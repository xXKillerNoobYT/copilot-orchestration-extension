# Conversation Management Pattern

**Purpose**: Manage LLM conversation history with automatic pruning and chatId tracking  
**Related Files**: `src/agents/answerAgent.ts`  
**Keywords**: conversation, history, pruning, chatid, context, memory

## Conversation History Structure

Answer Agent maintains per-chat conversation history:

```typescript
// src/agents/answerAgent.ts

interface ConversationMetadata {
    chatId: string;
    createdAt: string;
    lastActivityAt: string;
    messages: Message[];
}

interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export const MAX_HISTORY_EXCHANGES = 5; // 5 user + 5 assistant = 10 messages

class AnswerAgent {
    // Map of chatId → conversation metadata
    private conversationHistory: Map<string, ConversationMetadata> = new Map();
    
    async ask(question: string, chatId?: string): Promise<string> {
        // Implementation...
    }
}
```

## Ask Method with History Management

```typescript
/**
 * Ask a question with conversation history tracking.
 * Maintains up to 5 exchanges (10 messages) per chat session.
 * 
 * **Simple explanation**: Like a conversation with memory. The AI remembers
 * previous messages in the chat (up to 5 exchanges) so you can have back-and-forth
 * discussions. When history gets too long, we forget the oldest messages
 * to save memory - like clearing old emails to free space.
 * 
 * @param question - User's question
 * @param chatId - Optional chat session ID (creates new session if not provided)
 * @returns AI's answer
 */
async ask(question: string, chatId?: string): Promise<string> {
    // Generate or use provided chat ID
    const sessionId = chatId || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Get existing conversation or start new one
    const existingHistory = this.conversationHistory.get(sessionId)?.messages || [];
    const createdAt = this.conversationHistory.get(sessionId)?.createdAt || new Date().toISOString();
    
    // Build messages array: system prompt + history + new question
    const messages: Message[] = [
        { role: 'system', content: ANSWER_SYSTEM_PROMPT },
        ...existingHistory,
        { role: 'user', content: question }
    ];
    
    // Get answer from LLM
    const answer = await completeLLM('', { messages });
    
    // Update conversation history
    const updatedHistory = [
        ...existingHistory,
        { role: 'user', content: question },
        { role: 'assistant', content: answer }
    ];
    
    // Prune to max exchanges (CRITICAL)
    if (updatedHistory.length > MAX_HISTORY_EXCHANGES * 2) {
        const trimmed = updatedHistory.slice(-(MAX_HISTORY_EXCHANGES * 2));
        
        this.conversationHistory.set(sessionId, {
            chatId: sessionId,
            createdAt: createdAt,
            lastActivityAt: new Date().toISOString(),
            messages: trimmed
        });
        
        logInfo(`Chat ${sessionId} history trimmed to last ${MAX_HISTORY_EXCHANGES} exchanges`);
    } else {
        this.conversationHistory.set(sessionId, {
            chatId: sessionId,
            createdAt: createdAt,
            lastActivityAt: new Date().toISOString(),
            messages: updatedHistory
        });
    }
    
    return answer;
}
```

## History Pruning Strategy

**Each exchange** = 1 user message + 1 assistant message

```
MAX_HISTORY_EXCHANGES = 5

Total messages in history:
- 1 system prompt (always kept, not in history)
- 5 user messages
- 5 assistant messages
= 10 messages in history array

Total sent to LLM:
- 1 system prompt
- 10 history messages
= 11 messages total
```

**Pruning algorithm**:

```typescript
// Keep only last N exchanges
const MAX_MESSAGES = MAX_HISTORY_EXCHANGES * 2; // 10 messages

if (updatedHistory.length > MAX_MESSAGES) {
    // Slice from end: keeps last 10 messages
    const trimmed = updatedHistory.slice(-MAX_MESSAGES);
    
    logInfo(`Trimmed history: ${updatedHistory.length} → ${trimmed.length} messages`);
    
    // Store trimmed history
    conversationHistory.set(chatId, { messages: trimmed });
}
```

## ChatId Generation

**Auto-generate unique chat IDs**:

```typescript
function generateChatId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `chat-${timestamp}-${random}`;
}

// Example: "chat-1707063425123-k2j9x3p1q"
```

**Usage patterns**:

```typescript
// New conversation (no chatId)
const answer1 = await answerAgent.ask('What is TypeScript?');
// Creates: chat-1707063425123-k2j9x3p1q

// Continue conversation (with chatId)
const answer2 = await answerAgent.ask('Give me an example', 'chat-1707063425123-k2j9x3p1q');
// Reuses same chat, maintains history
```

## Getting Conversation History

```typescript
/**
 * Get conversation history for a chat session.
 * 
 * **Simple explanation**: Like viewing your chat history in Slack.
 * Returns all the back-and-forth messages for a specific conversation.
 * 
 * @param chatId - Chat session ID
 * @returns Conversation metadata or null if not found
 */
getConversation(chatId: string): ConversationMetadata | null {
    return this.conversationHistory.get(chatId) || null;
}

/**
 * List all active conversations.
 * 
 * **Simple explanation**: Like your inbox showing all open chats.
 * Returns metadata for all ongoing conversations.
 * 
 * @returns Array of all conversation metadata
 */
getAllConversations(): ConversationMetadata[] {
    return Array.from(this.conversationHistory.values());
}
```

