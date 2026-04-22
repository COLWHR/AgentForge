from typing import Any, Dict
from backend.models.tool import BaseTool, ToolDefinition
from backend.services.sandbox_service import sandbox_service

class EchoTool(BaseTool):
    """
    A simple tool that returns x + 1.
    Used for basic Tool Runtime verification.
    """
    def __init__(self):
        definition = ToolDefinition(
            name="echo_tool",
            description="A simple tool that echoes input x as y + 1",
            input_schema={
                "type": "object",
                "properties": {
                    "x": {"type": "integer"}
                },
                "required": ["x"]
            },
            output_schema={
                "type": "object",
                "properties": {
                    "y": {"type": "integer"}
                },
                "required": ["y"]
            }
        )
        super().__init__(definition)

    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        return {"y": input_data["x"] + 1}

class PythonAddTool(BaseTool):
    """
    A Python tool that adds 1 via the sandbox.
    Used for Sandbox integration verification.
    """
    def __init__(self):
        definition = ToolDefinition(
            name="python_add_tool",
            description="Adds 1 to x using the Python Sandbox",
            input_schema={
                "type": "object",
                "properties": {
                    "x": {"type": "integer"}
                },
                "required": ["x"]
            },
            output_schema={
                "type": "object",
                "properties": {
                    "observation": {
                        "description": "The result of the execution, can be any JSON-serializable type."
                    }
                },
                "required": ["observation"],
                "additionalProperties": False
            }
        )
        super().__init__(definition)

    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        # Minimal Python code to perform addition, returning a dict for schema compatibility
        code = "result = {'value': input_data['x'] + 1}"
        return sandbox_service.execute_python(code, input_data)

class PythonExecutorTool(BaseTool):
    """
    A general Python execution tool.
    Used for arbitrary code execution in the sandbox.
    """
    def __init__(self):
        definition = ToolDefinition(
            name="python_executor",
            description="Executes arbitrary Python code in a secure sandbox. The code must be provided in the 'code' field. You must assign the final result to the variable 'result' if you want it returned in the observation.",
            input_schema={
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "The Python code to execute."}
                },
                "required": ["code"]
            },
            output_schema={
                "type": "object",
                "properties": {
                    "observation": {
                        "description": "The result of the execution, can be any JSON-serializable type."
                    }
                },
                "required": ["observation"],
                "additionalProperties": False
            }
        )
        super().__init__(definition)

    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        code = input_data["code"]
        # Basic wrapping to ensure it runs
        return sandbox_service.execute_python(code, {})
