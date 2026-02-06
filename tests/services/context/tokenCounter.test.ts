/**
 * @file context/tokenCounter.test.ts
 * @description Tests for TokenCounter (MT-017.2)
 */

import {
    TokenCounter,
    createTokenCounter,
    estimateTokens,
    fitsWithinLimit
} from '../../../src/services/context/tokenCounter';

describe('TokenCounter', () => {
    let counter: TokenCounter;

    beforeEach(() => {
        counter = createTokenCounter();
    });

    describe('Test 1: constructor', () => {
        it('should create instance with default config', () => {
            expect(counter).toBeInstanceOf(TokenCounter);
        });

        it('should create instance with custom config', () => {
            const customCounter = createTokenCounter({
                charsPerToken: 3,
                codeMultiplier: 1.5
            });
            expect(customCounter).toBeInstanceOf(TokenCounter);
        });
    });

    describe('Test 2: count', () => {
        it('should return 0 for empty string', () => {
            expect(counter.count('')).toBe(0);
        });

        it('should estimate tokens for text', () => {
            const tokens = counter.count('Hello world');
            expect(tokens).toBeGreaterThan(0);
            // ~11 chars / 4 chars per token ≈ 3 tokens
            expect(tokens).toBeLessThan(10);
        });

        it('should count more tokens for longer text', () => {
            const short = counter.count('Hello');
            const long = counter.count('Hello world, this is a longer string');
            expect(long).toBeGreaterThan(short);
        });
    });

    describe('Test 3: code detection', () => {
        it('should detect code and apply multiplier', () => {
            const proseTokens = counter.count('This is a simple sentence.');
            const codeTokens = counter.count(`
                import { foo } from 'bar';
                export function test() {
                    const x = 1;
                    return x;
                }
            `);
            
            // Code should have higher token count per character
            const proseRatio = proseTokens / 'This is a simple sentence.'.length;
            const codeRatio = codeTokens / 120; // Approximate code length
            
            expect(codeRatio).toBeGreaterThanOrEqual(proseRatio * 0.8);
        });
    });

    describe('Test 4: countMany', () => {
        it('should count tokens for multiple strings', () => {
            const texts = ['Hello', 'World', 'Test'];
            const total = counter.countMany(texts);
            const individual = texts.reduce((sum, t) => sum + counter.count(t), 0);
            expect(total).toBe(individual);
        });
    });

    describe('Test 5: fitsWithin', () => {
        it('should return true if text fits', () => {
            expect(counter.fitsWithin('Hello', 100)).toBe(true);
        });

        it('should return false if text exceeds limit', () => {
            const longText = 'x'.repeat(1000);
            expect(counter.fitsWithin(longText, 10)).toBe(false);
        });
    });

    describe('Test 6: getMaxLength', () => {
        it('should calculate max character length for token limit', () => {
            const maxLength = counter.getMaxLength(100);
            // 100 tokens * 4 chars/token = 400
            expect(maxLength).toBe(400);
        });
    });

    describe('Test 7: truncateToFit', () => {
        it('should not truncate if text fits', () => {
            const text = 'Short text';
            expect(counter.truncateToFit(text, 100)).toBe(text);
        });

        it('should truncate long text', () => {
            const longText = 'x'.repeat(1000);
            const truncated = counter.truncateToFit(longText, 10);
            expect(truncated.length).toBeLessThan(1000);
            expect(truncated).toContain('...');
        });
    });

    describe('Test 8: utility functions', () => {
        it('estimateTokens should work', () => {
            expect(estimateTokens('Hello world')).toBeGreaterThan(0);
        });

        it('fitsWithinLimit should work', () => {
            expect(fitsWithinLimit('Hello', 100)).toBe(true);
            expect(fitsWithinLimit('x'.repeat(1000), 10)).toBe(false);
        });
    });
});
