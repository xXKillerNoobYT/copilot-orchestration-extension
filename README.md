# copilot-orchestration-extension
Lightweight planning &amp; orchestration layer for GitHub Copilot and other AI coding agents inside VS Code. Breaks down tasks, manages AI↔human tickets (SQLite), coordinates Planning/Answer/Verification agents.

## Features

- **Task Queue Management**: FIFO task queue loaded from SQLite ticket database
- **AI Agent Orchestration**: Routes questions to Answer agent via LLM
- **LLM Streaming**: Real-time streaming responses with inactivity timeout
- **Timeout Detection**: Automatically blocks stuck tasks after configurable timeout
- **Ticket System**: SQLite-based tickets with in-memory fallback
- **MCP Server**: JSON-RPC 2.0 server for Copilot integration
- **VS Code Sidebar**: Live views for Agents and Tickets

## LLM Setup

COE integrates with LM Studio for AI-powered agent responses.

### Prerequisites

- **Node.js 18+** (for native fetch support)
- **LM Studio** (https://lmstudio.ai)

### Installation Steps

1. **Install LM Studio**
   - Download from https://lmstudio.ai
   - Install and launch the application

2. **Download the Model**
   - In LM Studio, go to "Discover" tab
   - Search for "ministral-3-14b-reasoning"
   - Download the model (requires ~8GB disk space)

3. **Start the Server**
   - Go to "Server" tab in LM Studio
   - Load the ministral-3-14b-reasoning model
   - Click "Start Server"
   - Default endpoint: `http://127.0.0.1:1234/v1`
   - **Note**: Update to `http://192.168.1.205:1234/v1` if using a different IP

### Configuration

Create or update `.coe/config.json` in your workspace:

```json
{
  "version": "0.1.0",
  "llm": {
    "endpoint": "http://192.168.1.205:1234/v1",
    "model": "ministral-3-14b-reasoning",
    "timeoutSeconds": 60,
    "maxTokens": 2048
  },
  "tickets": {
    "enabled": true,
    "dbPath": "./.coe/tickets.db"
  },
  "debug": {
    "logLevel": "info"
  }
}
```

**Config Options:**
- `endpoint`: LM Studio API endpoint (update if different IP/port)
- `model`: Model name loaded in LM Studio
- `timeoutSeconds`: Inactivity timeout for streaming (default: 60)
- `maxTokens`: Maximum tokens in request (default: 2048)

### Troubleshooting

**"LLM endpoint unreachable"**
- Verify LM Studio server is running (check Server tab)
- Test endpoint in browser: `http://192.168.1.205:1234/v1/models`
- Check firewall settings if using remote IP
- Verify network connectivity

**"LLM request timed out"**
- Increase `timeoutSeconds` in config.json
- Check LM Studio model is fully loaded (not still loading)
- Verify sufficient system resources (RAM, CPU)

**"Wrong or nonsensical responses"**
- Verify correct model is loaded in LM Studio
- Check `model` name in config.json matches LM Studio
- Try restarting LM Studio server

**"Node.js 18+ required"**
- Update Node.js: https://nodejs.org
- Verify version: `node --version` (should be v18+)
- Alternative: Install `node-fetch` as polyfill

### Viewing LLM Output

- Open "COE Logs" in VS Code Output panel (View → Output → COE Logs)
- Real-time streaming chunks appear as `LLM: ...`
- Errors and warnings logged with timestamps

### Blocked Tickets

If LLM fails (network error, timeout, etc.), COE automatically:
1. Logs the error to Output channel
2. Creates a blocked ticket with error details
3. Returns fallback message to caller

Check the Tickets sidebar for "LLM FAILURE" tickets requiring manual review.

## Development

### Testing

```bash
npm run test:once          # Run all tests once
npm run test              # Run tests in watch mode
npm run test:coverage     # Run with coverage report
npm run lint              # Check code style
```

### Building

```bash
npm run compile           # Compile TypeScript
npm run watch             # Watch mode for development
```
