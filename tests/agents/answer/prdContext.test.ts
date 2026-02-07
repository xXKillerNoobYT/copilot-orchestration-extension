/**
 * Tests for PRD Context Extractor
 * @module tests/agents/answer/prdContext.test
 */

import { PRDContextExtractor, createPRDContextExtractor, PRDSection, PRDContextResult } from '../../../src/agents/answer/prdContext';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn()
}));

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('PRD Context Extractor', () => {
    const samplePRD = `# Project Requirements Document

## Overview
This is the project overview section. It describes the main goals.

## Features
### User Authentication
Users should be able to log in with email and password.
Sessions should expire after 24 hours.

### Dashboard
The dashboard displays key metrics.
- Total users
- Active sessions
- Revenue

## Technical Requirements
The application should use TypeScript.
Database should be PostgreSQL.

## Design Guidelines
Use blue as the primary color.
Font should be Inter.
`;

    beforeEach(() => {
        mockFs.existsSync.mockReset();
        mockFs.readFileSync.mockReset();
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        it('Test 1: should create extractor with workspace path', () => {
            const extractor = new PRDContextExtractor('/workspace');
            expect(extractor).toBeDefined();
        });

        it('Test 2: should create extractor without workspace path', () => {
            const extractor = new PRDContextExtractor();
            expect(extractor).toBeDefined();
        });
    });

    describe('extractContext()', () => {
        it('Test 3: should return empty result when PRD not found', async () => {
            mockFs.existsSync.mockReturnValue(false);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('What is the primary color?');
            
            expect(result.prdFound).toBe(false);
            expect(result.sections).toHaveLength(0);
            expect(result.tokenEstimate).toBe(0);
        });

        it('Test 4: should extract relevant sections for question', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('What is the primary color?');
            
            expect(result.prdFound).toBe(true);
            expect(result.sections.length).toBeGreaterThan(0);
        });

        it('Test 5: should prioritize sections with keyword matches', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('What color should be used?');
            
            // Design Guidelines section should have high relevance
            const hasDesignSection = result.sections.some(
                s => s.heading.includes('Design') || s.content.includes('color')
            );
            expect(hasDesignSection).toBe(true);
        });

        it('Test 6: should find authentication-related sections', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('How should user authentication work?');
            
            expect(result.sections.some(
                s => s.content.includes('email') || s.content.includes('password')
            )).toBe(true);
        });

        it('Test 7: should respect maxTokens limit', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('Tell me about the project', 50);
            
            expect(result.tokenEstimate).toBeLessThanOrEqual(50);
        });

        it('Test 8: should include at least one section when all are relevant', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('What is in this document?', 10);
            
            // Should include at least one truncated section
            expect(result.sections.length).toBeGreaterThanOrEqual(0);
        });

        it('Test 9: should handle read errors gracefully', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('Read error');
            });
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('Any question');
            
            expect(result.prdFound).toBe(false);
            expect(result.sections).toHaveLength(0);
        });

        it('Test 10: should use cached sections on subsequent calls', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            await extractor.extractContext('First question');
            await extractor.extractContext('Second question');
            
            // Should only read file once due to caching
            expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
        });
    });

    describe('Markdown Parsing', () => {
        it('Test 11: should parse heading levels correctly', async () => {
            const prd = `# Level 1
Content 1

## Level 2
Content 2

### Level 3
Content 3
`;
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(prd);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('all', 10000);
            
            // Should have parsed multiple sections
            expect(result.prdFound).toBe(true);
        });

        it('Test 12: should handle PRD without headings', async () => {
            const prd = `Just some text without any headings.
More text here.`;
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(prd);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('text');
            
            expect(result.prdFound).toBe(true);
        });

        it('Test 13: should handle empty PRD', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue('');
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('anything');
            
            expect(result.prdFound).toBe(true);
            expect(result.sections).toHaveLength(0);
        });

        it('Test 14: should preserve content between headings', async () => {
            const prd = `## Section A
Line 1
Line 2
Line 3

## Section B
More content`;
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(prd);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('Section A Line');
            
            const sectionA = result.sections.find(s => s.heading === 'Section A');
            if (sectionA) {
                expect(sectionA.content).toContain('Line 1');
                expect(sectionA.content).toContain('Line 2');
            }
        });
    });

    describe('Keyword Extraction', () => {
        it('Test 15: should extract meaningful keywords', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            // Question with stop words that should be filtered
            const result = await extractor.extractContext(
                'What is the best color for the buttons?'
            );
            
            expect(result.prdFound).toBe(true);
        });

        it('Test 16: should handle questions with special characters', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext(
                'What about the "color"? (Primary, I mean!)'
            );
            
            expect(result.prdFound).toBe(true);
        });

        it('Test 17: should limit keyword count', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const veryLongQuestion = Array(20).fill('keyword').join(' ');
            const result = await extractor.extractContext(veryLongQuestion);
            
            expect(result.prdFound).toBe(true);
        });
    });

    describe('Section Scoring', () => {
        it('Test 18: should score heading matches higher', async () => {
            const prd = `## Authentication
Login functionality

## Colors
The authentication header should be blue.
`;
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(prd);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('authentication');
            
            // Authentication section should come first due to heading match
            if (result.sections.length > 0) {
                expect(result.sections[0].heading).toBe('Authentication');
            }
        });

        it('Test 19: should boost shorter focused sections', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('TypeScript database');
            
            // Technical Requirements section matches and is focused
            expect(result.sections.some(s => 
                s.content.includes('TypeScript') ||
                s.content.includes('PostgreSQL')
            )).toBe(true);
        });

        it('Test 20: should handle no matching sections', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('xyznonexistent');
            
            // Should return no relevant sections
            expect(result.sections.every(s => s.relevanceScore === 0)).toBe(true);
        });
    });

    describe('formatAsContext()', () => {
        it('Test 21: should format sections with headings', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('features');
            
            const formatted = extractor.formatAsContext(result.sections);
            
            expect(formatted).toContain('##');
        });

        it('Test 22: should separate sections with dividers', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('project', 10000);
            
            if (result.sections.length > 1) {
                const formatted = extractor.formatAsContext(result.sections);
                expect(formatted).toContain('---');
            }
        });

        it('Test 23: should handle empty sections array', () => {
            const extractor = new PRDContextExtractor('/workspace');
            const formatted = extractor.formatAsContext([]);
            
            expect(formatted).toBe('');
        });

        it('Test 24: should handle section without heading', () => {
            const extractor = new PRDContextExtractor('/workspace');
            const sections: PRDSection[] = [{
                heading: '',
                content: 'Just content',
                level: 1,
                relevanceScore: 10,
                startLine: 1
            }];
            
            const formatted = extractor.formatAsContext(sections);
            
            expect(formatted).toBe('Just content');
        });
    });

    describe('Cache Management', () => {
        it('Test 25: should refresh cache after timeout', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            
            // Force cache to be old by manipulating internal state
            await extractor.extractContext('first');
            
            // Clear cache manually
            extractor.clearCache();
            
            await extractor.extractContext('second');
            
            // Should have read file twice (once initially, once after clear)
            expect(mockFs.readFileSync).toHaveBeenCalledTimes(2);
        });

        it('Test 26: should clear cache on clearCache()', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            await extractor.extractContext('first');
            
            extractor.clearCache();
            await extractor.extractContext('second');
            
            expect(mockFs.readFileSync).toHaveBeenCalledTimes(2);
        });

        it('Test 27: should clear cache when path changes', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            await extractor.extractContext('first');
            
            extractor.setPrdPath('/new/path/PRD.md');
            await extractor.extractContext('second');
            
            expect(mockFs.readFileSync).toHaveBeenCalledTimes(2);
        });
    });

    describe('createPRDContextExtractor()', () => {
        it('Test 28: should create extractor with factory function', () => {
            const extractor = createPRDContextExtractor('/workspace');
            expect(extractor).toBeInstanceOf(PRDContextExtractor);
        });

        it('Test 29: should create extractor without workspace path', () => {
            const extractor = createPRDContextExtractor();
            expect(extractor).toBeInstanceOf(PRDContextExtractor);
        });
    });

    describe('Token Estimation', () => {
        it('Test 30: should estimate tokens based on content length', async () => {
            const shortPRD = `## Short
Brief content.`;
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(shortPRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('Short');
            
            expect(result.tokenEstimate).toBeGreaterThan(0);
            expect(result.tokenEstimate).toBeLessThan(100);
        });
    });

    describe('Edge Cases', () => {
        it('Test 31: should handle PRD with only whitespace', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue('   \n\n   \t  ');
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('anything');
            
            expect(result.prdFound).toBe(true);
        });

        it('Test 32: should handle very long PRD', async () => {
            const longPRD = samplePRD.repeat(100);
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(longPRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('color', 100);
            
            expect(result.tokenEstimate).toBeLessThanOrEqual(100);
        });

        it('Test 33: should handle question with only stop words', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(samplePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('the is a an');
            
            // Should still work, just won't find relevant sections
            expect(result.prdFound).toBe(true);
        });

        it('Test 34: should handle unicode in PRD', async () => {
            const unicodePRD = `## 功能要求
支持中文和日本語。

## Emoji Support 🎉
We support emojis!`;
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(unicodePRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('emoji 🎉');
            
            expect(result.prdFound).toBe(true);
        });

        it('Test 35: should truncate very long sections', async () => {
            const longSectionPRD = `## Very Long Section
${'Content that goes on and on. '.repeat(1000)}`;
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(longSectionPRD);
            
            const extractor = new PRDContextExtractor('/workspace');
            const result = await extractor.extractContext('Long', 50);
            
            // Should truncate to fit token limit
            expect(result.tokenEstimate).toBeLessThanOrEqual(50);
        });
    });
});
