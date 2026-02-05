# LLM Integration Pattern

**Purpose**: Stream LLM responses with timeout protection and Server-Sent Events handling  
**Related Files**: `src/services/llmService.ts`  
**Keywords**: llm, streaming, sse, abort, timeout, fetch, lm-studio

## Core LLM Service Pattern

COE integrates with LM Studio using OpenAI-compatible HTTP API:

```typescript
// src/services/llmService.ts

/**
 * LLM service for streaming and one-shot completions.
 * Uses AbortController for inactivity timeout protection.
 * 
 * **Simple explanation**: Like having a conversation with an AI assistant
 * that can stream responses word-by-word. We use a timeout to prevent hanging
 * if the AI stops responding mid-sentence.
 */
class LLMService {
    private config: LLMConfig;
    
    async init(context: vscode.ExtensionContext): Promise<void> {
        const globalConfig = getConfigInstance();
        
        this.config = {
            endpoint: globalConfig.llm.endpoint || 'http://127.0.0.1:1234/v1',
            model: globalConfig.llm.model || 'ministral-3-14b-reasoning',
            timeoutSeconds: globalConfig.llm.timeoutSeconds || 60,
            maxTokens: globalConfig.llm.maxTokens || 2048
        };
        
        logInfo(`LLM Service initialized: ${this.config.endpoint}`);
    }
}
```

## Streaming with Timeout Protection

**Critical pattern**: Uses `AbortController` to cancel requests that hang:

```typescript
/**
 * Stream LLM response with inactivity timeout protection.
 * 
 * **Simple explanation**: AbortController is like a kill switch.
 * If the LLM server freezes and stops sending chunks for 60 seconds,
 * we flip the switch to cancel the request instead of waiting forever.
 * 
 * @param prompt - User's question or task description
 * @param onChunk - Callback fired for each chunk of text received
 * @param onDone - Callback fired when streaming completes
 * @param options - Optional request configuration
 * @returns LLMResponse with full content and token usage
 */
export async function streamLLM(
    prompt: string,
    onChunk: (chunk: string) => void,
    onDone?: (fullResponse: string) => void,
    options?: LLMRequestOptions
): Promise<LLMResponse> {
    const service = getLLMServiceInstance();
    const config = service.getConfig();
    
    // AbortController = kill switch for hung requests
    const controller = new AbortController();
    let lastActivityTime = Date.now();
    let inactivityCheckInterval: NodeJS.Timeout | null = null;
    
    const INACTIVITY_TIMEOUT_MS = config.timeoutSeconds * 1000;
    
    let fullContent = '';
    
    try {
        const messages = options?.messages || [
            { role: 'user', content: prompt }
        ];
        
        const body = {
            model: config.model,
            messages: messages,
            max_tokens: options?.maxTokens || config.maxTokens,
            stream: true,
            temperature: options?.temperature || 0.7
        };
        
        const response = await fetch(`${config.endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal // Connect abort controller
        });
        
        if (!response.ok) {
            throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
        }
        
        // Start inactivity timeout checker (every 5 seconds)
        inactivityCheckInterval = setInterval(() => {
            const now = Date.now();
            const timeSinceLastActivity = now - lastActivityTime;
            
            if (timeSinceLastActivity > INACTIVITY_TIMEOUT_MS) {
                logWarn(`LLM stream inactive for ${timeSinceLastActivity/1000}s, aborting`);
                controller.abort(); // Kill switch activated!
                if (inactivityCheckInterval) {
                    clearInterval(inactivityCheckInterval);
                }
            }
        }, 5000);
        
        // Process Server-Sent Events (SSE) stream
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            lastActivityTime = Date.now(); // Reset timeout - we got data!
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6); // Remove "data: " prefix
                    
                    if (data === '[DONE]') {
                        break;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content || '';
                        
                        if (content) {
                            fullContent += content;
                            onChunk(content); // Stream to callback
                        }
                    } catch (parseError) {
                        // Ignore malformed JSON chunks
                    }
                }
            }
        }
        
        if (inactivityCheckInterval) {
            clearInterval(inactivityCheckInterval);
        }
        
        onDone?.(fullContent);
        
        return {
            content: fullContent,
            usage: { total_tokens: estimateTokens(fullContent) }
        };
        
    } catch (error: unknown) {
        if (inactivityCheckInterval) {
            clearInterval(inactivityCheckInterval);
        }
        
        const msg = error instanceof Error ? error.message : String(error);
        logError(`LLM streaming failed: ${msg}`);
        
        // Never throw - return fallback response
        return {
            content: `[LLM Error: ${msg}]`,
            usage: { total_tokens: 0 }
        };
    }
}
```

## One-Shot Completion (Non-Streaming)

```typescript
/**
 * Single LLM completion without streaming.
 * 
 * **Simple explanation**: Like asking a question and waiting for the full answer
 * instead of getting it word-by-word. Simpler but less interactive.
 * 
 * @param prompt - User's question
 * @param options - Optional configuration
 * @returns Full LLM response
 */
