from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any

from app.core.msf_client import msf_client
from app.api.routes.auth import get_current_active_user

router = APIRouter()


class ModuleExecuteRequest(BaseModel):
    options: Dict[str, Any] = {}
    payload: Optional[str] = None
    payload_options: Optional[Dict[str, Any]] = None


@router.get("/types")
async def list_module_types(user=Depends(get_current_active_user)):
    """List available module types."""
    return {
        "types": [
            {"id": "exploit", "name": "Exploits", "description": "Exploitation modules"},
            {"id": "payload", "name": "Payloads", "description": "Payload modules"},
            {"id": "auxiliary", "name": "Auxiliary", "description": "Auxiliary modules (scanners, fuzzers, etc.)"},
            {"id": "post", "name": "Post", "description": "Post-exploitation modules"},
            {"id": "encoder", "name": "Encoders", "description": "Payload encoders"},
            {"id": "nop", "name": "NOPs", "description": "NOP generators"},
        ]
    }


@router.get("/stats")
async def get_module_stats():
    """Get module count statistics (public endpoint for health checks)."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        stats = await msf_client.get_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def search_modules(
    q: str = Query(..., min_length=2, description="Search query"),
    type: Optional[str] = Query(None, description="Module type filter"),
    user=Depends(get_current_active_user)
):
    """Search for modules."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        results = await msf_client.search_modules(q, type)
        return {"results": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{module_type}")
async def list_modules(
    module_type: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: Optional[str] = None,
    user=Depends(get_current_active_user)
):
    """List modules of a specific type with pagination."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    valid_types = ["exploit", "payload", "auxiliary", "post", "encoder", "nop"]
    if module_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid module type. Must be one of: {valid_types}")

    try:
        modules = await msf_client.list_modules(module_type)

        # Filter by search query if provided
        if search:
            search_lower = search.lower()
            modules = [m for m in modules if search_lower in m.lower()]

        total = len(modules)
        modules = modules[offset:offset + limit]

        return {
            "type": module_type,
            "modules": modules,
            "total": total,
            "offset": offset,
            "limit": limit
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{module_type}/{module_name:path}/info")
async def get_module_info(module_type: str, module_name: str, user=Depends(get_current_active_user)):
    """Get detailed information about a specific module."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        info = await msf_client.get_module_info(module_type, module_name)
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{module_type}/{module_name:path}/payloads")
async def get_compatible_payloads(module_type: str, module_name: str, user=Depends(get_current_active_user)):
    """Get compatible payloads for an exploit module."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    if module_type != "exploit":
        raise HTTPException(status_code=400, detail="Compatible payloads only available for exploit modules")

    try:
        payloads = await msf_client.get_compatible_payloads(module_name)
        return {"payloads": payloads, "count": len(payloads)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{module_type}/{module_name:path}/execute")
async def execute_module(
    module_type: str,
    module_name: str,
    request: ModuleExecuteRequest,
    user=Depends(get_current_active_user)
):
    """Execute a module with given options."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    valid_types = ["exploit", "auxiliary", "post"]
    if module_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Only {valid_types} modules can be executed via this endpoint")

    try:
        if module_type == "exploit":
            result = await msf_client.run_exploit(
                module_name,
                request.options,
                request.payload,
                request.payload_options
            )
        else:
            # For auxiliary and post modules
            result = await msf_client.run_module(
                module_type,
                module_name,
                request.options
            )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs")
async def list_module_jobs(user=Depends(get_current_active_user)):
    """List all running module jobs."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        jobs = await msf_client.list_jobs()
        return {"jobs": jobs, "count": len(jobs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/{job_id}")
async def get_module_job_info(job_id: str, user=Depends(get_current_active_user)):
    """Get information about a specific job."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        job_info = await msf_client.get_job_info(job_id)
        if not job_info:
            raise HTTPException(status_code=404, detail="Job not found")
        return job_info
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
