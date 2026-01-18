from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.core.msf_client import msf_client
from app.api.routes.auth import get_current_active_user

router = APIRouter()


class ConsoleCommand(BaseModel):
    command: str


@router.get("")
async def list_consoles(user=Depends(get_current_active_user)):
    """List all active consoles."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        consoles = await msf_client.console_list()
        return {"consoles": consoles, "count": len(consoles)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_console(user=Depends(get_current_active_user)):
    """Create a new msfconsole instance."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        result = await msf_client.console_create()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{console_id}")
async def destroy_console(console_id: str, user=Depends(get_current_active_user)):
    """Destroy a console instance."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        result = await msf_client.console_destroy(console_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{console_id}")
async def read_console(console_id: str, user=Depends(get_current_active_user)):
    """Read output from a console."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        result = await msf_client.console_read(console_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{console_id}")
async def write_console(console_id: str, cmd: ConsoleCommand, user=Depends(get_current_active_user)):
    """Write a command to a console."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        # Ensure command ends with newline
        command = cmd.command if cmd.command.endswith("\n") else cmd.command + "\n"
        result = await msf_client.console_write(console_id, command)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
