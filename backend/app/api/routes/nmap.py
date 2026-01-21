from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid
import subprocess
import xml.etree.ElementTree as ET
import asyncio
import os
import json

from app.api.routes.auth import get_current_active_user
from app.api.routes.targets import targets_db, services_db, save_targets

router = APIRouter()

# Scan storage
SCANS_FILE = "/tmp/msf_gui_scans.json"
active_scans: dict[str, dict] = {}
completed_scans: dict[str, dict] = {}


# Pydantic Models
class ScanRequest(BaseModel):
    targets: str  # IP, CIDR, or range (e.g., "192.168.1.0/24" or "192.168.1.1-50")
    profile: str = "quick"  # quick, full, stealth, udp, vuln, custom
    custom_args: Optional[str] = None
    import_results: bool = True


class ScanProfile(BaseModel):
    id: str
    name: str
    description: str
    args: str


# Predefined scan profiles
SCAN_PROFILES: dict[str, ScanProfile] = {
    "quick": ScanProfile(
        id="quick",
        name="Quick Scan",
        description="Fast scan of common ports (-T4 -F)",
        args="-T4 -F"
    ),
    "full": ScanProfile(
        id="full",
        name="Full Scan",
        description="Complete port scan with service detection (-T4 -A -p-)",
        args="-T4 -A -p-"
    ),
    "stealth": ScanProfile(
        id="stealth",
        name="Stealth Scan",
        description="Slow SYN scan to avoid detection (-sS -T2)",
        args="-sS -T2"
    ),
    "udp": ScanProfile(
        id="udp",
        name="UDP Scan",
        description="Scan top 100 UDP ports (-sU --top-ports 100)",
        args="-sU --top-ports 100"
    ),
    "vuln": ScanProfile(
        id="vuln",
        name="Vulnerability Scan",
        description="Run vulnerability detection scripts (--script vuln)",
        args="-sV --script vuln"
    ),
    "discovery": ScanProfile(
        id="discovery",
        name="Host Discovery",
        description="Ping scan to find live hosts (-sn)",
        args="-sn"
    ),
    "services": ScanProfile(
        id="services",
        name="Service Version",
        description="Detect service versions (-sV)",
        args="-sV"
    ),
}


def load_scans():
    """Load scan history from file."""
    global completed_scans
    if os.path.exists(SCANS_FILE):
        try:
            with open(SCANS_FILE, 'r') as f:
                completed_scans = json.load(f)
        except Exception:
            completed_scans = {}


def save_scans():
    """Save scan history to file."""
    try:
        with open(SCANS_FILE, 'w') as f:
            json.dump(completed_scans, f, indent=2)
    except Exception as e:
        print(f"Failed to save scans: {e}")


# Load on module import
load_scans()


def parse_nmap_xml(xml_content: str) -> dict:
    """Parse nmap XML output and extract hosts/services."""
    results = {
        "hosts": [],
        "total_hosts": 0,
        "hosts_up": 0,
        "hosts_down": 0,
    }

    try:
        root = ET.fromstring(xml_content)

        # Get scan info
        if root.find("scaninfo") is not None:
            scaninfo = root.find("scaninfo")
            results["scan_type"] = scaninfo.get("type", "")
            results["protocol"] = scaninfo.get("protocol", "")

        # Parse hosts
        for host in root.findall("host"):
            host_data = {
                "status": "unknown",
                "ip": "",
                "hostname": "",
                "os": "",
                "os_family": "",
                "services": [],
            }

            # Status
            status = host.find("status")
            if status is not None:
                host_data["status"] = "online" if status.get("state") == "up" else "offline"

            # IP Address
            for addr in host.findall("address"):
                if addr.get("addrtype") == "ipv4":
                    host_data["ip"] = addr.get("addr", "")
                elif addr.get("addrtype") == "mac":
                    host_data["mac"] = addr.get("addr", "")

            # Hostname
            hostnames = host.find("hostnames")
            if hostnames is not None:
                hostname = hostnames.find("hostname")
                if hostname is not None:
                    host_data["hostname"] = hostname.get("name", "")

            # OS Detection
            os_elem = host.find("os")
            if os_elem is not None:
                osmatch = os_elem.find("osmatch")
                if osmatch is not None:
                    host_data["os"] = osmatch.get("name", "")
                    # Try to determine OS family
                    os_name = host_data["os"].lower()
                    if "windows" in os_name:
                        host_data["os_family"] = "windows"
                    elif "linux" in os_name:
                        host_data["os_family"] = "linux"
                    elif "mac" in os_name or "darwin" in os_name:
                        host_data["os_family"] = "macos"
                    elif "android" in os_name:
                        host_data["os_family"] = "android"
                    elif "ios" in os_name or "iphone" in os_name:
                        host_data["os_family"] = "ios"

            # Ports/Services
            ports = host.find("ports")
            if ports is not None:
                for port in ports.findall("port"):
                    service_data = {
                        "port": int(port.get("portid", 0)),
                        "protocol": port.get("protocol", "tcp"),
                        "state": "open",
                        "service": "",
                        "version": "",
                        "banner": "",
                    }

                    state = port.find("state")
                    if state is not None:
                        service_data["state"] = state.get("state", "open")

                    service = port.find("service")
                    if service is not None:
                        service_data["service"] = service.get("name", "")
                        product = service.get("product", "")
                        version = service.get("version", "")
                        if product:
                            service_data["version"] = f"{product} {version}".strip()
                        extra = service.get("extrainfo", "")
                        if extra:
                            service_data["banner"] = extra

                    if service_data["state"] == "open":
                        host_data["services"].append(service_data)

            if host_data["ip"]:
                results["hosts"].append(host_data)
                results["total_hosts"] += 1
                if host_data["status"] == "online":
                    results["hosts_up"] += 1
                else:
                    results["hosts_down"] += 1

    except ET.ParseError as e:
        print(f"XML parse error: {e}")

    return results


