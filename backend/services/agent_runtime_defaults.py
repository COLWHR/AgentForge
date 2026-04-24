from __future__ import annotations


DEFAULT_AGENT_TOOL_IDS: list[str] = [
    "python_executor",
    "echo_tool",
    "python_add_tool",
]


def default_agent_tool_ids() -> list[str]:
    return list(DEFAULT_AGENT_TOOL_IDS)
