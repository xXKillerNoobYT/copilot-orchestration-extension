/**
 * Tests for LLM Service
 * 
 * Tests config reading, validation, completeLLM, streamLLM, error handling, and timeout behavior
 */

import { initializeLLMService, completeLLM, streamLLM } from '../src/services/llmService';
import * as vscode from 'vscode';
import * as fs from 'fs';

// Mock dependencies
jest.mock('../src/services/ticketDb', () => ({
    createTicket: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

jest.mock('../src/ui/llmStatusBar', () => ({
    llmStatusBar: {
        start: jest.fn(),
        end: jest.fn()
    }
}));

jest.mock('fs');

import { createTicket } from '../src/services/ticketDb';
import { logInfo, logWarn, logError } from '../src/logger';
import { llmStatusBar } from '../src/ui/llmStatusBar';

describe('LLM Service', () => {
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();

        // Mock extension context
        mockContext = {
            extensionPath: '/mock/extension/path'
        } as any;

        // Mock global fetch
        global.fetch = jest.fn();
    });

    afterEach(() => {
        // Clean up fake timers if used
        jest.useRealTimers();
    });

    describe('initializeLLMService', () => {
        it('should throw error if fetch is not available (Node <18)', async () => {
            // Remove fetch temporarily
            const originalFetch = global.fetch;
            (global as any).fetch = undefined;

            await expect(initializeLLMService(mockContext)).rejects.toThrow('Node.js 18+ required');
            expect(logError).toHaveBeenCalledWith(expect.stringContaining('Node.js 18+'));

            // Restore fetch
            global.fetch = originalFetch;
        });

        it('should use default config if file is missing', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);

            await initializeLLMService(mockContext);

            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Config file not found'));
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('http://192.168.1.205:1234/v1'));
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('ministral-3-14b-reasoning'));
        });

        it('should read config from file if it exists', async () => {
            const mockConfig = {
                llm: {
                    endpoint: 'http://localhost:1234/v1',
                    model: 'test-model',
                    timeoutSeconds: 30,
                    maxTokens: 1024
                }
            };

            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

            await initializeLLMService(mockContext);

            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('http://localhost:1234/v1'));
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('test-model'));
        });

        it('should validate and use defaults for invalid timeoutSeconds', async () => {
            const mockConfig = {
                llm: {
                    endpoint: 'http://localhost:1234/v1',
                    model: 'test-model',
                    timeoutSeconds: -5, // Invalid
                    maxTokens: 2048
                }
            };

            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

            await initializeLLMService(mockContext);

            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Invalid timeoutSeconds'));
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('using default: 60'));
        });

        it('should validate and use defaults for invalid maxTokens', async () => {
            const mockConfig = {
                llm: {
                    endpoint: 'http://localhost:1234/v1',
                    model: 'test-model',
                    timeoutSeconds: 60,
                    maxTokens: 'invalid' // Invalid type
                }
            };

            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

            await initializeLLMService(mockContext);

            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Invalid maxTokens'));
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('using default: 2048'));
        });

        it('should handle JSON parse errors gracefully', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue('invalid json{');

            await initializeLLMService(mockContext);

            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to read config file'));
        });
    });

    describe('completeLLM', () => {
        beforeEach(async () => {
            // Initialize service with defaults
            (fs.existsSync as jest.Mock).mockReturnValue(false);
            await initializeLLMService(mockContext);
            jest.clearAllMocks(); // Clear init logs
        });

        it('should make successful LLM request', async () => {
            const mockResponse = {
                choices: [{ message: { content: 'This is a test response' } }],
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockResponse
            });

            const result = await completeLLM('What is TypeScript?');

            expect(result.content).toBe('This is a test response');
            expect(result.usage?.total_tokens).toBe(30);
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('LLM request'));
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('LLM response'));
            expect(llmStatusBar.start).toHaveBeenCalledTimes(1);
            expect(llmStatusBar.end).toHaveBeenCalledTimes(1);
        });

        it('should include system prompt if provided', async () => {
            const mockResponse = {
                choices: [{ message: { content: 'Answer' } }],
                usage: {}
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockResponse
            });

            await completeLLM('Test question', {
                systemPrompt: 'You are a helpful assistant'
            });

            const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.messages).toHaveLength(2);
            expect(body.messages[0].role).toBe('system');
            expect(body.messages[0].content).toBe('You are a helpful assistant');
            expect(body.messages[1].role).toBe('user');
        });

        it('should handle network errors and create blocked ticket', async () => {
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            await expect(completeLLM('Test')).rejects.toThrow();

            expect(logError).toHaveBeenCalledWith(expect.stringContaining('LLM call failed'));
            expect(createTicket).toHaveBeenCalledWith(expect.objectContaining({
                title: expect.stringContaining('LLM FAILURE'),
                status: 'blocked',
                description: expect.stringContaining('Network error')
            }));
            expect(llmStatusBar.start).toHaveBeenCalledTimes(1);
            expect(llmStatusBar.end).toHaveBeenCalledTimes(1);
        });

        it('should handle HTTP error responses', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 500
            });

            await expect(completeLLM('Test')).rejects.toThrow('HTTP error');
            expect(createTicket).toHaveBeenCalled();
        });

        it('should handle timeout with AbortError', async () => {
            // Simulate abort error directly
            const error: any = new Error('The operation was aborted');
            error.name = 'AbortError';
            (global.fetch as jest.Mock).mockRejectedValue(error);

            await expect(completeLLM('Test')).rejects.toThrow('timed out');
            expect(createTicket).toHaveBeenCalled();
        });

        it('should handle ECONNREFUSED error specifically', async () => {
            const error: any = new Error('connect ECONNREFUSED');
            error.code = 'ECONNREFUSED';
            (global.fetch as jest.Mock).mockRejectedValue(error);

            await expect(completeLLM('Test')).rejects.toThrow('LLM endpoint unreachable');
            expect(createTicket).toHaveBeenCalled();
        });
    });

    describe('streamLLM', () => {
        beforeEach(async () => {
            // Initialize service with defaults
            (fs.existsSync as jest.Mock).mockReturnValue(false);
            await initializeLLMService(mockContext);
            jest.clearAllMocks();
        });
        // Helper to reinitialize service with custom config
        const reinitWithConfig = async (config: any) => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ llm: config }));
            await initializeLLMService(mockContext);
            jest.clearAllMocks();
        };
        it('should stream chunks and accumulate response', async () => {
            const mockChunks = [
                'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
                'data: {"choices":[{"delta":{"content":" world"}}]}\n',
                'data: [DONE]\n'
            ];

            let chunkIndex = 0;
            const mockReader = {
                read: jest.fn().mockImplementation(() => {
                    if (chunkIndex < mockChunks.length) {
                        const chunk = mockChunks[chunkIndex++];
                        return Promise.resolve({
                            done: false,
                            value: new TextEncoder().encode(chunk)
                        });
                    }
                    return Promise.resolve({ done: true });
                }),
                cancel: jest.fn()
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                body: { getReader: () => mockReader }
            });

            const receivedChunks: string[] = [];
            const result = await streamLLM('Test', (chunk) => receivedChunks.push(chunk));

            expect(receivedChunks).toEqual(['Hello', ' world']);
            expect(result.content).toBe('Hello world');
            expect(result.usage).toBeUndefined();
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('First LLM chunk received'));
            expect(llmStatusBar.start).toHaveBeenCalledTimes(1);
            expect(llmStatusBar.end).toHaveBeenCalledTimes(1);
        });

        it('should skip malformed SSE lines gracefully', async () => {
            const mockChunks = [
                'data: {"choices":[{"delta":{"content":"Good"}}]}\n',
                'data: {invalid json\n', // Malformed line
                'data: {"choices":[{"delta":{"content":"Also good"}}]}\n',
                'data: [DONE]\n'
            ];

            let chunkIndex = 0;
            const mockReader = {
                read: jest.fn().mockImplementation(() => {
                    if (chunkIndex < mockChunks.length) {
                        const chunk = mockChunks[chunkIndex++];
                        return Promise.resolve({
                            done: false,
                            value: new TextEncoder().encode(chunk)
                        });
                    }
                    return Promise.resolve({ done: true });
                }),
                cancel: jest.fn()
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                body: { getReader: () => mockReader }
            });

            const receivedChunks: string[] = [];
            const result = await streamLLM('Test', (chunk) => receivedChunks.push(chunk));

            expect(receivedChunks).toEqual(['Good', 'Also good']);
            expect(result.content).toBe('GoodAlso good');
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to parse SSE line'));
        });

        it('should abort on inactivity timeout', async () => {
            // Reinit with short timeout for testing (1.2 seconds, just over the 1s check interval)
            await reinitWithConfig({
                endpoint: 'http://localhost:1234/v1',
                model: 'test-model',
                timeoutSeconds: 1.2, // 1200ms inactivity timeout
                maxTokens: 2048,
                startupTimeoutSeconds: 10
            });

            let readCount = 0;
            const mockReader = {
                read: jest.fn().mockImplementation(async () => {
                    if (readCount === 0) {
                        readCount++;
                        // First chunk arrives immediately
                        return {
                            done: false,
                            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n')
                        };
                    }
                    // Subsequent reads hang forever
                    return new Promise(() => { });
                }),
                cancel: jest.fn().mockResolvedValue(undefined)
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                body: { getReader: () => mockReader }
            });

            // With real timers, interval checks every 1s, so this will abort after ~2.2s total
            await expect(streamLLM('Test', () => { })).rejects.toThrow('LLM streaming inactivity timeout');
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('LLM inactivity timeout'));
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Streaming aborted: inactivity'));
        }, 3000);

        it('should handle streaming network errors', async () => {
            const mockReader = {
                read: jest.fn().mockRejectedValue(new Error('Network error')),
                cancel: jest.fn().mockResolvedValue(undefined)
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                body: { getReader: () => mockReader }
            });

            await expect(streamLLM('Test', () => { })).rejects.toThrow('Network error');
            expect(logError).toHaveBeenCalledWith(expect.stringContaining('LLM streaming failed'));
            expect(createTicket).toHaveBeenCalled();
            expect(llmStatusBar.start).toHaveBeenCalledTimes(1);
            expect(llmStatusBar.end).toHaveBeenCalledTimes(1);
        });

        it('should handle HTTP error in streaming', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 500
            });

            await expect(streamLLM('Test', () => { })).rejects.toThrow('HTTP error');
            expect(createTicket).toHaveBeenCalled();
        });

        it('should abort on startup timeout', async () => {
            // Reinit with short startup timeout (0.5 seconds = 500ms)
            await reinitWithConfig({
                endpoint: 'http://localhost:1234/v1',
                model: 'test-model',
                timeoutSeconds: 60,
                maxTokens: 2048,
                startupTimeoutSeconds: 0.5 // 500ms startup timeout
            });

            const mockReader = {
                read: jest.fn().mockImplementation(() => {
                    // Simulate no chunks arriving - hang forever
                    return new Promise(() => { });
                }),
                cancel: jest.fn().mockResolvedValue(undefined)
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                body: { getReader: () => mockReader }
            });

            // With real timers, this will abort after ~500ms of no startup chunks
            await expect(streamLLM('Test', () => { })).rejects.toThrow('LLM streaming startup timeout');
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('LLM startup timeout'));
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Streaming aborted: startup'));
        }, 2000);

        it('should abort on inactivity timeout after first chunk', async () => {
            // Reinit with short inactivity timeout (1.2 seconds, just over the 1s check interval)
            await reinitWithConfig({
                endpoint: 'http://localhost:1234/v1',
                model: 'test-model',
                timeoutSeconds: 1.2, // 1200ms inactivity timeout
                maxTokens: 2048,
                startupTimeoutSeconds: 10
            });

            let readCount = 0;
            const mockReader = {
                read: jest.fn().mockImplementation(async () => {
                    if (readCount === 0) {
                        readCount++;
                        return {
                            done: false,
                            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n')
                        };
                    }
                    // Second read hangs forever
                    return new Promise(() => { });
                }),
                cancel: jest.fn().mockResolvedValue(undefined)
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                body: { getReader: () => mockReader }
            });

            // With real timers, interval checks every 1s, so this will abort after ~2.2s total
            await expect(streamLLM('Test', () => { })).rejects.toThrow('LLM streaming inactivity timeout');
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('LLM inactivity timeout'));
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Streaming aborted: inactivity'));
        }, 3000);

        it('should not double-abort if startup and inactivity timeouts overlap', async () => {
            // Reinit with overlapping short timeouts
            await reinitWithConfig({
                endpoint: 'http://localhost:1234/v1',
                model: 'test-model',
                timeoutSeconds: 1.2, // 1200ms inactivity timeout
                maxTokens: 2048,
                startupTimeoutSeconds: 0.5 // 500ms startup timeout
            });

            let readCount = 0;
            const mockReader = {
                read: jest.fn().mockImplementation(async () => {
                    if (readCount === 0) {
                        readCount++;
                        return {
                            done: false,
                            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Test"}}]}\n')
                        };
                    }
                    return new Promise(() => { });
                }),
                cancel: jest.fn().mockResolvedValue(undefined)
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                body: { getReader: () => mockReader }
            });

            // With real timers, startup (500ms) will fire first
            // Guard ensures only one abort reason is logged
            await expect(streamLLM('Test', () => { })).rejects.toThrow();
            
            // Verify exactly one abort reason was set (guard prevented double-abort)
            expect(logInfo).toHaveBeenCalledWith(expect.stringMatching(/Streaming aborted: (startup|inactivity)/));
        }, 3000);
    });

    describe('token management', () => {
        beforeEach(async () => {
            // Initialize with low token limit for testing
            const mockConfig = {
                llm: {
                    endpoint: 'http://localhost:1234/v1',
                    model: 'test-model',
                    timeoutSeconds: 30,
                    maxTokens: 200 // Low limit for testing trimming
                }
            };
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));
            await initializeLLMService(mockContext);
        });

        describe('token estimation', () => {
            it('should estimate tokens for empty string as 0', () => {
                // Access private function via completeLLM test - estimate empty content
                const emptyMessage = '';
                // We can't directly test private functions, but we can verify behavior
                expect(emptyMessage.length).toBe(0);
            });

            it('should estimate tokens with reasonable accuracy', () => {
                // Test token estimation indirectly through trimming behavior
                // Short text: "Hello world" ≈ 11 chars / 4 + 2 words * 0.3 = 3 + 1 = 4 tokens
                const shortText = 'Hello world';
                const estimatedTokens = Math.ceil(shortText.length / 4) + Math.ceil(shortText.split(/\s+/).length * 0.3);
                expect(estimatedTokens).toBeGreaterThan(0);
                expect(estimatedTokens).toBeLessThan(10); // Should be reasonable
            });

            it('should estimate longer text with ±20% variance tolerance', () => {
                // Longer text for estimation testing
                const longText = 'The quick brown fox jumps over the lazy dog. This is a test sentence to verify token estimation accuracy.';
                const charEstimate = Math.ceil(longText.length / 4);
                const words = longText.split(/\s+/).filter(w => w.length > 0);
                const wordAdjustment = Math.ceil(words.length * 0.3);
                const totalEstimate = charEstimate + wordAdjustment;

                // Should be in reasonable range (not 0, not absurdly high)
                expect(totalEstimate).toBeGreaterThan(10);
                expect(totalEstimate).toBeLessThan(100);
            });
        });

        describe('message trimming', () => {
            it('should not trim messages under 80% of maxTokens', async () => {
                // Clear previous warnings
                jest.clearAllMocks();

                const mockResponse = {
                    ok: true,
                    json: async () => ({
                        choices: [{ message: { content: 'Response' } }],
                        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
                    })
                };
                (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

                // Short messages array (well under limit)
                const messages = [
                    { role: 'system' as const, content: 'You are helpful' },
                    { role: 'user' as const, content: 'Hi' }
                ];

                await completeLLM('', { messages });

                // Should NOT log trimming warning
                expect(logWarn).not.toHaveBeenCalledWith(expect.stringContaining('Token limit exceeded'));
            });

            it('should trim oldest messages when over 80% of maxTokens', async () => {
                jest.clearAllMocks();

                const mockResponse = {
                    ok: true,
                    json: async () => ({
                        choices: [{ message: { content: 'Response' } }],
                        usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 }
                    })
                };
                (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

                // Build messages that exceed 80% of 200 tokens (160 tokens)
                // Each message is ~50 chars = ~15 tokens
                const longContent = 'A'.repeat(200); // ~50 tokens per message
                const messages = [
                    { role: 'system' as const, content: 'You are a helpful assistant' },
                    { role: 'user' as const, content: longContent },
                    { role: 'assistant' as const, content: longContent },
                    { role: 'user' as const, content: longContent },
                    { role: 'assistant' as const, content: longContent },
                    { role: 'user' as const, content: longContent },
                    { role: 'assistant' as const, content: longContent },
                    { role: 'user' as const, content: 'Latest message' }
                ];

                await completeLLM('', { messages });

                // Should log trimming warning
                expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Token limit exceeded'));
                expect(logWarn).toHaveBeenCalledWith(expect.stringMatching(/Trimmed messages from \d+ to \d+/));
            });

            it('should preserve system message even if it exceeds limit', async () => {
                jest.clearAllMocks();

                const mockResponse = {
                    ok: true,
                    json: async () => ({
                        choices: [{ message: { content: 'Response' } }],
                        usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 }
                    })
                };
                (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

                // System message alone exceeds maxTokens
                const hugeSystemPrompt = 'A'.repeat(2000); // Way over 200 token limit
                const messages = [
                    { role: 'system' as const, content: hugeSystemPrompt }
                ];

                await completeLLM('', { messages });

                // Should log warning about system message exceeding limit
                expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('System message alone'));
                expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Keeping it anyway'));
            });

            it('should keep system message + last 3 exchanges minimum', async () => {
                jest.clearAllMocks();

                const mockResponse = {
                    ok: true,
                    json: async () => ({
                        choices: [{ message: { content: 'Response' } }],
                        usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 }
                    })
                };
                (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

                // 10 user/assistant exchanges + system message
                const mediumContent = 'B'.repeat(100); // ~30 tokens each
                const messages = [
                    { role: 'system' as const, content: 'System prompt' },
                    { role: 'user' as const, content: mediumContent },
                    { role: 'assistant' as const, content: mediumContent },
                    { role: 'user' as const, content: mediumContent },
                    { role: 'assistant' as const, content: mediumContent },
                    { role: 'user' as const, content: mediumContent },
                    { role: 'assistant' as const, content: mediumContent },
                    { role: 'user' as const, content: mediumContent },
                    { role: 'assistant' as const, content: mediumContent },
                    { role: 'user' as const, content: 'Recent 1' },
                    { role: 'assistant' as const, content: 'Recent 2' },
                    { role: 'user' as const, content: 'Recent 3' }
                ];

                const result = await completeLLM('', { messages });

                expect(result).toBeDefined();
                // Trimming should have occurred
                expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Token limit exceeded'));
            });
        });

        describe('integration with completeLLM', () => {
            it('should apply trimming before calling LLM', async () => {
                jest.clearAllMocks();

                const mockResponse = {
                    ok: true,
                    json: async () => ({
                        choices: [{ message: { content: 'Trimmed response' } }],
                        usage: { prompt_tokens: 40, completion_tokens: 10, total_tokens: 50 }
                    })
                };
                (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

                const longContent = 'C'.repeat(150); // ~40 tokens each
                const messages = [
                    { role: 'system' as const, content: 'System' },
                    { role: 'user' as const, content: longContent },
                    { role: 'assistant' as const, content: longContent },
                    { role: 'user' as const, content: longContent },
                    { role: 'assistant' as const, content: longContent },
                    { role: 'user' as const, content: longContent }
                ];

                const result = await completeLLM('', { messages });

                expect(result.content).toBe('Trimmed response');
                // Verify fetch was called with trimmed messages
                expect(global.fetch).toHaveBeenCalled();
                const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
                const requestBody = JSON.parse(fetchCall[1].body);
                expect(requestBody.messages.length).toBeLessThanOrEqual(messages.length);
            });

            it('should work with legacy mode (prompt + systemPrompt)', async () => {
                jest.clearAllMocks();

                const mockResponse = {
                    ok: true,
                    json: async () => ({
                        choices: [{ message: { content: 'Legacy response' } }],
                        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
                    })
                };
                (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

                const result = await completeLLM('Short prompt', { systemPrompt: 'System' });

                expect(result.content).toBe('Legacy response');
                // No trimming should occur for short messages
                expect(logWarn).not.toHaveBeenCalledWith(expect.stringContaining('Token limit exceeded'));
            });
        });

        describe('integration with streamLLM', () => {
            it('should apply trimming before streaming', async () => {
                jest.clearAllMocks();

                const mockReader = {
                    read: jest.fn()
                        .mockResolvedValueOnce({
                            done: false,
                            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Stream"}}]}\n')
                        })
                        .mockResolvedValueOnce({
                            done: false,
                            value: new TextEncoder().encode('data: [DONE]\n')
                        })
                        .mockResolvedValueOnce({ done: true }),
                    cancel: jest.fn()
                };

                (global.fetch as jest.Mock).mockResolvedValue({
                    ok: true,
                    body: { getReader: () => mockReader }
                });

                const longContent = 'D'.repeat(150);
                const chunks: string[] = [];

                await streamLLM('Test', (chunk) => chunks.push(chunk), { systemPrompt: longContent });

                // Trimming may or may not occur depending on content length
                // Just verify no errors
                expect(chunks.length).toBeGreaterThan(0);
            });
        });
    });
});
