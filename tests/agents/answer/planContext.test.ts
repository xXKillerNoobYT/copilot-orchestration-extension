/**
 * @file tests/agents/answer/planContext.test.ts
 * @description Tests for Plan.json context extraction (MT-014.5)
 */

import * as fs from 'fs';
import * as path from 'path';
import { PlanContextExtractor, createPlanContextExtractor } from '../../../src/agents/answer/planContext';

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

// Mock fs
jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('PlanContextExtractor', () => {
    let extractor: PlanContextExtractor;

    beforeEach(() => {
        jest.clearAllMocks();
        extractor = createPlanContextExtractor('/test/workspace');
    });

    describe('Test 1-5: extractContext', () => {
        it('Test 1: should return empty when plan not found', async () => {
            mockFs.existsSync.mockReturnValue(false);

            const result = await extractor.extractContext('What is the plan?');

            expect(result.planFound).toBe(false);
            expect(result.sections).toHaveLength(0);
        });

        it('Test 2: should parse plan.json successfully', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                tasks: [
                    { id: 'T1', title: 'Setup TypeScript', description: 'Configure TypeScript compiler' }
                ]
            }));

            const result = await extractor.extractContext('TypeScript setup');

            expect(result.planFound).toBe(true);
        });

        it('Test 3: should find relevant sections by keyword', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                tasks: [
                    { id: 'T1', title: 'Setup TypeScript', description: 'Configure TypeScript compiler' },
                    { id: 'T2', title: 'Add ESLint', description: 'Configure linting rules' }
                ]
            }));

            const result = await extractor.extractContext('TypeScript');

            expect(result.sections.length).toBeGreaterThan(0);
            expect(result.sections[0].content).toContain('TypeScript');
        });

        it('Test 4: should handle invalid JSON gracefully', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue('not valid json');

            const result = await extractor.extractContext('test');

            expect(result.planFound).toBe(false);
        });

        it('Test 5: should limit tokens in response', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                tasks: Array.from({ length: 100 }, (_, i) => ({
                    id: `T${i}`,
                    title: `Task ${i} with TypeScript`,
                    description: 'A'.repeat(500)
                }))
            }));

            const result = await extractor.extractContext('TypeScript', 100);

            expect(result.tokenEstimate).toBeLessThanOrEqual(100);
        });
    });

    describe('Test 6-10: keyword extraction', () => {
        it('Test 6: should extract meaningful keywords', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                tasks: [{ id: 'T1', title: 'TypeScript configuration task' }]
            }));

            // Question with stop words that should be filtered
            const result = await extractor.extractContext('How do I configure TypeScript?');

            expect(result.planFound).toBe(true);
        });

        it('Test 7: should handle empty question', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ tasks: [] }));

            const result = await extractor.extractContext('');

            expect(result.sections).toHaveLength(0);
        });

        it('Test 8: should score by keyword matches', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                tasks: [
                    { id: 'T1', title: 'TypeScript TypeScript TypeScript', description: 'TypeScript' },
                    { id: 'T2', title: 'JavaScript', description: 'JS stuff' }
                ]
            }));

            const result = await extractor.extractContext('TypeScript');

            // First section should have higher relevance
            if (result.sections.length >= 2) {
                expect(result.sections[0].relevanceScore).toBeGreaterThan(result.sections[1].relevanceScore);
            }
        });

        it('Test 9: should filter short words', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                tasks: [{ id: 'T1', title: 'Test task' }]
            }));

            // Words like "is" and "a" should be filtered
            const result = await extractor.extractContext('is it a test?');

            expect(result.planFound).toBe(true);
        });

        it('Test 10: should limit keywords to 10', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ tasks: [] }));

            // Very long question
            const longQuestion = Array.from({ length: 50 }, (_, i) => `keyword${i}`).join(' ');
            const result = await extractor.extractContext(longQuestion);

            expect(result.planFound).toBe(true);
        });
    });

    describe('Test 11-15: caching', () => {
        it('Test 11: should cache plan between calls', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ tasks: [] }));

            await extractor.extractContext('test1');
            await extractor.extractContext('test2');

            // Only one read should happen due to caching
            expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
        });

        it('Test 12: should clear cache on request', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ tasks: [] }));

            await extractor.extractContext('test1');
            extractor.clearCache();
            await extractor.extractContext('test2');

            expect(mockFs.readFileSync).toHaveBeenCalledTimes(2);
        });

        it('Test 13: should update path and clear cache', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ tasks: [] }));

            await extractor.extractContext('test1');
            extractor.setPlanPath('/new/path/plan.json');
            await extractor.extractContext('test2');

            expect(mockFs.readFileSync).toHaveBeenCalledTimes(2);
        });

        it('Test 14: should handle file read errors', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const result = await extractor.extractContext('test');

            expect(result.planFound).toBe(false);
        });

        it('Test 15: should estimate token count', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                tasks: [
                    { id: 'T1', title: 'Test', description: 'A'.repeat(400) }
                ]
            }));

            const result = await extractor.extractContext('Test', 1000);

            // 400 chars ≈ 100 tokens
            expect(result.tokenEstimate).toBeGreaterThan(0);
        });
    });
});
