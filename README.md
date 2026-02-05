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

> **Full setup guide**: [Docs/LM-STUDIO-SETUP.md](Docs/LM-STUDIO-SETUP.md) - includes structured output schemas, model recommendations, and troubleshooting.

### Quick Start

1. Install [LM Studio](https://lmstudio.ai) on a machine with adequate GPU/RAM
2. Download a model (e.g., `mistralai/ministral-3-14b-reasoning`)
3. Start the server and note the address
4. Update `.coe/config.json`:

```json
{
  "llm": {
    "endpoint": "http://192.168.1.205:1234/v1",
    "model": "mistralai/ministral-3-14b-reasoning",
    "timeoutSeconds": 900,
    "startupTimeoutSeconds": 300,
    "maxTokens": 4000
  }
}
```

See the [full setup guide](Docs/LM-STUDIO-SETUP.md) for structured output schemas, tips for small models, and troubleshooting.

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
