# LM Studio Developer Documentation

> Comprehensive reference scraped from https://lmstudio.ai/docs/developer (February 2026)

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [API Endpoints Summary](#api-endpoints-summary)
4. [LM Studio REST API v1](#lm-studio-rest-api-v1)
5. [OpenAI Compatible Endpoints](#openai-compatible-endpoints)
6. [TypeScript SDK (`@lmstudio/sdk`)](#typescript-sdk-lmstudiosdk)
7. [Tool Use / Function Calling](#tool-use--function-calling)
8. [Structured Output (JSON Schema)](#structured-output-json-schema)
9. [MCP (Model Context Protocol) via API](#mcp-model-context-protocol-via-api)
10. [Streaming Events (SSE)](#streaming-events-sse)
11. [Authentication](#authentication)
12. [Model Management](#model-management)
13. [CLI Reference (`lms`)](#cli-reference-lms)
14. [Configuration & Best Practices](#configuration--best-practices)

---

## Overview

LM Studio provides local AI inference with multiple integration options:

| Stack | Description |
|-------|-------------|
| **TypeScript SDK** | `@lmstudio/sdk` - Full-featured SDK |
| **Python SDK** | `lmstudio-python` |
| **LM Studio REST API** | Native v1 API at `/api/v1/*` with stateful chats, MCP support |
| **OpenAI Compatible** | `/v1/chat/completions`, `/v1/embeddings`, `/v1/responses` |
| **Anthropic Compatible** | `/v1/messages` |
| **CLI** | `lms` command for automation |

### What You Can Build
- Chat and text generation with streaming
- Tool calling and local agents with MCP
- Structured output (JSON schema)
- Embeddings and tokenization
- Model management (load, download, list)

### Default Server
```
http://localhost:1234
```

---

## Quick Start

### Start the Server
```bash
lms server start
```

Or via the Developer tab in LM Studio GUI.

### Download a Model
```bash
lms get ibm/granite-4-micro
```

### Simple Chat Request (curl)
```bash
curl http://localhost:1234/api/v1/chat \
  -H "Authorization: Bearer $LM_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ibm/granite-4-micro",
    "input": "Write a short haiku about sunrise."
  }'
```

### TypeScript Quick Start
```typescript
import { LMStudioClient } from "@lmstudio/sdk";

const client = new LMStudioClient();
const model = await client.llm.model("qwen/qwen3-4b-2507");
const result = await model.respond("What is the meaning of life?");

console.info(result.content);
```

---

## API Endpoints Summary

### LM Studio REST API v1 (Recommended)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/chat` | POST | Chat with a model (stateful) |
| `/api/v1/models` | GET | List available models |
| `/api/v1/models/load` | POST | Load a model into memory |
| `/api/v1/models/unload` | POST | Unload a model |
| `/api/v1/models/download` | POST | Download a model |
| `/api/v1/models/download/status` | GET | Get download progress |

### OpenAI Compatible Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/models` | GET | List models |
| `/v1/responses` | POST | Responses API (with reasoning) |
| `/v1/chat/completions` | POST | Chat completions |
| `/v1/embeddings` | POST | Generate embeddings |
| `/v1/completions` | POST | Text completions (legacy) |

### REST API v0 (Legacy)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v0/models` | GET | List models |
| `/api/v0/models/{model}` | GET | Get specific model info |
| `/api/v0/chat/completions` | POST | Chat completions |
| `/api/v0/completions` | POST | Text completions |
| `/api/v0/embeddings` | POST | Embeddings |

---

## LM Studio REST API v1

### POST `/api/v1/chat`

Send a message to a model with stateful conversation support and MCP integration.

#### Request Body

```typescript
interface ChatRequest {
  model: string;                    // Model identifier
  input: string | MessageArray;     // Message content
  system_prompt?: string;           // System message
  integrations?: Integration[];     // MCP servers, plugins
  stream?: boolean;                 // Enable SSE streaming (default: false)
  temperature?: number;             // 0-1, randomness
  top_p?: number;                   // Nucleus sampling
  top_k?: number;                   // Top-k sampling
  min_p?: number;                   // Minimum probability
  repeat_penalty?: number;          // Repetition penalty
  max_output_tokens?: number;       // Max tokens to generate
  reasoning?: "off" | "low" | "medium" | "high" | "on";
  context_length?: number;          // Context window size
  store?: boolean;                  // Store chat (default: true)
  previous_response_id?: string;    // Continue conversation
}
```

#### Response

```typescript
interface ChatResponse {
  model_instance_id: string;
  output: OutputItem[];
  stats: {
    input_tokens: number;
    total_output_tokens: number;
    reasoning_output_tokens: number;
    tokens_per_second: number;
    time_to_first_token_seconds: number;
    model_load_time_seconds?: number;
  };
  response_id?: string;  // For stateful conversations
}

type OutputItem = 
  | { type: "message"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "tool_call"; tool: string; arguments: object; output: string; provider_info: ProviderInfo }
  | { type: "invalid_tool_call"; reason: string; metadata: object };
```

#### Example: Basic Chat

```bash
curl http://localhost:1234/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ibm/granite-4-micro",
    "input": "Hello, introduce yourself."
  }'
```

#### Example: Chat with MCP Integration

```bash
curl http://localhost:1234/api/v1/chat \
  -H "Authorization: Bearer $LM_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ibm/granite-4-micro",
    "input": "What is the top trending model on hugging face?",
    "integrations": [
      {
        "type": "ephemeral_mcp",
        "server_label": "huggingface",
        "server_url": "https://huggingface.co/mcp",
        "allowed_tools": ["model_search"]
      }
    ],
    "context_length": 8000
  }'
```

### Stateful Chats

The `/api/v1/chat` endpoint is **stateful by default**. Response includes a `response_id` that you can use to continue conversations.

```bash
# Start conversation
curl http://localhost:1234/api/v1/chat \
  -d '{"model": "ibm/granite-4-micro", "input": "My favorite color is blue."}'

# Response includes: "response_id": "resp_abc123xyz..."

# Continue conversation
curl http://localhost:1234/api/v1/chat \
  -d '{
    "model": "ibm/granite-4-micro",
    "input": "What color did I just mention?",
    "previous_response_id": "resp_abc123xyz..."
  }'
```

Disable stateful storage with `"store": false`.

### GET `/api/v1/models`

List all downloaded and loaded models.

```bash
curl http://localhost:1234/api/v1/models \
  -H "Authorization: Bearer $LM_API_TOKEN"
```

#### Response Format

```typescript
interface ModelsResponse {
  models: Array<{
    type: "llm" | "embedding";
    publisher: string;
    key: string;                    // Model identifier
    display_name: string;
    architecture?: string;          // e.g., "llama", "mistral"
    quantization?: { name: string; bits_per_weight: number } | null;
    size_bytes: number;
    params_string?: string;         // e.g., "7B", "13B"
    loaded_instances: Array<{
      id: string;
      config: {
        context_length: number;
        eval_batch_size?: number;
        flash_attention?: boolean;
        num_experts?: number;
        offload_kv_cache_to_gpu?: boolean;
      };
    }>;
    max_context_length: number;
    format: "gguf" | "mlx" | null;
    capabilities?: {
      vision: boolean;
      trained_for_tool_use: boolean;
    };
    description?: string;
  }>;
}
```

### POST `/api/v1/models/load`

Load a model into memory with custom configuration.

```bash
curl http://localhost:1234/api/v1/models/load \
  -H "Authorization: Bearer $LM_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-oss-20b",
    "context_length": 16384,
    "flash_attention": true,
    "echo_load_config": true
  }'
```

#### Load Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | string | Model identifier |
| `context_length` | number | Max context tokens |
| `eval_batch_size` | number | Batch size for evaluation |
| `flash_attention` | boolean | Enable flash attention |
| `num_experts` | number | Experts for MoE models |
| `offload_kv_cache_to_gpu` | boolean | GPU KV cache offload |
| `echo_load_config` | boolean | Return final config |

### POST `/api/v1/models/unload`

```bash
curl http://localhost:1234/api/v1/models/unload \
  -H "Authorization: Bearer $LM_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"instance_id": "openai/gpt-oss-20b"}'
```

### POST `/api/v1/models/download`

```bash
curl http://localhost:1234/api/v1/models/download \
  -H "Authorization: Bearer $LM_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "ibm/granite-4-micro"}'
```

Returns a `job_id` for tracking progress.

---

## OpenAI Compatible Endpoints

Switch existing OpenAI client code to LM Studio by changing the base URL:

### TypeScript
```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseUrl: "http://localhost:1234/v1"
});
```

### Python
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:1234/v1",
    api_key="lm-studio"  # Can be any string
)
```

### POST `/v1/chat/completions`

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:1234/v1", api_key="lm-studio")

completion = client.chat.completions.create(
    model="model-identifier",
    messages=[
        {"role": "system", "content": "Always answer in rhymes."},
        {"role": "user", "content": "Introduce yourself."}
    ],
    temperature=0.7,
)

print(completion.choices[0].message)
```

#### Supported Parameters

```
model, messages, temperature, top_p, top_k, max_tokens,
stream, stop, presence_penalty, frequency_penalty,
logit_bias, repeat_penalty, seed
```

### POST `/v1/embeddings`

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:1234/v1", api_key="lm-studio")

def get_embedding(text, model="model-identifier"):
   text = text.replace("\n", " ")
   return client.embeddings.create(input=[text], model=model).data[0].embedding

print(get_embedding("Once upon a time, there was a cat."))
```

### POST `/v1/responses`

Supports reasoning, stateful follow-up, and MCP tools.

```bash
curl http://localhost:1234/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-oss-20b",
    "input": "Provide a prime number less than 50",
    "reasoning": { "effort": "low" }
  }'
```

---

## TypeScript SDK (`@lmstudio/sdk`)

### Installation

```bash
npm install @lmstudio/sdk --save
```

### Basic Usage

```typescript
import { LMStudioClient } from "@lmstudio/sdk";

const client = new LMStudioClient();
const model = await client.llm.model("qwen2.5-7b-instruct");

// Streaming response
for await (const fragment of model.respond("What is the meaning of life?")) {
  process.stdout.write(fragment.content);
}
```

### Working with Chat History

```typescript
import { Chat, LMStudioClient } from "@lmstudio/sdk";

const client = new LMStudioClient();
const model = await client.llm.model();
const chat = Chat.empty();

// Add messages to chat
chat.append("system", "You are a helpful assistant.");
chat.append("user", "Hello!");

const prediction = model.respond(chat, {
  onMessage: (message) => chat.append(message),  // Auto-append response
});

for await (const { content } of prediction) {
  process.stdout.write(content);
}
```

### Inference Parameters

```typescript
const prediction = model.respond(chat, {
  temperature: 0.6,
  maxTokens: 50,
  topP: 0.9,
  topK: 40,
});
```

### Load Parameters

```typescript
const model = await client.llm.model("qwen2.5-7b-instruct", {
  config: {
    contextLength: 8192,
    gpu: {
      ratio: 0.5,  // GPU offload ratio
    },
  },
});

// Or with explicit load()
const model = await client.llm.load("qwen2.5-7b-instruct", {
  config: { contextLength: 8192 },
  identifier: "my-model",
  ttl: 300,  // Auto-unload after 5 minutes idle
});
```

### Model Management

```typescript
// Get any loaded model
const model = await client.llm.model();

// Get specific model (loads if not already loaded)
const model = await client.llm.model("qwen2.5-7b-instruct");

// Load new instance
const model = await client.llm.load("qwen2.5-7b-instruct");

// Unload model
await model.unload();
```

### Prediction Stats

```typescript
const result = await prediction.result();

console.info("Model:", result.modelInfo.displayName);
console.info("Tokens:", result.stats.predictedTokensCount);
console.info("Time to first token:", result.stats.timeToFirstTokenSec);
console.info("Stop reason:", result.stats.stopReason);
```

---

## Tool Use / Function Calling

### OpenAI-Compatible Tool Calling

Via `/v1/chat/completions` endpoint with the `tools` parameter.

```bash
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "lmstudio-community/qwen2.5-7b-instruct",
    "messages": [{"role": "user", "content": "What products under $50?"}],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "search_products",
          "description": "Search the product catalog.",
          "parameters": {
            "type": "object",
            "properties": {
              "query": {"type": "string"},
              "category": {"type": "string", "enum": ["electronics", "clothing"]},
              "max_price": {"type": "number"}
            },
            "required": ["query"]
          }
        }
      }
    ]
  }'
```

#### Response with Tool Call

```json
{
  "choices": [{
    "finish_reason": "tool_calls",
    "message": {
      "role": "assistant",
      "tool_calls": [{
        "id": "365174485",
        "type": "function",
        "function": {
          "name": "search_products",
          "arguments": "{\"query\":\"dell\",\"category\":\"electronics\",\"max_price\":50}"
        }
      }]
    }
  }]
}
```

### TypeScript SDK `.act()` for Agents

The `.act()` method enables automatic multi-round tool calling:

```typescript
import { LMStudioClient, tool } from "@lmstudio/sdk";
import { z } from "zod";

const client = new LMStudioClient();

const multiplyTool = tool({
  name: "multiply",
  description: "Multiply two numbers",
  parameters: { a: z.number(), b: z.number() },
  implementation: ({ a, b }) => a * b,
});

const model = await client.llm.model("qwen2.5-7b-instruct");
await model.act("What is 12345 × 54321?", [multiplyTool], {
  onMessage: (message) => console.info(message.toString()),
});
```

### Supported Models for Tool Use

**Native support** (trained for tool use):
- Qwen 2.5 Instruct
- Llama 3.1, Llama 3.2
- Mistral Instruct

**Default support**: All other models get a generic tool use prompt.

---

## Structured Output (JSON Schema)

Force LLM responses to conform to a JSON schema via `response_format`.

```bash
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "model-identifier",
    "messages": [
      {"role": "system", "content": "You are a helpful jokester."},
      {"role": "user", "content": "Tell me a joke."}
    ],
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "joke_response",
        "strict": "true",
        "schema": {
          "type": "object",
          "properties": {
            "joke": {"type": "string"}
          },
          "required": ["joke"]
        }
      }
    }
  }'
```

### Python Example

```python
from openai import OpenAI
import json

client = OpenAI(base_url="http://localhost:1234/v1", api_key="lm-studio")

character_schema = {
    "type": "json_schema",
    "json_schema": {
        "name": "characters",
        "schema": {
            "type": "object",
            "properties": {
                "characters": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "occupation": {"type": "string"}
                        },
                        "required": ["name", "occupation"]
                    }
                }
            },
            "required": ["characters"]
        }
    }
}

