# LM Studio Setup Guide for COE

> Complete setup instructions for integrating LM Studio with the Copilot Orchestration Extension.

## Prerequisites

- **Node.js 18+** (for native fetch support)
- **LM Studio** installed on a machine with sufficient GPU/RAM (https://lmstudio.ai)
- **Network access** between your dev machine and the LM Studio host

> **Important**: LM Studio should run on a machine with adequate processing power. The development machine may not have enough resources.

## 1. Install & Configure LM Studio

### Download a Model

In LM Studio, go to **Discover** tab and download one of these:

| Model | Size | Best For |
|-------|------|----------|
| `pico-lamma-3.2-1b-reasoning-instruct` | ~1GB | Fast testing, simple tasks |
| `mistralai/ministral-3-3b` | ~2GB | Light tasks, quick iteration |
| `mistralai/ministral-3-14b-reasoning` | ~8GB | Production use, complex reasoning |
| `nvidia/nemotron-3-nano` | varies | General purpose |

### Start the Server

1. Go to **Server** tab in LM Studio
2. Load your chosen model
3. Click **Start Server**
4. Note the server address (e.g., `http://192.168.1.205:1234`)

### Verify Server is Running

Open a browser or run:
```bash
curl http://192.168.1.205:1234/v1/models
```

You should see a JSON response listing available models.

## 2. Configure COE

Update `.coe/config.json` in the project root:

```json
{
  "version": "0.1.0",
  "llm": {
    "endpoint": "http://192.168.1.205:1234/v1",
    "model": "mistralai/ministral-3-14b-reasoning",
    "timeoutSeconds": 900,
    "startupTimeoutSeconds": 300,
    "maxTokens": 4000
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

**Why the high timeouts?** Local LLMs on network machines can be slow. 900s (15 min) for operations and 300s (5 min) for startup prevents premature timeouts.

## 3. Structured Output (Recommended)

Structured output forces the LLM to respond in a predictable JSON format, which is critical for small models that may otherwise produce inconsistent responses.

### How It Works

COE sends a `response_format` parameter with API requests:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "agent_response",
      "strict": "true",
      "schema": { ... }
    }
  }
}
```

### Agent Response Schemas

**Copy-paste these into LM Studio's Structured Output field if configuring manually.**

#### Planning Agent Response

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": ["success", "needs_clarification", "error"]
    },
    "plan": {
      "type": "object",
      "properties": {
        "summary": { "type": "string" },
        "steps": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "step_number": { "type": "integer" },
              "action": { "type": "string" },
              "details": { "type": "string" },
              "estimated_minutes": { "type": "integer" }
            },
            "required": ["step_number", "action", "details"]
          }
        }
      },
      "required": ["summary", "steps"]
    },
    "clarification_needed": { "type": "string" },
    "error_message": { "type": "string" }
  },
  "required": ["status"]
}
```

#### Verification Agent Response

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": ["PASS", "FAIL", "PARTIAL"]
    },
    "explanation": { "type": "string" },
    "checks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "criterion": { "type": "string" },
          "passed": { "type": "boolean" },
          "note": { "type": "string" }
        },
        "required": ["criterion", "passed"]
      }
    },
    "suggestions": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "required": ["status", "explanation"]
}
```

#### Answer Agent Response

```json
{
  "type": "object",
  "properties": {
    "answer": { "type": "string" },
    "confidence": {
      "type": "string",
      "enum": ["high", "medium", "low"]
    },
    "sources": {
      "type": "array",
      "items": { "type": "string" }
    },
    "follow_up_needed": { "type": "boolean" }
  },
  "required": ["answer", "confidence"]
}
```

### Important Notes on Structured Output

- **Models < 7B parameters** may struggle with structured output. Test first.
- For GGUF models, LM Studio uses `llama.cpp` grammar-based sampling.
- For MLX models, it uses the Outlines library.
- No special LM Studio UI configuration needed - it works through the API.

## 4. Tips for Small Models

Small local models (1B-14B) need different prompting than GPT-4 or Claude:

1. **Keep prompts short and focused** - One task per prompt
2. **Use checklists** - Break complex instructions into numbered steps
3. **Use structured output** - Forces consistent, parseable responses
4. **Test model capability first** - Verify the model can handle the task before assigning it
5. **Prefer explicit over implicit** - Spell out every expectation

Example prompt style for small models:
```
You are a verification agent. Check if these criteria are met:

1. File exists: src/config/schema.ts
2. File exports a Zod schema named "ConfigSchema"
3. Schema includes "llm.endpoint" field

Respond with PASS or FAIL for each criterion.
```

## 5. Troubleshooting

| Problem | Solution |
|---------|----------|
| "LLM endpoint unreachable" | Check LM Studio server is running. Test: `curl http://192.168.1.205:1234/v1/models` |
| "LLM request timed out" | Increase `timeoutSeconds` in config. Check model is fully loaded. |
| "No model loaded" | Load a model in LM Studio's Server tab before sending requests. |
| "Wrong responses" | Try a larger model. Use structured output. Simplify the prompt. |
| "Node.js 18+ required" | Update Node.js from https://nodejs.org |
| Garbled JSON responses | Enable structured output. Try a 7B+ model. |

## 6. Available Models on Current Server

Check available models:
```bash
curl -s http://192.168.1.205:1234/v1/models | python -m json.tool
```

Current models (as of Feb 2026):
- `text-embedding-nomic-embed-text-v1.5` (embeddings only)
- `nvidia/nemotron-3-nano`
- `lamma3merge3-15b-moe`
- `pico-lamma-3.2-1b-reasoning-instruct` (fast testing)
- `qwen/qwen3-vl-30b` (vision + language)
- `mistralai/magistral-small-2509`
- `mistralai/ministral-3-14b-reasoning` (default)
- `zai-org/glm-4.6v-flash`
- `mistralai/ministral-3-3b` (lightweight)
