from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App settings
    app_name: str = "Metasploit GUI"
    debug: bool = True
    api_prefix: str = "/api/v1"

    # CORS
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://localhost",
    ]

    # JWT Auth
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24 hours

    # Metasploit RPC
    msf_rpc_host: str = "127.0.0.1"
    msf_rpc_port: int = 55553
    msf_rpc_user: str = "msf"
    msf_rpc_password: str = "msf"
    msf_rpc_ssl: bool = False  # Set True if msfrpcd runs with SSL

    # Database
    database_url: str = "sqlite+aiosqlite:///./metasploit_gui.db"

    # WebSocket
    ws_ping_interval: int = 25
    ws_ping_timeout: int = 120

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
