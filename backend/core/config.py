import os
from pathlib import Path
from typing import Any
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
import yaml
from dotenv import dotenv_values

# Determine project root based on backend module location
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

class Settings(BaseSettings):
    # Mandatory fields
    MODEL_API_KEY: str
    MODEL_BASE_URL: str = "https://openrouter.ai/api/v1"
    DB_URL: str
    REDIS_URL: str
    JWT_SECRET: str = "agentforge-secret-key-phase-7"
    
    # Optional fields with defaults
    ENV: str = "dev"
    APP_NAME: str = "AgentForge"
    LOG_LEVEL: str = "INFO"
    CORS_ALLOWED_ORIGINS: Any = [
        "http://localhost:3000",
        "http://localhost:4174",
        "http://localhost:4175",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:4174",
        "http://127.0.0.1:4175",
        "http://127.0.0.1:5173",
    ]
    
    @field_validator("CORS_ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v
    
    # Stable configuration for .env location
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"), 
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @classmethod
    def load_config(cls):
        # 1. Load YAML (lowest priority)
        yaml_config_path = PROJECT_ROOT / os.getenv("CONFIG_PATH", "backend/config.yaml")
        yaml_data = {}
        if yaml_config_path.exists():
            with open(yaml_config_path, "r") as f:
                yaml_data = yaml.safe_load(f) or {}
        
        # 2. Get high-priority values from .env and environment variables
        # Priority order: os.environ > .env
        dotenv_path = str(PROJECT_ROOT / ".env")
        env_vars = {**dotenv_values(dotenv_path), **os.environ}
        
        # 3. Filter YAML: only use YAML if the field is not present in Env or Dotenv.
        # This achieves: Env > Dotenv > YAML > Defaults
        yaml_data = {
            k: v for k, v in yaml_data.items() 
            if k not in env_vars or not env_vars[k]
        }
        
        # 4. Initialize Settings. Pydantic will still handle internal .env loading if configured,
        # but since we filtered yaml_data, constructor arguments won't override them.
        return cls(**yaml_data)

settings = Settings.load_config()
