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
| Phase 3: Target & Network | 🔲 Not Started | 0% |
| Phase 4: Post-Exploitation | 🔲 Not Started | 0% |
| Phase 5: Advanced Features | 🔲 Not Started | 0% |

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

## Next Phase: Phase 3 - Target & Network

### Overview
Phase 3 focuses on target management and network visualization to provide a comprehensive view of the engagement scope.

### Features to Implement

#### 3.1 Target/Host Management
**Purpose**: Central database for tracking all hosts in the engagement

| Feature | Description | Priority |
|---------|-------------|----------|
| Host CRUD | Add, edit, delete target hosts | High |
| Host Details | IP, hostname, OS, notes, tags | High |
| Status Tracking | Online/offline, compromised status | Medium |
| Host Groups | Organize hosts by network/purpose | Medium |
| Import Hosts | Import from file (CSV, XML) | Low |

**UI Components Needed**:
- `Targets.tsx` - Main targets page
- `TargetCard.tsx` - Individual host display
- `AddTargetModal.tsx` - Form to add/edit hosts
- `targetStore.ts` - Zustand store for hosts

**Backend Endpoints**:
```
GET    /api/v1/targets          - List all targets
POST   /api/v1/targets          - Add new target
GET    /api/v1/targets/{id}     - Get target details
PUT    /api/v1/targets/{id}     - Update target
DELETE /api/v1/targets/{id}     - Delete target
POST   /api/v1/targets/import   - Import from file
```

#### 3.2 Network Topology Visualization
**Purpose**: Visual map showing network relationships and attack paths

| Feature | Description | Priority |
|---------|-------------|----------|
| Network Graph | D3.js interactive visualization | High |
| Auto-layout | Automatic node positioning | High |
| Pivot Paths | Show session routes/pivots | Medium |
| Zoom/Pan | Navigate large networks | Medium |
| Node Actions | Right-click context menu | Low |

**Implementation**:
- Use D3.js force-directed graph
- Nodes = hosts, Edges = connections/pivots
- Color coding: green (compromised), yellow (scanned), gray (unknown)
- Click node to see details, double-click to open session

#### 3.3 Service Enumeration Display
**Purpose**: Track discovered services on each host

| Feature | Description | Priority |
|---------|-------------|----------|
| Service List | Port, protocol, service name, version | High |
| Vuln Linking | Link services to potential exploits | Medium |
| Banner Grab | Display service banners | Low |
| Service Search | Find hosts by service type | Medium |

**Data Model**:
```typescript
interface Service {
  id: string
  host_id: string
  port: number
  protocol: 'tcp' | 'udp'
  service: string
  version?: string
  banner?: string
  state: 'open' | 'filtered' | 'closed'
}
```

#### 3.4 Nmap Integration
**Purpose**: Run scans directly from UI and import results

| Feature | Description | Priority |
|---------|-------------|----------|
| Quick Scan | Common scan profiles | High |
| Custom Scan | Full nmap options | Medium |
| Scan Progress | Real-time scan status | High |
| Result Import | Parse and import XML results | High |
| Auto-populate | Create hosts from scan results | High |

**Scan Profiles**:
- Quick Scan: `-T4 -F`
- Full Scan: `-T4 -A -p-`
- Stealth Scan: `-sS -T2`
- UDP Scan: `-sU --top-ports 100`
- Vuln Scan: `--script vuln`

---

## Future Phases Overview

### Phase 4: Post-Exploitation
- Post-exploitation module browser (filter by session type)
- Credential vault (store harvested creds, hash cracking)
- File browser for meterpreter sessions (upload/download)
- Screenshot and keylogger viewers
- Process list and management
- Privilege escalation suggestions

### Phase 5: Advanced Features
- Automation workflows (attack chains, scheduled tasks)
- Team collaboration (multi-user, shared sessions, activity log)
- Reporting system (engagement timeline, PDF/HTML export)
- Android app packaging (Capacitor)
- Notifications (desktop/push for new sessions)

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
│   │   │   └── common/          # Layout, Login
│   │   ├── services/            # API and Socket clients
│   │   ├── store/               # Zustand state stores
│   │   └── types/               # TypeScript definitions
│   └── package.json
│
├── backend/                     # FastAPI server
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes/          # API endpoints
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

Last Updated: 2026-01-21
