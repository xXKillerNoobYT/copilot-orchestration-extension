// Requires Node.js 18+ for native fetch. If using Node 16, install node-fetch as fallback.

import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../logger';
import { getConfigInstance } from '../config';
import { createTicket } from './ticketDb';
import { llmStatusBar } from '../ui/llmStatusBar';
import { LLMTimeoutError, LLMOfflineError, LLMResponseError } from '../errors/LLMErrors';

/**
 * Configuration for LLM service
 */
export interface LLMConfig {
    endpoint: string;
    model: string;
    timeoutSeconds: number;
    maxTokens: number;
    startupTimeoutSeconds?: number;
    temperature?: number;
    offlineFallbackMessage?: string;
}

/**
 * Options for LLM requests
 */
export interface LLMRequestOptions {
    systemPrompt?: string;
    temperature?: number;
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

/**
 * Response from LLM
 */
export interface LLMResponse {
    content: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * Default configuration values
 * Note: These are fallbacks. Production config should be in .coe/config.json
 */
const DEFAULT_CONFIG: LLMConfig = {
    endpoint: 'http://127.0.0.1:1234/v1',
    model: 'ministral-3-14b-reasoning',
    timeoutSeconds: 60,
    maxTokens: 2048,
    startupTimeoutSeconds: 300,
    temperature: 0.7,
    offlineFallbackMessage: 'LLM offline – ticket created for manual review'
};

/**
 * Singleton LLM service instance
 */
class LLMService {
    private config: LLMConfig | null = null;

    /**
     * Get the current configuration
     */
    getConfig(): LLMConfig {
        if (!this.config) {
            throw new Error('LLM service not initialized. Call initializeLLMService first.');
        }
        return this.config;
    }