response = client.chat.completions.create(
    model="your-model",
    messages=[{"role": "user", "content": "Create 3 fictional characters"}],
    response_format=character_schema,
)

results = json.loads(response.choices[0].message.content)
```

---

## MCP (Model Context Protocol) via API

### Ephemeral MCP Servers

Define MCP servers per-request (no pre-configuration needed):

```bash
curl http://localhost:1234/api/v1/chat \
  -H "Authorization: Bearer $LM_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ibm/granite-4-micro",
    "input": "What is the top trending model on hugging face?",
    "integrations": [
      {
        "type": "ephemeral_mcp",
        "server_label": "huggingface",
        "server_url": "https://huggingface.co/mcp",
        "allowed_tools": ["model_search"],
        "headers": { "Authorization": "Bearer YOUR_HF_TOKEN" }
      }
    ],
    "context_length": 8000
  }'
```

### Pre-configured MCP Servers (mcp.json)

Use servers defined in your `mcp.json`:

```bash
curl http://localhost:1234/api/v1/chat \
  -H "Authorization: Bearer $LM_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ibm/granite-4-micro",
    "input": "Open lmstudio.ai",
    "integrations": ["mcp/playwright"],
    "context_length": 8000
  }'
```

### Integration Types

| Type | Config Location | Use Case |
|------|-----------------|----------|
| `ephemeral_mcp` | Request body | One-off, remote MCP |
| `plugin` | `mcp.json` | Local MCP, frequently used |

### Restricting Tool Access

```json
{
  "integrations": [{
    "type": "ephemeral_mcp",
    "server_url": "https://example.com/mcp",
    "allowed_tools": ["specific_tool_only"]
  }]
}
```

---

## Streaming Events (SSE)

When `stream: true`, responses use Server-Sent Events:

```
event: <event_type>
data: <JSON_payload>
```

### Event Types

| Event | Description |
|-------|-------------|
| `chat.start` | Stream begins |
| `model_load.start/progress/end` | Model loading progress |
| `prompt_processing.start/progress/end` | Prompt processing |
| `reasoning.start/delta/end` | Reasoning content |
| `tool_call.start/arguments/success/failure` | Tool invocations |
| `message.start/delta/end` | Message content |
| `error` | Error occurred |
| `chat.end` | Final aggregated response |

### Example: message.delta

```json
{
  "type": "message.delta",
  "content": "The current"
}
```

### Example: tool_call.success

```json
{
  "type": "tool_call.success",
  "tool": "model_search",
  "arguments": {"sort": "trendingScore", "limit": 1},
  "output": "[{\"type\":\"text\",\"text\":\"Showing first 1 models...\"}]",
  "provider_info": {"type": "ephemeral_mcp", "server_label": "huggingface"}
}
```

### Example: chat.end

```json
{
  "type": "chat.end",
  "result": {
    "model_instance_id": "openai/gpt-oss-20b",
    "output": [...],
    "stats": {
      "input_tokens": 329,
      "total_output_tokens": 268,
      "tokens_per_second": 43.73,
      "time_to_first_token_seconds": 0.781
    },
    "response_id": "resp_..."
  }
}
```

---

## Authentication

### Enable Authentication

Toggle "Require authentication" in Developer tab → Server Settings.

### Create API Token

Developer tab → Server Settings → Manage Tokens → Create Token

### Using Tokens

```bash
# REST API
curl http://localhost:1234/api/v1/chat \
  -H "Authorization: Bearer $LM_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