export async function completeLLM(
    prompt: string,
    options?: LLMRequestOptions
): Promise<LLMResponse> {
    const service = getLLMServiceInstance();
    const config = service.getConfig();
    
    try {
        const messages = options?.messages || [
            { role: 'user', content: prompt }
        ];
        
        const body = {
            model: config.model,
            messages: messages,
            max_tokens: options?.maxTokens || config.maxTokens,
            stream: false, // No streaming
            temperature: options?.temperature || 0.7
        };
        
        const response = await fetch(`${config.endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error(`LLM request failed: ${response.status}`);
        }
        
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        return {
            content: content,
            usage: data.usage || { total_tokens: 0 }
        };
        
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`LLM completion failed: ${msg}`);
        
        return {
            content: `[LLM Error: ${msg}]`,
            usage: { total_tokens: 0 }
        };
    }
}
```

## Token Estimation and Trimming

**Heuristic-based token counting** (±20% accuracy):

```typescript
/**
 * Estimate token count for text (approximate).
 * 
 * **Simple explanation**: Like counting words, but for AI tokens.
 * We estimate ~4 characters per token plus word-based adjustment.
 * Good enough for defensive trimming but not billing.
 * 
 * @param text - Text to estimate
 * @returns Estimated token count (±20% variance)
 */
function estimateTokens(text: string): number {
    const charEstimate = Math.ceil(text.length / 4); // ~4 chars per token
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordAdjustment = Math.ceil(words.length * 0.3);
    
    return charEstimate + wordAdjustment;
}

function estimateMessagesTokens(messages: Message[]): number {
    let total = 0;
    
    for (const msg of messages) {
        total += estimateTokens(msg.content);
        total += 4; // Overhead per message
    }
    
    return total;
}
```

**Defensive trimming** before sending to LLM:

```typescript
/**
 * Trim message history to fit within token limit.
 * 
 * **Simple explanation**: Like clearing old emails to stay under storage quota.
 * We keep the system prompt + last 3 exchanges to fit in context window.
 * 
 * @param messages - Full message history
 * @param maxTokens - Token limit (from config)
 * @returns Trimmed message array
 */
function trimMessagesToTokenLimit(messages: Message[], maxTokens: number): Message[] {
    const TRIM_THRESHOLD = 0.8; // Trim at 80% of max
    const MIN_EXCHANGES_TO_KEEP = 3;
    
    const totalTokens = estimateMessagesTokens(messages);
    
    if (totalTokens <= maxTokens * TRIM_THRESHOLD) {
        return messages; // No trimming needed
    }
    
    // Preserve system message + last 3 exchanges
    const systemMessage = messages[0]?.role === 'system' ? messages[0] : null;
    const conversationMessages = systemMessage ? messages.slice(1) : messages;
    
    // 3 exchanges = 6 messages (3 user + 3 assistant)
    const trimmedConversation = conversationMessages.slice(-6);
    
    const candidateMessages = systemMessage
        ? [systemMessage, ...trimmedConversation]
        : trimmedConversation;
    
    logWarn(`Token limit exceeded (${totalTokens} > ${Math.floor(maxTokens * TRIM_THRESHOLD)}). Trimmed to ${candidateMessages.length} messages.`);
    
    return candidateMessages;
}
```

## Configuration (.coe/config.json)

```json
{
  "llm": {
    "endpoint": "http://192.168.1.205:1234/v1",
    "model": "ministral-3-14b-reasoning",
    "timeoutSeconds": 60,
    "maxTokens": 2048,
    "startupTimeoutSeconds": 300
  }
}
```

## Usage Examples

### Basic Streaming

```typescript
import { streamLLM } from '../services/llmService';

async function askQuestion(question: string): Promise<void> {
    let fullResponse = '';
    
    await streamLLM(
        question,
        (chunk) => {
            // Handle each chunk
            process.stdout.write(chunk);
            fullResponse += chunk;
        },
        (response) => {
            // Handle completion
            console.log(`\n\nFull response: ${response}`);
        }
    );
}
```

### With System Prompt

```typescript
const messages = [
    { role: 'system', content: 'You are a helpful coding assistant.' },
    { role: 'user', content: 'Explain async/await in JavaScript' }
];

const response = await completeLLM('', { messages });
console.log(response.content);
```

## Error Handling

**Never throw errors** - always return fallback response:

```typescript
try {
    // ... LLM request
} catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`LLM failed: ${msg}`);
    
    // Return error message, don't throw
    return {
        content: `[LLM Error: ${msg}]`,
        usage: { total_tokens: 0 }
    };
}
```

## Common Mistakes

❌ **Don't**: Forget to clear interval on error
```typescript
// BAD - interval leaks if error thrown
const interval = setInterval(() => checkInactivity(), 5000);
await streamLLM(...);
clearInterval(interval);
```

✅ **Do**: Use try/finally
```typescript
// GOOD - always cleanup
let interval: NodeJS.Timeout | null = null;
try {
    interval = setInterval(() => checkInactivity(), 5000);
    await streamLLM(...);
} finally {
    if (interval) clearInterval(interval);
}
```

❌ **Don't**: Throw errors from LLM service
```typescript
// BAD - breaks caller
if (!response.ok) {
    throw new Error('LLM failed');
}
```

✅ **Do**: Return error in response
```typescript
// GOOD - graceful degradation
if (!response.ok) {
    return { content: '[LLM Error]', usage: { total_tokens: 0 } };
}
```

## Related Skills
- **[07-conversation-management.md](07-conversation-management.md)** - History pruning
- **[10-configuration-management.md](10-configuration-management.md)** - LLM config
- **[11-error-handling-patterns.md](11-error-handling-patterns.md)** - Error recovery
