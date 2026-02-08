/**
 * @file lmStudioClient.ts
 * @module LLM/LMStudio
 * @description LM Studio REST API v1 client with stateful conversations,
 * streaming, tool calling, MCP integration, and model management.
 *
 * **Simple explanation**: Like a phone to call your local AI - this client
 * speaks LM Studio's native language (API v1) for better features than
 * the OpenAI-compatible fallback.
 *
 * @implements MT-034.1-8 (LM Studio Advanced Integration - REST API v1 Foundation)
 * @see Docs/LM-STUDIO-DEVELOPER-DOCS.md
 */

import { logInfo, logError } from '../logger';

// Use logInfo for debug in dev mode, can be silenced via config
const logDebug = (msg: string) => {
    // Only log in debug mode - check process.env or config
    if (process.env.COE_DEBUG === 'true') {
        logInfo(msg);
    }
};

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * LM Studio client configuration
 */
export interface LMStudioConfig {
    /** Base URL for LM Studio server (default: http://127.0.0.1:1234) */
    baseUrl: string;
    /** API key for authentication (default: empty) */
    apiKey?: string;
    /** Request timeout in milliseconds (default: 60000) */
    timeoutMs: number;
    /** Retry count for failed requests (default: 3) */
    retryCount: number;
    /** Retry delay in milliseconds (default: 1000) */
    retryDelayMs: number;
    /** Enable debug logging (default: false) */
    debug?: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_LMSTUDIO_CONFIG: LMStudioConfig = {
    baseUrl: 'http://127.0.0.1:1234',
    apiKey: '',
    timeoutMs: 60000,
    retryCount: 3,
    retryDelayMs: 1000,
    debug: false
};

// ============================================================================
// Request/Response Types (REST API v1)
// ============================================================================

/**
 * Chat message format for API v1
 */
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    name?: string;
    tool_call_id?: string;
}

/**
 * MCP integration configuration
 */
export interface MCPIntegration {
    type: 'ephemeral_mcp' | 'plugin';
    server_label?: string;
    server_url?: string;
    allowed_tools?: string[];
    headers?: Record<string, string>;
}

/**
 * Tool definition for function calling
 */
export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, unknown>;
            required?: string[];
        };
    };
}

/**
 * Reasoning level configuration
 */
export type ReasoningLevel = 'off' | 'low' | 'medium' | 'high' | 'on';

/**
 * Chat request for API v1
 */