```typescript
// TypeScript SDK
const client = new LMStudioClient({
  apiToken: "your-token"
});
```

---

## Model Management

### Idle TTL (Time-To-Live)

Auto-unload idle models after a specified time:

```bash
# Per-request TTL (seconds)
curl http://localhost:1234/api/v0/chat/completions \
  -d '{
    "model": "model-name",
    "ttl": 300,
    "messages": [...]
  }'

# CLI with TTL
lms load model-name --ttl 3600
```

**Default TTL**: 60 minutes for JIT-loaded models.

### Auto-Evict

When enabled (default), new JIT-loaded models automatically unload previous ones, keeping at most 1 model loaded at a time.

Configure in Developer tab → Server Settings.

### JIT (Just-In-Time) Loading

Models load automatically on first request. Disable via Server Settings if you want explicit control.

---

## CLI Reference (`lms`)

### Installation

`lms` ships with LM Studio. Just open a terminal:

```bash
lms --help
```

### Common Commands

```bash
# Server management
lms server start
lms server stop
lms server status

# Model management
lms get <model>              # Download model
lms load [options]           # Load model
lms unload [--all]           # Unload model
lms ls                       # List downloaded models
lms ps                       # List loaded models

# Interactive
lms chat                     # Chat in terminal

# Debugging
lms log stream               # Stream server logs
```

