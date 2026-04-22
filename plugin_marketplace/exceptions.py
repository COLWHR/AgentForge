class PluginMarketplaceError(Exception):
    """Base exception for the plugin marketplace."""


class ExtensionNotFoundError(PluginMarketplaceError):
    """Raised when an extension cannot be found."""


class ExtensionInstallError(PluginMarketplaceError):
    """Raised when an extension cannot be installed."""


class ToolNotFoundError(PluginMarketplaceError):
    """Raised when a tool cannot be found."""


class ToolExecuteError(PluginMarketplaceError):
    """Raised when a tool execution fails."""


class MCPConnectionError(PluginMarketplaceError):
    """Raised when an MCP endpoint cannot be reached."""


class ManifestValidationError(PluginMarketplaceError):
    """Raised when a manifest is invalid."""
