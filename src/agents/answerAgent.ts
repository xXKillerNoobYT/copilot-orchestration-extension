import { ANSWER_SYSTEM_PROMPT } from '../services/orchestrator';
import { logInfo, logError, logWarn } from '../logger';
import { completeLLM, streamLLM } from '../services/llmService';
import { updateTicket } from '../services/ticketDb';

/**
 * Message interface for conversation history
 * Matches OpenAI-compatible API format
 */
export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface ConversationMetadata {
    chatId: string;
    createdAt: string;
    lastActivityAt: string;
    messages: Message[];
}

/**
 * Maximum number of exchanges (user + assistant pairs) to keep in history
 * Each exchange = 1 user message + 1 assistant message = 2 messages
 * 5 exchanges = 10 total messages + system prompt
 */
export const MAX_HISTORY_EXCHANGES = 5;
export const INACTIVITY_THRESHOLD_DAYS = 30;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Generate a unique chat ID
 * Uses timestamp + random string for simplicity (no external deps needed)
 */
export function createChatId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `chat-${timestamp}-${random}`;
}

/**
 * Answer Agent: Handles follow-up questions with conversation history
 * Maintains separate conversation history per chatId in a Map
 */
export class AnswerAgent {
    private conversationHistory: Map<string, ConversationMetadata>;

    constructor() {
        this.conversationHistory = new Map();
    }

