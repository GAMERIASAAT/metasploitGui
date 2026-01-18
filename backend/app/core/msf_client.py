import asyncio
import threading
from typing import Optional, Any
from pymetasploit3.msfrpc import MsfRpcClient
from .config import settings
import logging

logger = logging.getLogger(__name__)


class MetasploitClient:
    """Wrapper for Metasploit RPC client with async support."""

    def __init__(self):
        self._client: Optional[MsfRpcClient] = None
        self._sync_lock = threading.Lock()

    @property
    def connected(self) -> bool:
        return self._client is not None

    def _connect_sync(self) -> bool:
        """Synchronous connection to Metasploit RPC."""
        with self._sync_lock:
            if self._client is not None:
                return True

            try:
                logger.info(f"Connecting to MSF RPC at {settings.msf_rpc_host}:{settings.msf_rpc_port} (SSL={settings.msf_rpc_ssl})")
                self._client = MsfRpcClient(
                    settings.msf_rpc_password,
                    server=settings.msf_rpc_host,
                    port=settings.msf_rpc_port,
                    username=settings.msf_rpc_user,
                    ssl=settings.msf_rpc_ssl
                )
                logger.info("Connected to Metasploit RPC")
                return True
            except Exception as e:
                logger.warning(f"Could not connect to Metasploit RPC: {e}")
                self._client = None
                return False

    async def connect(self, timeout: float = 10.0) -> bool:
        """Connect to Metasploit RPC server with timeout."""
        try:
            loop = asyncio.get_running_loop()
            result = await asyncio.wait_for(
                loop.run_in_executor(None, self._connect_sync),
                timeout=timeout
            )
            return result
        except asyncio.TimeoutError:
            logger.warning(f"Metasploit RPC connection timed out after {timeout}s")
            return False
        except Exception as e:
            logger.warning(f"Metasploit RPC connection error: {e}")
            return False

    async def disconnect(self):
        """Disconnect from Metasploit RPC server."""
        if self._client:
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, self._client.logout)
            except Exception:
                pass
            self._client = None

    async def _run_sync(self, func):
        """Run synchronous MSF client function in executor."""
        if not self._client:
            raise ConnectionError("Not connected to Metasploit RPC")
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, func)

    # ==================== Core Info ====================

    async def get_version(self) -> dict:
        """Get Metasploit version info."""
        return await self._run_sync(lambda: self._client.core.version)

    async def get_stats(self) -> dict:
        """Get module statistics."""
        return await self._run_sync(lambda: {
            "exploits": len(self._client.modules.exploits),
            "payloads": len(self._client.modules.payloads),
            "auxiliaries": len(self._client.modules.auxiliary),
            "post": len(self._client.modules.post),
            "encoders": len(self._client.modules.encoders),
            "nops": len(self._client.modules.nops),
        })

    # ==================== Modules ====================

    async def list_modules(self, module_type: str) -> list[str]:
        """List modules of a specific type."""
        def _list():
            if module_type == "exploit":
                return list(self._client.modules.exploits)
            elif module_type == "payload":
                return list(self._client.modules.payloads)
            elif module_type == "auxiliary":
                return list(self._client.modules.auxiliary)
            elif module_type == "post":
                return list(self._client.modules.post)
            elif module_type == "encoder":
                return list(self._client.modules.encoders)
            elif module_type == "nop":
                return list(self._client.modules.nops)
            else:
                return []
        return await self._run_sync(_list)

    async def get_module_info(self, module_type: str, module_name: str) -> dict:
        """Get detailed information about a module using official API."""
        def _info():
            # Get module info using module.info API
            info = self._client.call('module.info', [module_type, module_name])

            # Get options using module.options API (separate call for full details)
            opts = self._client.call('module.options', [module_type, module_name])

            options_dict = {}
            for name, opt_data in opts.items():
                options_dict[name] = {
                    "type": opt_data.get('type', 'string'),
                    "required": opt_data.get('required', False),
                    "description": opt_data.get('desc', ''),
                    "default": opt_data.get('default'),
                    "advanced": opt_data.get('advanced', False),
                    "evasion": opt_data.get('evasion', False),
                }

            # Get required options list
            required = [name for name, opt in opts.items() if opt.get('required', False)]

            return {
                "name": info.get('name', module_name),
                "fullname": info.get('fullname', f"{module_type}/{module_name}"),
                "description": info.get('description', ''),
                "authors": info.get('authors', []),
                "references": info.get('references', []),
                "rank": info.get('rank'),
                "license": info.get('license'),
                "options": options_dict,
                "required_options": required,
            }
        return await self._run_sync(_info)

    async def search_modules(self, query: str, module_type: Optional[str] = None) -> list[dict]:
        """Search for modules matching query."""
        def _search():
            results = []
            types_to_search = [module_type] if module_type else ["exploit", "auxiliary", "post", "payload"]

            for mtype in types_to_search:
                modules = self._client.modules.search(query, mtype)
                for mod in modules:
                    results.append({
                        "type": mtype,
                        "name": mod,
                        "fullname": f"{mtype}/{mod}"
                    })
            return results[:100]
        return await self._run_sync(_search)

    # ==================== Sessions ====================

    async def list_sessions(self) -> dict:
        """List all active sessions."""
        return await self._run_sync(lambda: dict(self._client.sessions.list))

    async def get_session(self, session_id: int) -> dict:
        """Get information about a specific session."""
        def _get():
            sessions = self._client.sessions.list
            return sessions.get(str(session_id), {})
        return await self._run_sync(_get)

    async def session_shell_read(self, session_id: int) -> str:
        """Read output from shell session."""
        def _read():
            shell = self._client.sessions.session(str(session_id))
            return shell.read()
        return await self._run_sync(_read)

    async def session_shell_write(self, session_id: int, command: str) -> dict:
        """Write command to shell session."""
        def _write():
            shell = self._client.sessions.session(str(session_id))
            shell.write(command)
            return {"status": "ok"}
        return await self._run_sync(_write)

    async def session_meterpreter_read(self, session_id: int) -> str:
        """Read output from meterpreter session."""
        def _read():
            meterpreter = self._client.sessions.session(str(session_id))
            return meterpreter.read()
        return await self._run_sync(_read)

    async def session_meterpreter_write(self, session_id: int, command: str) -> dict:
        """Execute meterpreter command."""
        def _write():
            meterpreter = self._client.sessions.session(str(session_id))
            meterpreter.write(command)
            return {"status": "ok"}
        return await self._run_sync(_write)

    async def session_meterpreter_run_single(self, session_id: int, command: str) -> str:
        """Run a single meterpreter command and get output."""
        def _run():
            meterpreter = self._client.sessions.session(str(session_id))
            return meterpreter.run_with_output(command)
        return await self._run_sync(_run)

    async def kill_session(self, session_id: int) -> dict:
        """Kill a session."""
        def _kill():
            self._client.sessions.session(str(session_id)).stop()
            return {"status": "ok", "session_id": session_id}
        return await self._run_sync(_kill)

    # ==================== Console ====================

    async def console_create(self) -> dict:
        """Create a new console using direct API."""
        def _create():
            result = self._client.call('console.create', [])
            return {"id": result.get('id', '')}
        return await self._run_sync(_create)

    async def console_destroy(self, console_id: str) -> dict:
        """Destroy a console using direct API."""
        def _destroy():
            self._client.call('console.destroy', [console_id])
            return {"status": "ok"}
        return await self._run_sync(_destroy)

    async def console_read(self, console_id: str) -> dict:
        """Read from console using direct API for reliability."""
        def _read():
            result = self._client.call('console.read', [console_id])
            return {
                "data": result.get('data', ''),
                "prompt": result.get('prompt', ''),
                "busy": result.get('busy', False)
            }
        return await self._run_sync(_read)

    async def console_write(self, console_id: str, command: str) -> dict:
        """Write to console using direct API."""
        def _write():
            self._client.call('console.write', [console_id, command])
            return {"status": "ok"}
        return await self._run_sync(_write)

    async def console_list(self) -> list:
        """List all consoles using direct API."""
        def _list():
            result = self._client.call('console.list', [])
            return result.get('consoles', [])
        return await self._run_sync(_list)

    # ==================== Jobs ====================

    async def list_jobs(self) -> dict:
        """List all running jobs."""
        return await self._run_sync(lambda: dict(self._client.jobs.list))

    async def get_job_info(self, job_id: str) -> dict:
        """Get job information."""
        return await self._run_sync(lambda: self._client.jobs.info(job_id))

    async def kill_job(self, job_id: str) -> dict:
        """Kill a job."""
        def _kill():
            self._client.jobs.stop(job_id)
            return {"status": "ok", "job_id": job_id}
        return await self._run_sync(_kill)

    # ==================== Exploits & Handlers ====================

    async def run_exploit(self, module_name: str, options: dict, payload: Optional[str] = None, payload_options: Optional[dict] = None) -> dict:
        """Run an exploit module using direct API."""
        def _run():
            # Build datastore with all options
            datastore = {**options}
            if payload:
                datastore['PAYLOAD'] = payload
            if payload_options:
                datastore.update(payload_options)

            # Use direct module.execute API call
            result = self._client.call('module.execute', ['exploit', module_name, datastore])

            return {
                "job_id": result.get("job_id"),
                "uuid": result.get("uuid"),
                "status": "launched" if result.get("job_id") is not None else "failed"
            }
        return await self._run_sync(_run)

    async def get_compatible_payloads(self, module_name: str) -> list[str]:
        """Get list of compatible payloads for an exploit module."""
        def _get():
            result = self._client.call('module.compatible_payloads', [module_name])
            return result.get('payloads', [])
        return await self._run_sync(_get)

    async def create_handler(self, payload: str, options: dict) -> dict:
        """Create a multi/handler for catching reverse shells using direct API."""
        def _create():
            # Build datastore with PAYLOAD and other options
            datastore = {'PAYLOAD': payload, **options}

            # Use direct module.execute API call
            result = self._client.call('module.execute', ['exploit', 'multi/handler', datastore])

            return {
                "job_id": result.get('job_id'),
                "uuid": result.get('uuid'),
                "status": "started" if result.get('job_id') is not None else "failed"
            }
        return await self._run_sync(_create)

    # ==================== Payloads ====================

    async def generate_payload(
        self,
        payload_name: str,
        options: dict,
        format_type: str = "raw",
        encoder: str = None,
        iterations: int = 1,
        bad_chars: str = None
    ) -> bytes:
        """Generate a payload using msfvenom subprocess for reliability."""
        import subprocess
        import tempfile
        import os

        def _generate():
            # Build msfvenom command
            cmd = ['msfvenom', '-p', payload_name]

            # For Android payloads, don't specify format (APK is automatic)
            # For other payloads, specify the format
            if not payload_name.startswith('android/') and format_type != 'apk':
                cmd.extend(['-f', format_type])

            # Add options
            for key, value in options.items():
                cmd.append(f'{key}={value}')

            # Add encoder if specified (not for Android)
            if encoder and not payload_name.startswith('android/'):
                cmd.extend(['-e', encoder, '-i', str(iterations)])

            # Add bad chars if specified
            if bad_chars and not payload_name.startswith('android/'):
                cmd.extend(['-b', bad_chars])

            # Create temp file for output
            with tempfile.NamedTemporaryFile(delete=False) as tmp:
                tmp_path = tmp.name

            try:
                cmd.extend(['-o', tmp_path])
                result = subprocess.run(cmd, capture_output=True, timeout=120)

                if result.returncode != 0:
                    error_msg = result.stderr.decode('utf-8', errors='ignore')
                    raise Exception(f"msfvenom failed: {error_msg}")

                # Read the generated payload
                with open(tmp_path, 'rb') as f:
                    return f.read()
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _generate)

    async def list_payload_formats(self) -> list[str]:
        """List available payload formats using msfvenom."""
        import subprocess

        def _list():
            result = subprocess.run(
                ['msfvenom', '--list', 'formats'],
                capture_output=True,
                timeout=30
            )
            output = result.stdout.decode('utf-8', errors='ignore')

            formats = []
            in_formats = False
            for line in output.split('\n'):
                line = line.strip()
                if 'Framework Executable Formats' in line or 'Framework Transform Formats' in line:
                    in_formats = True
                    continue
                if in_formats and line and not line.startswith('='):
                    # Extract format name (first word)
                    fmt = line.split()[0] if line.split() else None
                    if fmt and not fmt.startswith('-'):
                        formats.append(fmt)

            return formats

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _list)

    async def list_encoders_detailed(self) -> list[dict]:
        """List available encoders with details."""
        import subprocess

        def _list():
            result = subprocess.run(
                ['msfvenom', '--list', 'encoders'],
                capture_output=True,
                timeout=30
            )
            output = result.stdout.decode('utf-8', errors='ignore')

            encoders = []
            for line in output.split('\n'):
                line = line.strip()
                if line and '/' in line and not line.startswith('=') and not line.startswith('Name'):
                    parts = line.split()
                    if len(parts) >= 2:
                        encoders.append({
                            'name': parts[0],
                            'rank': parts[1] if len(parts) > 1 else 'normal',
                            'description': ' '.join(parts[2:]) if len(parts) > 2 else ''
                        })

            return encoders

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _list)


# Global instance
msf_client = MetasploitClient()
