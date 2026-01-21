from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum
import uuid
import os
import json
import asyncio

from app.core.msf_client import msf_client
from app.api.routes.auth import get_current_active_user

router = APIRouter()

# Storage files
WORKFLOWS_FILE = "/tmp/msf_gui_workflows.json"
ACTIVITY_LOG_FILE = "/tmp/msf_gui_activity.json"

workflows_db: dict[str, dict] = {}
activity_log: list[dict] = []


# Enums
class StepType(str, Enum):
    EXPLOIT = "exploit"
    AUXILIARY = "auxiliary"
    POST = "post"
    COMMAND = "command"  # meterpreter/shell command
    DELAY = "delay"


class WorkflowStatus(str, Enum):
    DRAFT = "draft"
    READY = "ready"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"


# Pydantic Models
class WorkflowStep(BaseModel):
    id: Optional[str] = None
    type: StepType
    name: str
    module: Optional[str] = None  # module path for exploit/aux/post
    command: Optional[str] = None  # command for shell/meterpreter
    options: dict = {}
    delay_seconds: Optional[int] = None  # for delay steps
    continue_on_fail: bool = False
    description: Optional[str] = None


class WorkflowCreate(BaseModel):
    name: str
    description: Optional[str] = None
    target_session: Optional[int] = None  # session ID for post/command steps
    target_host: Optional[str] = None  # for exploit/aux steps
    steps: List[WorkflowStep] = []
    tags: List[str] = []


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    target_session: Optional[int] = None
    target_host: Optional[str] = None
    steps: Optional[List[WorkflowStep]] = None
    tags: Optional[List[str]] = None
    status: Optional[WorkflowStatus] = None


class ActivityLogEntry(BaseModel):
    action: str
    details: str
    user: Optional[str] = None
    target: Optional[str] = None
    session_id: Optional[int] = None
    status: str = "info"  # info, success, warning, error


# Load/Save functions
def load_workflows():
    global workflows_db
    if os.path.exists(WORKFLOWS_FILE):
        try:
            with open(WORKFLOWS_FILE, 'r') as f:
                workflows_db = json.load(f)
        except Exception:
            workflows_db = {}


def save_workflows():
    try:
        with open(WORKFLOWS_FILE, 'w') as f:
            json.dump(workflows_db, f, indent=2)
    except Exception as e:
        print(f"Failed to save workflows: {e}")


def load_activity_log():
    global activity_log
    if os.path.exists(ACTIVITY_LOG_FILE):
        try:
            with open(ACTIVITY_LOG_FILE, 'r') as f:
                activity_log = json.load(f)
        except Exception:
            activity_log = []


def save_activity_log():
    try:
        # Keep only last 1000 entries
        with open(ACTIVITY_LOG_FILE, 'w') as f:
            json.dump(activity_log[-1000:], f, indent=2)
    except Exception as e:
        print(f"Failed to save activity log: {e}")


def log_activity(action: str, details: str, user: str = None, target: str = None,
                 session_id: int = None, status: str = "info"):
    """Add entry to activity log."""
    entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now().isoformat(),
        "action": action,
        "details": details,
        "user": user,
        "target": target,
        "session_id": session_id,
        "status": status
    }
    activity_log.append(entry)
    save_activity_log()
    return entry


# Load on module import
load_workflows()
load_activity_log()


# ==================== Workflow Templates ====================