    /**
     * Ask a question and get an answer, maintaining conversation history
     * @param question The question to ask
     * @param chatId Optional chat ID for conversation grouping. If not provided, a new one is generated.
     * @param options Optional: { onStream: callback for streaming chunks }
     * @returns The answer from the LLM
     */
    async ask(
        question: string,
        chatId?: string,
        options?: { onStream?: (chunk: string) => void }
    ): Promise<string> {
        // Use provided chatId or generate a new one
        const sessionId = chatId || createChatId();
        logInfo(
            `[Answer Agent] Starting question in chat ${sessionId}: ${question.substring(0, 50)}...`
        );

        try {
            // Get existing history or start with empty array
            const existingMetadata = this.conversationHistory.get(sessionId);
            const existingHistory = existingMetadata?.messages || [];
            const createdAt = existingMetadata?.createdAt ?? new Date().toISOString();

            // Build messages array: system prompt + history + current question
            const messages: Message[] = [
                { role: 'system', content: ANSWER_SYSTEM_PROMPT },
                ...existingHistory,
                { role: 'user', content: question }
            ];

            logInfo(
                `[Answer Agent] Chat ${sessionId} with ${existingHistory.length} previous messages`
            );

            // Call LLM with message history - support streaming if callback provided
            let answer: string;
            if (options?.onStream) {
                // Use streaming mode
                const response = await streamLLM('', options.onStream, {
                    messages: messages
                });
                answer = response.content;
            } else {
                // Use non-streaming mode
                const response = await completeLLM('', {
                    messages: messages
                });
                answer = response.content;
            }

            const lastActivityAt = new Date().toISOString();

            // Append user question and assistant response to history
            const updatedHistory: Message[] = [
                ...existingHistory,
                { role: 'user', content: question },
                { role: 'assistant', content: answer }
            ];

            // Trim history to max exchanges if over limit (keep last N user-assistant pairs)
            // This prevents token overflow while maintaining context
            if (updatedHistory.length > MAX_HISTORY_EXCHANGES * 2) {
                const trimmedHistory: Message[] = updatedHistory.slice(
                    -(MAX_HISTORY_EXCHANGES * 2)
                );
                this.conversationHistory.set(sessionId, {
                    chatId: sessionId,
                    createdAt: createdAt,
                    lastActivityAt: lastActivityAt,
                    messages: trimmedHistory
                });
                logInfo(
                    `[Answer Agent] Chat ${sessionId} history trimmed to last ${MAX_HISTORY_EXCHANGES} exchanges`
                );
            } else {
                this.conversationHistory.set(sessionId, {
                    chatId: sessionId,
                    createdAt: createdAt,
                    lastActivityAt: lastActivityAt,
                    messages: updatedHistory
                });
            }

            await this.persistConversationHistory(sessionId);

            logInfo(`[Answer Agent] Chat ${sessionId} response complete`);
            return answer;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[Answer Agent] Error in chat ${sessionId}: ${message}`);
            throw error;
        }
    }

    /**
     * Clear conversation history for a specific chat
     * @param chatId The chat ID to clear
     */
    clearHistory(chatId: string): void {
        const deleted = this.conversationHistory.delete(chatId);
        if (deleted) {
            logInfo(`[Answer Agent] Cleared history for chat ${chatId}`);
        }
    }

    /**
     * Cleanup inactive conversations older than the inactivity threshold
     */
    async cleanupInactiveConversations(): Promise<void> {
        try {
            const now = Date.now();
            const threshold = INACTIVITY_THRESHOLD_DAYS * MS_PER_DAY;
            const chatIdsToDelete: string[] = [];

            for (const [chatId, metadata] of this.conversationHistory.entries()) {
                const lastActive = new Date(metadata.lastActivityAt).getTime();
                const inactiveMs = now - lastActive;

                if (inactiveMs > threshold) {
                    chatIdsToDelete.push(chatId);
                }
            }

            for (const chatId of chatIdsToDelete) {
                const metadata = this.conversationHistory.get(chatId);
                if (metadata) {
                    const ageDays = Math.floor(
                        (now - new Date(metadata.lastActivityAt).getTime()) / MS_PER_DAY
                    );
                    this.conversationHistory.delete(chatId);
                    logInfo(
                        `[Answer Agent] Auto-closed inactive chat ${chatId} (${ageDays} days old, last active: ${metadata.lastActivityAt})`
                    );
                }
            }

            if (chatIdsToDelete.length > 0) {
                logInfo(
                    `[Answer Agent] Auto-close cleanup: removed ${chatIdsToDelete.length} inactive conversation(s)`
                );
            } else {
                logInfo('[Answer Agent] Auto-close cleanup: no inactive conversations found');
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[Answer Agent] Auto-close cleanup failed: ${message}`);
        }
    }

    /**
     * Get current history for a chat (for testing/debugging)
     * @param chatId The chat ID
     * @returns The message history or undefined if not found
     */
    getHistory(chatId: string): Message[] | undefined {
        return this.conversationHistory.get(chatId)?.messages;
    }

    /**
     * Get active conversations for live UI rendering.
     */
    getActiveConversations(): ConversationMetadata[] {
        return Array.from(this.conversationHistory.values());
    }

    /**
     * Serialize conversation history for persistence
     * @returns Object mapping chatId -> JSON stringified ConversationMetadata
     */
    serializeHistory(): { [chatId: string]: string } {
        const serialized: { [chatId: string]: string } = {};
        const maxBytes = 1024 * 1024; // 1MB limit
        const maxMessages = 3 * 2; // 3 exchanges = 6 messages

        for (const [chatId, metadata] of this.conversationHistory.entries()) {
            let metadataToSave = metadata;
            let jsonString = JSON.stringify(metadataToSave);

            if (jsonString.length > maxBytes) {
                const trimmedMessages = metadata.messages.slice(-maxMessages);
                metadataToSave = {
                    ...metadata,
                    messages: trimmedMessages
                };
                jsonString = JSON.stringify(metadataToSave);
                logWarn(
                    `[Answer Agent] History truncated due to size for chat ${chatId} (kept last 3 exchanges)`
                );
            }

            serialized[chatId] = jsonString;
        }

        return serialized;
    }

    /**
     * Deserialize conversation history from persisted data
     * @param serialized Object mapping chatId -> JSON stringified ConversationMetadata
     */
    deserializeHistory(serialized: { [chatId: string]: string }): void {
        for (const [chatId, metadataJson] of Object.entries(serialized)) {
            try {
                const metadata = JSON.parse(metadataJson) as ConversationMetadata;
                this.conversationHistory.set(chatId, metadata);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logWarn(`[Answer Agent] Failed to load history for chat ${chatId}: ${message}`);
            }
        }
    }

    private async persistConversationHistory(chatId: string): Promise<void> {
        const metadata = this.conversationHistory.get(chatId);
        if (!metadata) {
            return;
        }

        try {
            const serialized = JSON.stringify(metadata);
            const updated = await updateTicket(chatId, { conversationHistory: serialized });

            if (!updated) {
                logWarn(`[Answer Agent] Could not persist history for chat ${chatId} (ticket not found)`);
            } else {
                logInfo(`[Answer Agent] Persisted history for chat ${chatId}`);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logWarn(`[Answer Agent] Failed to persist history for chat ${chatId}: ${message}`);
        }
    }
}

