# Metasploit GUI - Project Status

## Project Overview
A cross-platform GUI (Browser + Android) for Metasploit Framework combining features from Metasploit Pro, PowerShell Empire, Cobalt Strike, and Armitage for personal lab/CTF use.

## Technology Stack
- **Frontend**: React 18 + TypeScript + Tailwind CSS + Zustand
- **Backend**: Python FastAPI + pymetasploit3
- **Real-time**: Socket.IO
- **Terminal**: xterm.js
- **Visualization**: D3.js (planned)
- **Mobile**: Capacitor (planned)

---

## Current Status Summary

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 1: Foundation | ✅ Complete | 100% |
| Phase 2: Core MSF Integration | ✅ Complete | 100% |
| Phase 3: Target & Network | ✅ Complete | 100% |
| Phase 4: Post-Exploitation | ✅ Complete | 100% |
| Phase 5: Advanced Features | ✅ Complete | 100% |
| Phase 6: Social Engineering | ✅ Complete | 100% |

---

## Completed Features

### Phase 1: Foundation ✅
- [x] Project structure setup (React + FastAPI)
- [x] JWT authentication system
- [x] MSF RPC connection via pymetasploit3
- [x] Basic UI layout with Tailwind CSS
- [x] Socket.IO real-time communication

### Phase 2: Core MSF Integration ✅
- [x] **Dashboard** - Overview with module stats, session count, connection status
- [x] **Module Browser** - Search/filter by type (exploit, payload, auxiliary, post, encoder, nop)
- [x] **Session Management** - List sessions, kill sessions, real-time updates via WebSocket
- [x] **Session Terminal** - Interactive shell/meterpreter terminal with:
  - Colored prompts (magenta for meterpreter, green for shell)
  - Command history (↑/↓ arrows)
  - Cursor navigation (←/→ arrows, Home/End)
  - Ctrl+C support
- [x] **msfconsole Terminal** - Full interactive console with:
  - Styled `msf6 >` prompt
  - Welcome banner
  - Tab support for multiple consoles
  - Command history and editing
  - Fullscreen mode
- [x] **Listener Management** - Create/kill handlers with quick templates
- [x] **Payload Generator** - Full-featured with:
  - 22+ payload templates (Windows, Linux, Android, macOS, Multi)
  - Dynamic options fetching
  - Encoder selection with iterations
  - Bad character filtering
  - Multiple output formats (exe, dll, elf, apk, ps1, py, raw, etc.)
  - Payload hosting with custom URLs

---

### Phase 3: Target & Network ✅

#### 3.1 Target/Host Management ✅
- [x] Full CRUD operations (create, read, update, delete)
- [x] Host details: IP, hostname, OS, OS family, architecture, notes, tags
- [x] Status tracking: unknown, online, offline, compromised
- [x] Host groups for organization
- [x] Bulk operations (delete, status update)
- [x] Stats dashboard with counts by status, OS, groups
- [x] Target search and filtering
- [x] File-based persistence (`/tmp/msf_gui_targets.json`)

**Backend API**: `/api/v1/targets`
**Frontend**: `Targets.tsx`, `targetStore.ts`

#### 3.2 Network Topology Visualization 🔲 (Optional/Deferred)
- [ ] D3.js interactive network graph
- [ ] Auto-layout with force-directed positioning
- [ ] Pivot path visualization
- [ ] Zoom/pan navigation
- [ ] Node context menu actions

*Note: Moved to optional/future as not essential for core functionality*

#### 3.3 Service Enumeration ✅
- [x] Service tracking per host (port, protocol, service name, version, banner)
- [x] Service CRUD operations
- [x] Service state tracking (open, filtered, closed)
- [x] Display in expandable target rows
- [x] Auto-import from nmap scans

**Backend API**: `/api/v1/targets/{id}/services`

#### 3.4 Nmap Integration ✅
- [x] 7 predefined scan profiles:
  - Quick Scan (`-T4 -F`)
  - Full Scan (`-T4 -A -p-`)
  - Stealth Scan (`-sS -T2`)
  - UDP Scan (`-sU --top-ports 100`)
  - Vulnerability Scan (`-sV --script vuln`)
  - Host Discovery (`-sn`)
  - Service Version (`-sV`)
- [x] Custom scan arguments support
- [x] Background task execution with status polling
- [x] XML result parsing
- [x] Auto-import discovered hosts and services to targets
- [x] Scan history with results display

**Backend API**: `/api/v1/nmap`
**UI**: Scan modal in Targets page

---

### Phase 4: Post-Exploitation ✅

#### 4.1 Post-Exploitation Module Browser ✅
- [x] List all post modules with platform filtering
- [x] Search modules by name
- [x] View module details and options
- [x] Execute modules against sessions
- [x] SESSION option auto-populated

