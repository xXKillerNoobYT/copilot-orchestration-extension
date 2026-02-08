/**
 * Tests for Match Report Generator
 *
 * Tests for comparing implemented code against acceptance criteria.
 */

import {
    MatchReportGenerator,
    CriterionMatch,
    MatchReport,
    getMatchReportGenerator,
    resetMatchReportGeneratorForTests,
} from '../../../src/agents/verification/matchReport';

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import { logInfo } from '../../../src/logger';

describe('MatchReportGenerator', () => {
    let generator: MatchReportGenerator;

    const createMatch = (overrides?: Partial<CriterionMatch>): CriterionMatch => ({
        criterion: 'Test criterion',
        matched: true,
        confidence: 1.0,
        ...overrides,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        resetMatchReportGeneratorForTests();
        generator = new MatchReportGenerator();
    });

    afterEach(() => {
        generator.clear();
    });

    // ============================================================================
    // generateReport Tests
    // ============================================================================
    describe('generateReport()', () => {
        it('Test 1: should generate report with matched criteria', () => {
            const matches = [
                createMatch({ criterion: 'Criterion 1', matched: true }),
                createMatch({ criterion: 'Criterion 2', matched: true }),
            ];
            
            const report = generator.generateReport('task-1', ['Criterion 1', 'Criterion 2'], matches);
            
            expect(report.matched.length).toBe(2);
            expect(report.remaining.length).toBe(0);
        });

        it('Test 2: should identify remaining criteria', () => {
            const matches = [
                createMatch({ criterion: 'Criterion 1', matched: true }),
            ];
            
            const report = generator.generateReport('task-1', ['Criterion 1', 'Criterion 2'], matches);
            
            expect(report.remaining).toContain('Criterion 2');
        });

        it('Test 3: should calculate progress percentage', () => {
            const matches = [
                createMatch({ criterion: 'Criterion 1', matched: true }),
            ];
            
            const report = generator.generateReport('task-1', ['Criterion 1', 'Criterion 2'], matches);
            
            expect(report.progressPercent).toBe(50);
        });

        it('Test 4: should handle 100% progress', () => {
            const matches = [
                createMatch({ criterion: 'Criterion 1', matched: true }),
                createMatch({ criterion: 'Criterion 2', matched: true }),
            ];
            
            const report = generator.generateReport('task-1', ['Criterion 1', 'Criterion 2'], matches);
            
            expect(report.progressPercent).toBe(100);
        });

        it('Test 5: should handle 0% progress', () => {
            const matches: CriterionMatch[] = [];
            
            const report = generator.generateReport('task-1', ['Criterion 1'], matches);
            
            expect(report.progressPercent).toBe(0);
        });

        it('Test 6: should handle empty criteria', () => {
            const report = generator.generateReport('task-1', [], []);
            
            expect(report.progressPercent).toBe(0);
            expect(report.allCriteria.length).toBe(0);
        });

        it('Test 7: should identify partial matches', () => {
            const matches = [
                createMatch({ 
                    criterion: 'Should handle login, and logout, and session management',
                    matched: false, 
                    confidence: 0.5,
                    evidence: 'login feature implemented'
                }),
            ];
            
            const report = generator.generateReport('task-1', ['Should handle login, and logout, and session management'], matches);
            
            expect(report.partial.length).toBe(1);
        });

        it('Test 8: should exclude low confidence partial matches', () => {
            const matches = [
                createMatch({ 
                    criterion: 'Some criterion',
                    matched: false, 
                    confidence: 0.2 // Below 0.3 threshold
                }),
            ];
            
            const report = generator.generateReport('task-1', ['Some criterion'], matches);
            
            expect(report.partial.length).toBe(0);
        });

        it('Test 9: should set timestamp', () => {
            const before = Date.now();
            const report = generator.generateReport('task-1', ['c1'], []);
            const after = Date.now();
            
            expect(report.timestamp).toBeGreaterThanOrEqual(before);
            expect(report.timestamp).toBeLessThanOrEqual(after);
        });

        it('Test 10: should store report for retrieval', () => {
            generator.generateReport('task-1', ['c1'], []);
            
            const retrieved = generator.getReport('task-1');
            expect(retrieved).toBeDefined();
            expect(retrieved?.taskId).toBe('task-1');
        });

        it('Test 11: should log report generation', () => {
            generator.generateReport('task-1', ['c1', 'c2'], [createMatch({ criterion: 'c1' })]);
            
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('1/2 criteria matched'));
        });
    });

    // ============================================================================
    // analyzePartialMatch Tests (via generateReport)
    // ============================================================================
    describe('analyzePartialMatch (via generateReport)', () => {
        it('Test 12: should split criterion into components', () => {
            const matches = [
                createMatch({ 
                    criterion: 'Handle login, validate input, display errors',
                    matched: false, 
                    confidence: 0.5,
                    evidence: 'login implemented'
                }),
            ];
            
            const report = generator.generateReport('task-1', ['Handle login, validate input, display errors'], matches);
            const partial = report.partial[0];
            
            expect(partial).toBeDefined();
        });

        it('Test 13: should identify completed components from evidence', () => {
            const matches = [
                createMatch({ 
                    criterion: 'Handle login flow, logout, session management',
                    matched: false, 
                    confidence: 0.5,
                    evidence: 'login flow completed with tests'
                }),
            ];
            
            const report = generator.generateReport('task-1', matches.map(m => m.criterion), matches);
            const partial = report.partial[0];
            
            expect(partial.completed.length).toBeGreaterThan(0);
        });

        it('Test 14: should identify remaining components', () => {
            const matches = [
                createMatch({ 
                    criterion: 'Implement button; add validation; write tests',
                    matched: false, 
                    confidence: 0.5,
                    evidence: 'button done'
                }),
            ];
            
            const report = generator.generateReport('task-1', matches.map(m => m.criterion), matches);
            const partial = report.partial[0];
            
            expect(partial.remaining.length).toBeGreaterThan(0);
        });

        it('Test 15: should calculate partial progress', () => {
            const matches = [
                createMatch({ 
                    criterion: 'Complete step one and then step two and also step three',
                    matched: false, 
                    confidence: 0.5,
                    evidence: 'step one step two complete'
                }),
            ];
            
            const report = generator.generateReport('task-1', matches.map(m => m.criterion), matches);
            const partial = report.partial[0];
            
            expect(partial.progress).toBeGreaterThan(0);
        });

        it('Test 16: should use confidence for simple criteria', () => {
            const matches = [
                createMatch({ 
                    criterion: 'abc', // Too short to split (< 5 chars)
                    matched: false, 
                    confidence: 0.7
                }),
            ];
            
            const report = generator.generateReport('task-1', matches.map(m => m.criterion), matches);
            const partial = report.partial[0];
            
            expect(partial.progress).toBe(70);
        });
    });

    // ============================================================================
    // formatAsText Tests
    // ============================================================================
    describe('formatAsText()', () => {
        it('Test 17: should include task ID in header', () => {
            const report = generator.generateReport('my-task', ['c1'], []);
            
            const text = generator.formatAsText(report);
            
            expect(text).toContain('my-task');
        });

        it('Test 18: should include progress percentage', () => {
            const report = generator.generateReport('task-1', ['c1'], [createMatch({ criterion: 'c1' })]);
            
            const text = generator.formatAsText(report);
            
            expect(text).toContain('100%');
        });

        it('Test 19: should format matched section', () => {
            const report = generator.generateReport('task-1', ['c1'], [
                createMatch({ criterion: 'c1', satisfiedBy: 'test.ts' })
            ]);
            
            const text = generator.formatAsText(report);
            
            expect(text).toContain('✅ MATCHED');
            expect(text).toContain('✓ c1');
            expect(text).toContain('Satisfied by: test.ts');
        });

        it('Test 20: should format remaining section', () => {
            const report = generator.generateReport('task-1', ['c1', 'c2'], [
                createMatch({ criterion: 'c1' })
            ]);
            
            const text = generator.formatAsText(report);
            
            expect(text).toContain('❌ REMAINING');
            expect(text).toContain('○ c2');
        });

        it('Test 21: should format partial matches section', () => {
            const matches = [
                createMatch({ 
                    criterion: 'Handle login flow, validate input flow, display error flow',
                    matched: false, 
                    confidence: 0.5,
                    evidence: 'login done'
                }),
            ];
            
            const report = generator.generateReport('task-1', matches.map(m => m.criterion), matches);
            const text = generator.formatAsText(report);
            
            expect(text).toContain('🔄 PARTIAL MATCHES');
        });

        it('Test 22: should omit matched section if empty', () => {
            const report = generator.generateReport('task-1', ['c1'], []);
            
            const text = generator.formatAsText(report);
            
            expect(text).not.toContain('✅ MATCHED');
        });

        it('Test 23: should omit remaining section if empty', () => {
            const report = generator.generateReport('task-1', ['c1'], [createMatch({ criterion: 'c1' })]);
            
            const text = generator.formatAsText(report);
            
            expect(text).not.toContain('❌ REMAINING');
        });
    });

    // ============================================================================
    // formatAsMarkdown Tests
    // ============================================================================
    describe('formatAsMarkdown()', () => {
        it('Test 24: should include markdown headers', () => {
            const report = generator.generateReport('task-1', ['c1'], []);
            
            const md = generator.formatAsMarkdown(report);
            
            expect(md).toContain('# Match Report: task-1');
        });

        it('Test 25: should include progress with counts', () => {
            const report = generator.generateReport('task-1', ['c1', 'c2'], [
                createMatch({ criterion: 'c1' })
            ]);
            
            const md = generator.formatAsMarkdown(report);
            
            expect(md).toContain('1/2 criteria');
        });

        it('Test 26: should format matched as checkboxes', () => {
            const report = generator.generateReport('task-1', ['c1'], [
                createMatch({ criterion: 'c1' })
            ]);
            
            const md = generator.formatAsMarkdown(report);
            
            expect(md).toContain('- [x] c1');
        });

        it('Test 27: should format remaining as unchecked', () => {
            const report = generator.generateReport('task-1', ['c1', 'c2'], [
                createMatch({ criterion: 'c1' })
            ]);
            
            const md = generator.formatAsMarkdown(report);
            
            expect(md).toContain('- [ ] c2');
        });

        it('Test 28: should include satisfied by info', () => {
            const report = generator.generateReport('task-1', ['c1'], [
                createMatch({ criterion: 'c1', satisfiedBy: 'feature.ts' })
            ]);
            
            const md = generator.formatAsMarkdown(report);
            
            expect(md).toContain('Satisfied by: feature.ts');
        });

        it('Test 29: should format partial matches with subheaders', () => {
            const matches = [
                createMatch({ 
                    criterion: 'Handle auth and validate auth and process auth results',
                    matched: false, 
                    confidence: 0.5,
                    evidence: 'handle auth done'
                }),
            ];
            
            const report = generator.generateReport('task-1', matches.map(m => m.criterion), matches);
            const md = generator.formatAsMarkdown(report);
            
            expect(md).toContain('## 🔄 Partial Matches');
        });
    });

    // ============================================================================
    // getActionableItems Tests
    // ============================================================================
    describe('getActionableItems()', () => {
        it('Test 30: should list remaining criteria', () => {
            const report = generator.generateReport('task-1', ['c1', 'c2'], [
                createMatch({ criterion: 'c1' })
            ]);
            
            const items = generator.getActionableItems(report);
            
            expect(items).toContain('Implement: c2');
        });

        it('Test 31: should list remaining parts of partial matches', () => {
            const matches = [
                createMatch({ 
                    criterion: 'Add feature alpha and then feature Beta',
                    matched: false, 
                    confidence: 0.5,
                    evidence: 'feature alpha implemented'
                }),
            ];
            
            const report = generator.generateReport('task-1', matches.map(m => m.criterion), matches);
            const items = generator.getActionableItems(report);
            
            // Should have at least one "Complete:" item
            expect(items.some(i => i.startsWith('Complete:'))).toBe(true);
        });

        it('Test 32: should return empty for complete tasks', () => {
            const report = generator.generateReport('task-1', ['c1'], [
                createMatch({ criterion: 'c1' })
            ]);
            
            const items = generator.getActionableItems(report);
            
            expect(items.length).toBe(0);
        });
    });

    // ============================================================================
    // getReport Tests
    // ============================================================================
    describe('getReport()', () => {
        it('Test 33: should return undefined for unknown task', () => {
            const report = generator.getReport('unknown');
            
            expect(report).toBeUndefined();
        });

        it('Test 34: should return existing report', () => {
            generator.generateReport('task-1', ['c1'], []);
            
            const report = generator.getReport('task-1');
            
            expect(report).toBeDefined();
            expect(report?.taskId).toBe('task-1');
        });
    });

    // ============================================================================
    // updateReport Tests
    // ============================================================================
    describe('updateReport()', () => {
        it('Test 35: should return undefined for unknown task', () => {
            const result = generator.updateReport('unknown', []);
            
            expect(result).toBeUndefined();
        });

        it('Test 36: should merge new matches', () => {
            generator.generateReport('task-1', ['c1', 'c2'], [
                createMatch({ criterion: 'c1' })
            ]);
            
            const updated = generator.updateReport('task-1', [
                createMatch({ criterion: 'c2' })
            ]);
            
            expect(updated?.matched.length).toBe(2);
            expect(updated?.progressPercent).toBe(100);
        });

        it('Test 37: should not duplicate existing matches', () => {
            generator.generateReport('task-1', ['c1'], [
                createMatch({ criterion: 'c1' })
            ]);
            
            const updated = generator.updateReport('task-1', [
                createMatch({ criterion: 'c1' })
            ]);
            
            expect(updated?.matched.length).toBe(1);
        });

        it('Test 38: should ignore unmatched in update', () => {
            generator.generateReport('task-1', ['c1', 'c2'], [
                createMatch({ criterion: 'c1' })
            ]);
            
            const updated = generator.updateReport('task-1', [
                createMatch({ criterion: 'c2', matched: false })
            ]);
            
            expect(updated?.matched.length).toBe(1);
        });
    });

    // ============================================================================
    // clear Tests
    // ============================================================================
    describe('clear()', () => {
        it('Test 39: should clear all reports', () => {
            generator.generateReport('task-1', ['c1'], []);
            generator.generateReport('task-2', ['c2'], []);
            
            generator.clear();
            
            expect(generator.getReport('task-1')).toBeUndefined();
            expect(generator.getReport('task-2')).toBeUndefined();
        });
    });

    // ============================================================================
    // Singleton Tests
    // ============================================================================
    describe('singleton functions', () => {
        it('Test 40: getMatchReportGenerator should return singleton', () => {
            const instance1 = getMatchReportGenerator();
            const instance2 = getMatchReportGenerator();
            
            expect(instance1).toBe(instance2);
        });

        it('Test 41: resetMatchReportGeneratorForTests should reset', () => {
            const instance1 = getMatchReportGenerator();
            resetMatchReportGeneratorForTests();
            const instance2 = getMatchReportGenerator();
            
            expect(instance1).not.toBe(instance2);
        });
    });

    // ============================================================================
    // Edge Cases
    // ============================================================================
    describe('edge cases', () => {
        it('Test 42: should handle very long criteria', () => {
            const longCriterion = 'A'.repeat(500);
            const report = generator.generateReport('task-1', [longCriterion], []);
            
            expect(report.remaining).toContain(longCriterion);
        });

        it('Test 43: should handle special characters', () => {
            const criterion = 'Handle <html> tags & "quotes" properly';
            const report = generator.generateReport('task-1', [criterion], []);
            
            expect(report.remaining).toContain(criterion);
        });

        it('Test 44: should handle unicode criteria', () => {
            const criterion = 'Support 日本語 and émojis 🎉';
            const report = generator.generateReport('task-1', [criterion], [
                createMatch({ criterion })
            ]);
            
            expect(report.matched[0].criterion).toBe(criterion);
        });

        it('Test 45: should handle multiple reports for same task', () => {
            generator.generateReport('task-1', ['c1'], []);
            generator.generateReport('task-1', ['c1', 'c2'], [createMatch({ criterion: 'c1' })]);
            
            const report = generator.getReport('task-1');
            expect(report?.allCriteria.length).toBe(2);
        });
    });
});