export interface ChatRequest {
    /** Model identifier */
    model: string;
    /** Message input (string or message array) */
    input: string | ChatMessage[];
    /** System prompt */
    system_prompt?: string;
    /** MCP integrations */
    integrations?: (MCPIntegration | string)[];
    /** Enable SSE streaming */
    stream?: boolean;
    /** Temperature (0-2) */
    temperature?: number;
    /** Nucleus sampling */
    top_p?: number;
    /** Top-k sampling */
    top_k?: number;
    /** Minimum probability threshold */
    min_p?: number;
    /** Repetition penalty */
    repeat_penalty?: number;
    /** Maximum tokens to generate */
    max_output_tokens?: number;
    /** Reasoning level */
    reasoning?: ReasoningLevel;
    /** Context window size */
    context_length?: number;
    /** Store conversation (default: true) */
    store?: boolean;
    /** Continue from previous response */
    previous_response_id?: string;
    /** Response format (for structured output) */
    response_format?: ResponseFormat;
    /** Tool definitions for function calling */
    tools?: ToolDefinition[];
    /** Tool choice ('auto', 'none', or specific tool) */
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

/**
 * Response format for structured output
 */
export interface ResponseFormat {
    type: 'json_schema' | 'json_object';
    json_schema?: {
        name: string;
        strict?: string | boolean;
        schema: Record<string, unknown>;
    };
}

/**
 * Output item types in API v1 response
 */
export type OutputItem =
    | { type: 'message'; content: string }
    | { type: 'reasoning'; content: string }
    | { type: 'tool_call'; tool: string; arguments: Record<string, unknown>; output: string; provider_info: ProviderInfo }
    | { type: 'invalid_tool_call'; reason: string; metadata: Record<string, unknown> };

/**
 * Provider info for tool calls
 */
export interface ProviderInfo {
    name: string;
    tool_name: string;
}

/**
 * Generation statistics
 */
export interface GenerationStats {
    input_tokens: number;
    total_output_tokens: number;
    reasoning_output_tokens: number;
    tokens_per_second: number;
    time_to_first_token_seconds: number;
    model_load_time_seconds?: number;
}

/**
 * Chat response from API v1
 */
export interface ChatResponse {
    model_instance_id: string;
    output: OutputItem[];
    stats: GenerationStats;
    response_id?: string;
}

/**
 * Model info from /api/v1/models
 */
export interface ModelInfo {
    type: 'llm' | 'embedding';
    publisher: string;
    key: string;
    display_name: string;
    architecture?: string;
    quantization?: { name: string; bits_per_weight: number } | null;
    size_bytes: number;
    params_string?: string;
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
    format: 'gguf' | 'mlx' | null;
    capabilities?: {
        vision: boolean;
        trained_for_tool_use: boolean;
    };
    description?: string;
}

/**
 * Models list response
 */
export interface ModelsResponse {
    models: ModelInfo[];
}

/**
 * Model load configuration
 */
export interface ModelLoadConfig {
    model: string;
    context_length?: number;
    eval_batch_size?: number;
    flash_attention?: boolean;
    num_experts?: number;
    offload_kv_cache_to_gpu?: boolean;
    echo_load_config?: boolean;
}

/**
 * Model load response
 */
export interface ModelLoadResponse {
    instance_id: string;
    config?: ModelLoadConfig;
}

// ============================================================================
// Streaming Types
// ============================================================================

/**
 * SSE event types for streaming
 */
export type StreamEventType =
    | 'chat.start'
    | 'model_load.start' | 'model_load.progress' | 'model_load.end'
    | 'prompt_processing.start' | 'prompt_processing.progress' | 'prompt_processing.end'
    | 'reasoning.start' | 'reasoning.delta' | 'reasoning.end'
    | 'tool_call.start' | 'tool_call.arguments' | 'tool_call.success' | 'tool_call.failure'
    | 'message.start' | 'message.delta' | 'message.end'
    | 'error';

/**
 * Streaming chunk
 */
export interface StreamChunk {
    event: StreamEventType;
    data: {
        content?: string;
        reasoning?: string;
        tool_call?: {
            id: string;
            name: string;
            arguments?: string;
        };
        error?: string;
        progress?: number;
        stats?: Partial<GenerationStats>;
    };
}

/**
 * Stream callback for processing chunks
 */
export type StreamCallback = (chunk: StreamChunk) => void;

// ============================================================================
// Error Types
// ============================================================================

/**
 * LM Studio API error
 */
export class LMStudioError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
        public readonly errorType: string,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = 'LMStudioError';
    }
}

/**
 * Connection error
 */
export class LMStudioConnectionError extends Error {
    constructor(
        message: string,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'LMStudioConnectionError';
    }
}

/**
 * Timeout error
 */
export class LMStudioTimeoutError extends Error {
    constructor(message: string = 'Request timed out') {
        super(message);
        this.name = 'LMStudioTimeoutError';
    }
}

// ============================================================================
// Conversation Tracker (MT-034.2)
// ============================================================================

/**
 * Conversation state for stateful chats
 */
