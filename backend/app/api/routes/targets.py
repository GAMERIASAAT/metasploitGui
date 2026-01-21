from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid
import json
import os

from app.api.routes.auth import get_current_active_user

router = APIRouter()

# File-based storage for persistence
TARGETS_FILE = "/tmp/msf_gui_targets.json"


# Pydantic Models
class ServiceCreate(BaseModel):
    port: int
    protocol: str = "tcp"
    service: str = ""
    version: Optional[str] = None
    banner: Optional[str] = None
    state: str = "open"


class Service(ServiceCreate):
    id: str
    host_id: str
    created_at: str


class TargetCreate(BaseModel):
    ip: str
    hostname: Optional[str] = None
    os: Optional[str] = None
    os_family: Optional[str] = None
    arch: Optional[str] = None
    status: str = "unknown"  # unknown, online, offline, compromised
    tags: List[str] = []
    notes: Optional[str] = None
    group: Optional[str] = None


class TargetUpdate(BaseModel):
    ip: Optional[str] = None
    hostname: Optional[str] = None
    os: Optional[str] = None
    os_family: Optional[str] = None
    arch: Optional[str] = None
    status: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    group: Optional[str] = None


class Target(TargetCreate):
    id: str
    created_at: str
    updated_at: str
    services: List[Service] = []
    session_count: int = 0


class TargetImport(BaseModel):
    targets: List[TargetCreate]


# In-memory storage with file persistence
targets_db: dict[str, dict] = {}
services_db: dict[str, dict] = {}


def load_targets():
    """Load targets from file."""
    global targets_db, services_db
    if os.path.exists(TARGETS_FILE):
        try:
            with open(TARGETS_FILE, 'r') as f:
                data = json.load(f)
                targets_db = data.get("targets", {})
                services_db = data.get("services", {})
        except Exception:
            targets_db = {}
            services_db = {}


def save_targets():
    """Save targets to file."""
    try:
        with open(TARGETS_FILE, 'w') as f:
            json.dump({"targets": targets_db, "services": services_db}, f, indent=2)
    except Exception as e:
        print(f"Failed to save targets: {e}")


# Load on module import
load_targets()


def get_target_with_services(target_id: str) -> dict:
    """Get target with its services attached."""
    if target_id not in targets_db:
        return None
    target = targets_db[target_id].copy()
    target["services"] = [
        s for s in services_db.values() if s.get("host_id") == target_id
    ]
    return target


# Target CRUD endpoints
@router.get("")
async def list_targets(
    status: Optional[str] = None,
    group: Optional[str] = None,
    tag: Optional[str] = None,
    user=Depends(get_current_active_user)
):
    """List all targets with optional filtering."""
    result = []
    for target_id, target in targets_db.items():
        # Apply filters
        if status and target.get("status") != status:
            continue
        if group and target.get("group") != group:
            continue
        if tag and tag not in target.get("tags", []):
            continue

        # Get full target with services
        full_target = get_target_with_services(target_id)
        if full_target:
            result.append(full_target)

    # Sort by created_at descending
    result.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    return {
        "targets": result,
        "count": len(result),
        "groups": list(set(t.get("group") for t in targets_db.values() if t.get("group"))),
        "tags": list(set(tag for t in targets_db.values() for tag in t.get("tags", [])))
    }


@router.post("")
async def create_target(target: TargetCreate, user=Depends(get_current_active_user)):
    """Create a new target."""
    # Check for duplicate IP
    for existing in targets_db.values():
        if existing.get("ip") == target.ip:
            raise HTTPException(status_code=400, detail=f"Target with IP {target.ip} already exists")

    target_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    target_data = {
        "id": target_id,
        **target.model_dump(),
        "created_at": now,
        "updated_at": now,
        "session_count": 0
    }

    targets_db[target_id] = target_data
    save_targets()

    return get_target_with_services(target_id)


