/**
 * @file llmService.streaming.test.ts
 * @description Tests for MT-009.6: Streaming queue with backpressure handling.
 *
 * Tests the queue mechanism that enforces maxConcurrentRequests limit
 * to prevent overwhelming the LLM endpoint with too many parallel requests.
 */

import {
    initializeLLMService,
    completeLLM,
    getLLMQueueStats,
    clearLLMQueue,
    clearLLMCache
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

// Create a mutable config for testing different queue settings
let mockConfig = { ...DEFAULT_CONFIG };

jest.mock('../../src/config', () => ({
    getConfigInstance: jest.fn(() => mockConfig),
    initializeConfig: jest.fn(),
    resetConfigForTests: jest.fn(),
}));

describe('LLM Service Queue/Backpressure (MT-009.6)', () => {
    let mockContext: vscode.ExtensionContext;
    const mockResponse = {
        choices: [{ message: { content: 'Test response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
    };

    // Helper to create a delayed mock response
    function createDelayedResponse(delayMs: number): Promise<any> {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    ok: true,
                    json: () => Promise.resolve(mockResponse)
                });
            }, delayMs);
        });
    }

    beforeEach(async () => {
        jest.clearAllMocks();
        resetConfigForTests();

        // Reset mock config
        mockConfig = {
            ...DEFAULT_CONFIG,
            llm: {
                ...DEFAULT_CONFIG.llm,
                cacheEnabled: false, // Disable cache so all requests hit queue
                maxConcurrentRequests: 3
            }
        };

        mockContext = {
            extensionPath: '/mock/extension/path'
        } as any;

        // Mock successful fetch response (immediate)
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockResponse)
        });

        // Initialize service
        await initializeLLMService(mockContext);

        // Clear cache and queue
        clearLLMCache();
        clearLLMQueue();
    });

    afterEach(() => {
        jest.useRealTimers();
        clearLLMQueue();
    });

    it('Test 1: should track active requests in queue stats', async () => {
        // Check initial state
        const statsBefore = getLLMQueueStats();
        expect(statsBefore.active).toBe(0);
        expect(statsBefore.queued).toBe(0);
        expect(statsBefore.max).toBe(3);

        // Make a request
        await completeLLM('Test prompt');

        // After completion, slot should be released
        const statsAfter = getLLMQueueStats();
        expect(statsAfter.active).toBe(0);
    });

    it('Test 2: should enforce maxConcurrentRequests limit', async () => {
        // Configure for maxConcurrentRequests=1
        mockConfig = {
            ...DEFAULT_CONFIG,
            llm: {
                ...DEFAULT_CONFIG.llm,
                cacheEnabled: false,
                maxConcurrentRequests: 1
            }
        };
        await initializeLLMService(mockContext);

        // Setup delayed responses
        let callCount = 0;
        global.fetch = jest.fn().mockImplementation(() => {
            callCount++;
            return createDelayedResponse(50);
        });

        // Start 3 requests simultaneously
        const promises = [
            completeLLM('Prompt 1'),
            completeLLM('Prompt 2'),
            completeLLM('Prompt 3')
        ];

        // Give time for first request to start (but not complete)
        await new Promise(r => setTimeout(r, 10));

        // Check queue stats - should have 1 active, 2 queued
        const stats = getLLMQueueStats();
        expect(stats.active).toBe(1);
        expect(stats.queued).toBe(2);

        // Wait for all to complete
        await Promise.all(promises);

        // All should be done
        const finalStats = getLLMQueueStats();
        expect(finalStats.active).toBe(0);
        expect(finalStats.queued).toBe(0);
    });

    it('Test 3: should process requests concurrently up to limit', async () => {
        // Configure for maxConcurrentRequests=3
        mockConfig = {
            ...DEFAULT_CONFIG,
            llm: {
                ...DEFAULT_CONFIG.llm,
                cacheEnabled: false,
                maxConcurrentRequests: 3
            }
        };
        await initializeLLMService(mockContext);

        // Setup delayed responses
        global.fetch = jest.fn().mockImplementation(() => createDelayedResponse(100));

        // Start 3 requests simultaneously (exactly at limit)
        const promises = [
            completeLLM('Prompt 1'),
            completeLLM('Prompt 2'),
            completeLLM('Prompt 3')
        ];

        // Give time for all to start
        await new Promise(r => setTimeout(r, 20));

        // All 3 should be active (none queued)
        const stats = getLLMQueueStats();
        expect(stats.active).toBe(3);
        expect(stats.queued).toBe(0);

        // Wait for all to complete
        await Promise.all(promises);
    });

    it('Test 4: should release slot after successful completion', async () => {
        const statsBefore = getLLMQueueStats();
        expect(statsBefore.active).toBe(0);

        // Make a request
        const response = await completeLLM('Test prompt');
        expect(response.content).toBe('Test response');

        // Slot should be released
        const statsAfter = getLLMQueueStats();
        expect(statsAfter.active).toBe(0);
    });

    it('Test 5: should release slot after error', async () => {
        // Setup mock to fail
        global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));

        const statsBefore = getLLMQueueStats();
        expect(statsBefore.active).toBe(0);

        // Make request that will fail
        await expect(completeLLM('Test prompt')).rejects.toThrow('Network error');

        // Slot should still be released despite error
        const statsAfter = getLLMQueueStats();
        expect(statsAfter.active).toBe(0);
    });

    it('Test 6: cache hit should bypass queue (not acquire slot)', async () => {
        // Configure with caching enabled
        mockConfig = {
            ...DEFAULT_CONFIG,
            llm: {
                ...DEFAULT_CONFIG.llm,
                cacheEnabled: true,
                maxConcurrentRequests: 1
            }
        };
        await initializeLLMService(mockContext);

        // First call - should acquire slot and cache result
        await completeLLM('Cached prompt');
        expect(global.fetch).toHaveBeenCalledTimes(1);

        // Reset fetch mock to a slow response
        (global.fetch as jest.Mock).mockClear();
        global.fetch = jest.fn().mockImplementation(() => createDelayedResponse(5000));

        // Second call - same prompt should hit cache (fast, no slot needed)
        const startTime = Date.now();
        const response = await completeLLM('Cached prompt');
        const elapsed = Date.now() - startTime;

        // Should be fast (cache hit) and no new fetch
        expect(elapsed).toBeLessThan(100);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(response.content).toBe('Test response');
    });

    it('Test 7: clearLLMQueue should drop pending requests', async () => {
        // Configure for maxConcurrentRequests=1
        mockConfig = {
            ...DEFAULT_CONFIG,
            llm: {
                ...DEFAULT_CONFIG.llm,
                cacheEnabled: false,
                maxConcurrentRequests: 1
            }
        };
        await initializeLLMService(mockContext);

        // Setup a slow response
        global.fetch = jest.fn().mockImplementation(() => createDelayedResponse(200));

        // Start requests - first one will be active, others queued
        const promise1 = completeLLM('Prompt 1');
        // These will be queued and rejected when we clear
        const promise2 = completeLLM('Prompt 2').catch(() => 'cleared');
        const promise3 = completeLLM('Prompt 3').catch(() => 'cleared');

        // Wait for queue to build up
        await new Promise(r => setTimeout(r, 20));

        // Verify queue state
        const statsBefore = getLLMQueueStats();
        expect(statsBefore.queued).toBe(2);

        // Clear the queue
        clearLLMQueue();

        // Queue should be cleared
        const statsAfter = getLLMQueueStats();
        expect(statsAfter.queued).toBe(0);

        // First request continues, wait for it
        await promise1;

        // Queued requests should have been rejected with 'Queue cleared'
        const result2 = await promise2;
        const result3 = await promise3;
        expect(result2).toBe('cleared');
        expect(result3).toBe('cleared');
    });

    it('Test 8: should report correct max in queue stats', async () => {
        const stats = getLLMQueueStats();
        expect(stats.max).toBe(3);

        // Reinitialize with different max
        mockConfig = {
            ...DEFAULT_CONFIG,
            llm: {
                ...DEFAULT_CONFIG.llm,
                maxConcurrentRequests: 5
            }
        };
        await initializeLLMService(mockContext);

        const newStats = getLLMQueueStats();
        expect(newStats.max).toBe(5);
    });
});
