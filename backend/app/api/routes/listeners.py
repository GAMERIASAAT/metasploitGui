from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, Optional

from app.core.msf_client import msf_client
from app.api.routes.auth import get_current_active_user

router = APIRouter()


class HandlerCreateRequest(BaseModel):
    payload: str
    lhost: str
    lport: int
    options: Optional[Dict[str, Any]] = {}


class JobInfo(BaseModel):
    job_id: str
    name: str
    start_time: Optional[int] = None


@router.get("/jobs")
async def list_jobs(user=Depends(get_current_active_user)):
    """List all running jobs (handlers, exploits, etc.)."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        jobs = await msf_client.list_jobs()
        result = []
        for job_id, name in jobs.items():
            result.append({
                "id": job_id,
                "name": name
            })
        return {"jobs": result, "count": len(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/{job_id}")
async def get_job_info(job_id: str, user=Depends(get_current_active_user)):
    """Get detailed information about a job."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        info = await msf_client.get_job_info(job_id)
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/jobs/{job_id}")
async def kill_job(job_id: str, user=Depends(get_current_active_user)):
    """Kill a running job."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        result = await msf_client.kill_job(job_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/handler")
async def create_handler(request: HandlerCreateRequest, user=Depends(get_current_active_user)):
    """Create a new multi/handler listener."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        options = {
            "LHOST": request.lhost,
            "LPORT": request.lport,
            "ExitOnSession": False,
            **request.options
        }

        result = await msf_client.create_handler(request.payload, options)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/payloads")
async def list_common_payloads(user=Depends(get_current_active_user)):
    """List commonly used payloads for handlers."""
    common_payloads = [
        {
            "name": "windows/meterpreter/reverse_tcp",
            "platform": "Windows",
            "arch": "x86",
            "type": "Meterpreter",
            "staged": True
        },
        {
            "name": "windows/x64/meterpreter/reverse_tcp",
            "platform": "Windows",
            "arch": "x64",
            "type": "Meterpreter",
            "staged": True
        },
        {
            "name": "windows/meterpreter_reverse_tcp",
            "platform": "Windows",
            "arch": "x86",
            "type": "Meterpreter",
            "staged": False
        },
        {
            "name": "windows/x64/meterpreter_reverse_tcp",
            "platform": "Windows",
            "arch": "x64",
            "type": "Meterpreter",
            "staged": False
        },
        {
            "name": "linux/x86/meterpreter/reverse_tcp",
            "platform": "Linux",
            "arch": "x86",
            "type": "Meterpreter",
            "staged": True
        },
        {
            "name": "linux/x64/meterpreter/reverse_tcp",
            "platform": "Linux",
            "arch": "x64",
            "type": "Meterpreter",
            "staged": True
        },
        {
            "name": "python/meterpreter/reverse_tcp",
            "platform": "Multi",
            "arch": "python",
            "type": "Meterpreter",
            "staged": True
        },
        {
            "name": "java/meterpreter/reverse_tcp",
            "platform": "Multi",
            "arch": "java",
            "type": "Meterpreter",
            "staged": True
        },
        {
            "name": "php/meterpreter/reverse_tcp",
            "platform": "Multi",
            "arch": "php",
            "type": "Meterpreter",
            "staged": True
        },
        {
            "name": "cmd/unix/reverse_bash",
            "platform": "Unix",
            "arch": "cmd",
            "type": "Shell",
            "staged": False
        },
        {
            "name": "windows/shell/reverse_tcp",
            "platform": "Windows",
            "arch": "x86",
            "type": "Shell",
            "staged": True
        },
        {
            "name": "generic/shell_reverse_tcp",
            "platform": "Multi",
            "arch": "multi",
            "type": "Shell",
            "staged": False
        },
    ]
    return {"payloads": common_payloads}