WORKFLOW_TEMPLATES = {
    "windows_post_exploit": {
        "name": "Windows Post-Exploitation",
        "description": "Standard Windows post-exploitation workflow",
        "steps": [
            {"type": "command", "name": "Get System Info", "command": "sysinfo"},
            {"type": "command", "name": "Get User ID", "command": "getuid"},
            {"type": "command", "name": "Get Privileges", "command": "getprivs"},
            {"type": "post", "name": "Hashdump", "module": "windows/gather/hashdump"},
            {"type": "post", "name": "Enumerate Domain", "module": "windows/gather/enum_domain"},
        ]
    },
    "linux_post_exploit": {
        "name": "Linux Post-Exploitation",
        "description": "Standard Linux post-exploitation workflow",
        "steps": [
            {"type": "command", "name": "Get System Info", "command": "sysinfo"},
            {"type": "command", "name": "Get User ID", "command": "getuid"},
            {"type": "post", "name": "Enumerate Users", "module": "linux/gather/enum_users_history"},
            {"type": "post", "name": "Check VM", "module": "linux/gather/checkvm"},
        ]
    },
    "privilege_escalation": {
        "name": "Privilege Escalation",
        "description": "Attempt privilege escalation",
        "steps": [
            {"type": "command", "name": "Check Current Privs", "command": "getuid"},
            {"type": "command", "name": "Try GetSystem", "command": "getsystem", "continue_on_fail": True},
            {"type": "post", "name": "Suggest Exploits", "module": "multi/recon/local_exploit_suggester"},
        ]
    },
    "credential_harvest": {
        "name": "Credential Harvesting",
        "description": "Gather credentials from target",
        "steps": [
            {"type": "post", "name": "Hashdump", "module": "windows/gather/hashdump", "continue_on_fail": True},
            {"type": "post", "name": "Cached Creds", "module": "windows/gather/cachedump", "continue_on_fail": True},
            {"type": "post", "name": "LSA Secrets", "module": "windows/gather/lsa_secrets", "continue_on_fail": True},
        ]
    },
    "persistence": {
        "name": "Establish Persistence",
        "description": "Set up persistence mechanisms",
        "steps": [
            {"type": "post", "name": "Registry Persistence", "module": "windows/manage/persistence_exe", "continue_on_fail": True},
            {"type": "post", "name": "Scheduled Task", "module": "windows/manage/schtasks", "continue_on_fail": True},
        ]
    }
}


# ==================== Workflow Execution ====================

async def execute_workflow(workflow_id: str, user: str):
    """Execute a workflow in the background."""
    if workflow_id not in workflows_db:
        return

    workflow = workflows_db[workflow_id]
    workflow["status"] = "running"
    workflow["started_at"] = datetime.now().isoformat()
    workflow["current_step"] = 0
    workflow["results"] = []
    save_workflows()

    log_activity(
        "workflow_started",
        f"Workflow '{workflow['name']}' started",
        user=user,
        target=workflow.get("target_host"),
        session_id=workflow.get("target_session"),
        status="info"
    )

    try:
        for i, step in enumerate(workflow.get("steps", [])):
            workflow["current_step"] = i
            save_workflows()

            step_result = {
                "step_index": i,
                "step_name": step.get("name", f"Step {i+1}"),
                "type": step.get("type"),
                "started_at": datetime.now().isoformat(),
                "status": "running",
                "output": ""
            }

            try:
                step_type = step.get("type")

                if step_type == "delay":
                    delay = step.get("delay_seconds", 5)
                    await asyncio.sleep(delay)
                    step_result["output"] = f"Waited {delay} seconds"
                    step_result["status"] = "success"

                elif step_type == "command":
                    session_id = workflow.get("target_session")
                    if not session_id:
                        raise Exception("No target session specified")

                    command = step.get("command", "")
                    output = await msf_client.session_meterpreter_run_single(session_id, command)
                    step_result["output"] = output
                    step_result["status"] = "success"

                elif step_type in ["exploit", "auxiliary", "post"]:
                    module = step.get("module", "")
                    options = dict(step.get("options", {}))

                    # Add session ID for post modules
                    if step_type == "post" and workflow.get("target_session"):
                        options["SESSION"] = str(workflow["target_session"])

                    # Add RHOSTS for exploit/aux
                    if step_type in ["exploit", "auxiliary"] and workflow.get("target_host"):
                        options["RHOSTS"] = workflow["target_host"]

                    result = await msf_client.run_module(step_type, module, options)
                    step_result["output"] = str(result)
                    step_result["status"] = "success" if result.get("job_id") else "failed"

                log_activity(
                    "workflow_step",
                    f"Step '{step_result['step_name']}' completed",
                    user=user,
                    session_id=workflow.get("target_session"),
                    status=step_result["status"]
                )

            except Exception as e:
                step_result["status"] = "failed"
                step_result["error"] = str(e)
                step_result["output"] = f"Error: {str(e)}"

                log_activity(
                    "workflow_step_failed",
                    f"Step '{step_result['step_name']}' failed: {str(e)}",
                    user=user,
                    session_id=workflow.get("target_session"),
                    status="error"
                )

                if not step.get("continue_on_fail", False):
                    workflow["status"] = "failed"
                    workflow["error"] = f"Step {i+1} failed: {str(e)}"
                    break

            step_result["completed_at"] = datetime.now().isoformat()
            workflow["results"].append(step_result)
            save_workflows()

        if workflow["status"] == "running":
            workflow["status"] = "completed"

        workflow["completed_at"] = datetime.now().isoformat()
        save_workflows()

        log_activity(
            "workflow_completed",
            f"Workflow '{workflow['name']}' {workflow['status']}",
            user=user,
            target=workflow.get("target_host"),
            session_id=workflow.get("target_session"),
            status="success" if workflow["status"] == "completed" else "error"
        )

    except Exception as e:
        workflow["status"] = "failed"
        workflow["error"] = str(e)
        workflow["completed_at"] = datetime.now().isoformat()
        save_workflows()

        log_activity(
            "workflow_failed",
            f"Workflow '{workflow['name']}' failed: {str(e)}",
            user=user,
            status="error"
        )