**Backend API**: `/api/v1/postex/modules`

#### 4.2 Credential Vault ✅
- [x] Store credentials (username, password, hash)
- [x] Support for hash types (NTLM, LM, etc.)
- [x] Domain, host, service, and port tracking
- [x] Source tracking (hashdump, mimikatz, manual)
- [x] Add, edit, delete credentials
- [x] File-based persistence

**Backend API**: `/api/v1/postex/credentials`

#### 4.3 Meterpreter File Browser ✅
- [x] List files and directories
- [x] Navigate directory tree
- [x] Download files from target
- [x] Get current working directory

**Backend API**: `/api/v1/postex/sessions/{id}/files`

#### 4.4 Process Management ✅
- [x] List all processes (PID, name, user, arch, path)
- [x] Search/filter processes
- [x] Kill processes
- [x] Migrate to another process

**Backend API**: `/api/v1/postex/sessions/{id}/processes`

#### 4.5 System Information ✅
- [x] Get system info (OS, architecture, domain, etc.)
- [x] Get current user (getuid)
- [x] Get privileges (getprivs)
- [x] Take screenshots
- [x] Run hashdump with auto-import to credentials

**Backend API**: `/api/v1/postex/sessions/{id}/sysinfo`

#### 4.6 Privilege Escalation ✅
- [x] Get SYSTEM privileges (getsystem)
- [x] Run local exploit suggester
- [x] Quick action buttons in UI

**Frontend**: `PostExploitation.tsx` with tabbed interface

---

### Phase 5: Advanced Features 🟡

#### 5.1 Automation Workflows ✅
- [x] Workflow management (create, edit, delete, duplicate)
- [x] 5 predefined workflow templates:
  - Windows Post-Exploit Chain
  - Linux Post-Exploit Chain
  - Privilege Escalation
  - Credential Harvest
  - Persistence Setup
- [x] Step types: exploit, auxiliary, post, command, delay
- [x] Background workflow execution
- [x] Step-by-step result tracking
- [x] Pause/resume/stop controls
- [x] Continue on fail option per step

**Backend API**: `/api/v1/automation`
**Frontend**: `Automation.tsx`

#### 5.2 Activity Log / Audit Trail ✅
- [x] Log all significant actions
- [x] Timestamps and user tracking
- [x] Filter by action type and status
- [x] Integration with workflow execution
- [x] Persistent storage

**Backend API**: `/api/v1/automation/activity`

#### 5.3 Reporting System ✅
- [x] Report generation with configurable sections
- [x] Report types: engagement, executive, technical
- [x] Include targets, credentials, activity, scans, workflows
- [x] Date range filtering
- [x] HTML and JSON export
- [x] Engagement statistics dashboard
- [x] Report preview

**Backend API**: `/api/v1/reports`
**Frontend**: `Reports.tsx`

#### 5.4 Notifications ✅
- [x] Desktop browser notifications (with permission request)
- [x] Sound notifications (toggleable)
- [x] Real-time toast notifications with animations
- [x] Notification center with history
- [x] New session alerts
- [x] Listener start/stop notifications
- [x] Job completion alerts
- [x] Mark as read / clear all functionality
- [x] Notification settings (desktop/sound toggle)

**Frontend**: `notificationStore.ts`, `useNotifications.ts`, `Toast.tsx`, `NotificationCenter.tsx`

#### 5.5 Android App (Capacitor) 🔲 *Deferred*
- [ ] Capacitor wrapper
- [ ] Mobile-optimized layouts
- [ ] Push notifications

---

### Phase 6: Social Engineering ✅

#### 6.1 Phishing Campaign Manager ✅
- [x] Campaign creation and management
- [x] Campaign status tracking (draft, running, paused, completed)
- [x] Campaign statistics dashboard
- [x] Conversion funnel visualization
- [x] Real-time tracking (opens, clicks, submissions)

**Backend API**: `/api/v1/phishing/campaigns`

#### 6.2 Email Templates ✅
- [x] 6 prebuilt phishing templates:
  - Password Reset Required
  - Office 365 Session Expired
  - Document Shared With You
  - IT Support Account Verification
  - Invoice Attached
  - Security Alert - New Login
- [x] Custom template editor
- [x] Template variables (first_name, email, tracking_url, etc.)
- [x] Tracking pixel injection

**Backend API**: `/api/v1/phishing/templates`

#### 6.3 Landing Pages ✅
- [x] 3 prebuilt credential capture pages:
  - Office 365 Login
  - Google Sign In
  - Generic Corporate Login
- [x] Website cloning functionality
- [x] Custom HTML page editor
- [x] Automatic form modification for credential capture
- [x] Redirect after capture

**Backend API**: `/api/v1/phishing/landing-pages`

