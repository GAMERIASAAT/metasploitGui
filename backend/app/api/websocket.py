import asyncio
import socketio
import logging
from typing import Dict, Set

from app.core.msf_client import msf_client

logger = logging.getLogger(__name__)

# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=True
)

# Track active console sessions per client
client_consoles: Dict[str, Set[str]] = {}

# Track active session subscriptions per client
client_sessions: Dict[str, Set[int]] = {}


@sio.event
async def connect(sid, environ):
    """Handle client connection."""
    logger.info(f"Client connected: {sid}")
    client_consoles[sid] = set()
    client_sessions[sid] = set()
    await sio.emit('connected', {'sid': sid}, to=sid)


@sio.event
async def disconnect(sid):
    """Handle client disconnection."""
    logger.info(f"Client disconnected: {sid}")
    # Clean up any consoles created by this client
    if sid in client_consoles:
        for console_id in client_consoles[sid]:
            try:
                await msf_client.console_destroy(console_id)
            except Exception:
                pass
        del client_consoles[sid]
    # Clean up any session subscriptions
    if sid in client_sessions:
        del client_sessions[sid]


@sio.event
async def create_console(sid, data):
    """Create a new msfconsole for the client."""
    if not msf_client.connected:
        await sio.emit('error', {'message': 'Metasploit RPC not connected'}, to=sid)
        return

    try:
        result = await msf_client.console_create()
        console_id = result['id']
        client_consoles[sid].add(console_id)
        await sio.emit('console_created', {'console_id': console_id}, to=sid)

        # Start reading from console
        asyncio.create_task(console_reader(sid, console_id))
    except Exception as e:
        await sio.emit('error', {'message': str(e)}, to=sid)


@sio.event
async def destroy_console(sid, data):
    """Destroy a console."""
    console_id = data.get('console_id')
    if not console_id:
        return

    try:
        await msf_client.console_destroy(console_id)
        if sid in client_consoles:
            client_consoles[sid].discard(console_id)
        await sio.emit('console_destroyed', {'console_id': console_id}, to=sid)
    except Exception as e:
        await sio.emit('error', {'message': str(e)}, to=sid)


@sio.event
async def console_input(sid, data):
    """Send input to a console."""
    console_id = data.get('console_id')
    command = data.get('command', '')

    if not console_id:
        return

    try:
        await msf_client.console_write(console_id, command + '\n')
    except Exception as e:
        await sio.emit('error', {'message': str(e)}, to=sid)


@sio.event
async def session_input(sid, data):
    """Send input to a session."""
    session_id = data.get('session_id')
    command = data.get('command', '')
    session_type = data.get('type', 'shell')

    if not session_id:
        return

    try:
        if session_type == 'meterpreter':
            await msf_client.session_meterpreter_write(session_id, command)
        else:
            await msf_client.session_shell_write(session_id, command + '\n')
    except Exception as e:
        await sio.emit('error', {'message': str(e)}, to=sid)


@sio.event
async def subscribe_sessions(sid, data):
    """Subscribe to session updates."""
    asyncio.create_task(session_monitor(sid))


async def console_reader(sid: str, console_id: str):
    """Background task to read console output and send to client."""
    # Initial delay to let console initialize
    await asyncio.sleep(0.5)

    while sid in client_consoles and console_id in client_consoles.get(sid, set()):
        try:
            result = await msf_client.console_read(console_id)
            data = result.get('data', '')

            if data:
                # Clean up ANSI codes for better display
                await sio.emit('console_output', {
                    'console_id': console_id,
                    'data': data,
                    'prompt': result.get('prompt', ''),
                    'busy': result.get('busy', False)
                }, to=sid)

            # Adjust poll rate based on busy state
            if result.get('busy', False):
                await asyncio.sleep(0.05)  # Faster polling when busy
            else:
                await asyncio.sleep(0.15)  # Normal polling
        except Exception as e:
            logger.error(f"Console reader error: {e}")
            await asyncio.sleep(1)


async def session_monitor(sid: str):
    """Background task to monitor sessions and send updates."""
    last_sessions = {}

    while sid in client_consoles:
        try:
            if msf_client.connected:
                sessions = await msf_client.list_sessions()

                # Check for new sessions
                for session_id, info in sessions.items():
                    if session_id not in last_sessions:
                        await sio.emit('session_opened', {
                            'session_id': session_id,
                            'info': info
                        }, to=sid)

                # Check for closed sessions
                for session_id in last_sessions:
                    if session_id not in sessions:
                        await sio.emit('session_closed', {
                            'session_id': session_id
                        }, to=sid)

                # Send current session list
                await sio.emit('sessions_update', {
                    'sessions': sessions,
                    'count': len(sessions)
                }, to=sid)

                last_sessions = sessions

            await asyncio.sleep(2)  # Poll interval
        except Exception as e:
            logger.error(f"Session monitor error: {e}")
            await asyncio.sleep(5)


@sio.event
async def subscribe_session_output(sid, data):
    """Subscribe to session output streaming."""
    session_id = data.get('session_id')
    session_type = data.get('type', 'shell')

    if session_id is None:
        return

    session_id = int(session_id)

    if sid not in client_sessions:
        client_sessions[sid] = set()

    if session_id not in client_sessions[sid]:
        client_sessions[sid].add(session_id)
        asyncio.create_task(session_output_reader(sid, session_id, session_type))


@sio.event
async def unsubscribe_session_output(sid, data):
    """Unsubscribe from session output streaming."""
    session_id = data.get('session_id')

    if session_id is None:
        return

    session_id = int(session_id)

    if sid in client_sessions:
        client_sessions[sid].discard(session_id)


async def session_output_reader(sid: str, session_id: int, session_type: str):
    """Poll session output and emit to client."""
    # Initial delay to let session initialize
    await asyncio.sleep(0.3)

    while sid in client_sessions and session_id in client_sessions.get(sid, set()):
        try:
            # Check if session still exists
            sessions = await msf_client.list_sessions()
            if str(session_id) not in sessions:
                await sio.emit('session_output', {
                    'session_id': session_id,
                    'closed': True
                }, to=sid)
                if sid in client_sessions:
                    client_sessions[sid].discard(session_id)
                break

            # Read output based on session type
            if session_type == 'meterpreter':
                output = await msf_client.session_meterpreter_read(session_id)
            else:
                output = await msf_client.session_shell_read(session_id)

            if output:
                await sio.emit('session_output', {
                    'session_id': session_id,
                    'data': output,
                    'type': session_type
                }, to=sid)

            await asyncio.sleep(0.15)
        except Exception as e:
            logger.error(f"Session output reader error: {e}")
            await asyncio.sleep(1)