# ==================== Workflow Endpoints ====================

@router.get("/templates")
async def list_templates(user=Depends(get_current_active_user)):
    """List available workflow templates."""
    templates = []
    for tid, template in WORKFLOW_TEMPLATES.items():
        templates.append({
            "id": tid,
            "name": template["name"],
            "description": template["description"],
            "step_count": len(template["steps"])
        })
    return {"templates": templates}


@router.get("/templates/{template_id}")
async def get_template(template_id: str, user=Depends(get_current_active_user)):
    """Get a workflow template."""
    if template_id not in WORKFLOW_TEMPLATES:
        raise HTTPException(status_code=404, detail="Template not found")
    return WORKFLOW_TEMPLATES[template_id]


@router.get("")
async def list_workflows(
    status: Optional[str] = None,
    user=Depends(get_current_active_user)
):
    """List all workflows."""
    results = list(workflows_db.values())

    if status:
        results = [w for w in results if w.get("status") == status]

    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    return {
        "workflows": results,
        "count": len(results),
        "running": sum(1 for w in workflows_db.values() if w.get("status") == "running")
    }


@router.post("")
async def create_workflow(
    workflow: WorkflowCreate,
    user=Depends(get_current_active_user)
):
    """Create a new workflow."""
    workflow_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    # Process steps and add IDs
    steps = []
    for step in workflow.steps:
        step_dict = step.model_dump()
        step_dict["id"] = str(uuid.uuid4())
        steps.append(step_dict)

    workflows_db[workflow_id] = {
        "id": workflow_id,
        "name": workflow.name,
        "description": workflow.description,
        "target_session": workflow.target_session,
        "target_host": workflow.target_host,
        "steps": steps,
        "tags": workflow.tags,
        "status": "draft",
        "created_at": now,
        "updated_at": now,
        "created_by": user.username if hasattr(user, 'username') else "admin",
    }

    save_workflows()
    log_activity(
        "workflow_created",
        f"Workflow '{workflow.name}' created",
        user=user.username if hasattr(user, 'username') else "admin",
        status="info"
    )

    return workflows_db[workflow_id]


@router.post("/from-template/{template_id}")
async def create_from_template(
    template_id: str,
    name: Optional[str] = None,
    target_session: Optional[int] = None,
    target_host: Optional[str] = None,
    user=Depends(get_current_active_user)
):
    """Create a workflow from a template."""
    if template_id not in WORKFLOW_TEMPLATES:
        raise HTTPException(status_code=404, detail="Template not found")

    template = WORKFLOW_TEMPLATES[template_id]
    workflow_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    # Process steps
    steps = []
    for step in template["steps"]:
        step_copy = dict(step)
        step_copy["id"] = str(uuid.uuid4())
        steps.append(step_copy)

    workflows_db[workflow_id] = {
        "id": workflow_id,
        "name": name or template["name"],
        "description": template["description"],
        "target_session": target_session,
        "target_host": target_host,
        "steps": steps,
        "tags": [template_id],
        "status": "ready" if (target_session or target_host) else "draft",
        "created_at": now,
        "updated_at": now,
        "created_by": user.username if hasattr(user, 'username') else "admin",
        "template_id": template_id,
    }

    save_workflows()
    return workflows_db[workflow_id]


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str, user=Depends(get_current_active_user)):
    """Get a workflow by ID."""
    if workflow_id not in workflows_db:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflows_db[workflow_id]