    /**
     * Set the configuration
     */
    setConfig(config: LLMConfig): void {
        this.config = config;
    }
}

const llmServiceInstance = new LLMService();

/**
 * Type alias for message objects used in LLM conversations
 */
type Message = { role: 'user' | 'assistant' | 'system'; content: string };

/**
 * Estimate the number of tokens in a text string
 * 
 * Uses a simple heuristic: ~4 characters per token + word count * 0.3
 * This is approximate but sufficient for defensive trimming (±20% variance).
 * 
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 */
function estimateTokens(text: string): number {
    if (!text || text.length === 0) {
        return 0;
    }

    // Character-based estimation: 1 token ≈ 4 characters
    const charEstimate = Math.ceil(text.length / 4);

    // Word-based adjustment: Add weight for word boundaries
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordAdjustment = Math.ceil(words.length * 0.3);

    return charEstimate + wordAdjustment;
}

/**
 * Estimate total tokens for an array of messages
 * 
 * Sums up token estimates for all message contents.
 * 
 * @param messages - Array of messages to estimate
 * @returns Total estimated token count
 */
function estimateMessagesTokens(messages: Message[]): number {
    return messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
}

/**
 * Trim messages to stay within token limit
 * 
 * Defensive trimming strategy:
 * - If messages <= 80% of maxTokens, return unchanged
 * - Otherwise, preserve system message (index 0) + last 3 user/assistant exchanges
 * - Remove oldest conversation messages until under 80% threshold
 * - Always keep system message even if it exceeds limit (critical context)
 * 
 * @param messages - Array of messages to potentially trim
 * @param maxTokens - Maximum token limit from config
 * @returns Trimmed messages array (or original if no trimming needed)
 */
function trimMessagesToTokenLimit(messages: Message[], maxTokens: number): Message[] {
    const TRIM_THRESHOLD = 0.8; // 80% of maxTokens
    const MIN_EXCHANGES_TO_KEEP = 3; // Keep last 3 user/assistant exchanges (6 messages)

    // Quick exit: if under threshold, no trimming needed
    const totalTokens = estimateMessagesTokens(messages);
    if (totalTokens <= maxTokens * TRIM_THRESHOLD) {
        return messages;
    }

    // If only 1 message or empty, can't trim further
    if (messages.length <= 1) {
        if (messages.length === 1 && totalTokens > maxTokens) {
            logWarn(`System message alone (${totalTokens} tokens) exceeds maxTokens (${maxTokens}). Keeping it anyway (critical context).`);
        }
        return messages;
    }

    // Separate system message from conversation messages
    const systemMessage: Message | null = (messages[0]?.role === 'system') ? messages[0] : null;
    const conversationMessages = systemMessage ? messages.slice(1) : messages;

    // Start with system message + last N exchanges
    const messagesToKeep = MIN_EXCHANGES_TO_KEEP * 2; // 3 exchanges = 6 messages
    let trimmedConversation = conversationMessages.slice(-messagesToKeep);

    // Build candidate array
    let candidateMessages = systemMessage
        ? [systemMessage, ...trimmedConversation]
        : trimmedConversation;

    // If still over limit, remove oldest conversation messages one by one
    let candidateTokens = estimateMessagesTokens(candidateMessages);
    while (candidateTokens > maxTokens * TRIM_THRESHOLD && trimmedConversation.length > 1) {
        // Remove the oldest conversation message
        trimmedConversation = trimmedConversation.slice(1);
        candidateMessages = systemMessage
            ? [systemMessage, ...trimmedConversation]
            : trimmedConversation;
        candidateTokens = estimateMessagesTokens(candidateMessages);
    }

    // Final safety: if only system message remains and still over limit, keep it anyway
    if (candidateMessages.length === 1 && systemMessage && candidateTokens > maxTokens) {
        logWarn(`System message alone (${candidateTokens} tokens) exceeds maxTokens (${maxTokens}). Keeping it anyway (critical context).`);
    }

    // Log trimming action
    if (candidateMessages.length < messages.length) {
        logWarn(`Token limit exceeded (${totalTokens} > ${Math.floor(maxTokens * TRIM_THRESHOLD)}). Trimmed messages from ${messages.length} to ${candidateMessages.length} (${candidateTokens} tokens).`);
    }

    return candidateMessages;
}

/**
 * Initialize the LLM service by reading config from central config system
 *
 * This function reads the config from the centralized config system (already validated).
 * The config system handles defaults and validation via Zod schema.
 *
 * @param context - VS Code extension context (kept for API compatibility)
 */
export async function initializeLLMService(context: vscode.ExtensionContext): Promise<void> {
    // Check for native fetch support (Node.js 18+)
    // fetch() is like asking the internet for something - it returns a promise you await
    if (typeof fetch === 'undefined') {
        logError('LLM service requires Node.js 18+ for native fetch support');
        throw new Error('Node.js 18+ required for LLM integration. Please upgrade Node.js or install node-fetch as a polyfill.');
    }

    // Get config from central config system (already validated by Zod)
    const centralConfig = getConfigInstance();
    const llmConfig = centralConfig.llm;

    // Map central config to LLMConfig interface
    const config: LLMConfig = {
        endpoint: llmConfig.endpoint,
        model: llmConfig.model,
        timeoutSeconds: llmConfig.timeoutSeconds,
        maxTokens: llmConfig.maxTokens,
        startupTimeoutSeconds: llmConfig.startupTimeoutSeconds,
        temperature: llmConfig.temperature,
        offlineFallbackMessage: llmConfig.offlineFallbackMessage,
    };

    // Store validated config
    llmServiceInstance.setConfig(config);
    logInfo(`LLM service initialized: ${config.endpoint} (model: ${config.model})`);
}

/**
 * Validate connection to LLM endpoint.
 *
 * Performs a lightweight health check to verify the LLM service is reachable.
 * Uses the /models endpoint which is standard for OpenAI-compatible APIs.
 *
 * **Simple explanation**: Like pinging a server to see if anyone's home before
 * sending a long request.
 *
 * @returns Promise<boolean> - true if connection successful, false otherwise
 */
export async function validateConnection(): Promise<{ success: boolean; error?: string }> {
    const config = llmServiceInstance.getConfig();
    const timeoutMs = 5000; // 5 second timeout for health check

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${config.endpoint}/models`, {
            method: 'GET',
            signal: controller.signal,
        });

        if (response.ok) {
            logInfo('LLM connection validated successfully');
            return { success: true };
        } else {
            const errorMsg = `LLM health check failed: HTTP ${response.status}`;
            logWarn(errorMsg);
            return { success: false, error: errorMsg };
        }
    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));

        if (err.name === 'AbortError') {
            const errorMsg = 'LLM connection timeout (health check)';
            logWarn(errorMsg);
            return { success: false, error: errorMsg };
        }

        if ((err as any).code === 'ECONNREFUSED') {
            const errorMsg = `LLM endpoint unreachable: ${config.endpoint}`;
            logWarn(errorMsg);
            return { success: false, error: errorMsg };
        }

        logWarn(`LLM connection check failed: ${err.message}`);
        return { success: false, error: err.message };
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Call LLM with non-streaming request (waits for full response)
 * 
 * This function sends a prompt to the LLM and waits for the complete response.
 * Uses fetch() to make HTTP POST request and AbortController for timeout.
 * 
 * Supports two modes:
 * 1. Legacy: Pass prompt + systemPrompt in options
 * 2. New: Pass pre-built messages array in options.messages (for conversation history)
 * 
 * @param prompt - The user's question or prompt (can be empty string if using options.messages)
 * @param options - Optional system prompt, temperature, or messages array
 * @returns Promise with the full response and token usage
 */
export async function completeLLM(
    prompt: string,
    options?: LLMRequestOptions
): Promise<LLMResponse> {
    const config = llmServiceInstance.getConfig();
    llmStatusBar.start();

    // Build messages array - support two modes for backward compatibility
    // Mode 1: If messages array provided in options, use it directly (for multi-turn history)
    // Mode 2: Otherwise, build from prompt + optional systemPrompt (legacy behavior)
    let messages: any[];

    if (options?.messages && options.messages.length > 0) {
        // Multi-turn mode: use provided messages array directly
        messages = options.messages;
    } else {
        // Legacy mode: build from prompt and optional system prompt
        messages = [];
        if (options?.systemPrompt) {
            messages.push({ role: 'system', content: options.systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });
    }

    // Apply defensive token trimming before sending to LLM
    messages = trimMessagesToTokenLimit(messages, config.maxTokens);

    // Build request body for LM Studio API (OpenAI-compatible format)
    const body = {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        stream: false, // Non-streaming mode - wait for full response
        temperature: options?.temperature ?? config.temperature ?? 0.7
    };

    logInfo(`LLM request: ${prompt.substring(0, 100)}...`);

    // AbortController is like a kill switch - lets us stop the request if it takes too long
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort(); // Stop the request after timeout
        logWarn(`LLM request timeout after ${config.timeoutSeconds}s`);
    }, config.timeoutSeconds * 1000);

    try {
        // fetch() is like asking the internet for data - it returns a promise you await
        // We send a POST request to the LLM endpoint with our prompt
        const response = await fetch(config.endpoint + '/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal // This lets AbortController stop the request
        });

        // Check if the response status is OK (200-299)
        if (!response.ok) {
            const errorBody = await response.text().catch(() => undefined);
            throw new LLMResponseError(response.status, response.statusText, errorBody);
        }

        // Parse the JSON response
        const data: any = await response.json();
        const content = data.choices[0].message.content;
        const usage = data.usage;

        logInfo(`LLM response: ${content.substring(0, 100)}... (tokens: ${usage?.total_tokens || 'unknown'})`);

        return { content, usage };

    } catch (error: any) {
        // Log the error with details
        logError(`LLM call failed: ${error.message}`);

        // Create a blocked ticket so a human can review what went wrong
        await createTicket({
            title: `LLM FAILURE: ${prompt.substring(0, 50)}`,
            status: 'blocked',
            description: `Error: ${error.message}\n\nOriginal prompt:\n${prompt}`,
            priority: 2,
            creator: 'system',
            assignee: 'Clarity Agent',
            taskId: null,
            version: 1,
            resolution: null
        });

        // Provide specific error messages based on error type
        if (error.name === 'AbortError') {
            throw new LLMTimeoutError('request', config.timeoutSeconds * 1000, { model: config.model });
        } else if (error.code === 'ECONNREFUSED') {
            throw new LLMOfflineError(
                config.endpoint,
                config.offlineFallbackMessage || 'LLM offline – ticket created for manual review',
                error
            );
        } else if (error instanceof LLMResponseError) {
            throw error; // Already a typed error
        } else {
            throw error;
        }
    } finally {
        // Always clear the timeout, even if there was an error
        clearTimeout(timeoutId);
        llmStatusBar.end();
    }
}

/**
 * Call LLM with streaming request (chunks arrive in real-time)
 * 
 * This function sends a prompt to the LLM and receives the response in small chunks.
 * Think of it like drinking through a straw - data comes in small sips, not all at once.
 * It accumulates chunks and returns the full response at the end.
 * 
 * @param prompt - The user's question or prompt
 * @param onChunk - Callback function called for each chunk of text
 * @param options - Optional system prompt and temperature
 * @returns Promise with the full accumulated response
 */
export async function streamLLM(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: LLMRequestOptions
): Promise<LLMResponse> {
    const config = llmServiceInstance.getConfig();
    llmStatusBar.start();

    // Build messages array - support two modes for backward compatibility
    // Mode 1: If messages array provided in options, use it directly (for multi-turn history)
    // Mode 2: Otherwise, build from prompt + optional systemPrompt (legacy behavior)
    let messages: any[];

    if (options?.messages && options.messages.length > 0) {
        // Multi-turn mode: use provided messages array directly (for conversation history)
        messages = options.messages;
    } else {
        // Legacy mode: build from prompt and optional system prompt
        messages = [];
        if (options?.systemPrompt) {
            messages.push({ role: 'system', content: options.systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });
    }

    // Apply defensive token trimming before sending to LLM
    const trimmedMessages = trimMessagesToTokenLimit(messages, config.maxTokens);

    // Build request body with stream: true
    const body = {
        model: config.model,
        messages: trimmedMessages,
        max_tokens: config.maxTokens,
        stream: true, // Streaming mode - chunks arrive as they're generated
        temperature: options?.temperature ?? config.temperature ?? 0.7
    };

    logInfo(`LLM streaming started: ${prompt.substring(0, 50)}...`);

    // AbortController for cancellation
    const controller = new AbortController();
    let abortReason: 'startup' | 'inactivity' | null = null; // Track which timeout triggered abort
    let lastChunkTime: number | null = null; // Track when we last received a chunk
    let checkInterval: NodeJS.Timeout | null = null;
    let startupTimeout: NodeJS.Timeout | null = null;
    let streamingStarted = false; // Flag to track if streaming has started
    const startTime = Date.now(); // Track total elapsed time for logging

    // Validate and set startup timeout
    const startupTimeoutSeconds =
        typeof config.startupTimeoutSeconds === 'number' && config.startupTimeoutSeconds > 0
            ? config.startupTimeoutSeconds
            : 300; // Default to 300 seconds

    if (startupTimeoutSeconds !== config.startupTimeoutSeconds) {
        logWarn(`Invalid startupTimeoutSeconds in config. Using default: ${startupTimeoutSeconds}s`);
    }

    // Start startup timeout
    startupTimeout = setTimeout(() => {
        if (!streamingStarted) {
            // Guard: prevent double-abort
            if (abortReason !== null) {
                return; // Already aborting via another timeout
            }
            abortReason = 'startup';
            const timeElapsed = Date.now() - startTime;
            logWarn(`LLM startup timeout after ${startupTimeoutSeconds}s (elapsed: ${timeElapsed}ms)`);
            logInfo(`Streaming aborted: ${abortReason}, duration: ${timeElapsed}ms`);
            controller.abort();
        }
    }, startupTimeoutSeconds * 1000);
    // .unref() ensures timer doesn't keep Node/Jest process alive
    startupTimeout.unref();

    // Start interval checker for inactivity timeout
    checkInterval = setInterval(() => {
        if (!streamingStarted || !lastChunkTime) return; // Skip if streaming hasn't started

        const idleTime = Date.now() - lastChunkTime;
        if (idleTime > config.timeoutSeconds * 1000) {
            // Guard: prevent double-abort
            if (abortReason !== null) {
                return; // Already aborting via another timeout
            }
            abortReason = 'inactivity';
            const timeElapsed = Date.now() - startTime;
            logWarn(`LLM inactivity timeout after ${config.timeoutSeconds}s (elapsed: ${timeElapsed}ms)`);
            logInfo(`Streaming aborted: ${abortReason}, duration: ${timeElapsed}ms`);
            controller.abort(); // Stop the stream
        }
    }, 1000); // Check every second
    // .unref() ensures timer doesn't keep Node/Jest process alive
    checkInterval.unref();

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    // Cleanup helper function - idempotent (safe to call multiple times)
    const cleanup = async (): Promise<void> => {
        const timeElapsed = Date.now() - startTime;
        logInfo(`Cleanup: aborting (reason=${abortReason || 'none'}, duration=${timeElapsed}ms), clearing timers and reader`);
        if (checkInterval !== null) {
            clearInterval(checkInterval);
            checkInterval = null;
        }
        if (startupTimeout !== null) {
            clearTimeout(startupTimeout);
            startupTimeout = null;
        }
        if (reader !== null) {
            await reader.cancel(); // Close the stream
            reader = null;
        }
        llmStatusBar.end();
    };

    try {
        // Make the streaming request
        const response = await fetch(config.endpoint + '/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        // Check if the response status is OK
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Get a reader for the response body
        // ReadableStream is like a water pipe - data flows through in chunks
        reader = response.body!.getReader();

        // TextDecoder converts bytes (numbers) into readable text (letters)
        const decoder = new TextDecoder();

        // This will accumulate all chunks into one full response
        let fullResponse = '';
        let buffer = '';

        let streaming = true;
        while (streaming) {
            const { done, value } = await reader.read();

            if (done) {
                logInfo('LLM streaming complete');
                streaming = false;
                break; // Stream finished
            }

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Process complete lines (SSE data)
            const lines = buffer.split('\n');
            buffer = lines.pop()!; // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const json = line.substring(5).trim();
                    if (json === '[DONE]') {
                        streaming = false;
                        break;
                    }

                    try {
                        const parsed = JSON.parse(json);
                        const content = parsed.choices[0]?.delta?.content;

                        if (content) {
                            if (!streamingStarted) {
                                streamingStarted = true;
                                lastChunkTime = Date.now();
                                logInfo('First LLM chunk received — starting normal 60s inactivity timer');
                                if (startupTimeout) {
                                    clearTimeout(startupTimeout);
                                }
                            } else {
                                lastChunkTime = Date.now();
                            }

                            onChunk(content);
                            fullResponse += content;
                        }
                    } catch (err) {
                        logWarn(`Failed to parse SSE line: ${line}`);
                    }
                }
            }
        }

        return { content: fullResponse };
    } catch (error: any) {
        const timeElapsed = Date.now() - startTime;
        // Log the error with details
        logError(`LLM streaming failed after ${timeElapsed}ms: ${error.message}`);

        // Create a blocked ticket so a human can review what went wrong
        await createTicket({
            title: `LLM STREAMING FAILURE: ${prompt.substring(0, 50)}`,
            status: 'blocked',
            description: `Error: ${error.message}\nAbort Reason: ${abortReason || 'N/A'}\nElapsed: ${timeElapsed}ms\n\nOriginal prompt:\n${prompt}`,
            priority: 2,
            creator: 'system',
            assignee: 'Clarity Agent',
            taskId: null,
            version: 1,
            resolution: null
        });

        // Provide specific error messages based on error type
        if (error.name === 'AbortError') {
            // Map the abort reason to appropriate error phase
            let phase: 'startup' | 'streaming' | 'inactivity' = 'streaming';
            if (abortReason === 'startup') {
                phase = 'startup';
            } else if (abortReason === 'inactivity') {
                phase = 'inactivity';
            }
            throw new LLMTimeoutError(phase, timeElapsed, { model: config.model });
        } else if (error.code === 'ECONNREFUSED') {
            throw new LLMOfflineError(
                config.endpoint,
                config.offlineFallbackMessage || 'LLM offline – ticket created for manual review',
                error
            );
        } else {
            throw error;
        }
    } finally {
        await cleanup(); // Call cleanup helper - runs only once, idempotent
    }
}