export interface ConversationState {
    id: string;
    responseId?: string;
    model: string;
    messages: ChatMessage[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Stateful conversation tracker
 * 
 * **Simple explanation**: Like a notepad that remembers your chat history
 * with the AI, so you can continue conversations naturally.
 */
export class ConversationTracker {
    private conversations: Map<string, ConversationState> = new Map();

    /**
     * Create a new conversation
     */
    create(model: string, systemPrompt?: string): string {
        const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const messages: ChatMessage[] = [];

        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        this.conversations.set(id, {
            id,
            model,
            messages,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        logDebug(`[ConversationTracker] Created conversation ${id}`);
        return id;
    }

    /**
     * Get a conversation by ID
     */
    get(id: string): ConversationState | undefined {
        return this.conversations.get(id);
    }

    /**
     * Add a message to a conversation
     */
    addMessage(id: string, message: ChatMessage): void {
        const conv = this.conversations.get(id);
        if (!conv) {
            throw new Error(`Conversation ${id} not found`);
        }
        conv.messages.push(message);
        conv.updatedAt = new Date();
    }

    /**
     * Set the response ID for continuing conversations
     */
    setResponseId(id: string, responseId: string): void {
        const conv = this.conversations.get(id);
        if (conv) {
            conv.responseId = responseId;
            conv.updatedAt = new Date();
        }
    }

    /**
     * Get messages for a conversation
     */
    getMessages(id: string): ChatMessage[] {
        return this.conversations.get(id)?.messages ?? [];
    }

    /**
     * Get response ID for continuing a conversation
     */
    getResponseId(id: string): string | undefined {
        return this.conversations.get(id)?.responseId;
    }

    /**
     * Delete a conversation
     */
    delete(id: string): boolean {
        return this.conversations.delete(id);
    }

    /**
     * Clear all conversations
     */
    clear(): void {
        this.conversations.clear();
    }

    /**
     * Get all conversation IDs
     */
    list(): string[] {
        return Array.from(this.conversations.keys());
    }

    /**
     * Get count of active conversations
     */
    count(): number {
        return this.conversations.size;
    }
}

// ============================================================================
// Response Parsers (MT-034.5-6)
// ============================================================================

/**
 * Extract message content from response output
 */
export function extractMessageContent(output: OutputItem[]): string {
    return output
        .filter((item): item is { type: 'message'; content: string } => item.type === 'message')
        .map(item => item.content)
        .join('');
}

/**
 * Extract reasoning content from response output
 */
export function extractReasoningContent(output: OutputItem[]): string {
    return output
        .filter((item): item is { type: 'reasoning'; content: string } => item.type === 'reasoning')
        .map(item => item.content)
        .join('');
}

/**
 * Extract tool calls from response output
 */
export function extractToolCalls(output: OutputItem[]): Array<{
    tool: string;
    arguments: Record<string, unknown>;
    output: string;
}> {
    return output
        .filter((item): item is OutputItem & { type: 'tool_call' } => item.type === 'tool_call')
        .map(item => ({
            tool: item.tool,
            arguments: item.arguments,
            output: item.output
        }));
}

/**
 * Extract invalid tool calls from response output
 */
export function extractInvalidToolCalls(output: OutputItem[]): Array<{
    reason: string;
    metadata: Record<string, unknown>;
}> {
    return output
        .filter((item): item is OutputItem & { type: 'invalid_tool_call' } => item.type === 'invalid_tool_call')
        .map(item => ({
            reason: item.reason,
            metadata: item.metadata
        }));
}

/**
 * Parse a simple response to message text
 */
export function parseResponseToText(response: ChatResponse): string {
    return extractMessageContent(response.output);
}

/**
 * Parse response to structured result
 */
export interface ParsedResponse {
    content: string;
    reasoning: string;
    toolCalls: Array<{ tool: string; arguments: Record<string, unknown>; output: string }>;
    invalidToolCalls: Array<{ reason: string; metadata: Record<string, unknown> }>;
    stats: GenerationStats;
    responseId?: string;
}

export function parseResponse(response: ChatResponse): ParsedResponse {
    return {
        content: extractMessageContent(response.output),
        reasoning: extractReasoningContent(response.output),
        toolCalls: extractToolCalls(response.output),
        invalidToolCalls: extractInvalidToolCalls(response.output),
        stats: response.stats,
        responseId: response.response_id
    };
}

// ============================================================================
// SSE Parser (MT-034.23)
// ============================================================================

/**
 * Parse SSE line to stream chunk
 */
export function parseSSELine(line: string): StreamChunk | null {
    if (!line.startsWith('data: ')) {
        return null;
    }

    try {
        const data = JSON.parse(line.substring(6));
        const eventType = data.event || 'message.delta';

        return {
            event: eventType as StreamEventType,
            data: {
                content: data.content || data.delta?.content,
                reasoning: data.reasoning || data.delta?.reasoning,
                tool_call: data.tool_call,
                error: data.error,
                progress: data.progress,
                stats: data.stats
            }
        };
    } catch {
        return null;
    }
}

/**
 * Parse multiple SSE lines from a chunk
 */
export function parseSSEChunk(chunk: string): StreamChunk[] {
    return chunk
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line !== 'event: ' && !line.startsWith('event:'))
        .map(parseSSELine)
        .filter((c): c is StreamChunk => c !== null);
}

// ============================================================================
// API Version Detection (MT-034.4)
// ============================================================================

/**
 * API version information
 */
export interface APIVersionInfo {
    version: 'v0' | 'v1' | 'openai';
    hasV1: boolean;
    hasV0: boolean;
    hasOpenAI: boolean;
    serverVersion?: string;
}

/**
 * Detect available API versions on the server
 */
export async function detectAPIVersion(baseUrl: string): Promise<APIVersionInfo> {
    const info: APIVersionInfo = {
        version: 'openai',
        hasV1: false,
        hasV0: false,
        hasOpenAI: false
    };

    // Check v1 API
    try {
        const v1Response = await fetch(`${baseUrl}/api/v1/models`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        });
        info.hasV1 = v1Response.ok;
        if (info.hasV1) {
            info.version = 'v1';
        }
    } catch {
        info.hasV1 = false;
    }

    // Check v0 API
    try {
        const v0Response = await fetch(`${baseUrl}/api/v0/models`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        });
        info.hasV0 = v0Response.ok;
    } catch {
        info.hasV0 = false;
    }

    // Check OpenAI-compatible
    try {
        const openaiResponse = await fetch(`${baseUrl}/v1/models`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        });
        info.hasOpenAI = openaiResponse.ok;
        if (!info.hasV1 && info.hasOpenAI) {
            info.version = 'openai';
        }
    } catch {
        info.hasOpenAI = false;
    }