@router.put("/{workflow_id}")
async def update_workflow(
    workflow_id: str,
    update: WorkflowUpdate,
    user=Depends(get_current_active_user)
):
    """Update a workflow."""
    if workflow_id not in workflows_db:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow = workflows_db[workflow_id]

    if workflow.get("status") == "running":
        raise HTTPException(status_code=400, detail="Cannot update running workflow")

    update_data = update.model_dump(exclude_unset=True)

    # Process steps if provided
    if "steps" in update_data and update_data["steps"]:
        steps = []
        for step in update_data["steps"]:
            if isinstance(step, dict):
                if not step.get("id"):
                    step["id"] = str(uuid.uuid4())
                steps.append(step)
        update_data["steps"] = steps

    for key, value in update_data.items():
        workflow[key] = value

    workflow["updated_at"] = datetime.now().isoformat()
    save_workflows()

    return workflow


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: str, user=Depends(get_current_active_user)):
    """Delete a workflow."""
    if workflow_id not in workflows_db:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow = workflows_db[workflow_id]
    if workflow.get("status") == "running":
        raise HTTPException(status_code=400, detail="Cannot delete running workflow")

    del workflows_db[workflow_id]
    save_workflows()

    log_activity(
        "workflow_deleted",
        f"Workflow '{workflow['name']}' deleted",
        user=user.username if hasattr(user, 'username') else "admin",
        status="info"
    )

    return {"success": True, "message": "Workflow deleted"}


@router.post("/{workflow_id}/run")
async def run_workflow(
    workflow_id: str,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_active_user)
):
    """Run a workflow."""
    if workflow_id not in workflows_db:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow = workflows_db[workflow_id]

    if workflow.get("status") == "running":
        raise HTTPException(status_code=400, detail="Workflow already running")

    if not workflow.get("steps"):
        raise HTTPException(status_code=400, detail="Workflow has no steps")

    # Check if MSF is connected
    if not msf_client.connected:
        raise HTTPException(status_code=503, detail="Metasploit RPC not connected")

    username = user.username if hasattr(user, 'username') else "admin"
    background_tasks.add_task(execute_workflow, workflow_id, username)

    return {"success": True, "message": "Workflow started", "workflow_id": workflow_id}


@router.post("/{workflow_id}/stop")
async def stop_workflow(workflow_id: str, user=Depends(get_current_active_user)):
    """Stop a running workflow."""
    if workflow_id not in workflows_db:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow = workflows_db[workflow_id]

    if workflow.get("status") != "running":
        raise HTTPException(status_code=400, detail="Workflow is not running")

    workflow["status"] = "paused"
    workflow["paused_at"] = datetime.now().isoformat()
    save_workflows()

    log_activity(
        "workflow_stopped",
        f"Workflow '{workflow['name']}' stopped",
        user=user.username if hasattr(user, 'username') else "admin",
        status="warning"
    )

    return {"success": True, "message": "Workflow stop requested"}


@router.post("/{workflow_id}/duplicate")
async def duplicate_workflow(workflow_id: str, user=Depends(get_current_active_user)):
    """Duplicate a workflow."""
    if workflow_id not in workflows_db:
        raise HTTPException(status_code=404, detail="Workflow not found")

    original = workflows_db[workflow_id]
    new_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    # Deep copy steps with new IDs
    steps = []
    for step in original.get("steps", []):
        step_copy = dict(step)
        step_copy["id"] = str(uuid.uuid4())
        steps.append(step_copy)

    workflows_db[new_id] = {
        "id": new_id,
        "name": f"{original['name']} (Copy)",
        "description": original.get("description"),
        "target_session": original.get("target_session"),
        "target_host": original.get("target_host"),
        "steps": steps,
        "tags": original.get("tags", []),
        "status": "draft",
        "created_at": now,
        "updated_at": now,
        "created_by": user.username if hasattr(user, 'username') else "admin",
    }

    save_workflows()
    return workflows_db[new_id]


# ==================== Activity Log Endpoints ====================

@router.get("/activity/log")
async def get_activity_log(
    limit: int = 100,
    action: Optional[str] = None,
    status: Optional[str] = None,
    user=Depends(get_current_active_user)
):
    """Get activity log entries."""
    results = list(activity_log)

    if action:
        results = [e for e in results if e.get("action") == action]
    if status:
        results = [e for e in results if e.get("status") == status]

    # Return most recent first
    results.reverse()
    results = results[:limit]

    return {
        "entries": results,
        "count": len(results),
        "total": len(activity_log)
    }


@router.post("/activity/log")
async def add_activity_log(
    entry: ActivityLogEntry,
    user=Depends(get_current_active_user)
):
    """Add a manual activity log entry."""
    username = user.username if hasattr(user, 'username') else "admin"
    result = log_activity(
        entry.action,
        entry.details,
        user=entry.user or username,
        target=entry.target,
        session_id=entry.session_id,
        status=entry.status
    )
    return result


@router.delete("/activity/log")
async def clear_activity_log(user=Depends(get_current_active_user)):
    """Clear the activity log."""
    global activity_log
    activity_log = []
    save_activity_log()
    return {"success": True, "message": "Activity log cleared"}
