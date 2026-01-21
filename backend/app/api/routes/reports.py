from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid
import os
import json

from app.api.routes.auth import get_current_active_user
from app.api.routes.targets import targets_db, services_db
from app.api.routes.postex import credentials_db
from app.api.routes.automation import activity_log, workflows_db
from app.api.routes.nmap import completed_scans

router = APIRouter()

# Reports storage
REPORTS_FILE = "/tmp/msf_gui_reports.json"
reports_db: dict[str, dict] = {}


class ReportCreate(BaseModel):
    name: str
    description: Optional[str] = None
    type: str = "engagement"  # engagement, executive, technical
    include_targets: bool = True
    include_credentials: bool = True
    include_activity: bool = True
    include_scans: bool = True
    include_workflows: bool = True
    date_from: Optional[str] = None
    date_to: Optional[str] = None


def load_reports():
    global reports_db
    if os.path.exists(REPORTS_FILE):
        try:
            with open(REPORTS_FILE, 'r') as f:
                reports_db = json.load(f)
        except Exception:
            reports_db = {}


def save_reports():
    try:
        with open(REPORTS_FILE, 'w') as f:
            json.dump(reports_db, f, indent=2)
    except Exception as e:
        print(f"Failed to save reports: {e}")


load_reports()


def generate_report_data(config: dict) -> dict:
    """Generate report data based on configuration."""
    data = {
        "generated_at": datetime.now().isoformat(),
        "config": config,
        "summary": {},
    }

    date_from = config.get("date_from")
    date_to = config.get("date_to")

    # Targets
    if config.get("include_targets", True):
        targets = list(targets_db.values())
        if date_from:
            targets = [t for t in targets if t.get("created_at", "") >= date_from]
        if date_to:
            targets = [t for t in targets if t.get("created_at", "") <= date_to]

        services = list(services_db.values())

        data["targets"] = {
            "items": targets,
            "count": len(targets),
            "by_status": {},
            "by_os": {},
        }

        for t in targets:
            status = t.get("status", "unknown")
            data["targets"]["by_status"][status] = data["targets"]["by_status"].get(status, 0) + 1
            os_family = t.get("os_family", "unknown")
            data["targets"]["by_os"][os_family] = data["targets"]["by_os"].get(os_family, 0) + 1

        data["services"] = {
            "items": services,
            "count": len(services),
        }

        data["summary"]["total_targets"] = len(targets)
        data["summary"]["total_services"] = len(services)
        data["summary"]["compromised_targets"] = data["targets"]["by_status"].get("compromised", 0)

    # Credentials
    if config.get("include_credentials", True):
        creds = list(credentials_db.values())
        if date_from:
            creds = [c for c in creds if c.get("created_at", "") >= date_from]
        if date_to:
            creds = [c for c in creds if c.get("created_at", "") <= date_to]

        data["credentials"] = {
            "items": creds,
            "count": len(creds),
            "by_source": {},
            "by_host": {},
        }

        for c in creds:
            source = c.get("source", "unknown")
            data["credentials"]["by_source"][source] = data["credentials"]["by_source"].get(source, 0) + 1
            host = c.get("host", "unknown")
            if host:
                data["credentials"]["by_host"][host] = data["credentials"]["by_host"].get(host, 0) + 1

        data["summary"]["total_credentials"] = len(creds)

    # Activity Log
    if config.get("include_activity", True):
        activities = list(activity_log)
        if date_from:
            activities = [a for a in activities if a.get("timestamp", "") >= date_from]
        if date_to:
            activities = [a for a in activities if a.get("timestamp", "") <= date_to]

        data["activity"] = {
            "items": activities[-500:],  # Last 500 entries
            "count": len(activities),
            "by_action": {},
            "by_status": {},
        }

        for a in activities:
            action = a.get("action", "unknown")
            data["activity"]["by_action"][action] = data["activity"]["by_action"].get(action, 0) + 1
            status = a.get("status", "info")
            data["activity"]["by_status"][status] = data["activity"]["by_status"].get(status, 0) + 1

        data["summary"]["total_activities"] = len(activities)

    # Scans
    if config.get("include_scans", True):
        scans = list(completed_scans.values())
        if date_from:
            scans = [s for s in scans if s.get("created_at", "") >= date_from]
        if date_to:
            scans = [s for s in scans if s.get("created_at", "") <= date_to]

        data["scans"] = {
            "items": scans,
            "count": len(scans),
            "by_profile": {},
        }

        for s in scans:
            profile = s.get("profile", "unknown")
            data["scans"]["by_profile"][profile] = data["scans"]["by_profile"].get(profile, 0) + 1

        data["summary"]["total_scans"] = len(scans)

    # Workflows
    if config.get("include_workflows", True):
        workflows = list(workflows_db.values())
        if date_from:
            workflows = [w for w in workflows if w.get("created_at", "") >= date_from]
        if date_to:
            workflows = [w for w in workflows if w.get("created_at", "") <= date_to]

        data["workflows"] = {
            "items": workflows,
            "count": len(workflows),
            "by_status": {},
        }

        for w in workflows:
            status = w.get("status", "unknown")
            data["workflows"]["by_status"][status] = data["workflows"]["by_status"].get(status, 0) + 1

        data["summary"]["total_workflows"] = len(workflows)
        data["summary"]["completed_workflows"] = data["workflows"]["by_status"].get("completed", 0)

    return data


