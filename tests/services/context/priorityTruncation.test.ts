/**
 * @file context/priorityTruncation.test.ts
 * @description Tests for PriorityTruncator (MT-017.3)
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn()
}));

import {
    PriorityTruncator,
    createPriorityTruncator,
    comparePriority,
    meetsMinimumPriority,
    TruncatableContent,
    ContentPriority
} from '../../../src/services/context/priorityTruncation';

describe('PriorityTruncator', () => {
    let truncator: PriorityTruncator;

    beforeEach(() => {
        truncator = createPriorityTruncator({ maxTokens: 100 });
    });

    const createContent = (id: string, priority: ContentPriority, tokens: number): TruncatableContent => ({
        id,
        content: `Content for ${id}`,
        tokens,
        priority
    });

    describe('Test 1: constructor', () => {
        it('should create instance with default config', () => {
            const defaultTruncator = createPriorityTruncator();
            expect(defaultTruncator).toBeInstanceOf(PriorityTruncator);
        });

        it('should create instance with custom config', () => {
            const customTruncator = createPriorityTruncator({
                maxTokens: 500,
                preserveMinimum: 50
            });
            expect(customTruncator).toBeInstanceOf(PriorityTruncator);
        });
    });

    describe('Test 2: truncate - fits within limit', () => {
        it('should keep all content when it fits', () => {
            const content = [
                createContent('A', 'high', 30),
                createContent('B', 'normal', 30),
                createContent('C', 'low', 30)
            ];
            
            const result = truncator.truncate(content);
            expect(result).toHaveLength(3);
        });
    });

    describe('Test 3: truncate - removes low priority first', () => {
        it('should remove low priority content first', () => {
            const content = [
                createContent('A', 'high', 60),
                createContent('B', 'normal', 30),
                createContent('C', 'low', 30)
            ];
            
            const result = truncator.truncate(content);
            
            // Should keep high and normal, remove low
            const ids = result.map(r => r.id);
            expect(ids).toContain('A');
            expect(ids).toContain('B');
            expect(ids).not.toContain('C');
        });
    });

    describe('Test 4: truncate - preserves critical content', () => {
        it('should always include critical content', () => {
            const content = [
                createContent('critical', 'critical', 50),
                createContent('optional', 'optional', 50),
                createContent('optional2', 'optional', 50)
            ];
            
            const result = truncator.truncate(content);
            const ids = result.map(r => r.id);
            expect(ids).toContain('critical');
        });
    });

    describe('Test 5: fitsWithinLimit', () => {
        it('should return true when content fits', () => {
            const content = [
                createContent('A', 'high', 30),
                createContent('B', 'normal', 30)
            ];
            expect(truncator.fitsWithinLimit(content)).toBe(true);
        });

        it('should return false when content exceeds limit', () => {
            const content = [
                createContent('A', 'high', 60),
                createContent('B', 'normal', 60)
            ];
            expect(truncator.fitsWithinLimit(content)).toBe(false);
        });
    });

    describe('Test 6: calculateRemoval', () => {
        it('should calculate removal statistics', () => {
            const content = [
                createContent('A', 'high', 60),
                createContent('B', 'low', 60)
            ];
            
            const stats = truncator.calculateRemoval(content);
            expect(stats.removedItems).toContain('B');
            expect(stats.removed).toBe(60);
        });
    });

    describe('Test 7: comparePriority', () => {
        it('should compare priorities correctly', () => {
            expect(comparePriority('critical', 'high')).toBeLessThan(0);
            expect(comparePriority('high', 'normal')).toBeLessThan(0);
            expect(comparePriority('low', 'critical')).toBeGreaterThan(0);
            expect(comparePriority('normal', 'normal')).toBe(0);
        });
    });

    describe('Test 8: meetsMinimumPriority', () => {
        it('should check if priority meets minimum', () => {
            expect(meetsMinimumPriority('critical', 'high')).toBe(true);
            expect(meetsMinimumPriority('high', 'high')).toBe(true);
            expect(meetsMinimumPriority('low', 'high')).toBe(false);
        });
    });
});
