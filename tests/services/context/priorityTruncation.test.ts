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

    describe('Test 9: truncate - partial high priority content', () => {
        it('should truncate high priority content when partial fit available', () => {
            // Use a truncator with a small preserveMinimum to allow partial truncation
            const smallTruncator = createPriorityTruncator({ 
                maxTokens: 150,
                preserveMinimum: 20 
            });
            
            // Create content with very long text - charLimit will be ~200 chars (50 tokens * 4)
            // So we need content longer than 200 chars to trigger actual truncation
            const longHighPriorityContent: TruncatableContent = {
                id: 'B',
                content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate.',
                tokens: 100,
                priority: 'high'
            };
            
            const content = [
                createContent('A', 'critical', 100),
                longHighPriorityContent // Won't fit fully, but has room for partial (50 tokens available)
            ];
            
            const result = smallTruncator.truncate(content);
            
            // Both should be included - critical fully, high partially truncated
            const ids = result.map(r => r.id);
            expect(ids).toContain('A');
            expect(ids).toContain('B');
            
            // The high priority item should have reduced tokens (50 available tokens)
            const bItem = result.find(r => r.id === 'B');
            expect(bItem).toBeDefined();
            if (bItem) {
                expect(bItem.tokens).toBeLessThanOrEqual(50);
                expect(bItem.content).toContain('... [truncated]');
            }
        });

        it('should skip high priority content when not enough space for minimum', () => {
            // Very small minimum space available
            const smallTruncator = createPriorityTruncator({ 
                maxTokens: 110,
                preserveMinimum: 50 
            });
            
            const content = [
                createContent('A', 'critical', 105),
                createContent('B', 'high', 100) // Won't fit - only 5 tokens left, below preserveMinimum
            ];
            
            const result = smallTruncator.truncate(content);
            
            // Only critical should be included
            const ids = result.map(r => r.id);
            expect(ids).toContain('A');
            expect(ids).not.toContain('B');
        });
    });

    describe('Test 10: truncate - content actually truncated', () => {
        it('should add truncation marker when content is physically truncated', () => {
            const smallTruncator = createPriorityTruncator({ 
                maxTokens: 200,
                preserveMinimum: 30 
            });
            
            // Create content with very long text - charLimit will be ~200 chars (50 tokens * 4)
            // Content needs to be much longer than 200 chars to trigger truncation
            const longContent: TruncatableContent = {
                id: 'long',
                content: 'This is an extremely long piece of content that absolutely needs to be truncated because it far exceeds the available token budget significantly and will definitely need to be cut short to fit within limits. We need to ensure this content is long enough to trigger the truncation logic which requires the content length to exceed the calculated character limit based on available tokens multiplied by four characters per token.',
                tokens: 100,
                priority: 'high'
            };
            
            const content = [
                createContent('A', 'critical', 150),
                longContent // Should get truncated to ~50 tokens = ~200 chars max
            ];
            
            const result = smallTruncator.truncate(content);
            
            // Both should be included
            expect(result).toHaveLength(2);
            
            // The long content should have been physically truncated
            const truncatedItem = result.find(r => r.id === 'long');
            expect(truncatedItem).toBeDefined();
            if (truncatedItem) {
                expect(truncatedItem.content).toContain('... [truncated]');
            }
        });

        it('should return full content when char limit exceeds content length', () => {
            // When the calculated char limit is larger than the content itself
            const largeTruncator = createPriorityTruncator({ 
                maxTokens: 500,
                preserveMinimum: 10 
            });
            
            const shortContent: TruncatableContent = {
                id: 'short',
                content: 'Short text', // Very short
                tokens: 100,
                priority: 'high'
            };
            
            const content = [
                createContent('A', 'critical', 400),
                shortContent // Available: 100 tokens = 400 chars, content is only ~10 chars
            ];
            
            const result = largeTruncator.truncate(content);
            
            const shortItem = result.find(r => r.id === 'short');
            expect(shortItem).toBeDefined();
            if (shortItem) {
                expect(shortItem.content).toBe('Short text');
                expect(shortItem.content).not.toContain('truncated');
            }
        });
    });
});