#### 6.4 Target Management ✅
- [x] Target groups creation
- [x] CSV import (email, first_name, last_name, position, department)
- [x] Per-group target listing
- [x] Target count tracking

**Backend API**: `/api/v1/phishing/targets`

#### 6.5 Credential Harvesting ✅
- [x] Automatic credential capture from landing pages
- [x] IP address and user agent logging
- [x] Timestamp tracking
- [x] Copy to clipboard functionality
- [x] Campaign-specific credential filtering

**Backend API**: `/api/v1/phishing/capture`, `/api/v1/phishing/captured`

#### 6.6 SMTP Configuration ✅
- [x] SMTP server configuration
- [x] TLS/SSL support
- [x] Connection testing
- [x] Multiple SMTP configs support

**Frontend**: `Phishing.tsx` with tabbed interface

---

## All Core Phases Complete!

The Metasploit GUI has all major features implemented:
- Foundation & Authentication
- Core MSF Integration (Sessions, Modules, Terminal, Listeners, Payloads)
- Target & Network Management (Hosts, Services, Nmap)
- Post-Exploitation Tools
- Automation, Reporting & Notifications
- **Social Engineering & Phishing Campaigns**

### Future Enhancements (Optional)
- Network topology visualization (D3.js)
- Mobile app (Capacitor)
- Multi-user collaboration
- Session recording/playback
- Custom module integration
- Advanced OSINT integration
- C2 enhancements (beacon scheduling, lateral movement)

---

## Recent Fixes Applied
1. **MSF RPC API** - Changed to direct `client.call()` method for reliability
2. **Payload generation** - Uses msfvenom subprocess (fixes binary encoding issues)
3. **Android APK** - No `-f` flag needed for android payloads
4. **Terminal output** - Fixed line ending issues with `convertEol: true`
5. **Payload hosting** - Custom URL paths (`/dl/downloadandroid`), IP/port config
6. **Terminal Prompts** - Added styled `msf6 >` prompt and welcome banner to msfconsole terminal
7. **Session Terminal** - Added colored prompts for meterpreter/shell sessions
8. **Payloads Page Crash** - Fixed encoder handling (API returns objects, not strings)
9. **TypeScript Errors** - Fixed unused imports and type mismatches across components
10. **Debounce Fix** - Fixed broken debounce in payload options fetching

---

## How to Run

### Prerequisites
- Metasploit Framework installed
- Node.js 18+
- Python 3.10+

### Start MSF RPC
```bash
msfrpcd -P yourpassword -S -a 127.0.0.1
```

### Start Backend
```bash
cd /home/riyo/metasploitGui/backend
source venv/bin/activate
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload
```

### Start Frontend
```bash
cd /home/riyo/metasploitGui/frontend
npm run dev
```

### Access
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Default Credentials
- Username: `admin`
- Password: `admin`

---

## Project Structure
```
metasploitGui/
├── frontend/                    # React web application
│   ├── src/
│   │   ├── components/
│   │   │   ├── dashboard/       # Main dashboard
│   │   │   ├── sessions/        # Session management + terminal
│   │   │   ├── modules/         # Module browser
│   │   │   ├── listeners/       # Listener/handler config
│   │   │   ├── payloads/        # Payload generator
│   │   │   ├── terminal/        # msfconsole terminal
│   │   │   ├── targets/         # Target management + nmap
│   │   │   ├── postex/          # Post-exploitation tools
│   │   │   └── common/          # Layout, Login
│   │   ├── services/            # API and Socket clients
│   │   ├── store/               # Zustand state stores (auth, module, session, target, notification)
│   │   ├── hooks/               # Custom React hooks (useNotifications)
│   │   └── types/               # TypeScript definitions
│   └── package.json
│
├── backend/                     # FastAPI server
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes/          # API endpoints (auth, sessions, modules, console, listeners, payloads, targets, nmap, postex, automation, reports)
│   │   │   └── websocket.py     # Socket.IO handler
│   │   ├── core/
│   │   │   ├── msf_client.py    # Metasploit RPC wrapper
│   │   │   └── config.py        # Settings
│   │   ├── models/              # Pydantic models
│   │   └── services/            # Business logic
│   ├── main.py                  # FastAPI entry point
│   └── requirements.txt
│
└── PROJECT_STATUS.md            # This file
```

---

## Known Issues
1. Hosted payloads are stored in `/tmp` (lost on reboot)
2. Module execution results could use better formatting
3. No error boundaries in React (crashes can blank the page)

---

## Notes
- Payload templates include 4 Android payloads
- Custom payload hosting URLs: `http://<IP>:<PORT>/dl/<custom-path>`
- Session terminals persist across page navigation

---

Last Updated: 2026-01-22
