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

## Completed Features (Phase 1 + Partial Phase 2)

### Backend (`/backend`)
- **FastAPI server** with JWT authentication
- **MSF RPC connection** via pymetasploit3 with direct API calls
- **WebSocket support** for real-time console output
- **Endpoints implemented**:
  - `/api/v1/auth/*` - Login, token management
  - `/api/v1/sessions/*` - Session list, kill, shell/meterpreter interaction
  - `/api/v1/modules/*` - Module search, info, execute, stats
  - `/api/v1/console/*` - Console create, read, write, destroy
  - `/api/v1/listeners/*` - Handler creation, job management
  - `/api/v1/payloads/*` - Generate, host, templates, encoders

### Frontend (`/frontend`)
- **Dashboard** - Overview with module stats, session count
- **Sessions page** - List and manage active sessions
- **Modules page** - Browse and search modules by type
- **Listeners page** - Create handlers with common payload templates
- **Terminal page** - Interactive msfconsole with xterm.js (tab support)
- **Payloads page** - Full payload generator with:
  - 22 payload templates (Windows, Linux, Android, macOS, Multi-platform)
  - Dynamic options fetching based on selected payload
  - Advanced options toggle
  - Platform filtering
  - Encoder selection with iterations and bad chars
  - Payload hosting with custom URL paths

### Key Files Modified/Created

#### Backend
- `backend/main.py` - FastAPI app with `/dl/*` route for hosted payloads
- `backend/app/core/msf_client.py` - MSF RPC wrapper with direct API calls
- `backend/app/api/routes/payloads.py` - Payload generation and hosting
- `backend/app/api/routes/modules.py` - Module browsing and execution
- `backend/app/api/routes/listeners.py` - Handler management
- `backend/app/api/routes/console.py` - Console management
- `backend/app/api/routes/sessions.py` - Session management
- `backend/app/api/websocket.py` - Socket.IO for real-time updates

#### Frontend
- `frontend/src/components/payloads/Payloads.tsx` - Payload generator UI
- `frontend/src/components/terminal/Terminal.tsx` - Interactive terminal
- `frontend/src/components/listeners/Listeners.tsx` - Listener management
- `frontend/src/components/modules/Modules.tsx` - Module browser
- `frontend/src/components/sessions/Sessions.tsx` - Session list
- `frontend/src/services/api.ts` - API client
- `frontend/src/services/socket.ts` - Socket.IO client
- `frontend/src/types/index.ts` - TypeScript interfaces

---

## Recent Fixes Applied
1. **MSF RPC API** - Changed to direct `client.call()` method for reliability
2. **Payload generation** - Uses msfvenom subprocess (fixes binary encoding issues)
3. **Android APK** - No `-f` flag needed for android payloads
4. **Terminal output** - Fixed line ending issues with `convertEol: true`
5. **Payload hosting** - Custom URL paths (`/dl/downloadandroid`), IP/port config

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
source venv/bin/activate  # if using virtualenv
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

## Next Phases

### Phase 2: Core MSF Integration (Partially Done)
- [x] Module browser with search/filter
- [x] Session management with live updates
- [x] Interactive terminal (msfconsole proxy)
- [x] Handler/listener management
- [x] Basic payload generation
- [ ] Module execution UI improvements
- [ ] Session interaction panel (run commands from UI)

### Phase 3: Target & Network
- [ ] **Target/host management**
  - Add/edit/delete target hosts
  - Track host status and notes
  - Tag and categorize hosts
- [ ] **Network topology visualization**
  - D3.js interactive graph
  - Show connections between hosts
  - Visualize pivoting paths
- [ ] **Service enumeration display**
  - List services per host
  - Port/protocol/version info
  - Link services to potential exploits
- [ ] **Nmap integration**
  - Run scans from UI
  - Import scan results
  - Auto-populate targets

### Phase 4: Post-Exploitation
- [ ] **Post-exploitation module browser**
  - Filter by session type/platform
  - Quick-run on selected session
  - Module suggestions based on session
- [ ] **Credential vault**
  - Store harvested creds
  - Hash cracking integration
  - Pass-the-hash support
- [ ] **File browser for sessions**
  - Browse remote filesystem
  - Upload/download files
  - File operations (delete, rename)
- [ ] **Screenshot/keylogger viewers**
  - View captured screenshots
  - Keylogger log viewer
  - Webcam snapshots

### Phase 5: Advanced Features
- [ ] **Automation workflows**
  - Create attack chains
  - Scheduled tasks
  - Auto-exploit on new sessions
- [ ] **Team collaboration**
  - Multi-operator support
  - Shared sessions
  - Activity log
  - Chat/notes
- [ ] **Reporting system**
  - Engagement timeline
  - Finding documentation
  - Export to PDF/HTML
- [ ] **Android app packaging**
  - Capacitor setup
  - Native Android build
  - Push notifications

---

## Project Structure
```
metasploitGui/
├── frontend/                    # React web application
│   ├── src/
│   │   ├── components/
│   │   │   ├── dashboard/       # Main dashboard
│   │   │   ├── sessions/        # Session management
│   │   │   ├── modules/         # Module browser
│   │   │   ├── listeners/       # Listener/handler config
│   │   │   ├── payloads/        # Payload generator
│   │   │   ├── terminal/        # Interactive console
│   │   │   └── layout/          # App layout components
│   │   ├── services/            # API and Socket clients
│   │   ├── store/               # Zustand stores
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
1. Session shell interaction needs WebSocket integration for real-time output
2. Module execution results need better display
3. Hosted payloads are stored in `/tmp` (lost on reboot)

---

## Notes
- Plan file location: `/home/riyo/.claude/plans/ancient-juggling-moon.md`
- Payload templates include 4 Android payloads
- Custom payload hosting URLs: `http://<IP>:<PORT>/dl/<custom-path>`

---

Last Updated: 2026-01-18
