// Requires Node.js 18+ for native fetch. If using Node 16, install node-fetch as fallback.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn, logError } from '../logger';
import { createTicket } from './ticketDb';
import { llmStatusBar } from '../ui/llmStatusBar';

/**
 * Configuration for LLM service
 */
export interface LLMConfig {
    endpoint: string;
    model: string;
    timeoutSeconds: number;
    maxTokens: number;
    startupTimeoutSeconds?: number;
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
 */
const DEFAULT_CONFIG: LLMConfig = {
    endpoint: 'http://192.168.1.205:1234/v1',
    model: 'ministral-3-14b-reasoning',
    timeoutSeconds: 60,
    maxTokens: 2048,
    startupTimeoutSeconds: 300
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
 * Initialize the LLM service by reading and validating config
 * 
 * This function reads the config from .coe/config.json and validates it.
 * If config is missing or invalid, uses default values with warnings.
 * 
 * @param context - VS Code extension context
 */
export async function initializeLLMService(context: vscode.ExtensionContext): Promise<void> {
    // Check for native fetch support (Node.js 18+)
    // fetch() is like asking the internet for something - it returns a promise you await
    if (typeof fetch === 'undefined') {
        logError('LLM service requires Node.js 18+ for native fetch support');
        throw new Error('Node.js 18+ required for LLM integration. Please upgrade Node.js or install node-fetch as a polyfill.');
    }

    // Read config from .coe/config.json
    const configPath = path.join(context.extensionPath, '.coe', 'config.json');
    let config = { ...DEFAULT_CONFIG }; // Start with defaults

    if (fs.existsSync(configPath)) {
        try {
            const fileContent = fs.readFileSync(configPath, 'utf-8');
            const fileConfig = JSON.parse(fileContent);

            // Merge LLM config if it exists
            if (fileConfig.llm) {
                config = { ...config, ...fileConfig.llm };
            }
        } catch (error: any) {
            logWarn(`Failed to read config file: ${error.message}. Using defaults.`);
        }
    } else {
        logWarn(`Config file not found at ${configPath}. Using defaults.`);
    }

    // Validate timeoutSeconds (must be a positive number)
    if (typeof config.timeoutSeconds !== 'number' || config.timeoutSeconds <= 0) {
        logWarn(`Invalid timeoutSeconds: ${config.timeoutSeconds}, using default: 60`);
        config.timeoutSeconds = 60;
    }

    // Validate maxTokens (must be a positive number)
    if (typeof config.maxTokens !== 'number' || config.maxTokens <= 0) {
        logWarn(`Invalid maxTokens: ${config.maxTokens}, using default: 2048`);
        config.maxTokens = 2048;
    }

    // Validate startupTimeoutSeconds (must be a positive number)
    if (typeof config.startupTimeoutSeconds !== 'number' || config.startupTimeoutSeconds <= 0) {
        logWarn(`Invalid startupTimeoutSeconds: ${config.startupTimeoutSeconds}, using default: 300`);
        config.startupTimeoutSeconds = 300;
    }

    // Store validated config
    llmServiceInstance.setConfig(config);
    logInfo(`LLM service initialized: ${config.endpoint} (model: ${config.model})`);
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

    // Build request body for LM Studio API (OpenAI-compatible format)
    const body = {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        stream: false, // Non-streaming mode - wait for full response
        temperature: options?.temperature ?? 0.7
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
            throw new Error(`HTTP error! status: ${response.status}`);
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
            description: `Error: ${error.message}\n\nOriginal prompt:\n${prompt}`
        });

        // Provide specific error messages based on error type
        if (error.name === 'AbortError') {
            throw new Error(`LLM request timed out after ${config.timeoutSeconds} seconds`);
        } else if (error.code === 'ECONNREFUSED') {
            throw new Error('LLM endpoint unreachable. Check if LM Studio is running.');
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

    // Build messages array (same as completeLLM)
    const messages: any[] = [];
    if (options?.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    // Build request body with stream: true
    const body = {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        stream: true, // Streaming mode - chunks arrive as they're generated
        temperature: options?.temperature ?? 0.7
    };

    logInfo(`LLM streaming started: ${prompt.substring(0, 50)}...`);

    // AbortController for cancellation
    const controller = new AbortController();
    let lastChunkTime: number | null = null; // Track when we last received a chunk
    let checkInterval: NodeJS.Timeout | null = null;
    let startupTimeout: NodeJS.Timeout | null = null;
    let streamingStarted = false; // Flag to track if streaming has started

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
            logWarn(`LLM startup timeout after ${startupTimeoutSeconds}s`);
            controller.abort();
        }
    }, startupTimeoutSeconds * 1000);

    // Start interval checker for inactivity timeout
    checkInterval = setInterval(() => {
        if (!streamingStarted || !lastChunkTime) return; // Skip if streaming hasn't started

        const idleTime = Date.now() - lastChunkTime;
        if (idleTime > config.timeoutSeconds * 1000) {
            logWarn(`LLM inactivity timeout after ${config.timeoutSeconds}s`);
            controller.abort(); // Stop the stream
            if (checkInterval) {
                clearInterval(checkInterval);
            }
        }
    }, 1000); // Check every second

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

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
        // Log the error with details
        logError(`LLM streaming failed: ${error.message}`);

        // Create a blocked ticket so a human can review what went wrong
        await createTicket({
            title: `LLM STREAMING FAILURE: ${prompt.substring(0, 50)}`,
            status: 'blocked',
            description: `Error: ${error.message}\n\nOriginal prompt:\n${prompt}`
        });

        // Provide specific error messages based on error type
        if (error.name === 'AbortError') {
            throw new Error(`LLM request timed out after ${config.timeoutSeconds} seconds`);
        } else if (error.code === 'ECONNREFUSED') {
            throw new Error('LLM endpoint unreachable. Check if LM Studio is running.');
        } else {
            throw error;
        }
    } finally {
        if (checkInterval) {
            clearInterval(checkInterval);
        }
        if (startupTimeout) {
            clearTimeout(startupTimeout);
        }
        if (reader) {
            await reader.cancel(); // Close the stream
        }
        llmStatusBar.end();
    }
}
