"""
Builtin adapter for AgentForge plugin marketplace.
Provides built-in tools: echo, python_exec.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from plugin_marketplace.adapters.base import BaseAdapter
from plugin_marketplace.interfaces import ToolDescriptor, ToolType


class EchoTool:
    """Echo tool - returns the input text."""

    name = "echo"
    description = "Echo back the input text"

    async def execute(self, arguments: dict) -> str:
        text = arguments.get("text", "")
        return json.dumps({"echo": text})


class PythonExecTool:
    """Python execution tool."""

    name = "python_exec"
    description = "Execute Python code and return the result"

    async def execute(self, arguments: dict) -> str:
        code = arguments.get("code", "")
        try:
            import sys
            from io import StringIO

            old_stdout = sys.stdout
            sys.stdout = StringIO()
            try:
                exec(code, {"__name__": "__main__"})
                output = sys.stdout.getvalue()
            finally:
                sys.stdout = old_stdout

            return json.dumps({"success": True, "output": output})
        except Exception as e:
            return json.dumps({"success": False, "error": str(e)})


class BuiltinAdapter(BaseAdapter):
    """
    Builtin tool adapter for AgentForge.
    Provides echo and python_exec tools.
    """

    def __init__(self, extension_id: str = "builtin", config: dict | None = None):
        super().__init__(extension_id, config or {})
        self._tools: dict[str, Any] = {
            "echo": EchoTool(),
            "python_exec": PythonExecTool(),
        }

    @property
    def tool_type(self) -> ToolType:
        return "builtin"

    async def discover_tools(self) -> list[Any]:
        return await self.list_tools()

    async def execute(self, tool_name: str, arguments: dict) -> str:
        tool = self._tools.get(tool_name)
        if not tool:
            raise ValueError(f"Unknown builtin tool: {tool_name}")
        return await tool.execute(arguments)

    async def list_tools(self) -> list[ToolDescriptor]:
        descriptors = []
        for tool_name, tool in self._tools.items():
            descriptors.append(ToolDescriptor(
                extension_id_value=self.extension_id,
                name_value=tool_name,
                description_value=tool.description,
                tool_type_value="builtin",
                input_schema_value={"type": "object"},
            ))
        return descriptors

    async def get_tool(self, tool_name: str) -> ToolDescriptor | None:
        if tool_name not in self._tools:
            return None
        tools = await self.list_tools()
        return next((t for t in tools if t.name == tool_name), None)

    async def install(self) -> None:
        pass  # Builtin tools need no installation

    async def uninstall(self) -> None:
        pass  # Builtin tools need no uninstallation

    async def health_check(self) -> bool:
        return True  # Always healthy
