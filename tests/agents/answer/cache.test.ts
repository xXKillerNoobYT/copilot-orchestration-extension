/**
 * Tests for Answer Cache System
 * @module tests/agents/answer/cache.test
 */

import {
    AnswerCache,
    getAnswerCache,
    resetAnswerCacheForTests,
    CachedAnswer,
    CacheHitResult,
    AnswerCacheConfig
} from '../../../src/agents/answer/cache';

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

describe('Answer Cache System', () => {
    beforeEach(() => {
        resetAnswerCacheForTests();
        jest.clearAllMocks();
    });

    describe('AnswerCache Constructor', () => {
        it('Test 1: should create cache with default config', () => {
            const cache = new AnswerCache();
            expect(cache.size).toBe(0);
        });

        it('Test 2: should create cache with custom config', () => {
            const cache = new AnswerCache({
                ttlMs: 1000,
                maxEntries: 10,
                similarityThreshold: 0.9,
                minConfidenceToCache: 90
            });
            expect(cache.size).toBe(0);
        });

        it('Test 3: should merge partial config with defaults', () => {
            const cache = new AnswerCache({ maxEntries: 5 });
            // Cache should work with partial config
            cache.store('question', 'answer', 90);
            expect(cache.size).toBe(1);
        });
    });

    describe('store()', () => {
        it('Test 4: should store an answer with high confidence', () => {
            const cache = new AnswerCache();
            cache.store('What is the primary color?', 'Blue is the primary color.', 95);
            expect(cache.size).toBe(1);
        });

        it('Test 5: should not store low confidence answers', () => {
            const cache = new AnswerCache({ minConfidenceToCache: 80 });
            cache.store('What is the color?', 'Maybe red?', 50);
            expect(cache.size).toBe(0);
        });

        it('Test 6: should store answer at exactly minimum confidence', () => {
            const cache = new AnswerCache({ minConfidenceToCache: 80 });
            cache.store('What is the color?', 'Red', 80);
            expect(cache.size).toBe(1);
        });

        it('Test 7: should store answer with context', () => {
            const cache = new AnswerCache();
            cache.store('Question', 'Answer', 90, 'test-context');
            const result = cache.lookup('Question');
            expect(result.hit).toBe(true);
            expect(result.answer?.context).toBe('test-context');
        });

        it('Test 8: should evict LRU entries when max is reached', () => {
            const cache = new AnswerCache({ maxEntries: 3, minConfidenceToCache: 50 });

            cache.store('Question 1', 'Answer 1', 90);
            cache.store('Question 2', 'Answer 2', 90);
            cache.store('Question 3', 'Answer 3', 90);

            // Access question 1 to increase hit count
            cache.lookup('Question 1');
            cache.lookup('Question 1');

            // Adding a 4th should evict something
            cache.store('Question 4', 'Answer 4', 90);

            // Size should still be at max or less due to eviction
            expect(cache.size).toBeLessThanOrEqual(3);
        });

        it('Test 9: should update existing entry when same question is stored', () => {
            const cache = new AnswerCache();
            cache.store('Same question', 'First answer', 90);
            cache.store('Same question', 'Updated answer', 95);

            const result = cache.lookup('Same question');
            expect(result.answer?.answer).toBe('Updated answer');
            expect(result.answer?.confidence).toBe(95);
        });
    });

    describe('lookup()', () => {
        it('Test 10: should find exact match', () => {
            const cache = new AnswerCache();
            cache.store('What is TypeScript?', 'A typed superset of JavaScript', 95);

            const result = cache.lookup('What is TypeScript?');
            expect(result.hit).toBe(true);
            expect(result.similarity).toBe(1.0);
            expect(result.answer?.answer).toBe('A typed superset of JavaScript');
        });

        it('Test 11: should return miss for unknown question', () => {
            const cache = new AnswerCache();
            cache.store('Question A', 'Answer A', 90);

            const result = cache.lookup('Completely different question');
            expect(result.hit).toBe(false);
            expect(result.answer).toBeUndefined();
        });

        it('Test 12: should find fuzzy match with similar wording', () => {
            const cache = new AnswerCache({ similarityThreshold: 0.6 });
            cache.store('What is the primary button color?', 'Blue', 90);

            // Similar question with different wording
            const result = cache.lookup('primary button color');
            expect(result.hit).toBe(true);
            expect(result.similarity).toBeGreaterThan(0.6);
        });

        it('Test 13: should not match when below similarity threshold', () => {
            const cache = new AnswerCache({ similarityThreshold: 0.95 });
            cache.store('What is TypeScript?', 'A language', 90);

            // Very different question
            const result = cache.lookup('How do databases work?');
            expect(result.hit).toBe(false);
        });

        it('Test 14: should increment hit count on match', () => {
            const cache = new AnswerCache();
            cache.store('Question', 'Answer', 90);

            expect(cache.lookup('Question').answer?.hitCount).toBe(1);
            expect(cache.lookup('Question').answer?.hitCount).toBe(2);
            expect(cache.lookup('Question').answer?.hitCount).toBe(3);
        });

        it('Test 15: should not return expired entries', () => {
            const cache = new AnswerCache({ ttlMs: 100 });
            cache.store('Expiring question', 'Answer', 90);

            // Immediately should work
            expect(cache.lookup('Expiring question').hit).toBe(true);

            // After TTL, should not match
            jest.useFakeTimers();
            jest.advanceTimersByTime(200);

            const result = cache.lookup('Expiring question');
            expect(result.hit).toBe(false);

            jest.useRealTimers();
        });

        it('Test 16: should handle empty question', () => {
            const cache = new AnswerCache();
            const result = cache.lookup('');
            expect(result.hit).toBe(false);
        });

        it('Test 17: should normalize questions for matching', () => {
            const cache = new AnswerCache();
            cache.store('What is the COLOR?', 'Blue', 90);

            // Different casing and punctuation
            const result = cache.lookup('what is the color');
            expect(result.hit).toBe(true);
        });
    });

    describe('getStats()', () => {
        it('Test 18: should return empty stats for empty cache', () => {
            const cache = new AnswerCache();
            const stats = cache.getStats();

            expect(stats.size).toBe(0);
            expect(stats.hitRate).toBe(0);
            expect(stats.avgConfidence).toBe(0);
        });

        it('Test 19: should calculate correct stats', () => {
            const cache = new AnswerCache();
            cache.store('Q1', 'A1', 80);
            cache.store('Q2', 'A2', 100);

            // Generate some hits
            cache.lookup('Q1');
            cache.lookup('Q1');
            cache.lookup('Q2');

            const stats = cache.getStats();
            expect(stats.size).toBe(2);
            expect(stats.avgConfidence).toBe(90); // (80 + 100) / 2
            expect(stats.hitRate).toBeGreaterThan(0);
        });

        it('Test 20: should exclude expired entries from stats', () => {
            const cache = new AnswerCache({ ttlMs: 100 });
            cache.store('Q1', 'A1', 80);

            jest.useFakeTimers();
            jest.advanceTimersByTime(200);

            const stats = cache.getStats();
            expect(stats.size).toBe(0);

            jest.useRealTimers();
        });
    });

    describe('cleanExpired()', () => {
        it('Test 21: should remove expired entries', () => {
            const cache = new AnswerCache({ ttlMs: 100 });
            cache.store('Q1', 'A1', 90);
            cache.store('Q2', 'A2', 90);

            jest.useFakeTimers();
            jest.advanceTimersByTime(200);

            const removed = cache.cleanExpired();
            expect(removed).toBe(2);
            expect(cache.size).toBe(0);

            jest.useRealTimers();
        });

        it('Test 22: should keep non-expired entries', () => {
            const cache = new AnswerCache({ ttlMs: 10000 });
            cache.store('Q1', 'A1', 90);

            const removed = cache.cleanExpired();
            expect(removed).toBe(0);
            expect(cache.size).toBe(1);
        });

        it('Test 23: should return 0 for empty cache', () => {
            const cache = new AnswerCache();
            expect(cache.cleanExpired()).toBe(0);
        });
    });

    describe('clear()', () => {
        it('Test 24: should remove all entries', () => {
            const cache = new AnswerCache();
            cache.store('Q1', 'A1', 90);
            cache.store('Q2', 'A2', 90);
            cache.store('Q3', 'A3', 90);

            cache.clear();
            expect(cache.size).toBe(0);
        });

        it('Test 25: should be safe to call on empty cache', () => {
            const cache = new AnswerCache();
            expect(() => cache.clear()).not.toThrow();
            expect(cache.size).toBe(0);
        });
    });

    describe('Singleton Functions', () => {
        it('Test 26: should return same instance from getAnswerCache', () => {
            const cache1 = getAnswerCache();
            const cache2 = getAnswerCache();
            expect(cache1).toBe(cache2);
        });

        it('Test 27: should create new instance after reset', () => {
            const cache1 = getAnswerCache();
            cache1.store('Q1', 'A1', 90);

            resetAnswerCacheForTests();

            const cache2 = getAnswerCache();
            expect(cache2.size).toBe(0);
        });
    });

    describe('Edge Cases', () => {
        it('Test 28: should handle very long questions', () => {
            const cache = new AnswerCache();
            const longQuestion = 'a'.repeat(10000);

            cache.store(longQuestion, 'Answer', 90);
            const result = cache.lookup(longQuestion);
            expect(result.hit).toBe(true);
        });

        it('Test 29: should handle special characters in questions', () => {
            const cache = new AnswerCache();
            cache.store('What about @#$%^&*()? And émojis 🎉?', 'It works!', 90);

            const result = cache.lookup('What about @#$%^&*()? And émojis 🎉?');
            expect(result.hit).toBe(true);
        });

        it('Test 30: should handle unicode in answers', () => {
            const cache = new AnswerCache();
            cache.store('Greek letters?', 'α β γ δ ε', 90);

            const result = cache.lookup('Greek letters?');
            expect(result.answer?.answer).toBe('α β γ δ ε');
        });
    });
});
