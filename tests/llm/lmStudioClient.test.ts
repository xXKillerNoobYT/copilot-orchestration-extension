/**
 * @file tests/llm/lmStudioClient.test.ts
 * @description Comprehensive tests for LM Studio REST API v1 client
 * @implements MT-034.8 (API v1 tests)
 */

import {
    LMStudioClient,
    ConversationTracker,
    initializeLMStudioClient,
    getLMStudioClient,
    resetLMStudioClientForTests,
    LMStudioError,
    LMStudioConnectionError,
    LMStudioTimeoutError,
    extractMessageContent,
    extractReasoningContent,
    extractToolCalls,
    extractInvalidToolCalls,
    parseResponse,
    parseResponseToText,
    parseSSELine,
    parseSSEChunk,
    detectAPIVersion,
    DEFAULT_LMSTUDIO_CONFIG,
    type OutputItem,
    type ChatResponse,
    type LMStudioConfig
} from '../../src/llm/lmStudioClient';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
    logDebug: jest.fn()
}));

describe('LM Studio Client', () => {
    let client: LMStudioClient;

    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
        resetLMStudioClientForTests();
        client = new LMStudioClient();
    });

    afterEach(() => {
        resetLMStudioClientForTests();
    });

    // ========================================================================
    // Configuration Tests
    // ========================================================================

    describe('Configuration', () => {
        it('Test 1: should use default configuration', () => {
            const config = client.getConfig();
            expect(config.baseUrl).toBe(DEFAULT_LMSTUDIO_CONFIG.baseUrl);
            expect(config.timeoutMs).toBe(DEFAULT_LMSTUDIO_CONFIG.timeoutMs);
            expect(config.retryCount).toBe(DEFAULT_LMSTUDIO_CONFIG.retryCount);
        });

        it('Test 2: should accept custom configuration', () => {
            const customClient = new LMStudioClient({
                baseUrl: 'http://custom:8080',
                timeoutMs: 30000,
                apiKey: 'test-key'
            });
            const config = customClient.getConfig();
            expect(config.baseUrl).toBe('http://custom:8080');
            expect(config.timeoutMs).toBe(30000);
            expect(config.apiKey).toBe('test-key');
        });

        it('Test 3: should update configuration', () => {
            client.updateConfig({ timeoutMs: 120000 });
            expect(client.getConfig().timeoutMs).toBe(120000);
        });

        it('Test 4: should merge custom config with defaults', () => {
            const customClient = new LMStudioClient({ timeoutMs: 5000 });
            const config = customClient.getConfig();
            expect(config.timeoutMs).toBe(5000);
            expect(config.baseUrl).toBe(DEFAULT_LMSTUDIO_CONFIG.baseUrl);
        });

        it('Test 5: should have default retryDelayMs', () => {
            expect(client.getConfig().retryDelayMs).toBe(1000);
        });
    });

    // ========================================================================
    // Singleton Tests
    // ========================================================================

    describe('Singleton', () => {
        it('Test 6: should initialize singleton', () => {
            const instance = initializeLMStudioClient({ baseUrl: 'http://test:1234' });
            expect(instance).toBeInstanceOf(LMStudioClient);
        });

        it('Test 7: should get initialized singleton', () => {
            initializeLMStudioClient();
            const instance = getLMStudioClient();
            expect(instance).toBeInstanceOf(LMStudioClient);
        });

        it('Test 8: should throw if not initialized', () => {
            expect(() => getLMStudioClient()).toThrow('LMStudioClient not initialized');
        });

        it('Test 9: should throw if already initialized', () => {
            initializeLMStudioClient();
            expect(() => initializeLMStudioClient()).toThrow('LMStudioClient already initialized');
        });

        it('Test 10: should reset for tests', () => {
            initializeLMStudioClient();
            resetLMStudioClientForTests();
            expect(() => getLMStudioClient()).toThrow('not initialized');
        });
    });

    // ========================================================================
    // Error Types Tests
    // ========================================================================

    describe('Error Types', () => {
        it('Test 11: should create LMStudioError', () => {
            const error = new LMStudioError('Test error', 400, 'bad_request', { info: 'test' });
            expect(error.message).toBe('Test error');
            expect(error.statusCode).toBe(400);
            expect(error.errorType).toBe('bad_request');
            expect(error.details).toEqual({ info: 'test' });
            expect(error.name).toBe('LMStudioError');
        });

        it('Test 12: should create LMStudioConnectionError', () => {
            const cause = new Error('Network failure');
            const error = new LMStudioConnectionError('Connection failed', cause);
            expect(error.message).toBe('Connection failed');
            expect(error.cause).toBe(cause);
            expect(error.name).toBe('LMStudioConnectionError');
        });

        it('Test 13: should create LMStudioTimeoutError', () => {
            const error = new LMStudioTimeoutError();
            expect(error.message).toBe('Request timed out');
            expect(error.name).toBe('LMStudioTimeoutError');
        });

        it('Test 14: should create LMStudioTimeoutError with custom message', () => {
            const error = new LMStudioTimeoutError('Custom timeout');
            expect(error.message).toBe('Custom timeout');
        });
    });

    // ========================================================================
    // ConversationTracker Tests (MT-034.2)
    // ========================================================================

    describe('ConversationTracker', () => {
        let tracker: ConversationTracker;

        beforeEach(() => {
            tracker = new ConversationTracker();
        });

        it('Test 15: should create new conversation', () => {
            const id = tracker.create('test-model');
            expect(id).toMatch(/^conv_\d+_[a-z0-9]+$/);
        });

        it('Test 16: should create conversation with system prompt', () => {
            const id = tracker.create('test-model', 'You are a helpful assistant');
            const conv = tracker.get(id);
            expect(conv?.messages[0]).toEqual({
                role: 'system',
                content: 'You are a helpful assistant'
            });
        });

        it('Test 17: should get conversation by ID', () => {
            const id = tracker.create('test-model');
            const conv = tracker.get(id);
            expect(conv).toBeDefined();
            expect(conv?.model).toBe('test-model');
        });

        it('Test 18: should return undefined for non-existent conversation', () => {
            expect(tracker.get('non-existent')).toBeUndefined();
        });

        it('Test 19: should add message to conversation', () => {
            const id = tracker.create('test-model');
            tracker.addMessage(id, { role: 'user', content: 'Hello' });
            const messages = tracker.getMessages(id);
            expect(messages).toHaveLength(1);
            expect(messages[0].content).toBe('Hello');
        });

        it('Test 20: should throw when adding message to non-existent conversation', () => {
            expect(() => tracker.addMessage('non-existent', { role: 'user', content: 'Hi' }))
                .toThrow('Conversation non-existent not found');
        });

        it('Test 21: should set and get response ID', () => {
            const id = tracker.create('test-model');
            tracker.setResponseId(id, 'resp_abc123');
            expect(tracker.getResponseId(id)).toBe('resp_abc123');
        });

        it('Test 22: should return undefined for non-existent response ID', () => {
            expect(tracker.getResponseId('non-existent')).toBeUndefined();
        });

        it('Test 23: should delete conversation', () => {
            const id = tracker.create('test-model');
            expect(tracker.delete(id)).toBe(true);
            expect(tracker.get(id)).toBeUndefined();
        });

        it('Test 24: should return false when deleting non-existent conversation', () => {
            expect(tracker.delete('non-existent')).toBe(false);
        });

        it('Test 25: should clear all conversations', () => {
            tracker.create('model-1');
            tracker.create('model-2');
            tracker.clear();
            expect(tracker.count()).toBe(0);
        });

        it('Test 26: should list all conversation IDs', () => {
            const id1 = tracker.create('model-1');
            const id2 = tracker.create('model-2');
            const list = tracker.list();
            expect(list).toContain(id1);
            expect(list).toContain(id2);
        });

        it('Test 27: should count conversations', () => {
            tracker.create('model-1');
            tracker.create('model-2');
            expect(tracker.count()).toBe(2);
        });

        it('Test 28: should update timestamps on message add', () => {
            const id = tracker.create('test-model');
            const conv1 = tracker.get(id);
            const created = conv1?.createdAt;

            // Add message updates timestamp
            tracker.addMessage(id, { role: 'user', content: 'Hi' });

            const conv2 = tracker.get(id);
            expect(conv2?.updatedAt).toBeDefined();
            expect(conv2?.createdAt).toEqual(created);
        });
    });

    // ========================================================================
    // Response Parser Tests (MT-034.5-6)
    // ========================================================================

    describe('Response Parsers', () => {
        const mockOutput: OutputItem[] = [
            { type: 'reasoning', content: 'Let me think...' },
            { type: 'message', content: 'Hello ' },
            { type: 'message', content: 'world!' },
            {
                type: 'tool_call',
                tool: 'search',
                arguments: { query: 'test' },
                output: '{"result": "found"}',
                provider_info: { name: 'mcp', tool_name: 'search' }
            },
            {
                type: 'invalid_tool_call',
                reason: 'Tool not found',
                metadata: { attemptedTool: 'unknown' }
            }
        ];

        it('Test 29: should extract message content', () => {
            const content = extractMessageContent(mockOutput);
            expect(content).toBe('Hello world!');
        });

        it('Test 30: should extract reasoning content', () => {
            const reasoning = extractReasoningContent(mockOutput);
            expect(reasoning).toBe('Let me think...');
        });

        it('Test 31: should extract tool calls', () => {
            const toolCalls = extractToolCalls(mockOutput);
            expect(toolCalls).toHaveLength(1);
            expect(toolCalls[0].tool).toBe('search');
            expect(toolCalls[0].arguments).toEqual({ query: 'test' });
        });

        it('Test 32: should extract invalid tool calls', () => {
            const invalid = extractInvalidToolCalls(mockOutput);
            expect(invalid).toHaveLength(1);
            expect(invalid[0].reason).toBe('Tool not found');
        });

        it('Test 33: should return empty string for no messages', () => {
            expect(extractMessageContent([])).toBe('');
        });

        it('Test 34: should return empty string for no reasoning', () => {
            expect(extractReasoningContent([])).toBe('');
        });

        it('Test 35: should return empty array for no tool calls', () => {
            expect(extractToolCalls([])).toEqual([]);
        });

        it('Test 36: should parse response to text', () => {
            const response: ChatResponse = {
                model_instance_id: 'test',
                output: mockOutput,
                stats: {
                    input_tokens: 10,
                    total_output_tokens: 20,
                    reasoning_output_tokens: 5,
                    tokens_per_second: 50,
                    time_to_first_token_seconds: 0.1
                },
                response_id: 'resp_123'
            };
            expect(parseResponseToText(response)).toBe('Hello world!');
        });

        it('Test 37: should parse complete response', () => {
            const response: ChatResponse = {
                model_instance_id: 'test',
                output: mockOutput,
                stats: {
                    input_tokens: 10,
                    total_output_tokens: 20,
                    reasoning_output_tokens: 5,
                    tokens_per_second: 50,
                    time_to_first_token_seconds: 0.1
                },
                response_id: 'resp_123'
            };

            const parsed = parseResponse(response);
            expect(parsed.content).toBe('Hello world!');
            expect(parsed.reasoning).toBe('Let me think...');
            expect(parsed.toolCalls).toHaveLength(1);
            expect(parsed.invalidToolCalls).toHaveLength(1);
            expect(parsed.responseId).toBe('resp_123');
            expect(parsed.stats.input_tokens).toBe(10);
        });
    });

    // ========================================================================
    // SSE Parser Tests (MT-034.23)
    // ========================================================================

    describe('SSE Parser', () => {
        it('Test 38: should parse SSE line with content', () => {
            const line = 'data: {"content": "Hello", "event": "message.delta"}';
            const chunk = parseSSELine(line);
            expect(chunk).toBeDefined();
            expect(chunk?.data.content).toBe('Hello');
        });

        it('Test 39: should return null for non-data lines', () => {
            expect(parseSSELine('event: message.delta')).toBeNull();
            expect(parseSSELine('')).toBeNull();
            expect(parseSSELine('comment')).toBeNull();
        });

        it('Test 40: should handle invalid JSON gracefully', () => {
            expect(parseSSELine('data: {invalid}')).toBeNull();
        });

        it('Test 41: should parse delta content', () => {
            const line = 'data: {"delta": {"content": "text"}}';
            const chunk = parseSSELine(line);
            expect(chunk?.data.content).toBe('text');
        });

        it('Test 42: should parse reasoning content', () => {
            const line = 'data: {"reasoning": "thinking..."}';
            const chunk = parseSSELine(line);
            expect(chunk?.data.reasoning).toBe('thinking...');
        });

        it('Test 43: should parse multiple lines in chunk', () => {
            const chunk = 'data: {"content": "A"}\ndata: {"content": "B"}\n';
            const parsed = parseSSEChunk(chunk);
            expect(parsed).toHaveLength(2);
            expect(parsed[0].data.content).toBe('A');
            expect(parsed[1].data.content).toBe('B');
        });

        it('Test 44: should filter empty lines', () => {
            const chunk = 'data: {"content": "Test"}\n\n\n';
            const parsed = parseSSEChunk(chunk);
            expect(parsed).toHaveLength(1);
        });

        it('Test 45: should handle tool_call events', () => {
            const line = 'data: {"tool_call": {"id": "1", "name": "search"}}';
            const chunk = parseSSELine(line);
            expect(chunk?.data.tool_call?.name).toBe('search');
        });

        it('Test 46: should handle error events', () => {
            const line = 'data: {"error": "Something went wrong"}';
            const chunk = parseSSELine(line);
            expect(chunk?.data.error).toBe('Something went wrong');
        });

        it('Test 47: should handle progress events', () => {
            const line = 'data: {"progress": 0.5}';
            const chunk = parseSSELine(line);
            expect(chunk?.data.progress).toBe(0.5);
        });
    });

    // ========================================================================
    // API Version Detection Tests (MT-034.4)
    // ========================================================================

    describe('API Version Detection', () => {
        it('Test 48: should detect v1 API when available', async () => {
            mockFetch.mockImplementation((url: string) => {
                if (url.includes('/api/v1/models')) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [] }) });
                }
                return Promise.resolve({ ok: false });
            });

            const version = await detectAPIVersion('http://localhost:1234');
            expect(version.hasV1).toBe(true);
            expect(version.version).toBe('v1');
        });

        it('Test 49: should detect OpenAI-compatible when v1 unavailable', async () => {
            // Reset mock completely for this test
            mockFetch.mockReset();

            // Use sequential mock returns to match the exact order of calls in detectAPIVersion:
            // 1. /api/v1/models - should reject (v1 unavailable)
            // 2. /api/v0/models - should return not ok (v0 unavailable)
            // 3. /v1/models - should return ok (OpenAI available)
            mockFetch
                .mockRejectedValueOnce(new Error('Not found'))  // v1 call
                .mockResolvedValueOnce({ ok: false })           // v0 call
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) }); // OpenAI call

            const version = await detectAPIVersion('http://localhost:1234');
            expect(version.hasV1).toBe(false);
            expect(version.hasOpenAI).toBe(true);
            expect(version.version).toBe('openai');
        });

        it('Test 50: should handle connection errors', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            const version = await detectAPIVersion('http://localhost:1234');
            expect(version.hasV1).toBe(false);
            expect(version.hasV0).toBe(false);
            expect(version.hasOpenAI).toBe(false);
        });

        it('Test 51: should detect v0 API', async () => {
            mockFetch.mockImplementation((url: string) => {
                if (url.includes('/api/v0/models')) {
                    return Promise.resolve({ ok: true });
                }
                return Promise.resolve({ ok: false });
            });

            const version = await detectAPIVersion('http://localhost:1234');
            expect(version.hasV0).toBe(true);
        });
    });

    // ========================================================================
    // Chat API Tests (MT-034.1)
    // ========================================================================

    describe('Chat API', () => {
        const mockChatResponse: ChatResponse = {
            model_instance_id: 'test-model-instance',
            output: [{ type: 'message', content: 'Hello!' }],
            stats: {
                input_tokens: 5,
                total_output_tokens: 2,
                reasoning_output_tokens: 0,
                tokens_per_second: 100,
                time_to_first_token_seconds: 0.05
            },
            response_id: 'resp_test'
        };

        it('Test 52: should send chat request', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockChatResponse)
            });

            const response = await client.chat({
                model: 'test-model',
                input: 'Hello'
            });

            expect(mockFetch).toHaveBeenCalledWith(
                'http://127.0.0.1:1234/api/v1/chat',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('"model":"test-model"')
                })
            );
            expect(response.output[0]).toEqual({ type: 'message', content: 'Hello!' });
        });

        it('Test 53: should send chat with messages array', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockChatResponse)
            });

            await client.chat({
                model: 'test-model',
                input: [
                    { role: 'system', content: 'You are helpful' },
                    { role: 'user', content: 'Hi' }
                ]
            });

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining('"role":"system"')
                })
            );
        });

        it('Test 54: should get text response with chatText', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockChatResponse)
            });

            const text = await client.chatText('test-model', 'Hello');
            expect(text).toBe('Hello!');
        });

        it('Test 55: should include API key in headers', async () => {
            const authClient = new LMStudioClient({ apiKey: 'secret-key' });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockChatResponse)
            });

            await authClient.chat({ model: 'test', input: 'Hi' });

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.any(Headers)
                })
            );
        });

        it('Test 56: should handle HTTP errors', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: () => Promise.resolve('{"error": "Bad request", "type": "validation_error"}')
            });

            await expect(client.chat({ model: 'test', input: 'Hi' }))
                .rejects.toThrow(LMStudioError);
        });

        it('Test 57: should retry on 5xx errors', async () => {
            const limitedClient = new LMStudioClient({ retryCount: 1, retryDelayMs: 10 });

            mockFetch
                .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('{}') })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockChatResponse) });

            const response = await limitedClient.chat({ model: 'test', input: 'Hi' });
            expect(response).toBeDefined();
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('Test 58: should not retry 4xx errors', async () => {
            const limitedClient = new LMStudioClient({ retryCount: 3, retryDelayMs: 10 });

            mockFetch.mockResolvedValue({
                ok: false,
                status: 400,
                text: () => Promise.resolve('{}')
            });

            await expect(limitedClient.chat({ model: 'test', input: 'Hi' }))
                .rejects.toThrow(LMStudioError);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('Test 59: should send chat with temperature', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockChatResponse)
            });

            await client.chat({
                model: 'test-model',
                input: 'Hello',
                temperature: 0.7
            });

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining('"temperature":0.7')
                })
            );
        });

        it('Test 60: should send chat with max_output_tokens', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockChatResponse)
            });

            await client.chat({
                model: 'test-model',
                input: 'Hello',
                max_output_tokens: 100
            });

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining('"max_output_tokens":100')
                })
            );
        });
    });

    // ========================================================================
    // Stateful Conversation Tests (MT-034.2)
    // ========================================================================

    describe('Stateful Conversations', () => {
        const mockChatResponse: ChatResponse = {
            model_instance_id: 'test-instance',
            output: [{ type: 'message', content: 'I remember!' }],
            stats: {
                input_tokens: 10,
                total_output_tokens: 5,
                reasoning_output_tokens: 0,
                tokens_per_second: 50,
                time_to_first_token_seconds: 0.1
            },
            response_id: 'resp_abc123'
        };

        it('Test 61: should start new conversation', () => {
            const convId = client.startConversation('test-model', 'System prompt');
            expect(convId).toMatch(/^conv_/);

            const tracker = client.getConversationTracker();
            const conv = tracker.get(convId);
            expect(conv?.model).toBe('test-model');
            expect(conv?.messages[0].content).toBe('System prompt');
        });

        it('Test 62: should continue conversation with response ID', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockChatResponse)
            });

            const convId = client.startConversation('test-model');
            await client.continueConversation(convId, 'First message');

            const tracker = client.getConversationTracker();
            expect(tracker.getResponseId(convId)).toBe('resp_abc123');
        });

        it('Test 63: should add messages to conversation', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockChatResponse)
            });

            const convId = client.startConversation('test-model');
            await client.continueConversation(convId, 'User message');

            const tracker = client.getConversationTracker();
            const messages = tracker.getMessages(convId);

            // Should have user message and assistant message
            expect(messages).toHaveLength(2);
            expect(messages[0].role).toBe('user');
            expect(messages[1].role).toBe('assistant');
        });

        it('Test 64: should throw for non-existent conversation', async () => {
            await expect(client.continueConversation('invalid', 'Hi'))
                .rejects.toThrow('Conversation invalid not found');
        });

        it('Test 65: should use previous_response_id for continuation', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockChatResponse)
            });

            const convId = client.startConversation('test-model');

            // First message
            await client.continueConversation(convId, 'Message 1');

            // Second message should include previous_response_id
            await client.continueConversation(convId, 'Message 2');

            const calls = mockFetch.mock.calls;
            const lastCall = calls[calls.length - 1];
            const body = JSON.parse(lastCall[1].body as string);
            expect(body.previous_response_id).toBe('resp_abc123');
        });
    });

    // ========================================================================
    // Model Management Tests (MT-034.25-26)
    // ========================================================================

    describe('Model Management', () => {
        const mockModelsResponse = {
            models: [
                {
                    type: 'llm',
                    publisher: 'lmstudio-community',
                    key: 'qwen2.5-7b-instruct',
                    display_name: 'Qwen 2.5 7B Instruct',
                    architecture: 'qwen2',
                    size_bytes: 7000000000,
                    params_string: '7B',
                    loaded_instances: [{ id: 'inst1', config: { context_length: 8192 } }],
                    max_context_length: 32768,
                    format: 'gguf',
                    capabilities: { vision: false, trained_for_tool_use: true }
                },
                {
                    type: 'llm',
                    publisher: 'meta',
                    key: 'llama-3.1-8b',
                    display_name: 'Llama 3.1 8B',
                    size_bytes: 8000000000,
                    loaded_instances: [],
                    max_context_length: 128000,
                    format: 'gguf'
                }
            ]
        };

        it('Test 66: should list all models', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockModelsResponse)
            });

            const models = await client.listModels();
            expect(models).toHaveLength(2);
            expect(models[0].key).toBe('qwen2.5-7b-instruct');
        });

        it('Test 67: should get loaded models only', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockModelsResponse)
            });

            const loaded = await client.getLoadedModels();
            expect(loaded).toHaveLength(1);
            expect(loaded[0].key).toBe('qwen2.5-7b-instruct');
        });

        it('Test 68: should check if model is loaded', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockModelsResponse)
            });

            expect(await client.isModelLoaded('qwen2.5-7b-instruct')).toBe(true);
            expect(await client.isModelLoaded('llama-3.1-8b')).toBe(false);
        });

        it('Test 69: should get model by key', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockModelsResponse)
            });

            const model = await client.getModel('qwen2.5-7b-instruct');
            expect(model?.display_name).toBe('Qwen 2.5 7B Instruct');
        });

        it('Test 70: should return undefined for non-existent model', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockModelsResponse)
            });

            const model = await client.getModel('non-existent');
            expect(model).toBeUndefined();
        });

        it('Test 71: should load model', async () => {
            const loadResponse = { instance_id: 'new-instance', config: { context_length: 16384 } };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(loadResponse)
            });

            const result = await client.loadModel({
                model: 'llama-3.1-8b',
                context_length: 16384,
                flash_attention: true
            });

            expect(result.instance_id).toBe('new-instance');
            expect(mockFetch).toHaveBeenCalledWith(
                'http://127.0.0.1:1234/api/v1/models/load',
                expect.objectContaining({ method: 'POST' })
            );
        });

        it('Test 72: should unload model', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({})
            });

            await client.unloadModel('qwen-instance');

            expect(mockFetch).toHaveBeenCalledWith(
                'http://127.0.0.1:1234/api/v1/models/unload',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('qwen-instance')
                })
            );
        });
    });

    // ========================================================================
    // Tool Calling Tests (MT-034.11-14)
    // ========================================================================

    describe('Tool Calling', () => {
        const mockToolResponse: ChatResponse = {
            model_instance_id: 'test',
            output: [
                {
                    type: 'tool_call',
                    tool: 'search',
                    arguments: { query: 'test' },
                    output: '{"results": []}',
                    provider_info: { name: 'internal', tool_name: 'search' }
                }
            ],
            stats: {
                input_tokens: 20,
                total_output_tokens: 15,
                reasoning_output_tokens: 0,
                tokens_per_second: 50,
                time_to_first_token_seconds: 0.2
            }
        };

        const searchTool = {
            type: 'function' as const,
            function: {
                name: 'search',
                description: 'Search for items',
                parameters: {
                    type: 'object' as const,
                    properties: {
                        query: { type: 'string' }
                    },
                    required: ['query']
                }
            }
        };

        it('Test 73: should chat with tools', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockToolResponse)
            });

            const response = await client.chatWithTools(
                'test-model',
                'Search for cats',
                [searchTool]
            );

            expect(response.toolCalls).toHaveLength(1);
            expect(response.toolCalls[0].tool).toBe('search');
        });

        it('Test 74: should include tool_choice auto by default', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockToolResponse)
            });

            await client.chatWithTools('test-model', 'Hi', [searchTool]);

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining('"tool_choice":"auto"')
                })
            );
        });

        it('Test 75: should execute tool and continue', async () => {
            const continueResponse: ChatResponse = {
                model_instance_id: 'test',
                output: [{ type: 'message', content: 'Found results!' }],
                stats: {
                    input_tokens: 30,
                    total_output_tokens: 5,
                    reasoning_output_tokens: 0,
                    tokens_per_second: 50,
                    time_to_first_token_seconds: 0.1
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(continueResponse)
            });

            const response = await client.executeToolAndContinue(
                'test-model',
                [{ role: 'user', content: 'Search for cats' }],
                { tool: 'search', arguments: { query: 'cats' } },
                '{"results": ["cat1", "cat2"]}',
                [searchTool]
            );

            expect(response.content).toBe('Found results!');
        });
    });

    // ========================================================================
    // Structured Output Tests (MT-034.9-10)
    // ========================================================================

    describe('Structured Output', () => {
        it('Test 76: should chat with JSON schema', async () => {
            const schemaResponse: ChatResponse = {
                model_instance_id: 'test',
                output: [{ type: 'message', content: '{"name": "John", "age": 30}' }],
                stats: {
                    input_tokens: 15,
                    total_output_tokens: 10,
                    reasoning_output_tokens: 0,
                    tokens_per_second: 50,
                    time_to_first_token_seconds: 0.1
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(schemaResponse)
            });

            const result = await client.chatWithSchema<{ name: string; age: number }>(
                'test-model',
                'Create a person',
                {
                    name: 'person',
                    schema: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            age: { type: 'number' }
                        },
                        required: ['name', 'age']
                    }
                }
            );

            expect(result.name).toBe('John');
            expect(result.age).toBe(30);
        });

        it('Test 77: should include response_format in request', async () => {
            const schemaResponse: ChatResponse = {
                model_instance_id: 'test',
                output: [{ type: 'message', content: '{}' }],
                stats: {
                    input_tokens: 5,
                    total_output_tokens: 2,
                    reasoning_output_tokens: 0,
                    tokens_per_second: 50,
                    time_to_first_token_seconds: 0.1
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(schemaResponse)
            });

            await client.chatWithSchema(
                'test-model',
                'Generate',
                { name: 'test', schema: { type: 'object' } }
            );

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining('"response_format"')
                })
            );
        });
    });

    // ========================================================================
    // Health Check Tests
    // ========================================================================

    describe('Health Checks', () => {
        it('Test 78: should check server reachability', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ models: [] })
            });

            expect(await client.isServerReachable()).toBe(true);
        });

        it('Test 79: should return false when server unreachable', async () => {
            // Set up mock to reject BEFORE creating client and calling method
            mockFetch.mockReset();
            mockFetch.mockRejectedValue(new Error('Connection refused'));

            // Create client with minimal retries/timeout for fast failure
            const testClient = new LMStudioClient({ retryCount: 0, timeoutMs: 100 });

            const result = await testClient.isServerReachable();
            expect(result).toBe(false);
        });

        it('Test 80: should get health status', async () => {
            // For hasV1API check
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ models: [{ key: 'test', loaded_instances: [{}] }] })
                })
                // For version detection
                .mockResolvedValueOnce({ ok: true }) // v1
                .mockResolvedValueOnce({ ok: false }) // v0
                .mockResolvedValueOnce({ ok: true }) // openai
                // For loaded models
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ models: [{ key: 'test', loaded_instances: [{}] }] })
                });

            const health = await client.getHealth();
            expect(health.reachable).toBe(true);
            expect(health.apiVersion).toBeDefined();
        });

        it('Test 81: should cache API version', async () => {
            mockFetch
                .mockResolvedValueOnce({ ok: true })
                .mockResolvedValueOnce({ ok: false })
                .mockResolvedValueOnce({ ok: true });

            // First call detects version
            await client.getAPIVersion();
            // Second call should use cached value
            const version = await client.getAPIVersion();

            expect(version.hasV1).toBe(true);
            // Should only have made 3 fetch calls total (for v1, v0, openai detection)
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });

        it('Test 82: should reset cached version on config update', async () => {
            mockFetch.mockResolvedValue({ ok: true });

            await client.getAPIVersion();
            client.updateConfig({ baseUrl: 'http://new:1234' });

            // Should have reset cache
            await client.getAPIVersion();
            expect(mockFetch.mock.calls.length).toBeGreaterThan(3);
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('Edge Cases', () => {
        it('Test 83: should handle empty output array', () => {
            const response: ChatResponse = {
                model_instance_id: 'test',
                output: [],
                stats: {
                    input_tokens: 0,
                    total_output_tokens: 0,
                    reasoning_output_tokens: 0,
                    tokens_per_second: 0,
                    time_to_first_token_seconds: 0
                }
            };

            const parsed = parseResponse(response);
            expect(parsed.content).toBe('');
            expect(parsed.reasoning).toBe('');
            expect(parsed.toolCalls).toEqual([]);
        });

        it('Test 84: should handle multiple message chunks', () => {
            const output: OutputItem[] = [
                { type: 'message', content: 'Part 1. ' },
                { type: 'message', content: 'Part 2. ' },
                { type: 'message', content: 'Part 3.' }
            ];
            expect(extractMessageContent(output)).toBe('Part 1. Part 2. Part 3.');
        });

        it('Test 85: should handle mixed output types', () => {
            const output: OutputItem[] = [
                { type: 'reasoning', content: 'Thinking...' },
                { type: 'message', content: 'Hello' },
                { type: 'reasoning', content: 'More thinking' },
                { type: 'message', content: ' World' }
            ];

            expect(extractMessageContent(output)).toBe('Hello World');
            expect(extractReasoningContent(output)).toBe('Thinking...More thinking');
        });

        it('Test 86: should handle connection error after retries', async () => {
            const limitedClient = new LMStudioClient({ retryCount: 2, retryDelayMs: 10 });
            mockFetch.mockRejectedValue(new Error('Network error'));

            await expect(limitedClient.chat({ model: 'test', input: 'Hi' }))
                .rejects.toThrow(LMStudioConnectionError);
        });

        it('Test 87: should parse stats correctly', () => {
            const response: ChatResponse = {
                model_instance_id: 'test',
                output: [{ type: 'message', content: 'Test' }],
                stats: {
                    input_tokens: 100,
                    total_output_tokens: 50,
                    reasoning_output_tokens: 10,
                    tokens_per_second: 75.5,
                    time_to_first_token_seconds: 0.123,
                    model_load_time_seconds: 5.5
                }
            };

            const parsed = parseResponse(response);
            expect(parsed.stats.input_tokens).toBe(100);
            expect(parsed.stats.total_output_tokens).toBe(50);
            expect(parsed.stats.tokens_per_second).toBe(75.5);
            expect(parsed.stats.model_load_time_seconds).toBe(5.5);
        });

        it('Test 88: should handle SSE with stats', () => {
            const line = 'data: {"stats": {"input_tokens": 10, "total_output_tokens": 5}}';
            const chunk = parseSSELine(line);
            expect(chunk?.data.stats?.input_tokens).toBe(10);
        });
    });

    // ========================================================================
    // Default Values Tests
    // ========================================================================

    describe('Default Values', () => {
        it('Test 89: DEFAULT_LMSTUDIO_CONFIG has correct baseUrl', () => {
            expect(DEFAULT_LMSTUDIO_CONFIG.baseUrl).toBe('http://127.0.0.1:1234');
        });

        it('Test 90: DEFAULT_LMSTUDIO_CONFIG has correct timeout', () => {
            expect(DEFAULT_LMSTUDIO_CONFIG.timeoutMs).toBe(60000);
        });

        it('Test 91: DEFAULT_LMSTUDIO_CONFIG has correct retry count', () => {
            expect(DEFAULT_LMSTUDIO_CONFIG.retryCount).toBe(3);
        });

        it('Test 92: DEFAULT_LMSTUDIO_CONFIG has correct retry delay', () => {
            expect(DEFAULT_LMSTUDIO_CONFIG.retryDelayMs).toBe(1000);
        });

        it('Test 93: DEFAULT_LMSTUDIO_CONFIG debug is off by default', () => {
            expect(DEFAULT_LMSTUDIO_CONFIG.debug).toBe(false);
        });

        it('Test 94: DEFAULT_LMSTUDIO_CONFIG apiKey is empty by default', () => {
            expect(DEFAULT_LMSTUDIO_CONFIG.apiKey).toBe('');
        });
    });
});
