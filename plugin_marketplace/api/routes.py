"""
plugin_marketplace.api.routes
FastAPI routes for the plugin marketplace.
"""

from fastapi import APIRouter, HTTPException, Request

from plugin_marketplace.api.schemas import (
    ExtensionListItem,
    ExtensionDetail,
    ToolListItem,
    ToolExecuteRequest,
    ToolExecuteResponse,
    AgentToolBindRequest,
    ExtensionInstallRequest,
    ExtensionInstallResponse,
    UserExtensionItem,
    ExtensionConnectionTestRequest,
    ExtensionConnectionTestResponse,
)
def create_router() -> APIRouter:
    """
    Create and return the plugin marketplace FastAPI router.
    """
    router = APIRouter(prefix="/api/v1/marketplace", tags=["Plugin Marketplace"])

    def _marketplace_api(request: Request):
        api = getattr(request.app.state, "pm_api", None)
        if api is None:
            raise HTTPException(status_code=503, detail="Plugin marketplace is not initialized")
        return api

    @router.get("/extensions", response_model=list[ExtensionListItem])
    async def list_extensions(request: Request):
        """List all available extensions."""
        try:
            marketplace_api = _marketplace_api(request)
            items = await marketplace_api.list_extensions()
            return [ExtensionListItem(**item) for item in items]
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/extensions/{extension_id}", response_model=ExtensionDetail)
    async def get_extension(extension_id: str, request: Request):
        """Get extension details with tools."""
        try:
            marketplace_api = _marketplace_api(request)
            tools = await marketplace_api.list_extension_tools(extension_id)
            extensions = await marketplace_api.list_extensions()
            ext = next((e for e in extensions if e["id"] == extension_id), None)
            if not ext:
                raise HTTPException(status_code=404, detail=f"Extension {extension_id} not found")
            ext["tools"] = tools
            return ExtensionDetail(**ext)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/extensions/{extension_id}/tools", response_model=list[ToolListItem])
    async def list_extension_tools(extension_id: str, request: Request):
        """List tools for an extension."""
        try:
            marketplace_api = _marketplace_api(request)
            tools = await marketplace_api.list_extension_tools(extension_id)
            return [ToolListItem(**t) for t in tools]
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/extensions/{extension_id}/install", response_model=ExtensionInstallResponse)
    async def install_extension(extension_id: str, request: Request, payload: ExtensionInstallRequest):
        """Install an extension for a user."""
        try:
            marketplace_api = _marketplace_api(request)
            await marketplace_api.install_extension(extension_id, payload.user_id, payload.config)
            return ExtensionInstallResponse(
                extension_id=extension_id,
                status="installed",
                message="ok",
            )
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/extensions/{extension_id}/uninstall")
    async def uninstall_extension(extension_id: str, user_id: str, request: Request):
        """Uninstall an extension for a user."""
        try:
            marketplace_api = _marketplace_api(request)
            await marketplace_api.uninstall_extension(extension_id, user_id)
            return {"status": "ok"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/extensions/{extension_id}/test-connection", response_model=ExtensionConnectionTestResponse)
    async def test_extension_connection(extension_id: str, request: Request, payload: ExtensionConnectionTestRequest):
        """Validate user-supplied configuration for an extension."""
        try:
            marketplace_api = _marketplace_api(request)
            result = await marketplace_api.test_extension_connection(extension_id, payload.config)
            return ExtensionConnectionTestResponse(**result)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/users/{user_id}/extensions", response_model=list[UserExtensionItem])
    async def list_user_extensions(user_id: str, request: Request):
        """List extensions installed for a user."""
        try:
            marketplace_api = _marketplace_api(request)
            items = await marketplace_api.list_user_extensions(user_id)
            return [UserExtensionItem(**item) for item in items]
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/tools/execute", response_model=ToolExecuteResponse)
    async def execute_tool(payload: ToolExecuteRequest, request: Request):
        """Execute a tool."""
        try:
            marketplace_api = _marketplace_api(request)
            result = await marketplace_api.execute_tool(
                payload.tool_id,
                payload.arguments,
                payload.context,
            )
            return ToolExecuteResponse(result=result)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/agents/{agent_id}/tools")
    async def get_agent_tools(agent_id: str, request: Request):
        """Get all tools bound to an agent."""
        try:
            marketplace_api = _marketplace_api(request)
            tools = await marketplace_api.get_tools_for_agent(agent_id)
            return {"tools": tools}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/agents/{agent_id}/tools/bind")
    async def bind_tools(agent_id: str, payload: AgentToolBindRequest, request: Request):
        """Bind tools to an agent."""
        try:
            marketplace_api = _marketplace_api(request)
            await marketplace_api.bind_tools_to_agent(agent_id, payload.tool_ids)
            return {"status": "ok", "agent_id": agent_id, "bound": len(payload.tool_ids)}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/agents/{agent_id}/tools/{tool_id}")
    async def unbind_tool(agent_id: str, tool_id: str, request: Request):
        """Unbind a tool from an agent."""
        try:
            marketplace_api = _marketplace_api(request)
            await marketplace_api.unbind_tools_from_agent(agent_id, [tool_id])
            return {"status": "ok"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/tools/schemas")
    async def get_tool_schemas(request: Request):
        """Get all tool schemas in OpenAI function-calling format."""
        try:
            marketplace_api = _marketplace_api(request)
            schemas = await marketplace_api.get_tool_schemas()
            return {"tools": schemas}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return router