### Load Options

```bash
lms load --gpu=max|auto|0.0-1.0 --context-length=N
lms load openai/gpt-oss-20b --identifier="my-model"
lms load <model> --ttl 3600
```

---

## Configuration & Best Practices

### Recommended Models for Tool Use

1. **Qwen 2.5-7B-Instruct** - Excellent tool use performance
2. **Llama 3.1-8B-Instruct** - Good general purpose
3. **Ministral-8B-Instruct** - Mistral's tool-capable model

### Performance Tips

1. **Flash Attention**: Enable for faster inference and lower memory
2. **Context Length**: Only use what you need (saves memory)
3. **GPU Offload**: Set `gpu.ratio` appropriately for your hardware
4. **Eval Batch Size**: Increase for faster prompt processing

### Memory Management

```typescript
// Set TTL for auto-cleanup
const model = await client.llm.load("model", { ttl: 300 });

// Explicitly unload when done
await model.unload();
```

### Error Handling

```typescript
try {
  const result = await model.respond(chat);
} catch (error) {
  if (error.code === "model_not_found") {
    // Handle missing model
  }
}
```

### Structured Output Tips

- Not all models support structured output well
- Models < 7B parameters may struggle
- Check model card README for compatibility

---

## Quick Reference Card

### Endpoints

| Task | Endpoint |
|------|----------|
| Chat (stateful) | `POST /api/v1/chat` |
| Chat (OpenAI) | `POST /v1/chat/completions` |
| Embeddings | `POST /v1/embeddings` |
| List models | `GET /api/v1/models` |
| Load model | `POST /api/v1/models/load` |
| Unload model | `POST /api/v1/models/unload` |
| Download | `POST /api/v1/models/download` |

### Common Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | string | Model identifier |
| `temperature` | 0-1 | Randomness |
| `max_tokens` | int | Max output tokens |
| `stream` | bool | Enable SSE |
| `top_p` | 0-1 | Nucleus sampling |
| `context_length` | int | Context window |

### TypeScript SDK

```typescript
import { LMStudioClient, Chat, tool } from "@lmstudio/sdk";

const client = new LMStudioClient();
const model = await client.llm.model("model-id");
const result = await model.respond("Hello");
await model.act("Task", [tools]);  // Agent mode
await model.unload();
```

---

## Resources

- **GitHub**: https://github.com/lmstudio-ai/lmstudio-js
- **Discord**: https://discord.gg/lmstudio
- **Model Catalog**: https://lmstudio.ai/models
- **Full Docs**: https://lmstudio.ai/docs/developer
