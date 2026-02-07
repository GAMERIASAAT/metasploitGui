# Metasploit GUI - Ruby Backend

A Ruby-based backend for Metasploit GUI, providing both a standalone Sinatra web server and a Metasploit Framework plugin.

## Features

- **Full API Compatibility**: Same REST API as the Python backend - works with the existing React frontend
- **Two Deployment Options**:
  - **Standalone Server**: Independent Ruby web server using MSF RPC
  - **MSF Plugin**: Direct integration with Metasploit Framework (no RPC needed)
- **Real-time Updates**: WebSocket support for session and console streaming
- **JWT Authentication**: Secure token-based authentication
- **All Features**: Sessions, modules, payloads, listeners, post-exploitation, targets, nmap, automation, reports, and phishing campaigns

## Requirements

- Ruby 3.0+ (recommended)
- Bundler gem
- Metasploit Framework (for MSF RPC or plugin mode)

## Quick Start

### Installation

```bash
cd backend_ruby
./install.sh
```

This will:
1. Install gem dependencies
2. Install the MSF plugin to `~/.msf4/plugins/`
3. Create a run script

### Option 1: Standalone Server

First, start MSF RPC daemon:
```bash
msfrpcd -P msf -S -p 55553 -U msf -a 127.0.0.1
```

Then start the Ruby backend:
```bash
cd backend_ruby
./run.sh
# Or manually:
bundle exec rackup -p 8000
```

### Option 2: MSF Plugin

Load the plugin directly in msfconsole:
```bash
msfconsole
msf6> load msf_gui
```

With custom options:
```bash
msf6> load msf_gui Port=9000 Host=0.0.0.0
```

## Default Credentials

- **Username**: `admin`
- **Password**: `admin`

## API Endpoints

| Route | Description |
|-------|-------------|
| `/api/v1/auth` | Authentication (token, me) |
| `/api/v1/sessions` | Session management |
| `/api/v1/modules` | Module listing, search, execution |
| `/api/v1/console` | MSF console management |
| `/api/v1/payloads` | Payload generation and hosting |
| `/api/v1/listeners` | Handler/listener management |
| `/api/v1/postex` | Post-exploitation operations |
| `/api/v1/targets` | Target management |
| `/api/v1/nmap` | Nmap scan integration |
| `/api/v1/automation` | Workflow automation |
| `/api/v1/reports` | Report generation |
| `/api/v1/phishing` | Phishing campaigns |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `SECRET_KEY` | (random) | JWT secret key |
| `MSF_RPC_HOST` | `127.0.0.1` | MSF RPC host |
| `MSF_RPC_PORT` | `55553` | MSF RPC port |
| `MSF_RPC_USER` | `msf` | MSF RPC username |
| `MSF_RPC_PASSWORD` | `msf` | MSF RPC password |
| `MSF_RPC_SSL` | `false` | Use SSL for RPC |
| `STORAGE_PATH` | `/tmp/msf_gui_ruby` | Data storage path |

## Directory Structure

```
backend_ruby/
├── Gemfile                 # Ruby dependencies
├── config.ru               # Rack configuration
├── install.sh              # Installation script
├── run.sh                  # Run script (created by install)
├── README.md               # This file
│
├── standalone/             # Standalone Sinatra server
│   ├── app.rb              # Main application
│   ├── config/
│   │   └── settings.rb     # Configuration
│   ├── lib/
│   │   ├── jwt_auth.rb     # JWT authentication
│   │   ├── msf_client.rb   # MSF RPC client
│   │   └── socket_handler.rb # WebSocket handler
│   ├── routes/             # API route modules
│   │   ├── auth.rb
│   │   ├── sessions.rb
│   │   ├── modules.rb
│   │   ├── console.rb
│   │   ├── payloads.rb
│   │   ├── listeners.rb
│   │   ├── postex.rb
│   │   ├── targets.rb
│   │   ├── nmap.rb
│   │   ├── automation.rb
│   │   ├── reports.rb
│   │   └── phishing.rb
│   └── models/
│       └── storage.rb      # JSON file storage
│
├── plugin/                 # Metasploit plugin
│   └── msf_gui.rb          # Main plugin file
│
└── shared/                 # Shared code
    └── helpers/
        ├── response.rb     # JSON response helpers
        └── validators.rb   # Input validation
```

## Standalone vs Plugin Mode

| Feature | Standalone | Plugin |
|---------|------------|--------|
| MSF Connection | Via RPC | Direct |
| Separate Process | Yes | No (embedded) |
| Startup | `./run.sh` | `load msf_gui` |
| Dependencies | Bundled gems | MSF's gems |
| Session Access | RPC calls | `framework.sessions` |
| Resource Usage | More | Less |

## Using with the React Frontend

The Ruby backend is fully compatible with the existing React frontend. Just point the frontend to the Ruby backend:

```bash
# Start Ruby backend on port 8000
./run.sh

# In the frontend directory
cd ../frontend
npm run dev
```

The Vite dev server will proxy API requests to `localhost:8000`.

## Development

### Running with Auto-reload

```bash
bundle exec rerun rackup -p 8000
```

### Running Tests

```bash
bundle exec ruby -Itest test/*_test.rb
```

### Linting

```bash
bundle exec rubocop
```

## Troubleshooting

### Cannot connect to MSF RPC

Make sure msfrpcd is running:
```bash
msfrpcd -P msf -S -p 55553 -U msf -a 127.0.0.1
```

### Plugin won't load

Check that the plugin file exists:
```bash
ls -la ~/.msf4/plugins/msf_gui.rb
```

### WebSocket not connecting

Make sure Faye WebSocket is properly loaded:
```ruby
Faye::WebSocket.load_adapter('puma')
```

## License

MIT License - Same as Metasploit Framework

## Author

Metasploit GUI Project
