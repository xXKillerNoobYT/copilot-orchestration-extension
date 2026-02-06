/**
 * Tests for LLM Service Response Caching
 *
 * Tests cache hit/miss, TTL expiration, LRU eviction, and config options.
 * 
 * MT-009.5: LLM response caching implementation
 */

import {
    initializeLLMService,
    completeLLM,
    clearLLMCache,
    getLLMCacheSize,
    isLLMCacheEnabled,
    getLLMCacheKey
} from '../../src/services/llmService';
import * as vscode from 'vscode';
import { DEFAULT_CONFIG } from '../../src/config/schema';
import { resetConfigForTests } from '../../src/config';

// Mock dependencies
jest.mock('../../src/services/ticketDb', () => ({
    createTicket: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

jest.mock('../../src/ui/llmStatusBar', () => ({
    llmStatusBar: {
        start: jest.fn(),
        end: jest.fn()
    }
}));

// Create a mutable config for testing different cache settings
let mockConfig = { ...DEFAULT_CONFIG };

jest.mock('../../src/config', () => ({
    getConfigInstance: jest.fn(() => mockConfig),
    initializeConfig: jest.fn(),
    resetConfigForTests: jest.fn(),
}));

import { logInfo } from '../../src/logger';

describe('LLM Service Cache', () => {
    let mockContext: vscode.ExtensionContext;
    const mockResponse = {
        choices: [{ message: { content: 'Test response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        resetConfigForTests();

        // Reset mock config to defaults with cache enabled
        mockConfig = {
            ...DEFAULT_CONFIG,
            llm: {
                ...DEFAULT_CONFIG.llm,
                cacheEnabled: true,
                cacheTTLMinutes: 30,
                cacheMaxEntries: 200
            }
        };

        mockContext = {
            extensionPath: '/mock/extension/path'
        } as any;

        // Mock successful fetch response
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockResponse)
        });

        // Initialize service with mocked config
        await initializeLLMService(mockContext);

        // Clear cache before each test
        clearLLMCache();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Cache Key Generation', () => {
        it('Test 1: should generate consistent cache key for same prompt', () => {
            const key1 = getLLMCacheKey('test prompt');
            const key2 = getLLMCacheKey('test prompt');
            expect(key1).toBe(key2);
            expect(key1).toHaveLength(64); // SHA-256 hex = 64 chars
        });

        it('Test 2: should generate different keys for different prompts', () => {
            const key1 = getLLMCacheKey('prompt one');
            const key2 = getLLMCacheKey('prompt two');
            expect(key1).not.toBe(key2);
        });

        it('Test 3: should generate different keys for same prompt with different options', () => {
            const key1 = getLLMCacheKey('test', { temperature: 0.5 });
            const key2 = getLLMCacheKey('test', { temperature: 0.9 });
            expect(key1).not.toBe(key2);
        });

        it('Test 4: should generate different keys for same prompt with different system prompts', () => {
            const key1 = getLLMCacheKey('test', { systemPrompt: 'You are a helpful assistant' });
            const key2 = getLLMCacheKey('test', { systemPrompt: 'You are a coding expert' });
            expect(key1).not.toBe(key2);
        });

        it('Test 5: should handle very long prompts', () => {
            const longPrompt = 'x'.repeat(10000);
            const key = getLLMCacheKey(longPrompt);
            expect(key).toHaveLength(64); // Still a valid SHA-256 hash
        });
    });

    describe('Cache Hit/Miss', () => {
        it('Test 6: should return cached response on cache hit', async () => {
            // First call - cache miss
            const response1 = await completeLLM('test prompt');
            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(response1.content).toBe('Test response');

            // Second call - cache hit (no new fetch)
            const response2 = await completeLLM('test prompt');
            expect(global.fetch).toHaveBeenCalledTimes(1); // Still only 1 call
            expect(response2.content).toBe('Test response');

            // Verify cache hit was logged
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Cache HIT'));
        });

        it('Test 7: should make real request on cache miss', async () => {
            const response = await completeLLM('new prompt');
            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(response.content).toBe('Test response');
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Cache MISS'));
        });

        it('Test 8: should store response in cache after successful request', async () => {
            expect(getLLMCacheSize()).toBe(0);

            await completeLLM('test prompt');
            expect(getLLMCacheSize()).toBe(1);

            await completeLLM('another prompt');
            expect(getLLMCacheSize()).toBe(2);
        });

        it('Test 9: should preserve usage data in cached response', async () => {
            const response1 = await completeLLM('test prompt');
            expect(response1.usage).toEqual(mockResponse.usage);

            const response2 = await completeLLM('test prompt');
            expect(response2.usage).toEqual(mockResponse.usage);
        });
    });

    describe('Cache Expiration (TTL)', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('Test 10: should return cached response before TTL expires', async () => {
            await completeLLM('test prompt');
            expect(global.fetch).toHaveBeenCalledTimes(1);

            // Advance time by 29 minutes (just under 30min TTL)
            jest.advanceTimersByTime(29 * 60 * 1000);

            // Should still hit cache
            await completeLLM('test prompt');
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it('Test 11: should fetch fresh response after TTL expires', async () => {
            await completeLLM('test prompt');
            expect(global.fetch).toHaveBeenCalledTimes(1);

            // Advance time by 31 minutes (past 30min TTL)
            jest.advanceTimersByTime(31 * 60 * 1000);

            // Should trigger new fetch (cache expired)
            await completeLLM('test prompt');
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('Cache Disabled', () => {
        beforeEach(async () => {
            // Reinitialize with cache disabled
            mockConfig = {
                ...DEFAULT_CONFIG,
                llm: {
                    ...DEFAULT_CONFIG.llm,
                    cacheEnabled: false
                }
            };
            await initializeLLMService(mockContext);
        });

        it('Test 12: should not cache when cacheEnabled=false', async () => {
            await completeLLM('test prompt');
            expect(getLLMCacheSize()).toBe(0);

            await completeLLM('test prompt');
            expect(global.fetch).toHaveBeenCalledTimes(2); // Both requests go to LLM
        });

        it('Test 13: isLLMCacheEnabled should return false when disabled', () => {
            expect(isLLMCacheEnabled()).toBe(false);
        });
    });

    describe('LRU Eviction', () => {
        beforeEach(async () => {
            // Set very low max entries for testing
            mockConfig = {
                ...DEFAULT_CONFIG,
                llm: {
                    ...DEFAULT_CONFIG.llm,
                    cacheEnabled: true,
                    cacheMaxEntries: 3
                }
            };
            await initializeLLMService(mockContext);
            clearLLMCache();
        });

        it('Test 14: should evict oldest entry when max entries exceeded', async () => {
            // Fill cache to max (3 entries)
            await completeLLM('prompt 1');
            await completeLLM('prompt 2');
            await completeLLM('prompt 3');
            expect(getLLMCacheSize()).toBe(3);

            // Add one more - should evict oldest
            await completeLLM('prompt 4');
            expect(getLLMCacheSize()).toBe(3); // Still at max

            // First prompt should now cause cache miss (was evicted)
            (global.fetch as jest.Mock).mockClear();
            await completeLLM('prompt 1');
            expect(global.fetch).toHaveBeenCalledTimes(1); // Had to fetch again
        });

        it('Test 15: should log eviction when max entries exceeded', async () => {
            await completeLLM('prompt 1');
            await completeLLM('prompt 2');
            await completeLLM('prompt 3');

            (logInfo as jest.Mock).mockClear();
            await completeLLM('prompt 4');

            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('evicted oldest'));
        });
    });

    describe('Cache Clear', () => {
        it('Test 16: should clear all entries when clearLLMCache called', async () => {
            await completeLLM('prompt 1');
            await completeLLM('prompt 2');
            expect(getLLMCacheSize()).toBe(2);

            clearLLMCache();
            expect(getLLMCacheSize()).toBe(0);
        });

        it('Test 17: should log when cache is cleared', () => {
            clearLLMCache();
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Cache cleared'));
        });
    });

    describe('Error Handling', () => {
        it('Test 18: should NOT cache error responses', async () => {
            // First call fails
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

            try {
                await completeLLM('test prompt');
            } catch (e) {
                // Expected to throw
            }

            expect(getLLMCacheSize()).toBe(0); // Error not cached

            // Fix the mock for next call
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            });

            // Second call should succeed and cache
            await completeLLM('test prompt');
            expect(getLLMCacheSize()).toBe(1);
        });

        it('Test 19: should NOT cache non-OK HTTP responses', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: () => Promise.resolve('Error')
            });

            try {
                await completeLLM('test prompt');
            } catch (e) {
                // Expected to throw
            }

            expect(getLLMCacheSize()).toBe(0); // Error not cached
        });
    });

    describe('Edge Cases', () => {
        it('Test 20: should handle empty prompt', async () => {
            const key = getLLMCacheKey('');
            expect(key).toHaveLength(64);

            await completeLLM('');
            expect(getLLMCacheSize()).toBe(1);
        });

        it('Test 21: should handle prompt with special characters', async () => {
            const specialPrompt = 'Hello! @#$%^&*() "quotes" \'apostrophe\' <tags> \n\t unicode: 你好';
            const key = getLLMCacheKey(specialPrompt);
            expect(key).toHaveLength(64);

            await completeLLM(specialPrompt);
            expect(getLLMCacheSize()).toBe(1);
        });

        it('Test 22: should handle messages array in options', async () => {
            const options = {
                messages: [
                    { role: 'system' as const, content: 'You are helpful' },
                    { role: 'user' as const, content: 'Hello' }
                ]
            };

            const key1 = getLLMCacheKey('', options);
            const key2 = getLLMCacheKey('', { ...options, messages: [...options.messages] });

            // Same content should produce same key
            expect(key1).toBe(key2);

            await completeLLM('', options);
            expect(getLLMCacheSize()).toBe(1);

            // Second call with same messages should hit cache
            (global.fetch as jest.Mock).mockClear();
            await completeLLM('', options);
            expect(global.fetch).not.toHaveBeenCalled();
        });
    });
});