async def run_nmap_scan(scan_id: str, targets: str, args: str, import_results: bool):
    """Run nmap scan in background."""
    try:
        active_scans[scan_id]["status"] = "running"
        active_scans[scan_id]["started_at"] = datetime.now().isoformat()

        # Build nmap command
        output_file = f"/tmp/nmap_scan_{scan_id}.xml"
        cmd = ["nmap", "-oX", output_file] + args.split() + [targets]

        active_scans[scan_id]["command"] = " ".join(cmd)

        # Run nmap
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await process.communicate()

        active_scans[scan_id]["completed_at"] = datetime.now().isoformat()

        if process.returncode != 0:
            active_scans[scan_id]["status"] = "failed"
            active_scans[scan_id]["error"] = stderr.decode() if stderr else "Unknown error"
        else:
            active_scans[scan_id]["status"] = "completed"

            # Parse results
            if os.path.exists(output_file):
                with open(output_file, 'r') as f:
                    xml_content = f.read()

                results = parse_nmap_xml(xml_content)
                active_scans[scan_id]["results"] = results

                # Import to targets if requested
                if import_results:
                    imported = 0
                    for host in results["hosts"]:
                        if not host["ip"]:
                            continue

                        # Check if target already exists
                        existing = None
                        for tid, t in targets_db.items():
                            if t.get("ip") == host["ip"]:
                                existing = tid
                                break

                        if existing:
                            # Update existing target
                            targets_db[existing]["status"] = host["status"]
                            if host["hostname"]:
                                targets_db[existing]["hostname"] = host["hostname"]
                            if host["os"]:
                                targets_db[existing]["os"] = host["os"]
                            if host["os_family"]:
                                targets_db[existing]["os_family"] = host["os_family"]
                            targets_db[existing]["updated_at"] = datetime.now().isoformat()

                            # Add new services
                            for svc in host["services"]:
                                # Check if service exists
                                svc_exists = any(
                                    s.get("host_id") == existing and
                                    s.get("port") == svc["port"] and
                                    s.get("protocol") == svc["protocol"]
                                    for s in services_db.values()
                                )
                                if not svc_exists:
                                    svc_id = str(uuid.uuid4())
                                    services_db[svc_id] = {
                                        "id": svc_id,
                                        "host_id": existing,
                                        "port": svc["port"],
                                        "protocol": svc["protocol"],
                                        "service": svc["service"],
                                        "version": svc["version"],
                                        "banner": svc["banner"],
                                        "state": svc["state"],
                                        "created_at": datetime.now().isoformat()
                                    }
                        else:
                            # Create new target
                            target_id = str(uuid.uuid4())
                            now = datetime.now().isoformat()
                            targets_db[target_id] = {
                                "id": target_id,
                                "ip": host["ip"],
                                "hostname": host["hostname"],
                                "os": host["os"],
                                "os_family": host["os_family"],
                                "arch": "",
                                "status": host["status"],
                                "tags": ["nmap-discovered"],
                                "notes": f"Discovered via nmap scan {scan_id[:8]}",
                                "group": "",
                                "created_at": now,
                                "updated_at": now,
                                "session_count": 0
                            }

                            # Add services
                            for svc in host["services"]:
                                svc_id = str(uuid.uuid4())
                                services_db[svc_id] = {
                                    "id": svc_id,
                                    "host_id": target_id,
                                    "port": svc["port"],
                                    "protocol": svc["protocol"],
                                    "service": svc["service"],
                                    "version": svc["version"],
                                    "banner": svc["banner"],
                                    "state": svc["state"],
                                    "created_at": now
                                }

                            imported += 1

                    active_scans[scan_id]["imported"] = imported
                    save_targets()

                # Cleanup temp file
                try:
                    os.unlink(output_file)
                except Exception:
                    pass

        # Move to completed scans
        completed_scans[scan_id] = active_scans.pop(scan_id)
        save_scans()

    except Exception as e:
        active_scans[scan_id]["status"] = "failed"
        active_scans[scan_id]["error"] = str(e)
        completed_scans[scan_id] = active_scans.pop(scan_id, {})
        save_scans()


