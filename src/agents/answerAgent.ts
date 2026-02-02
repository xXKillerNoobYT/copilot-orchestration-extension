import { ANSWER_SYSTEM_PROMPT } from '../services/orchestrator';
import { logInfo, logError } from '../logger';
import { completeLLM } from '../services/llmService';

/**
 * Message interface for conversation history
 * Matches OpenAI-compatible API format
 */
export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

/**
 * Maximum number of exchanges (user + assistant pairs) to keep in history
 * Each exchange = 1 user message + 1 assistant message = 2 messages
 * 5 exchanges = 10 total messages + system prompt
 */
export const MAX_HISTORY_EXCHANGES = 5;

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
    private conversationHistory: Map<string, Message[]>;

    constructor() {
        this.conversationHistory = new Map();
    }

    /**
     * Ask a question and get an answer, maintaining conversation history
     * @param question The question to ask
     * @param chatId Optional chat ID for conversation grouping. If not provided, a new one is generated.
     * @returns The answer from the LLM
     */
    async ask(question: string, chatId?: string): Promise<string> {
        // Use provided chatId or generate a new one
        const sessionId = chatId || createChatId();
        logInfo(
            `[Answer Agent] Starting question in chat ${sessionId}: ${question.substring(0, 50)}...`
        );

        try {
            // Get existing history or start with empty array
            const existingHistory = this.conversationHistory.get(sessionId) || [];

            // Build messages array: system prompt + history + current question
            const messages: Message[] = [
                { role: 'system', content: ANSWER_SYSTEM_PROMPT },
                ...existingHistory,
                { role: 'user', content: question }
            ];

            logInfo(
                `[Answer Agent] Chat ${sessionId} with ${existingHistory.length} previous messages`
            );

            // Call LLM with message history using new multi-turn mode
            const response = await completeLLM('', {
                messages: messages
            });

            const answer = response.content;

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
                this.conversationHistory.set(sessionId, trimmedHistory);
                logInfo(
                    `[Answer Agent] Chat ${sessionId} history trimmed to last ${MAX_HISTORY_EXCHANGES} exchanges`
                );
            } else {
                this.conversationHistory.set(sessionId, updatedHistory);
            }

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
        this.conversationHistory.delete(chatId);
        logInfo(`[Answer Agent] Cleared history for chat ${chatId}`);
    }

    /**
     * Get current history for a chat (for testing/debugging)
     * @param chatId The chat ID
     * @returns The message history or undefined if not found
     */
    getHistory(chatId: string): Message[] | undefined {
        return this.conversationHistory.get(chatId);
    }
}

export default AnswerAgent;
