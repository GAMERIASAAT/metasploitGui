import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import socketio
import logging
import os
from datetime import datetime

from app.core.config import settings
from app.core.msf_client import msf_client
from app.api.routes import sessions, modules, console, listeners, payloads, auth, targets
from app.api.websocket import sio

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    logger.info("Starting Metasploit GUI Backend...")

    # Try to connect to MSF RPC with a short timeout (non-blocking)
    try:
        connected = await msf_client.connect(timeout=10.0)
        if connected:
            logger.info("Connected to Metasploit RPC")
        else:
            logger.warning("Metasploit RPC not available - start msfrpcd to enable MSF features")
    except Exception as e:
        logger.warning(f"MSF connection skipped: {e}")

    logger.info("Backend ready!")

    yield

    # Shutdown
    logger.info("Shutting down...")
    await msf_client.disconnect()


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    description="A comprehensive GUI for Metasploit Framework",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(auth.router, prefix=f"{settings.api_prefix}/auth", tags=["Authentication"])
app.include_router(sessions.router, prefix=f"{settings.api_prefix}/sessions", tags=["Sessions"])
app.include_router(modules.router, prefix=f"{settings.api_prefix}/modules", tags=["Modules"])
app.include_router(console.router, prefix=f"{settings.api_prefix}/console", tags=["Console"])
app.include_router(listeners.router, prefix=f"{settings.api_prefix}/listeners", tags=["Listeners"])
app.include_router(payloads.router, prefix=f"{settings.api_prefix}/payloads", tags=["Payloads"])
app.include_router(targets.router, prefix=f"{settings.api_prefix}/targets", tags=["Targets"])

# Mount Socket.IO
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.app_name,
        "version": "1.0.0",
        "status": "running",
        "msf_connected": msf_client.connected
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    msf_status = "connected" if msf_client.connected else "disconnected"

    stats = None
    if msf_client.connected:
        try:
            stats = await msf_client.get_stats()
        except Exception:
            pass

    return {
        "status": "healthy",
        "metasploit": msf_status,
        "module_stats": stats
    }


@app.get("/dl/{path:path}")
async def serve_hosted_payload(path: str):
    """Serve hosted payloads at custom URL paths (no auth required for victim download)."""
    # Normalize path
    normalized_path = f"/{path}" if not path.startswith('/') else path

    # Look up the payload ID from the path mapping
    payload_id = payloads.url_path_mapping.get(normalized_path)

    if not payload_id or payload_id not in payloads.hosted_payloads:
        raise HTTPException(status_code=404, detail="Not found")

    info = payloads.hosted_payloads[payload_id]

    # Check expiry
    if datetime.fromisoformat(info["expires"]) < datetime.now():
        payloads.hosted_payloads.pop(payload_id, None)
        if normalized_path in payloads.url_path_mapping:
            del payloads.url_path_mapping[normalized_path]
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


# For running with: python main.py
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:socket_app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
