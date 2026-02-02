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

jest.mock('fs');

import { createTicket } from '../src/services/ticketDb';
import { logInfo, logWarn, logError } from '../src/logger';

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

        it.skip('should abort on inactivity timeout', async () => {
            // Reinit with très short timeout for testing
            await reinitWithConfig({
                endpoint: 'http://localhost:1234/v1',
                model: 'test-model',
                timeoutSeconds: 1, // 1 second timeout
                maxTokens: 2048,
                startupTimeoutSeconds: 10
            });

            let readCount = 0;
            const mockReader = {
                read: jest.fn().mockImplementation(() => {
                    if (readCount === 0) {
                        readCount++;
                        // First chunk arrives immediately
                        return Promise.resolve({
                            done: false,
                            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n')
                        });
                    }
                    // Subsequent reads hang forever (simulating no more chunks)
                    return new Promise(() => { });
                }),
                cancel: jest.fn().mockResolvedValue(undefined)
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                body: { getReader: () => mockReader }
            });

            await expect(streamLLM('Test', () => { })).rejects.toThrow('LLM request timed out');
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('LLM inactivity timeout'));
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
        });

        it('should handle HTTP error in streaming', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 500
            });

            await expect(streamLLM('Test', () => { })).rejects.toThrow('HTTP error');
            expect(createTicket).toHaveBeenCalled();
        });

        it.skip('should abort on startup timeout', async () => {
            // Reinit with very short startup timeout
            await reinitWithConfig({
                endpoint: 'http://localhost:1234/v1',
                model: 'test-model',
                timeoutSeconds: 60,
                maxTokens: 2048,
                startupTimeoutSeconds: 1 // 1 second startup timeout
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

            await expect(streamLLM('Test', () => { })).rejects.toThrow('LLM request timed out');
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('LLM startup timeout'));
        }, 3000);

        it.skip('should abort on inactivity timeout after first chunk', async () => {
            // Reinit with very short inactivity timeout
            await reinitWithConfig({
                endpoint: 'http://localhost:1234/v1',
                model: 'test-model',
                timeoutSeconds: 1, // 1 second inactivity timeout
                maxTokens: 2048,
                startupTimeoutSeconds: 10
            });

            let readCount = 0;
            const mockReader = {
                read: jest.fn().mockImplementation(() => {
                    if (readCount === 0) {
                        readCount++;
                        return Promise.resolve({
                            done: false,
                            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n')
                        });
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

            await expect(streamLLM('Test', () => { })).rejects.toThrow('LLM request timed out');
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('LLM inactivity timeout'));
        }, 3000);
    });
});
