# Metasploit GUI

A modern, cross-platform GUI for Metasploit Framework combining features from Metasploit Pro, PowerShell Empire, Cobalt Strike, and Armitage.

## Features

- **Dashboard**: Real-time overview of sessions, listeners, and module statistics
- **Session Management**: View, interact with, and manage active sessions
- **Module Browser**: Search and execute exploits, payloads, auxiliaries, and post-exploitation modules
- **Listener Management**: Create and manage multi/handler listeners
- **Payload Generator**: Generate payloads in various formats (exe, dll, ps1, etc.)
- **Interactive Terminal**: Full msfconsole access from the browser
- **Responsive Design**: Works on desktop browsers and mobile devices

## Prerequisites

- Metasploit Framework installed
- Node.js 18+
- Python 3.10+

## Quick Start

### 1. Start Metasploit RPC

```bash
# Using the provided script
chmod +x scripts/start-msfrpc.sh
./scripts/start-msfrpc.sh msf 55553

# Or manually
msfrpcd -P msf -S -p 55553 -U msf -a 127.0.0.1
```

### 2. Start the Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file and configure
cp .env.example .env

# Start the server
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload
```

### 3. Start the Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### 4. Access the Application

Open your browser and navigate to: `http://localhost:5173`

Default credentials: `admin / admin`

## Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Configuration

### Backend Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MSF_RPC_HOST` | Metasploit RPC host | `127.0.0.1` |
| `MSF_RPC_PORT` | Metasploit RPC port | `55553` |
| `MSF_RPC_USER` | RPC username | `msf` |
| `MSF_RPC_PASSWORD` | RPC password | `msf` |
| `MSF_RPC_SSL` | Use SSL for RPC | `true` |
| `SECRET_KEY` | JWT secret key | (change in production) |

## Project Structure

```
metasploitGui/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/routes/     # API endpoints
│   │   ├── core/           # Core modules (config, MSF client)
│   │   ├── models/         # Database models
│   │   └── services/       # Business logic
│   ├── main.py             # Application entry point
│   └── requirements.txt
│
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── services/      # API & WebSocket clients
│   │   ├── store/         # Zustand state management
│   │   └── types/         # TypeScript definitions
│   └── package.json
│
├── scripts/               # Utility scripts
├── docker-compose.yml     # Docker configuration
└── README.md
```

## API Documentation

When the backend is running, API documentation is available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Security Notes

This application is intended for **authorized security testing, CTF competitions, and educational purposes only**.

- Always obtain proper authorization before testing
- Use in isolated lab environments
- Change default credentials in production
- Use HTTPS in production environments

## License

This project is for educational and authorized security testing purposes only.
