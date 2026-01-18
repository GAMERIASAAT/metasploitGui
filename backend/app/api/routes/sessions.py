from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from app.core.msf_client import msf_client
from app.api.routes.auth import get_current_active_user

router = APIRouter()


class SessionCommand(BaseModel):
    command: str


class SessionResponse(BaseModel):
    output: str


@router.get("")
async def list_sessions(user=Depends(get_current_active_user)):
    """List all active sessions."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        sessions = await msf_client.list_sessions()
        # Transform to a more usable format
        result = []
        for sid, info in sessions.items():
            result.append({
                "id": int(sid),
                "type": info.get("type", "unknown"),
                "tunnel_local": info.get("tunnel_local", ""),
                "tunnel_peer": info.get("tunnel_peer", ""),
                "via_exploit": info.get("via_exploit", ""),
                "via_payload": info.get("via_payload", ""),
                "desc": info.get("desc", ""),
                "info": info.get("info", ""),
                "workspace": info.get("workspace", ""),
                "session_host": info.get("session_host", ""),
                "session_port": info.get("session_port", 0),
                "target_host": info.get("target_host", ""),
                "username": info.get("username", ""),
                "uuid": info.get("uuid", ""),
                "exploit_uuid": info.get("exploit_uuid", ""),
                "routes": info.get("routes", []),
                "arch": info.get("arch", ""),
                "platform": info.get("platform", ""),
            })
        return {"sessions": result, "count": len(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{session_id}")
async def get_session(session_id: int, user=Depends(get_current_active_user)):
    """Get detailed information about a specific session."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        session = await msf_client.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        session["id"] = session_id
        return session
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{session_id}/shell/write")
async def shell_write(session_id: int, cmd: SessionCommand, user=Depends(get_current_active_user)):
    """Send a command to a shell session."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        result = await msf_client.session_shell_write(session_id, cmd.command + "\n")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{session_id}/shell/read")
async def shell_read(session_id: int, user=Depends(get_current_active_user)):
    """Read output from a shell session."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        output = await msf_client.session_shell_read(session_id)
        return {"output": output}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{session_id}/meterpreter/write")
async def meterpreter_write(session_id: int, cmd: SessionCommand, user=Depends(get_current_active_user)):
    """Send a command to a meterpreter session."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        result = await msf_client.session_meterpreter_write(session_id, cmd.command)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{session_id}/meterpreter/read")
async def meterpreter_read(session_id: int, user=Depends(get_current_active_user)):
    """Read output from a meterpreter session."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        output = await msf_client.session_meterpreter_read(session_id)
        return {"output": output}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{session_id}/meterpreter/run")
async def meterpreter_run(session_id: int, cmd: SessionCommand, user=Depends(get_current_active_user)):
    """Run a single meterpreter command and get output."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        output = await msf_client.session_meterpreter_run_single(session_id, cmd.command)
        return {"output": output}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{session_id}")
async def kill_session(session_id: int, user=Depends(get_current_active_user)):
    """Kill a session."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        result = await msf_client.kill_session(session_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
