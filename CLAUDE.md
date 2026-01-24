# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Metasploit GUI is a full-stack web application providing a browser-based interface for Metasploit Framework. It combines features from Metasploit Pro, PowerShell Empire, Cobalt Strike, and Armitage for authorized security testing, CTF competitions, and educational purposes.

## Commands

### Frontend (in `/frontend`)
```bash
npm install          # Install dependencies
npm run dev          # Start dev server (port 5173, proxies API to :8000)
npm run build        # Production build (tsc + vite)
npm run lint         # ESLint validation
```

### Backend (in `/backend`)
```bash
pip install -r requirements.txt
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload
```

### Metasploit RPC (required before backend)
```bash
msfrpcd -P msf -S -p 55553 -U msf -a 127.0.0.1
```

### Docker (full stack)
```bash
docker-compose up -d      # Start all services
docker-compose logs -f    # View logs
```

## Architecture

### Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Zustand (state) + Socket.IO client + xterm.js
- **Backend**: FastAPI + Python-SocketIO + pymetasploit3 (RPC client) + SQLAlchemy + JWT auth

### Communication
- REST API at `/api/v1/*` with Bearer JWT authentication
- WebSocket (Socket.IO) for real-time updates: session changes, console output, notifications

### Key Directories
```
backend/
├── app/api/routes/    # 15 API route modules (sessions, modules, payloads, etc.)
├── app/core/          # Config (env-based) and MSF RPC client wrapper
└── main.py            # FastAPI app with Socket.IO integration

frontend/src/
├── components/        # Feature modules (dashboard, sessions, modules, payloads, etc.)
├── services/          # api.ts (Axios + auth), socket.ts (Socket.IO)
├── store/             # Zustand stores (auth, session, module, listener, terminal, etc.)
└── types/             # TypeScript interfaces
```

### MSF Client Usage
The backend uses `pymetasploit3.MsfRpcClient`. Key pattern:
```python
from app.core.msf_client import get_msf_client
client = get_msf_client()
result = client.call('session.list')  # Direct RPC calls
```

### Payload Generation
Uses `msfvenom` subprocess (not RPC) for payload generation. Android APKs require no `-f` flag.

### State Management
Each feature has a Zustand store. Auth state persists to localStorage. Socket.IO updates trigger store mutations which re-render components.

## Default Credentials
- Username: `admin`
- Password: `admin`

## API Documentation
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Key Technical Notes

1. **Socket.IO events**: `sessions_update`, `session_opened`, `session_closed`, `console_output`, `session_output`
2. **Payload hosting**: Files stored in `/tmp` (non-persistent), served at `/dl/{path}`
3. **Terminal output**: xterm.js with `convertEol: true` for proper line endings
4. **CORS origins**: localhost:5173, localhost:3000, 127.0.0.1:5173
5. **Frontend proxy**: Vite proxies `/api` and `/socket.io` to backend in dev mode