    return info;
}

// ============================================================================
// LM Studio Client (MT-034.1)
// ============================================================================

/**
 * LM Studio REST API v1 Client
 *
 * **Simple explanation**: Your connection to LM Studio's AI server. Like a
 * universal remote for local AI - handles chatting, models, streaming, and more.
 */
export class LMStudioClient {
    private config: LMStudioConfig;
    private conversationTracker: ConversationTracker;
    private apiVersion: APIVersionInfo | null = null;

    constructor(config: Partial<LMStudioConfig> = {}) {
        this.config = { ...DEFAULT_LMSTUDIO_CONFIG, ...config };
        this.conversationTracker = new ConversationTracker();
        logInfo(`[LMStudioClient] Initialized with baseUrl: ${this.config.baseUrl}`);
    }

    // ========================================================================
    // Configuration
    // ========================================================================

    /**
     * Get current configuration
     */
    getConfig(): LMStudioConfig {
        return { ...this.config };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<LMStudioConfig>): void {
        this.config = { ...this.config, ...config };
        this.apiVersion = null; // Reset cached version
    }

    /**
     * Get conversation tracker
     */
    getConversationTracker(): ConversationTracker {
        return this.conversationTracker;
    }

    // ========================================================================
    // API Version (MT-034.4)
    // ========================================================================

    /**
     * Get detected API version (caches result)
     */
    async getAPIVersion(): Promise<APIVersionInfo> {
        if (!this.apiVersion) {
            this.apiVersion = await detectAPIVersion(this.config.baseUrl);
            logInfo(`[LMStudioClient] Detected API version: ${this.apiVersion.version}`);
        }
        return this.apiVersion;
    }

    /**
     * Check if server has v1 API available
     */
    async hasV1API(): Promise<boolean> {
        const version = await this.getAPIVersion();
        return version.hasV1;
    }

    // ========================================================================
    // HTTP Helpers
    // ========================================================================

    /**
     * Build headers for API requests
     */
    private buildHeaders(): Headers {
        const headers = new Headers({
            'Content-Type': 'application/json'
        });
        if (this.config.apiKey) {
            headers.set('Authorization', `Bearer ${this.config.apiKey}`);
        }
        return headers;
    }

