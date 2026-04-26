import ast
import html
import math
import operator
import re
from typing import Any, Dict
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

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


class CalculateTool(BaseTool):
    def __init__(self):
        definition = ToolDefinition(
            name="calculate",
            description="Safely calculate a basic arithmetic expression. Supports +, -, *, /, //, %, ** and parentheses.",
            input_schema={
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "Arithmetic expression to calculate, for example '(12 + 8) / 5'.",
                    }
                },
                "required": ["expression"],
                "additionalProperties": False,
            },
            output_schema={
                "type": "object",
                "properties": {
                    "expression": {"type": "string"},
                    "result": {"type": ["number", "integer"]},
                },
                "required": ["expression", "result"],
                "additionalProperties": False,
            },
        )
        super().__init__(definition)

    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        expression = str(input_data["expression"]).strip()
        if not expression:
            raise ValueError("expression is required")
        if len(expression) > 200:
            raise ValueError("expression is too long")
        parsed = ast.parse(expression, mode="eval")
        result = self._eval_node(parsed.body)
        if isinstance(result, float) and not math.isfinite(result):
            raise ValueError("calculation result is not finite")
        return {"expression": expression, "result": result}

    _binary_ops = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod,
        ast.Pow: operator.pow,
    }
    _unary_ops = {
        ast.UAdd: operator.pos,
        ast.USub: operator.neg,
    }

    @classmethod
    def _eval_node(cls, node: ast.AST) -> int | float:
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp):
            operation = cls._binary_ops.get(type(node.op))
            if operation is None:
                raise ValueError("unsupported operator")
            left = cls._eval_node(node.left)
            right = cls._eval_node(node.right)
            if isinstance(node.op, ast.Pow) and abs(right) > 10:
                raise ValueError("exponent is too large")
            return operation(left, right)
        if isinstance(node, ast.UnaryOp):
            operation = cls._unary_ops.get(type(node.op))
            if operation is None:
                raise ValueError("unsupported unary operator")
            return operation(cls._eval_node(node.operand))
        raise ValueError("only arithmetic expressions are supported")


class WebSearchTool(BaseTool):
    def __init__(self):
        definition = ToolDefinition(
            name="websearch",
            description="Search the web for current public information and return result titles, links, and snippets.",
            input_schema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query."},
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results to return, from 1 to 5.",
                        "minimum": 1,
                        "maximum": 5,
                    },
                },
                "required": ["query"],
                "additionalProperties": False,
            },
            output_schema={
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "results": {"type": "array"},
                },
                "required": ["query", "results"],
                "additionalProperties": False,
            },
        )
        super().__init__(definition)

    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        query = str(input_data["query"]).strip()
        if not query:
            raise ValueError("query is required")
        limit = min(max(int(input_data.get("limit") or 5), 1), 5)
        return {"query": query, "results": self._search_duckduckgo(query, limit)}

    @staticmethod
    def _search_duckduckgo(query: str, limit: int) -> list[dict[str, str]]:
        request = Request(
            f"https://duckduckgo.com/html/?q={quote_plus(query)}",
            headers={"User-Agent": "Mozilla/5.0 (compatible; AgentForgeTool/1.0)"},
        )
        with urlopen(request, timeout=8) as response:
            raw_html = response.read().decode("utf-8", errors="ignore")
        pattern = re.compile(
            r'<a[^>]+class="result__a"[^>]+href="(?P<link>[^"]+)"[^>]*>(?P<title>.*?)</a>.*?'
            r'<a[^>]+class="result__snippet"[^>]*>(?P<snippet>.*?)</a>',
            re.DOTALL,
        )
        results: list[dict[str, str]] = []
        for match in pattern.finditer(raw_html):
            title = WebSearchTool._clean_html(match.group("title"))
            link = html.unescape(match.group("link"))
            snippet = WebSearchTool._clean_html(match.group("snippet"))
            if title and link:
                results.append({"title": title, "url": link, "snippet": snippet})
            if len(results) >= limit:
                break
        return results

    @staticmethod
    def _clean_html(value: str) -> str:
        return html.unescape(re.sub(r"<.*?>", "", value)).strip()