export default AnswerAgent;
/* ============================================================================
 * SINGLETON INSTANCE & WRAPPER FUNCTIONS
 * These wrap AnswerAgent for use throughout the extension
 * ============================================================================ */

let agentInstance: AnswerAgent | null = null;

/**
 * Initialize the Answer Agent singleton
 * Called once from extension.ts on activation
 */
export function initializeAnswerAgent(): void {
    if (!agentInstance) {
        agentInstance = new AnswerAgent();
        logInfo('[Answer Agent] Singleton initialized');
    }
}

/**
 * Get the Answer Agent singleton instance
 * Throws if not initialized
 */
function getAnswerAgent(): AnswerAgent {
    if (!agentInstance) {
        throw new Error('AnswerAgent not initialized. Call initializeAnswerAgent() first.');
    }
    return agentInstance;
}

/**
 * Ask a question with optional streaming support
 * Used by webview, MCP server, and orchestrator
 * 
 * @param question The user's question
 * @param chatId Optional conversation ID. If not provided, generates a new one
 * @param options Optional: { onStream: callback for streaming chunks }
 */
export async function answerQuestion(
    question: string,
    chatId?: string,
    options?: { onStream?: (chunk: string) => void }
): Promise<string> {
    const agent = getAnswerAgent();
    return agent.ask(question, chatId, options);
}

/**
 * Get conversation history for a chatId
 * Used by webview to load and display existing messages
 * 
 * @param chatId The conversation ID
 * @returns Array of messages (empty array if not found)
 */
export function getConversationHistory(chatId: string): Message[] {
    const agent = getAnswerAgent();
    const metadata = agent.getActiveConversations().find(c => c.chatId === chatId);
    return metadata?.messages || [];
}

/**
 * Clear a conversation's history
 * Used for "delete conversation" functionality
 * 
 * @param chatId The conversation ID to clear
 */
export function clearConversation(chatId: string): void {
    const agent = getAnswerAgent();
    agent.clearHistory(chatId);
}

/**
 * Get all active conversations
 * Used by tree provider to populate conversation list
 * 
 * @returns Array of conversation metadata
 */
export function getActiveConversations(): ConversationMetadata[] {
    const agent = getAnswerAgent();
    return agent.getActiveConversations();
}

/**
 * Restore Answer Agent state from persisted data
 * Called on extension activation to restore conversation history
 */
export function restoreAnswerAgentHistory(serialized: { [chatId: string]: string }): void {
    const agent = getAnswerAgent();
    agent.deserializeHistory(serialized);
}

/**
 * Persist Answer Agent state for later restore
 * Called on extension deactivation
 */
export function persistAnswerAgentHistory(): { [chatId: string]: string } {
    const agent = getAnswerAgent();
    return agent.serializeHistory();
}

/**
 * Reset Answer Agent for testing
 * NOT FOR PRODUCTION USE
 */
export function resetAnswerAgentForTests(): void {
    agentInstance = null;
}