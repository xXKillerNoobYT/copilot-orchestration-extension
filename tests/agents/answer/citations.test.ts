/**
 * Tests for Citation System
 * @module tests/agents/answer/citations.test
 */

import {
    CitationManager,
    getCitationManager,
    resetCitationManager,
    Citation,
    CitedAnswer,
    SourceType
} from '../../../src/agents/answer/citations';

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

describe('Citation System', () => {
    beforeEach(() => {
        resetCitationManager();
        jest.clearAllMocks();
    });

    describe('CitationManager Constructor', () => {
        it('Test 1: should create empty citation manager', () => {
            const manager = new CitationManager();
            expect(manager.getCitations('any-id')).toEqual([]);
        });
    });

    describe('createCitation()', () => {
        it('Test 2: should create citation with required fields', () => {
            const manager = new CitationManager();
            const citation = manager.createCitation('plan', 'plan.json');

            expect(citation.id).toMatch(/^cite-\d+$/);
            expect(citation.sourceType).toBe('plan');
            expect(citation.location).toBe('plan.json');
            expect(citation.accessedAt).toBeInstanceOf(Date);
        });

        it('Test 3: should create citation with optional fields', () => {
            const manager = new CitationManager();
            const citation = manager.createCitation('prd', 'PRD.md', {
                reference: 'Section 2.1',
                quote: 'This is a quote',
                confidence: 95
            });

            expect(citation.reference).toBe('Section 2.1');
            expect(citation.quote).toBe('This is a quote');
            expect(citation.confidence).toBe(95);
        });

        it('Test 4: should use default confidence when not provided', () => {
            const manager = new CitationManager();
            const citation = manager.createCitation('external', 'https://example.com');

            expect(citation.confidence).toBe(80);
        });

        it('Test 5: should generate unique IDs', () => {
            const manager = new CitationManager();
            const citation1 = manager.createCitation('plan', 'plan.json');
            const citation2 = manager.createCitation('prd', 'PRD.md');
            const citation3 = manager.createCitation('codebase', 'src/file.ts');

            expect(citation1.id).not.toBe(citation2.id);
            expect(citation2.id).not.toBe(citation3.id);
        });
    });

    describe('citePlan()', () => {
        it('Test 6: should create plan citation with high confidence', () => {
            const manager = new CitationManager();
            const citation = manager.citePlan('requirements');

            expect(citation.sourceType).toBe('plan');
            expect(citation.location).toBe('plan.json');
            expect(citation.reference).toBe('requirements');
            expect(citation.confidence).toBe(95);
        });

        it('Test 7: should include quote in plan citation', () => {
            const manager = new CitationManager();
            const citation = manager.citePlan('tasks', 'Build the feature');

            expect(citation.quote).toBe('Build the feature');
        });
    });

    describe('citePRD()', () => {
        it('Test 8: should create PRD citation with high confidence', () => {
            const manager = new CitationManager();
            const citation = manager.citePRD('Overview');

            expect(citation.sourceType).toBe('prd');
            expect(citation.location).toBe('PRD.md');
            expect(citation.reference).toBe('Overview');
            expect(citation.confidence).toBe(90);
        });

        it('Test 9: should include quote in PRD citation', () => {
            const manager = new CitationManager();
            const citation = manager.citePRD('Requirements', 'Must support dark mode');

            expect(citation.quote).toBe('Must support dark mode');
        });
    });

    describe('citeDesignSystem()', () => {
        it('Test 10: should create design system citation', () => {
            const manager = new CitationManager();
            const citation = manager.citeDesignSystem('Button');

            expect(citation.sourceType).toBe('design-system');
            expect(citation.location).toBe('design-system.json');
            expect(citation.reference).toBe('Button');
            expect(citation.confidence).toBe(85);
        });

        it('Test 11: should include property in reference', () => {
            const manager = new CitationManager();
            const citation = manager.citeDesignSystem('Button', 'primaryColor');

            expect(citation.reference).toBe('Button.primaryColor');
        });
    });

    describe('citeCode()', () => {
        it('Test 12: should create codebase citation', () => {
            const manager = new CitationManager();
            const citation = manager.citeCode('src/utils.ts');

            expect(citation.sourceType).toBe('codebase');
            expect(citation.location).toBe('src/utils.ts');
            expect(citation.confidence).toBe(90);
        });

        it('Test 13: should include line number in reference', () => {
            const manager = new CitationManager();
            const citation = manager.citeCode('src/utils.ts', 42);

            expect(citation.reference).toBe('line 42');
        });

        it('Test 14: should include quote in code citation', () => {
            const manager = new CitationManager();
            const citation = manager.citeCode('src/utils.ts', 42, 'export function helper()');

            expect(citation.quote).toBe('export function helper()');
        });
    });

    describe('citeExternal()', () => {
        it('Test 15: should create external citation with lower confidence', () => {
            const manager = new CitationManager();
            const citation = manager.citeExternal('https://docs.example.com');

            expect(citation.sourceType).toBe('external');
            expect(citation.location).toBe('https://docs.example.com');
            expect(citation.confidence).toBe(70);
        });

        it('Test 16: should include title in reference', () => {
            const manager = new CitationManager();
            const citation = manager.citeExternal('https://docs.example.com', 'Official Docs');

            expect(citation.reference).toBe('Official Docs');
        });
    });

    describe('citeLLM()', () => {
        it('Test 17: should create LLM citation with lowest confidence', () => {
            const manager = new CitationManager();
            const citation = manager.citeLLM('Based on pattern analysis...');

            expect(citation.sourceType).toBe('llm');
            expect(citation.location).toBe('llm-inference');
            expect(citation.confidence).toBe(60);
            expect(citation.quote).toBe('Based on pattern analysis...');
        });
    });

    describe('storeCitations() and getCitations()', () => {
        it('Test 18: should store and retrieve citations', () => {
            const manager = new CitationManager();
            const citations = [
                manager.citePlan('section1'),
                manager.citePRD('section2')
            ];

            manager.storeCitations('answer-1', citations);
            const retrieved = manager.getCitations('answer-1');

            expect(retrieved).toHaveLength(2);
            expect(retrieved[0].sourceType).toBe('plan');
            expect(retrieved[1].sourceType).toBe('prd');
        });

        it('Test 19: should return empty array for unknown answer', () => {
            const manager = new CitationManager();
            expect(manager.getCitations('unknown-id')).toEqual([]);
        });

        it('Test 20: should overwrite citations for same answer', () => {
            const manager = new CitationManager();
            manager.storeCitations('answer-1', [manager.citePlan('old')]);
            manager.storeCitations('answer-1', [manager.citePRD('new')]);

            const retrieved = manager.getCitations('answer-1');
            expect(retrieved).toHaveLength(1);
            expect(retrieved[0].sourceType).toBe('prd');
        });
    });

    describe('buildCitedAnswer()', () => {
        it('Test 21: should build cited answer with no citations', () => {
            const manager = new CitationManager();
            const result = manager.buildCitedAnswer('The answer is 42', []);

            expect(result.answer).toBe('The answer is 42');
            expect(result.citations).toEqual([]);
            expect(result.overallConfidence).toBe(50);
            expect(result.fullySupported).toBe(false);
        });

        it('Test 22: should calculate confidence from citations', () => {
            const manager = new CitationManager();
            const citations = [
                manager.citePlan('s1'), // 95%
                manager.citePRD('s2')   // 90%
            ];

            const result = manager.buildCitedAnswer('Answer', citations);

            // Average is 92.5, plus diversity bonus of 5
            expect(result.overallConfidence).toBeGreaterThan(90);
        });

        it('Test 23: should mark as fully supported with authoritative sources', () => {
            const manager = new CitationManager();
            const citations = [manager.citePlan('requirements')];

            const result = manager.buildCitedAnswer('Answer', citations);

            expect(result.fullySupported).toBe(true);
        });

        it('Test 24: should not be fully supported with only LLM citations', () => {
            const manager = new CitationManager();
            const citations = [manager.citeLLM('reasoning')];

            const result = manager.buildCitedAnswer('Answer', citations);

            expect(result.fullySupported).toBe(false);
        });

        it('Test 25: should add diversity bonus for multiple source types', () => {
            const manager = new CitationManager();
            const singleSource = [manager.citePlan('s1')];
            const multiSource = [
                manager.citePlan('s1'),
                manager.citePRD('s2'),
                manager.citeCode('file.ts')
            ];

            const single = manager.buildCitedAnswer('Answer', singleSource);
            const multi = manager.buildCitedAnswer('Answer', multiSource);

            // Multi-source should have higher confidence due to diversity bonus
            expect(multi.overallConfidence).toBeGreaterThan(single.overallConfidence);
        });

        it('Test 26: should cap confidence at 100', () => {
            const manager = new CitationManager();
            const citations = [
                manager.citePlan('s1'),
                manager.citePlan('s2'),
                manager.citePlan('s3'),
                manager.citePRD('s4'),
                manager.citeCode('file.ts')
            ];

            const result = manager.buildCitedAnswer('Answer', citations);

            expect(result.overallConfidence).toBeLessThanOrEqual(100);
        });
    });

    describe('formatCitations()', () => {
        it('Test 27: should return empty string for no citations', () => {
            const manager = new CitationManager();
            expect(manager.formatCitations([])).toBe('');
        });

        it('Test 28: should format plan citation', () => {
            const manager = new CitationManager();
            const formatted = manager.formatCitations([manager.citePlan('requirements')]);

            expect(formatted).toContain('**Sources:**');
            expect(formatted).toContain('Plan: requirements');
            expect(formatted).toContain('95% confidence');
        });

        it('Test 29: should format PRD citation', () => {
            const manager = new CitationManager();
            const formatted = manager.formatCitations([manager.citePRD('Overview')]);

            expect(formatted).toContain('PRD: Overview');
        });

        it('Test 30: should format design system citation', () => {
            const manager = new CitationManager();
            const formatted = manager.formatCitations([manager.citeDesignSystem('Button')]);

            expect(formatted).toContain('Design System: Button');
        });

        it('Test 31: should format code citation with line number', () => {
            const manager = new CitationManager();
            const formatted = manager.formatCitations([manager.citeCode('src/file.ts', 42)]);

            expect(formatted).toContain('Code: src/file.ts');
            expect(formatted).toContain('line 42');
        });

        it('Test 32: should format external citation', () => {
            const manager = new CitationManager();
            const formatted = manager.formatCitations([manager.citeExternal('https://example.com')]);

            expect(formatted).toContain('External: https://example.com');
        });

        it('Test 33: should format LLM citation', () => {
            const manager = new CitationManager();
            const formatted = manager.formatCitations([manager.citeLLM('reasoning')]);

            expect(formatted).toContain('LLM inference');
        });

        it('Test 34: should include truncated quote', () => {
            const manager = new CitationManager();
            const longQuote = 'a'.repeat(200);
            const citation = manager.citePlan('section');
            (citation as any).quote = longQuote;

            const formatted = manager.formatCitations([citation]);

            expect(formatted).toContain('...');
            expect(formatted.length).toBeLessThan(longQuote.length + 200);
        });

        it('Test 35: should format multiple citations', () => {
            const manager = new CitationManager();
            const citations = [
                manager.citePlan('s1'),
                manager.citePRD('s2'),
                manager.citeCode('file.ts')
            ];

            const formatted = manager.formatCitations(citations);

            expect(formatted).toContain('[cite-1]');
            expect(formatted).toContain('[cite-2]');
            expect(formatted).toContain('[cite-3]');
        });
    });

    describe('clear()', () => {
        it('Test 36: should clear all stored citations', () => {
            const manager = new CitationManager();
            manager.storeCitations('a1', [manager.citePlan('s1')]);
            manager.storeCitations('a2', [manager.citePRD('s2')]);

            manager.clear();

            expect(manager.getCitations('a1')).toEqual([]);
            expect(manager.getCitations('a2')).toEqual([]);
        });

        it('Test 37: should reset citation counter', () => {
            const manager = new CitationManager();
            manager.createCitation('plan', 'plan.json');
            manager.createCitation('prd', 'PRD.md');

            manager.clear();

            const newCitation = manager.createCitation('plan', 'plan.json');
            expect(newCitation.id).toBe('cite-1');
        });
    });

    describe('Singleton Functions', () => {
        it('Test 38: should return same instance from getCitationManager', () => {
            const manager1 = getCitationManager();
            const manager2 = getCitationManager();

            expect(manager1).toBe(manager2);
        });

        it('Test 39: should create new instance after reset', () => {
            const manager1 = getCitationManager();
            manager1.storeCitations('test', [manager1.citePlan('s1')]);

            resetCitationManager();

            const manager2 = getCitationManager();
            expect(manager2.getCitations('test')).toEqual([]);
        });
    });

    describe('Source Types', () => {
        it('Test 40: should support all source types', () => {
            const manager = new CitationManager();
            const sourceTypes: SourceType[] = ['plan', 'prd', 'design-system', 'codebase', 'external', 'llm'];

            for (const sourceType of sourceTypes) {
                const citation = manager.createCitation(sourceType, 'test-location');
                expect(citation.sourceType).toBe(sourceType);
            }
        });
    });
});
