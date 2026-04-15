import sys
from contextvars import ContextVar
from loguru import logger
from backend.core.config import settings

REQUEST_ID: ContextVar[str] = ContextVar("request_id", default="system")
TEAM_ID: ContextVar[str] = ContextVar("team_id", default="")

def setup_logging():
    # Remove default handler
    logger.remove()
    
    # Custom format with automatic request_id from patcher
    log_format = (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
        "<yellow>[{extra[request_id]}]</yellow> - <level>{message}</level>"
    )
    
    # Add console handler
    logger.add(
        sys.stdout,
        format=log_format,
        level=settings.LOG_LEVEL,
        colorize=True
    )

# Patcher to automatically pull request_id from ContextVar
def request_id_patcher(record):
    record["extra"]["request_id"] = REQUEST_ID.get()

# Configure logger with the patcher for all future logs
logger.configure(patcher=request_id_patcher)

def set_request_id(request_id: str):
    REQUEST_ID.set(request_id)

def get_request_id() -> str:
    return REQUEST_ID.get()

def set_team_id(team_id: str):
    TEAM_ID.set(team_id)

def get_team_id() -> str:
    return TEAM_ID.get()
