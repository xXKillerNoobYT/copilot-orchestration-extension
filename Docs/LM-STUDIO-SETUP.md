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

## 3. Structured Output (CRITICAL for Simple Models)

Structured output forces the LLM to respond in a predictable JSON format, which is **essential** for small models that may otherwise produce inconsistent responses.

### ⚠️ IMPORTANT: LM Studio Uses ONE Schema for ALL Agents

**LM Studio configures structured output at the SERVER level**, not per-request. This means:
- ✅ **ONE universal schema** for all agents (Planning, Answer, Verification, Clarity, Custom, etc.)
- ❌ **NOT** different schemas per agent type
- 🔧 Configure once in LM Studio Server settings, applies to all requests

### Universal Agent Response Schema

**Copy-paste this EXACT schema into LM Studio's Structured Output configuration:**

```json
{
  "type": "object",
  "properties": {
    "response_type": {
      "type": "string",
      "enum": ["planning", "answer", "verification", "clarity", "research", "custom", "error"],
      "description": "Which agent is responding"
    },
    "status": {
      "type": "string",
      "enum": ["success", "needs_clarification", "error", "PASS", "FAIL", "PARTIAL"],
      "description": "Overall status of the response"
    },
    "message": {
      "type": "string",
      "description": "Primary response text (answer, explanation, summary, etc.)"
    },
    "planning_data": {
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
            "required": ["step_number", "action"]
          }
        },
        "dependencies": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "verification_data": {
      "type": "object",
      "properties": {
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
      }
    },
    "clarity_data": {
      "type": "object",
      "properties": {
        "completeness_score": { 
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        },
        "clarity_score": { 
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        },
        "accuracy_score": { 
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        },
        "total_score": { 
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        },
        "follow_up_questions": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "research_data": {
      "type": "object",
      "properties": {
        "findings": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "topic": { "type": "string" },
              "description": { "type": "string" },
              "source_file": { "type": "string" },
              "relevance": {
                "type": "string",
                "enum": ["high", "medium", "low"]
              }
            },
            "required": ["topic", "description"]
          }
        },
        "sources": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "answer_data": {
      "type": "object",
      "properties": {
        "confidence": {
          "type": "string",
          "enum": ["high", "medium", "low"]
        },
        "sources": {
          "type": "array",
          "items": { "type": "string" }
        },
        "follow_up_needed": { "type": "boolean" }
      }
    },
    "custom_fields": {
      "type": "object",
      "description": "Flexible object for custom agent responses"
    },
    "error_details": {
      "type": "object",
      "properties": {
        "error_code": { "type": "string" },
        "error_message": { "type": "string" },
        "suggested_action": { "type": "string" }
      }
    }
  },
  "required": ["response_type", "status", "message"]
}
```

### How Agents Use This Schema

Each agent uses only the fields it needs:

**Planning Agent** (`response_type: "planning"`):
```json
{
  "response_type": "planning",
  "status": "success",
  "message": "Created 5-step implementation plan",
  "planning_data": {
    "summary": "Implement user authentication",
    "steps": [
      {
        "step_number": 1,
        "action": "Create User model",
        "details": "Define schema with email, password_hash, created_at",
        "estimated_minutes": 15
      }
    ]
  }
}
```

**Answer Agent** (`response_type: "answer"`):
```json
{
  "response_type": "answer",
  "status": "success",
  "message": "Authentication uses JWT tokens stored in httpOnly cookies...",
  "answer_data": {
    "confidence": "high",
    "sources": ["src/auth/jwt.ts", "docs/security.md"],
    "follow_up_needed": false
  }
}
```

**Verification Agent** (`response_type: "verification"`):
```json
{
  "response_type": "verification",
  "status": "PASS",
  "message": "All 3 criteria passed",
  "verification_data": {
    "checks": [
      { "criterion": "File exists", "passed": true, "note": "Found at src/config/schema.ts" },
      { "criterion": "Exports ConfigSchema", "passed": true, "note": "Zod schema exported" },
      { "criterion": "Includes llm.endpoint", "passed": true }
    ],
    "suggestions": []
  }
}
```

**Clarity Agent** (`response_type: "clarity"`):
```json
{
  "response_type": "clarity",
  "status": "needs_clarification",
  "message": "Reply needs more detail (score: 72/100)",
  "clarity_data": {
    "completeness_score": 80,
    "clarity_score": 70,
    "accuracy_score": 65,
    "total_score": 72,
    "follow_up_questions": [
      "Which specific CSS file did you update?",
      "What was the old color value?"
    ]
  }
}
```

**Custom Agent** (`response_type: "custom"`):
```json
{
  "response_type": "custom",
  "status": "success",
  "message": "Security review complete",
  "custom_fields": {
    "vulnerabilities_found": 3,
    "severity": "medium",
    "files_reviewed": ["auth.ts", "api.ts"]
  }
}
```

### Configuring in LM Studio

1. Open **LM Studio** → **Server** tab
2. Click **⚙️ Server Settings**
3. Under **"Structured Output"** or **"JSON Schema"** section:
   - Enable structured output
   - Paste the Universal Agent Response Schema above
   - Name: `universal_agent_response`
   - Set as default for all requests
4. Click **Save** or **Apply**
5. Restart the server if needed

### Important Notes on Structured Output

- ✅ **One schema for all**: COE agents share this universal schema
- ✅ **Models < 7B parameters** may struggle with structured output. Test with 14B+ models first.
- ✅ **Works through API**: No need to configure per-request, LM Studio applies server-wide
- ✅ **For GGUF models**: LM Studio uses `llama.cpp` grammar-based sampling
- ✅ **For MLX models**: Uses the Outlines library
- ⚠️ **Optional fields**: Agents only populate fields they need (e.g., Planning Agent leaves `verification_data` empty)
- ⚠️ **Simple models**: Keep prompts focused on ONE response type at a time

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