## Clearing Old Conversations

```typescript
/**
 * Clear conversation history for a chat session.
 * 
 * **Simple explanation**: Like deleting a chat thread. Removes all messages
 * for that conversation. Next question with same chatId starts fresh.
 * 
 * @param chatId - Chat session ID to clear
 */
clearConversation(chatId: string): void {
    this.conversationHistory.delete(chatId);
    logInfo(`Cleared conversation: ${chatId}`);
}

/**
 * Clear all inactive conversations (older than 24 hours).
 * 
 * **Simple explanation**: Like auto-archiving old emails. Cleans up memory
 * by removing conversations you haven't used in a day.
 */
clearInactiveConversations(): void {
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    
    const toDelete: string[] = [];
    
    for (const [chatId, metadata] of this.conversationHistory.entries()) {
        const lastActivity = new Date(metadata.lastActivityAt).getTime();
        const age = now - lastActivity;
        
        if (age > TWENTY_FOUR_HOURS) {
            toDelete.push(chatId);
        }
    }
    
    toDelete.forEach(chatId => {
        this.conversationHistory.delete(chatId);
    });
    
    if (toDelete.length > 0) {
        logInfo(`Cleared ${toDelete.length} inactive conversations`);
    }
}
```

## Integration with MCP askQuestion

```typescript
// src/mcpServer/tools/askQuestion.ts

export async function handleAskQuestion(params: any): Promise<MCPResponse> {
    const { question, chatId } = params;
    
    if (!question || typeof question !== 'string') {
        return createErrorResponse(-32602, 'question must be a string');
    }
    
    try {
        const orchestrator = getOrchestratorInstance();
        
        // Route to Answer Agent with optional chatId
        const answer = await orchestrator.routeToAnswerAgent(question, chatId);
        
        return {
            jsonrpc: '2.0',
            id: null,
            result: {
                answer: answer,
                chatId: chatId || 'new-session'
            }
        };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return createErrorResponse(-32603, `Failed to get answer: ${msg}`);
    }
}
```

## System Prompt Pattern

```typescript
// src/services/orchestrator.ts

export const ANSWER_SYSTEM_PROMPT = `You are an Answer agent in the COE system.

Your role:
- Answer user questions about code, tasks, and project context
- Be concise but thorough
- If you need deep research (>2 min), suggest using Research Agent
- Stay helpful and friendly

Current context:
- You have conversation history (up to 5 exchanges)
- You can see previous questions and answers in this chat
- Reference prior messages when relevant

Respond in markdown format.`;
```

## Usage Examples

### Basic Q&A (No History)

```typescript
const answerAgent = new AnswerAgent();

const answer = await answerAgent.ask('What is a singleton pattern?');
console.log(answer);
// Creates new chat session automatically
```

### Multi-Turn Conversation

```typescript
const chatId = 'chat-1707063425123-k2j9x3p1q';

const answer1 = await answerAgent.ask('What is async/await?', chatId);
console.log(answer1);

const answer2 = await answerAgent.ask('Can you give me an example?', chatId);
console.log(answer2); // Remembers previous question

const answer3 = await answerAgent.ask('What about error handling?', chatId);
console.log(answer3); // Has context from both prior exchanges
```

### Inspecting History

```typescript
const metadata = answerAgent.getConversation('chat-1707063425123-k2j9x3p1q');

console.log(`Created: ${metadata.createdAt}`);
console.log(`Last activity: ${metadata.lastActivityAt}`);
console.log(`Messages: ${metadata.messages.length}`);

metadata.messages.forEach(msg => {
    console.log(`${msg.role}: ${msg.content.substring(0, 50)}...`);
});
```

## Common Mistakes

❌ **Don't**: Store unlimited history
```typescript
// BAD - will exceed token limits
conversationHistory.set(chatId, {
    messages: [...existingHistory, newUserMsg, newAssistantMsg]
});
```

✅ **Do**: Always prune to max exchanges
```typescript
// GOOD - trim to last 5 exchanges
if (updatedHistory.length > MAX_HISTORY_EXCHANGES * 2) {
    updatedHistory = updatedHistory.slice(-10);
}
```

❌ **Don't**: Forget to update timestamps
```typescript
// BAD - timestamp never updates
conversationHistory.set(chatId, {
    createdAt: metadata.createdAt,
    lastActivityAt: metadata.lastActivityAt, // Stale!
    messages: updatedHistory
});
```

✅ **Do**: Update on each interaction
```typescript
// GOOD - fresh timestamp
conversationHistory.set(chatId, {
    createdAt: metadata.createdAt,
    lastActivityAt: new Date().toISOString(), // Updated!
    messages: updatedHistory
});
```

## Related Skills
- **[06-llm-integration.md](06-llm-integration.md)** - LLM request patterns
- **[12-agent-coordination.md](12-agent-coordination.md)** - Answer Agent routing
- **[08-mcp-protocol.md](08-mcp-protocol.md)** - askQuestion MCP tool