def generate_html_report(data: dict, config: dict) -> str:
    """Generate HTML report."""
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{config.get('name', 'Engagement Report')}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background: #1a1a2e; color: #eee; padding: 40px; }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        h1 {{ color: #e94560; margin-bottom: 10px; }}
        h2 {{ color: #e94560; margin: 30px 0 15px; border-bottom: 2px solid #e94560; padding-bottom: 5px; }}
        h3 {{ color: #0f3460; margin: 20px 0 10px; }}
        .meta {{ color: #888; margin-bottom: 30px; }}
        .summary {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }}
        .summary-card {{ background: #16213e; border-radius: 8px; padding: 20px; text-align: center; }}
        .summary-card .value {{ font-size: 36px; font-weight: bold; color: #e94560; }}
        .summary-card .label {{ color: #888; margin-top: 5px; }}
        table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
        th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #333; }}
        th {{ background: #16213e; color: #e94560; }}
        tr:hover {{ background: #16213e; }}
        .tag {{ display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin: 2px; }}
        .tag-online {{ background: #22c55e33; color: #22c55e; }}
        .tag-offline {{ background: #ef444433; color: #ef4444; }}
        .tag-compromised {{ background: #e9456033; color: #e94560; }}
        .tag-success {{ background: #22c55e33; color: #22c55e; }}
        .tag-error {{ background: #ef444433; color: #ef4444; }}
        .tag-warning {{ background: #eab30833; color: #eab308; }}
        .tag-info {{ background: #3b82f633; color: #3b82f6; }}
        .chart {{ background: #16213e; border-radius: 8px; padding: 20px; margin: 20px 0; }}
        .bar {{ height: 24px; background: #e94560; border-radius: 4px; margin: 5px 0; display: flex; align-items: center; padding-left: 10px; color: white; font-size: 12px; }}
        .section {{ margin: 40px 0; }}
        @media print {{
            body {{ background: white; color: black; }}
            .summary-card {{ border: 1px solid #ddd; }}
            th {{ background: #f5f5f5; }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>{config.get('name', 'Engagement Report')}</h1>
        <p class="meta">
            Generated: {data.get('generated_at', '')}<br>
            {config.get('description', '')}
        </p>

        <div class="summary">
            <div class="summary-card">
                <div class="value">{data.get('summary', {}).get('total_targets', 0)}</div>
                <div class="label">Total Targets</div>
            </div>
            <div class="summary-card">
                <div class="value">{data.get('summary', {}).get('compromised_targets', 0)}</div>
                <div class="label">Compromised</div>
            </div>
            <div class="summary-card">
                <div class="value">{data.get('summary', {}).get('total_services', 0)}</div>
                <div class="label">Services</div>
            </div>
            <div class="summary-card">
                <div class="value">{data.get('summary', {}).get('total_credentials', 0)}</div>
                <div class="label">Credentials</div>
            </div>
        </div>
"""

    # Targets section
    if data.get("targets"):
        html += """
        <div class="section">
            <h2>Targets</h2>
"""
        # Status chart
        if data["targets"].get("by_status"):
            html += '<div class="chart"><h3>By Status</h3>'
            total = sum(data["targets"]["by_status"].values())
            for status, count in data["targets"]["by_status"].items():
                pct = int((count / total) * 100) if total > 0 else 0
                html += f'<div class="bar" style="width: {max(pct, 10)}%">{status}: {count}</div>'
            html += '</div>'

        # Targets table
        html += """
            <table>
                <thead>
                    <tr>
                        <th>IP</th>
                        <th>Hostname</th>
                        <th>OS</th>
                        <th>Status</th>
                        <th>Services</th>
                    </tr>
                </thead>
                <tbody>
"""
        for target in data["targets"].get("items", [])[:50]:
            status_class = f"tag-{target.get('status', 'unknown')}"
            svc_count = sum(1 for s in data.get("services", {}).get("items", []) if s.get("host_id") == target.get("id"))
            html += f"""
                    <tr>
                        <td>{target.get('ip', '')}</td>
                        <td>{target.get('hostname', '-')}</td>
                        <td>{target.get('os', '-')}</td>
                        <td><span class="tag {status_class}">{target.get('status', 'unknown')}</span></td>
                        <td>{svc_count}</td>
                    </tr>
"""
        html += """
                </tbody>
            </table>
        </div>
"""

    # Credentials section
    if data.get("credentials"):
        html += """
        <div class="section">
            <h2>Credentials</h2>
            <table>
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Password/Hash</th>
                        <th>Host</th>
                        <th>Service</th>
                        <th>Source</th>
                    </tr>
                </thead>
                <tbody>
"""
        for cred in data["credentials"].get("items", [])[:50]:
            secret = cred.get("password") or (cred.get("hash", "")[:20] + "..." if cred.get("hash") else "-")
            html += f"""
                    <tr>
                        <td>{cred.get('username', '')}</td>
                        <td><code>{secret}</code></td>
                        <td>{cred.get('host', '-')}</td>
                        <td>{cred.get('service', '-')}</td>
                        <td>{cred.get('source', '-')}</td>
                    </tr>
"""
        html += """
                </tbody>
            </table>
        </div>
"""

    # Activity section
    if data.get("activity"):
        html += """
        <div class="section">
            <h2>Activity Timeline</h2>
            <table>
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Action</th>
                        <th>Details</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
"""
        for entry in data["activity"].get("items", [])[-100:]:
            status_class = f"tag-{entry.get('status', 'info')}"
            html += f"""
                    <tr>
                        <td>{entry.get('timestamp', '')[:19]}</td>
                        <td>{entry.get('action', '')}</td>
                        <td>{entry.get('details', '')[:100]}</td>
                        <td><span class="tag {status_class}">{entry.get('status', 'info')}</span></td>
                    </tr>
"""
        html += """
                </tbody>
            </table>
        </div>
"""

    html += """
    </div>
</body>
</html>
"""
    return html


def generate_json_report(data: dict) -> str:
    """Generate JSON report."""
    return json.dumps(data, indent=2)


# ==================== Report Endpoints ====================

@router.get("")
async def list_reports(user=Depends(get_current_active_user)):
    """List all saved reports."""
    results = list(reports_db.values())
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"reports": results, "count": len(results)}


@router.post("")
async def create_report(
    config: ReportCreate,
    user=Depends(get_current_active_user)
):
    """Create and save a new report."""
    report_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    config_dict = config.model_dump()
    data = generate_report_data(config_dict)

    reports_db[report_id] = {
        "id": report_id,
        "name": config.name,
        "description": config.description,
        "type": config.type,
        "config": config_dict,
        "data": data,
        "created_at": now,
        "created_by": user.username if hasattr(user, 'username') else "admin",
    }

    save_reports()
    return reports_db[report_id]


@router.get("/preview")
async def preview_report(
    include_targets: bool = True,
    include_credentials: bool = True,
    include_activity: bool = True,
    include_scans: bool = True,
    include_workflows: bool = True,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user=Depends(get_current_active_user)
):
    """Preview report data without saving."""
    config = {
        "include_targets": include_targets,
        "include_credentials": include_credentials,
        "include_activity": include_activity,
        "include_scans": include_scans,
        "include_workflows": include_workflows,
        "date_from": date_from,
        "date_to": date_to,
    }
    return generate_report_data(config)


@router.get("/{report_id}")
async def get_report(report_id: str, user=Depends(get_current_active_user)):
    """Get a saved report."""
    if report_id not in reports_db:
        raise HTTPException(status_code=404, detail="Report not found")
    return reports_db[report_id]


@router.get("/{report_id}/export/html")
async def export_report_html(report_id: str, user=Depends(get_current_active_user)):
    """Export report as HTML."""
    if report_id not in reports_db:
        raise HTTPException(status_code=404, detail="Report not found")

    report = reports_db[report_id]
    html = generate_html_report(report.get("data", {}), report.get("config", {}))

    return Response(
        content=html,
        media_type="text/html",
        headers={"Content-Disposition": f"attachment; filename={report['name']}.html"}
    )


@router.get("/{report_id}/export/json")
async def export_report_json(report_id: str, user=Depends(get_current_active_user)):
    """Export report as JSON."""
    if report_id not in reports_db:
        raise HTTPException(status_code=404, detail="Report not found")

    report = reports_db[report_id]
    json_data = generate_json_report(report.get("data", {}))

    return Response(
        content=json_data,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={report['name']}.json"}
    )


@router.delete("/{report_id}")
async def delete_report(report_id: str, user=Depends(get_current_active_user)):
    """Delete a report."""
    if report_id not in reports_db:
        raise HTTPException(status_code=404, detail="Report not found")

    del reports_db[report_id]
    save_reports()

    return {"success": True, "message": "Report deleted"}


@router.get("/stats/summary")
async def get_engagement_stats(user=Depends(get_current_active_user)):
    """Get overall engagement statistics."""
    return {
        "targets": {
            "total": len(targets_db),
            "compromised": sum(1 for t in targets_db.values() if t.get("status") == "compromised"),
            "online": sum(1 for t in targets_db.values() if t.get("status") == "online"),
        },
        "services": {
            "total": len(services_db),
        },
        "credentials": {
            "total": len(credentials_db),
            "with_password": sum(1 for c in credentials_db.values() if c.get("password")),
            "with_hash": sum(1 for c in credentials_db.values() if c.get("hash")),
        },
        "workflows": {
            "total": len(workflows_db),
            "completed": sum(1 for w in workflows_db.values() if w.get("status") == "completed"),
            "running": sum(1 for w in workflows_db.values() if w.get("status") == "running"),
        },
        "scans": {
            "total": len(completed_scans),
        },
        "activity": {
            "total": len(activity_log),
        }
    }