@router.get("/profiles")
async def list_profiles(user=Depends(get_current_active_user)):
    """List available scan profiles."""
    return {
        "profiles": [p.model_dump() for p in SCAN_PROFILES.values()]
    }


@router.post("/scan")
async def start_scan(
    request: ScanRequest,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_active_user)
):
    """Start a new nmap scan."""
    # Check if nmap is installed
    try:
        result = subprocess.run(["which", "nmap"], capture_output=True)
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail="nmap is not installed on this system")
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to check for nmap")

    # Get scan arguments
    if request.profile == "custom":
        if not request.custom_args:
            raise HTTPException(status_code=400, detail="Custom args required for custom profile")
        args = request.custom_args
    else:
        profile = SCAN_PROFILES.get(request.profile)
        if not profile:
            raise HTTPException(status_code=400, detail=f"Unknown profile: {request.profile}")
        args = profile.args

    scan_id = str(uuid.uuid4())
    active_scans[scan_id] = {
        "id": scan_id,
        "targets": request.targets,
        "profile": request.profile,
        "args": args,
        "import_results": request.import_results,
        "status": "pending",
        "created_at": datetime.now().isoformat(),
    }

    # Start scan in background
    background_tasks.add_task(run_nmap_scan, scan_id, request.targets, args, request.import_results)

    return {
        "scan_id": scan_id,
        "status": "pending",
        "message": f"Scan started for {request.targets}"
    }


@router.get("/scans")
async def list_scans(user=Depends(get_current_active_user)):
    """List all scans (active and completed)."""
    all_scans = []

    for scan in active_scans.values():
        all_scans.append(scan)

    for scan in completed_scans.values():
        all_scans.append(scan)

    # Sort by created_at descending
    all_scans.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    return {
        "scans": all_scans,
        "active": len(active_scans),
        "completed": len(completed_scans)
    }


@router.get("/scans/{scan_id}")
async def get_scan(scan_id: str, user=Depends(get_current_active_user)):
    """Get details of a specific scan."""
    if scan_id in active_scans:
        return active_scans[scan_id]
    if scan_id in completed_scans:
        return completed_scans[scan_id]
    raise HTTPException(status_code=404, detail="Scan not found")


@router.delete("/scans/{scan_id}")
async def delete_scan(scan_id: str, user=Depends(get_current_active_user)):
    """Delete a completed scan from history."""
    if scan_id in active_scans:
        raise HTTPException(status_code=400, detail="Cannot delete active scan")

    if scan_id in completed_scans:
        del completed_scans[scan_id]
        save_scans()
        return {"success": True, "message": "Scan deleted"}

    raise HTTPException(status_code=404, detail="Scan not found")


@router.post("/import-xml")
async def import_xml(xml_content: str, user=Depends(get_current_active_user)):
    """Import hosts from nmap XML output."""
    results = parse_nmap_xml(xml_content)

    imported = 0
    for host in results["hosts"]:
        if not host["ip"]:
            continue

        # Check if target already exists
        exists = any(t.get("ip") == host["ip"] for t in targets_db.values())
        if exists:
            continue

        target_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        targets_db[target_id] = {
            "id": target_id,
            "ip": host["ip"],
            "hostname": host["hostname"],
            "os": host["os"],
            "os_family": host["os_family"],
            "arch": "",
            "status": host["status"],
            "tags": ["imported"],
            "notes": "Imported from nmap XML",
            "group": "",
            "created_at": now,
            "updated_at": now,
            "session_count": 0
        }

        # Add services
        for svc in host["services"]:
            svc_id = str(uuid.uuid4())
            services_db[svc_id] = {
                "id": svc_id,
                "host_id": target_id,
                "port": svc["port"],
                "protocol": svc["protocol"],
                "service": svc["service"],
                "version": svc["version"],
                "banner": svc["banner"],
                "state": svc["state"],
                "created_at": now
            }

        imported += 1

    save_targets()

    return {
        "success": True,
        "imported": imported,
        "total_found": results["total_hosts"]
    }