    /**
     * Make an HTTP request with retry logic
     */
    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${this.config.baseUrl}${endpoint}`;
        const headers = this.buildHeaders();

        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= this.config.retryCount; attempt++) {
            try {
                if (this.config.debug) {
                    logDebug(`[LMStudioClient] Request: ${options.method || 'GET'} ${url}`);
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(
                    () => controller.abort(),
                    this.config.timeoutMs
                );

                const response = await fetch(url, {
                    ...options,
                    headers,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorBody = await response.text();
                    let errorData: { error?: string; type?: string } = {};
                    try {
                        errorData = JSON.parse(errorBody);
                    } catch {
                        // Not JSON
                    }
                    throw new LMStudioError(
                        errorData.error || `HTTP ${response.status}`,
                        response.status,
                        errorData.type || 'http_error',
                        errorData
                    );
                }

                const data = await response.json();
                return data as T;
            } catch (error) {
                lastError = error as Error;

                if (error instanceof LMStudioError) {
                    // Don't retry 4xx errors
                    if (error.statusCode >= 400 && error.statusCode < 500) {
                        throw error;
                    }
                }

                if ((error as Error).name === 'AbortError') {
                    throw new LMStudioTimeoutError();
                }

                if (attempt < this.config.retryCount) {
                    logDebug(`[LMStudioClient] Retry ${attempt + 1}/${this.config.retryCount}`);
                    await this.delay(this.config.retryDelayMs * (attempt + 1));
                }
            }
        }

        throw new LMStudioConnectionError(
            `Failed after ${this.config.retryCount} retries: ${lastError?.message}`,
            lastError
        );
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ========================================================================
    // Chat API (MT-034.1, MT-034.2)
    // ========================================================================

    /**
     * Send a chat message using API v1
     *
     * **Simple explanation**: Ask the AI a question and get an answer.
     * Like texting with a smart assistant.
     */
    async chat(request: ChatRequest): Promise<ChatResponse> {
        return this.request<ChatResponse>('/api/v1/chat', {
            method: 'POST',
            body: JSON.stringify(request)
        });
    }

    /**
     * Send a chat message and get just the text response
     */
    async chatText(
        model: string,
        input: string | ChatMessage[],
        options: Partial<Omit<ChatRequest, 'model' | 'input'>> = {}
    ): Promise<string> {
        const response = await this.chat({
            model,
            input,
            ...options
        });
        return parseResponseToText(response);
    }

    /**
     * Continue a stateful conversation
     */
    async continueConversation(
        conversationId: string,
        input: string
    ): Promise<ParsedResponse> {
        const conv = this.conversationTracker.get(conversationId);
        if (!conv) {
            throw new Error(`Conversation ${conversationId} not found`);
        }

        // Add user message to tracker
        this.conversationTracker.addMessage(conversationId, {
            role: 'user',
            content: input
        });

        const response = await this.chat({
            model: conv.model,
            input,
            previous_response_id: conv.responseId
        });

        // Store response ID for continuation
        if (response.response_id) {
            this.conversationTracker.setResponseId(conversationId, response.response_id);
        }

        // Add assistant message to tracker
        const parsed = parseResponse(response);
        this.conversationTracker.addMessage(conversationId, {
            role: 'assistant',
            content: parsed.content
        });

        return parsed;
    }

    /**
     * Start a new stateful conversation
     */
    startConversation(model: string, systemPrompt?: string): string {
        return this.conversationTracker.create(model, systemPrompt);
    }

    // ========================================================================
    // Streaming Chat (MT-034.23-24)
    // ========================================================================

    /**
     * Stream a chat response using SSE
     *
     * **Simple explanation**: Get the AI's response piece by piece as it
     * generates, like watching someone type in real-time.
     */
    async *streamChat(request: ChatRequest): AsyncGenerator<StreamChunk, void, unknown> {
        const url = `${this.config.baseUrl}/api/v1/chat`;
        const headers = this.buildHeaders();

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...request, stream: true })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new LMStudioError(
                `HTTP ${response.status}: ${errorBody}`,
                response.status,
                'http_error'
            );
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new LMStudioError('No response body', 500, 'no_body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const chunks = parseSSEChunk(line);
                    for (const chunk of chunks) {
                        yield chunk;
                    }
                }
            }

            // Process remaining buffer
            if (buffer) {
                const chunks = parseSSEChunk(buffer);
                for (const chunk of chunks) {
                    yield chunk;
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Stream chat with callback instead of generator
     */
    async streamChatWithCallback(
        request: ChatRequest,
        callback: StreamCallback
    ): Promise<ParsedResponse> {
        let content = '';
        let reasoning = '';
        const toolCalls: Array<{ tool: string; arguments: Record<string, unknown>; output: string }> = [];
        let stats: GenerationStats | undefined;
        let responseId: string | undefined;

        for await (const chunk of this.streamChat(request)) {
            callback(chunk);

            if (chunk.data.content) {
                content += chunk.data.content;
            }
            if (chunk.data.reasoning) {
                reasoning += chunk.data.reasoning;
            }
            if (chunk.data.stats) {
                stats = chunk.data.stats as GenerationStats;
            }
        }

        return {
            content,
            reasoning,
            toolCalls,
            invalidToolCalls: [],
            stats: stats || {
                input_tokens: 0,
                total_output_tokens: 0,
                reasoning_output_tokens: 0,
                tokens_per_second: 0,
                time_to_first_token_seconds: 0
            },
            responseId
        };
    }

    // ========================================================================
    // Model Management (MT-034.25-26)
    // ========================================================================

    /**
     * List available models
     */
    async listModels(): Promise<ModelInfo[]> {
        const response = await this.request<ModelsResponse>('/api/v1/models');
        return response.models;
    }

    /**
     * Get loaded models only
     */
    async getLoadedModels(): Promise<ModelInfo[]> {
        const models = await this.listModels();
        return models.filter(m => m.loaded_instances.length > 0);
    }

    /**
     * Load a model
     */
    async loadModel(config: ModelLoadConfig): Promise<ModelLoadResponse> {
        return this.request<ModelLoadResponse>('/api/v1/models/load', {
            method: 'POST',
            body: JSON.stringify(config)
        });
    }

    /**
     * Unload a model
     */
    async unloadModel(instanceId: string): Promise<void> {
        await this.request('/api/v1/models/unload', {
            method: 'POST',
            body: JSON.stringify({ instance_id: instanceId })
        });
    }

    /**
     * Check if a specific model is loaded
     */
    async isModelLoaded(modelKey: string): Promise<boolean> {
        const models = await this.getLoadedModels();
        return models.some(m => m.key === modelKey);
    }

    /**
     * Get model info by key
     */
    async getModel(modelKey: string): Promise<ModelInfo | undefined> {
        const models = await this.listModels();
        return models.find(m => m.key === modelKey);
    }

    // ========================================================================
    // Tool Calling (MT-034.11-14)
    // ========================================================================

    /**
     * Chat with tool definitions
     */
    async chatWithTools(
        model: string,
        input: string | ChatMessage[],
        tools: ToolDefinition[],
        options: Partial<Omit<ChatRequest, 'model' | 'input' | 'tools'>> = {}
    ): Promise<ParsedResponse> {
        const response = await this.chat({
            model,
            input,
            tools,
            tool_choice: 'auto',
            ...options
        });
        return parseResponse(response);
    }

    /**
     * Execute a tool call and continue the conversation
     */
    async executeToolAndContinue(
        model: string,
        messages: ChatMessage[],
        toolCall: { tool: string; arguments: Record<string, unknown> },
        toolResult: string,
        tools: ToolDefinition[]
    ): Promise<ParsedResponse> {
        // Add tool result message
        const newMessages: ChatMessage[] = [
            ...messages,
            {
                role: 'tool',
                content: toolResult,
                name: toolCall.tool,
                tool_call_id: `call_${Date.now()}`
            }
        ];

        return this.chatWithTools(model, newMessages, tools);
    }

    // ========================================================================
    // Structured Output (MT-034.9-10)
    // ========================================================================

    /**
     * Chat with JSON schema output
     */
    async chatWithSchema<T>(
        model: string,
        input: string | ChatMessage[],
        schema: { name: string; schema: Record<string, unknown> },
        options: Partial<Omit<ChatRequest, 'model' | 'input' | 'response_format'>> = {}
    ): Promise<T> {
        const response = await this.chat({
            model,
            input,
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: schema.name,
                    strict: true,
                    schema: schema.schema
                }
            },
            ...options
        });

        const content = parseResponseToText(response);
        return JSON.parse(content) as T;
    }

    // ========================================================================
    // Health & Connection
    // ========================================================================

    /**
     * Check if the server is reachable
     */
    async isServerReachable(): Promise<boolean> {
        try {
            await this.listModels();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get server health status
     */
    async getHealth(): Promise<{
        reachable: boolean;
        apiVersion: APIVersionInfo;
        loadedModels: number;
    }> {
        const reachable = await this.isServerReachable();
        const apiVersion = await this.getAPIVersion();
        let loadedModels = 0;

        if (reachable) {
            try {
                const models = await this.getLoadedModels();
                loadedModels = models.length;
            } catch {
                // Ignore
            }
        }

        return { reachable, apiVersion, loadedModels };
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: LMStudioClient | null = null;

/**
 * Initialize the LM Studio client singleton
 */
export function initializeLMStudioClient(config: Partial<LMStudioConfig> = {}): LMStudioClient {
    if (instance !== null) {
        throw new Error('LMStudioClient already initialized');
    }
    instance = new LMStudioClient(config);
    return instance;
}

/**
 * Get the LM Studio client instance
 */
export function getLMStudioClient(): LMStudioClient {
    if (!instance) {
        throw new Error('LMStudioClient not initialized. Call initializeLMStudioClient first.');
    }
    return instance;
}

/**
 * Reset the LM Studio client (for testing)
 */
export function resetLMStudioClientForTests(): void {
    instance = null;
}