@router.get("/{target_id}")
async def get_target(target_id: str, user=Depends(get_current_active_user)):
    """Get a specific target by ID."""
    target = get_target_with_services(target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    return target


@router.put("/{target_id}")
async def update_target(target_id: str, update: TargetUpdate, user=Depends(get_current_active_user)):
    """Update a target."""
    if target_id not in targets_db:
        raise HTTPException(status_code=404, detail="Target not found")

    # Check for duplicate IP if IP is being changed
    if update.ip:
        for tid, existing in targets_db.items():
            if tid != target_id and existing.get("ip") == update.ip:
                raise HTTPException(status_code=400, detail=f"Target with IP {update.ip} already exists")

    # Update only provided fields
    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            targets_db[target_id][key] = value

    targets_db[target_id]["updated_at"] = datetime.now().isoformat()
    save_targets()

    return get_target_with_services(target_id)


@router.delete("/{target_id}")
async def delete_target(target_id: str, user=Depends(get_current_active_user)):
    """Delete a target and its services."""
    if target_id not in targets_db:
        raise HTTPException(status_code=404, detail="Target not found")

    # Delete associated services
    services_to_delete = [sid for sid, s in services_db.items() if s.get("host_id") == target_id]
    for sid in services_to_delete:
        del services_db[sid]

    del targets_db[target_id]
    save_targets()

    return {"success": True, "message": "Target deleted"}


@router.post("/import")
async def import_targets(data: TargetImport, user=Depends(get_current_active_user)):
    """Import multiple targets at once."""
    imported = 0
    skipped = 0

    for target in data.targets:
        # Skip duplicates
        exists = any(t.get("ip") == target.ip for t in targets_db.values())
        if exists:
            skipped += 1
            continue

        target_id = str(uuid.uuid4())
        now = datetime.now().isoformat()

        target_data = {
            "id": target_id,
            **target.model_dump(),
            "created_at": now,
            "updated_at": now,
            "session_count": 0
        }

        targets_db[target_id] = target_data
        imported += 1

    save_targets()

    return {
        "success": True,
        "imported": imported,
        "skipped": skipped,
        "total": len(targets_db)
    }


# Service endpoints
@router.post("/{target_id}/services")
async def add_service(target_id: str, service: ServiceCreate, user=Depends(get_current_active_user)):
    """Add a service to a target."""
    if target_id not in targets_db:
        raise HTTPException(status_code=404, detail="Target not found")

    # Check for duplicate port/protocol
    for s in services_db.values():
        if (s.get("host_id") == target_id and
            s.get("port") == service.port and
            s.get("protocol") == service.protocol):
            raise HTTPException(status_code=400, detail=f"Service on port {service.port}/{service.protocol} already exists")

    service_id = str(uuid.uuid4())
    service_data = {
        "id": service_id,
        "host_id": target_id,
        **service.model_dump(),
        "created_at": datetime.now().isoformat()
    }

    services_db[service_id] = service_data
    save_targets()

    return service_data


@router.get("/{target_id}/services")
async def list_services(target_id: str, user=Depends(get_current_active_user)):
    """List all services for a target."""
    if target_id not in targets_db:
        raise HTTPException(status_code=404, detail="Target not found")

    services = [s for s in services_db.values() if s.get("host_id") == target_id]
    services.sort(key=lambda x: x.get("port", 0))

    return {"services": services, "count": len(services)}


@router.delete("/{target_id}/services/{service_id}")
async def delete_service(target_id: str, service_id: str, user=Depends(get_current_active_user)):
    """Delete a service from a target."""
    if target_id not in targets_db:
        raise HTTPException(status_code=404, detail="Target not found")

    if service_id not in services_db:
        raise HTTPException(status_code=404, detail="Service not found")

    if services_db[service_id].get("host_id") != target_id:
        raise HTTPException(status_code=400, detail="Service does not belong to this target")

    del services_db[service_id]
    save_targets()

    return {"success": True, "message": "Service deleted"}


# Bulk operations
@router.post("/bulk/status")
async def bulk_update_status(
    target_ids: List[str],
    status: str,
    user=Depends(get_current_active_user)
):
    """Update status for multiple targets."""
    updated = 0
    for target_id in target_ids:
        if target_id in targets_db:
            targets_db[target_id]["status"] = status
            targets_db[target_id]["updated_at"] = datetime.now().isoformat()
            updated += 1

    save_targets()
    return {"success": True, "updated": updated}


@router.delete("/bulk")
async def bulk_delete(target_ids: List[str], user=Depends(get_current_active_user)):
    """Delete multiple targets."""
    deleted = 0
    for target_id in target_ids:
        if target_id in targets_db:
            # Delete services
            services_to_delete = [sid for sid, s in services_db.items() if s.get("host_id") == target_id]
            for sid in services_to_delete:
                del services_db[sid]
            del targets_db[target_id]
            deleted += 1

    save_targets()
    return {"success": True, "deleted": deleted}


# Stats endpoint
@router.get("/stats/summary")
async def get_stats(user=Depends(get_current_active_user)):
    """Get target statistics."""
    total = len(targets_db)
    by_status = {}
    by_os = {}
    by_group = {}

    for target in targets_db.values():
        status = target.get("status", "unknown")
        by_status[status] = by_status.get(status, 0) + 1

        os_family = target.get("os_family", "unknown")
        by_os[os_family] = by_os.get(os_family, 0) + 1

        group = target.get("group", "ungrouped")
        by_group[group] = by_group.get(group, 0) + 1

    return {
        "total": total,
        "by_status": by_status,
        "by_os": by_os,
        "by_group": by_group,
        "total_services": len(services_db)
    }
