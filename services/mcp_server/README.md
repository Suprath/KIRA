# KIRA MCP Server

This is the Model Context Protocol (MCP) server for KIRA. It exposes the KIRA platform's trading backend as a set of autonomous tools that AI assistants (like Claude, Gemini MCP clients, Cursor, or Zed) can use to autonomously read, write, and execute backtests.

## How It Runs

The MCP Server is now fully **Dockerized** and runs automatically when you `docker compose up`. It runs as an **HTTP SSE (Server-Sent Events) Server** on port `8005`.

Because it runs inside the Docker network, it has immediate access to your `api_gateway` and databases without any local configuration.

## Connecting to an AI Assistant

### Claude Desktop
To add KIRA to your AI assistant, you need to connect the Claude Desktop to the Dockerized MCP Server over HTTP (SSE) instead of a local python script. 

*Note: Claude Desktop natively uses STDIO. To connect it to Docker SSE, you can use the official `mcp-proxy` tool or use an MCP Client that natively supports SSE (like Cursor).*

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kira": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/inspector",
        "proxy",
        "http://localhost:8005/sse"
      ]
    }
  }
}
```

## How to Test via Browser (Inspector)

You can test the server directly from the command line using the official MCP CLI testing suite:

```bash
# Run the inspector pointing to your local docker container
npx @modelcontextprotocol/inspector sse http://localhost:8005/sse
```
