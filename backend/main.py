import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from backend.core.config import settings
from backend.core.logging import setup_logging, logger
from backend.api.middleware import RequestLoggingMiddleware
from fastapi.exceptions import RequestValidationError
from backend.api.routes.health import router as health_router
from backend.api.routes.agents import router as agents_router
from backend.api.routes.sandbox import router as sandbox_router
from backend.api.routes.tools import router as tools_router
from backend.api.routes.executions import router as executions_router
from backend.api.routes.teams import router as teams_router
from backend.models.schemas import BaseResponse
from backend.models.constants import ResponseCode
from backend.core.database import engine, Base
from backend.core.tool_runtime import ToolRegistry
from backend.core.tools import EchoTool, PythonAddTool, PythonExecutorTool
from backend.core.exceptions import AgentForgeBaseException, NotFoundException, ValidationException
from sqlalchemy.exc import SQLAlchemyError

def create_app() -> FastAPI:
    # Initialize app instance
    app = FastAPI(
        title=settings.APP_NAME,
        description="AgentForge Backend Engine",
        version="1.0"
    )
    
    # Setup global logging configuration
    setup_logging()
    
    # Log startup info (Safe logging)
    logger.info(f"Starting {settings.APP_NAME} in {settings.ENV} mode")
    logger.info(f"Config loaded: ENV={settings.ENV}, APP_NAME={settings.APP_NAME}, LOG_LEVEL={settings.LOG_LEVEL}")
    
    # Add custom middleware
    app.add_middleware(RequestLoggingMiddleware)
    
    # Add CORS middleware for frontend development
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Database initialization on startup
    @app.on_event("startup")
    async def on_startup():
        # Phase 1 baseline strategy: ensure tables for currently defined ORM models exist.
        # This will only create the 'agents' table as it's the only one registered in Phase 1.
        logger.info("Initializing database tables for Phase 1...")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables initialized.")

        # Phase 4: Register tools and lock registry
        logger.info("Registering tools for Phase 4...")
        registry = ToolRegistry()
        registry.register(EchoTool())
        registry.register(PythonAddTool())
        registry.register(PythonExecutorTool())
        registry.lock()
        logger.info("Tool registry locked.")

    # Register global exception handlers (Single Exit Point)
    @app.exception_handler(AgentForgeBaseException)
    async def agent_forge_exception_handler(request: Request, exc: AgentForgeBaseException):
        logger.warning(f"AgentForge Exception: {exc.message} (Code: {exc.code}, Status: {exc.status_code})")
        return JSONResponse(
            status_code=exc.status_code,
            content=BaseResponse.error(
                code=exc.code,
                message=exc.message,
                data=exc.data
            ).model_dump()
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        # Standardize validation error messages
        logger.warning(f"Validation Error: {exc.errors()}")
        return JSONResponse(
            status_code=422,
            content=BaseResponse.error(
                code=ResponseCode.VALIDATION_ERROR,
                message="Schema validation failed. Check request body format and required fields."
            ).model_dump()
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        logger.warning(f"HTTP Exception: {exc.detail} (Status: {exc.status_code})")
        
        # Map common Starlette HTTP exceptions to ResponseCode
        code = ResponseCode.INTERNAL_ERROR
        if exc.status_code == 404:
            code = ResponseCode.NOT_FOUND
        elif exc.status_code == 401:
            code = ResponseCode.AUTH_REQUIRED
        elif exc.status_code == 403:
            code = ResponseCode.PERMISSION_DENIED
        elif exc.status_code == 429:
            code = ResponseCode.RATE_LIMIT_EXCEEDED
            
        return JSONResponse(
            status_code=exc.status_code,
            content=BaseResponse.error(
                code=code,
                message=exc.detail
            ).model_dump()
        )

    @app.exception_handler(SQLAlchemyError)
    async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
        logger.exception(f"Database Error: {str(exc)}")
        # Map DB errors to 1003 (DATABASE_ERROR)
        return JSONResponse(
            status_code=500,
            content=BaseResponse.error(
                code=ResponseCode.DATABASE_ERROR,
                message="A database error occurred. Operation could not be completed."
            ).model_dump()
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        # Unhandled exceptions
        logger.exception(f"Unhandled Exception: {str(exc)}")
        return JSONResponse(
            status_code=500,
            content=BaseResponse.error(
                code=ResponseCode.INTERNAL_ERROR,
                message="An unexpected error occurred"
            ).model_dump()
        )

    # Include API routes
    app.include_router(health_router, prefix="", tags=["Monitoring"])
    app.include_router(agents_router, prefix="", tags=["Agents"])
    app.include_router(sandbox_router, prefix="", tags=["Sandbox"])
    app.include_router(tools_router, prefix="", tags=["Tools"])
    app.include_router(executions_router, prefix="", tags=["Executions"])
    app.include_router(teams_router, prefix="", tags=["Teams"])
    
    return app

# Entry point for application
app = create_app()

if __name__ == "__main__":
    # Standard Uvicorn startup
    uvicorn.run(
        "backend.main:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=(settings.ENV == "dev")
    )
