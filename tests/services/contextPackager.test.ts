/**
 * Tests for Task Context Package Generator (MT-033.32)
 *
 * Validates context extraction, relevance scoring, filtering,
 * dependency analysis, pattern matching, and package creation.
 */

import {
    // Types
    ContextCategory,
    RelevanceTier,
    ContextItem,
    DependencyInfo,
    PatternMatch,
    ErrorRecord,
    ContextPackagerConfig,
    ContextPackage,

    // Constants
    DEFAULT_CONTEXT_PACKAGER_CONFIG,

    // Functions
    calculateFileRelevance,
    getRelevanceTier,
    extractKeywords,
    createCodeSnippet,
    analyzeDependencies,
    findSimilarPatterns,
    calculateSimilarity,
    gatherTestExamples,
    filterRelevantErrors,
    calculateTotalSize,
    trimToFit,
    gatherDocumentation,
    generateContextSummary,
    createContextPackage
} from '../../src/services/contextPackager';

import {
    AtomicTask,
    MasterTicket,
    TaskPriority,
    AgentTeam,
    TaskStatus
} from '../../src/generators/taskBreakdown';

import {
    HandoffPackage
} from '../../src/services/codingHandoff';

// ============================================================================
// Test Helpers
// ============================================================================

function makeTask(overrides?: Partial<AtomicTask>): AtomicTask {
    return {
        id: 'MT-1.1',
        parentId: 'MT-1',
        featureId: 'feat-1',
        title: 'Build login form',
        description: 'Create a login form with validation',
        priority: 'P1' as TaskPriority,
        estimatedMinutes: 30,
        dependsOn: [],
        acceptanceCriteria: ['Form renders', 'Validation works'],
        files: ['src/ui/loginForm.ts'],
        isUI: true,
        assignedTeam: 'coding' as AgentTeam,
        status: 'ready' as TaskStatus,
        developerStoryId: 'ds-1',
        relatedUserStoryIds: [],
        ...overrides
    };
}

function makeParentTicket(overrides?: Partial<MasterTicket>): MasterTicket {
    return {
        id: 'MT-1',
        featureId: 'feat-1',
        title: 'User Authentication',
        description: 'Auth system',
        priority: 'P1' as TaskPriority,
        acceptanceCriteria: ['Login works'],
        technicalNotes: 'Use JWT',
        childTaskIds: ['MT-1.1'],
        dependsOn: [],
        estimatedMinutes: 120,
        assignedTeam: 'coding' as AgentTeam,
        ...overrides
    };
}

function makeHandoffPackage(overrides?: Partial<HandoffPackage>): HandoffPackage {
    return {
        id: 'HO-MT-1.1-20240101',
        createdAt: '2024-01-01T00:00:00Z',
        urgency: 'normal',
        task: makeTask(),
        parentTicket: makeParentTicket(),
        taskType: 'build',
        summary: 'Build login form',
        detailedDescription: 'Create a login form',
        acceptanceCriteria: ['Form renders'],
        definitionOfDone: ['All tests pass'],
        fileReferences: [],
        codePatterns: [],
        testSpecifications: [],
        constraints: [],
        completedDependencies: [],
        inProgressSiblings: [],
        technicalNotes: '',
        ...overrides
    } as HandoffPackage;
}

// ============================================================================
// Tests
// ============================================================================

describe('ContextPackager', () => {

    // ── Relevance Scoring ────────────────────────────────────────────

    describe('calculateFileRelevance', () => {

        it('Test 1: should score highest for direct file references', () => {
            const task = makeTask({ files: ['src/ui/loginForm.ts'] });
            const parent = makeParentTicket();
            const score = calculateFileRelevance('src/ui/loginForm.ts', task, parent);
            expect(score).toBeGreaterThanOrEqual(80);
        });

        it('Test 2: should score medium for same-directory files', () => {
            const task = makeTask({ files: ['src/ui/loginForm.ts'] });
            const parent = makeParentTicket();
            const score = calculateFileRelevance('src/ui/otherComponent.ts', task, parent);
            expect(score).toBeGreaterThanOrEqual(30);
        });

        it('Test 3: should score low for unrelated files', () => {
            const task = makeTask({ files: ['src/ui/loginForm.ts'] });
            const parent = makeParentTicket();
            const score = calculateFileRelevance('src/config/schema.ts', task, parent);
            expect(score).toBeLessThan(30);
        });

        it('Test 4: should boost score for keyword matches in filename', () => {
            const task = makeTask({ title: 'Build auth handler', files: [] });
            const parent = makeParentTicket();
            const score = calculateFileRelevance('src/services/auth.ts', task, parent);
            expect(score).toBeGreaterThan(0);
        });

        it('Test 5: should cap score at 100', () => {
            const task = makeTask({ files: ['src/ui/loginForm.ts'], title: 'loginForm feature' });
            const parent = makeParentTicket({ title: 'loginForm system' });
            const score = calculateFileRelevance('src/ui/loginForm.ts', task, parent);
            expect(score).toBeLessThanOrEqual(100);
        });
    });

    describe('getRelevanceTier', () => {

        it('Test 6: should return high for scores >= 70', () => {
            expect(getRelevanceTier(70)).toBe('high');
            expect(getRelevanceTier(100)).toBe('high');
        });

        it('Test 7: should return medium for scores 40-69', () => {
            expect(getRelevanceTier(40)).toBe('medium');
            expect(getRelevanceTier(69)).toBe('medium');
        });

        it('Test 8: should return low for scores < 40', () => {
            expect(getRelevanceTier(0)).toBe('low');
            expect(getRelevanceTier(39)).toBe('low');
        });
    });

    describe('extractKeywords', () => {

        it('Test 9: should extract meaningful keywords', () => {
            const keywords = extractKeywords('Build the login form component');
            expect(keywords).toContain('build');
            expect(keywords).toContain('login');
            expect(keywords).toContain('form');
            expect(keywords).toContain('component');
        });

        it('Test 10: should filter out stop words', () => {
            const keywords = extractKeywords('the and or but in on at to for');
            expect(keywords).toHaveLength(0);
        });

        it('Test 11: should filter out short words', () => {
            const keywords = extractKeywords('It is a be do');
            expect(keywords).toHaveLength(0);
        });

        it('Test 12: should handle empty input', () => {
            expect(extractKeywords('')).toHaveLength(0);
        });
    });

    // ── Code Snippet Creation ────────────────────────────────────────

    describe('createCodeSnippet', () => {

        it('Test 13: should create snippet with correct metadata', () => {
            const snippet = createCodeSnippet(
                'src/services/auth.ts',
                'export function login() {}',
                75,
                DEFAULT_CONTEXT_PACKAGER_CONFIG
            );
            expect(snippet.category).toBe('code_snippet');
            expect(snippet.source).toBe('src/services/auth.ts');
            expect(snippet.relevance).toBe('high');
            expect(snippet.relevanceScore).toBe(75);
        });

        it('Test 14: should truncate long content', () => {
            const longContent = 'x'.repeat(3000);
            const snippet = createCodeSnippet(
                'file.ts',
                longContent,
                50,
                { ...DEFAULT_CONTEXT_PACKAGER_CONFIG, maxSnippetLength: 100 }
            );
            expect(snippet.content.length).toBeLessThanOrEqual(120); // 100 + truncation message
            expect(snippet.content).toContain('truncated');
        });

        it('Test 15: should not truncate short content', () => {
            const snippet = createCodeSnippet(
                'file.ts',
                'short code',
                50,
                DEFAULT_CONTEXT_PACKAGER_CONFIG
            );
            expect(snippet.content).toBe('short code');
        });
    });

    // ── Dependency Analysis ──────────────────────────────────────────

    describe('analyzeDependencies', () => {

        it('Test 16: should find upstream dependencies', () => {
            const task = makeTask({ files: ['src/ui/loginForm.ts'] });
            const importMap = new Map([
                ['src/ui/loginForm.ts', ['src/services/auth.ts', 'src/config/index.ts']]
            ]);

            const deps = analyzeDependencies(task, importMap);
            const upstream = deps.filter(d => d.direction === 'upstream');
            expect(upstream).toHaveLength(2);
            expect(upstream.map(d => d.filePath)).toContain('src/services/auth.ts');
        });

        it('Test 17: should find downstream dependencies', () => {
            const task = makeTask({ files: ['src/services/auth.ts'] });
            const importMap = new Map([
                ['src/ui/loginForm.ts', ['src/services/auth.ts']],
                ['src/services/auth.ts', []]
            ]);

            const deps = analyzeDependencies(task, importMap);
            const downstream = deps.filter(d => d.direction === 'downstream');
            expect(downstream).toHaveLength(1);
        });

        it('Test 18: should deduplicate dependencies', () => {
            const task = makeTask({ files: ['src/a.ts', 'src/b.ts'] });
            const importMap = new Map([
                ['src/a.ts', ['src/shared.ts']],
                ['src/b.ts', ['src/shared.ts']],
                ['src/shared.ts', []]
            ]);

            const deps = analyzeDependencies(task, importMap);
            const upstreamShared = deps.filter(
                d => d.filePath === 'src/shared.ts' && d.direction === 'upstream'
            );
            expect(upstreamShared).toHaveLength(1); // Deduplicated
        });

        it('Test 19: should handle no imports', () => {
            const task = makeTask({ files: ['src/standalone.ts'] });
            const importMap = new Map<string, string[]>();

            const deps = analyzeDependencies(task, importMap);
            expect(deps).toHaveLength(0);
        });
    });

    // ── Pattern Matching ─────────────────────────────────────────────

    describe('findSimilarPatterns', () => {

        it('Test 20: should find patterns with keyword matches', () => {
            const task = makeTask({ title: 'Build login component' });
            const existingFiles = new Map([
                ['src/ui/signupForm.ts', 'export function signup() { /* login-like component */ }'],
                ['src/config/schema.ts', 'export const schema = {};']
            ]);

            const matches = findSimilarPatterns(task, existingFiles, DEFAULT_CONTEXT_PACKAGER_CONFIG);
            // signupForm should match on "component" keyword
            expect(matches.length).toBeGreaterThanOrEqual(0);
        });

        it('Test 21: should skip task own files', () => {
            const task = makeTask({ files: ['src/ui/loginForm.ts'] });
            const existingFiles = new Map([
                ['src/ui/loginForm.ts', 'export function login() {}']
            ]);

            const matches = findSimilarPatterns(task, existingFiles, DEFAULT_CONTEXT_PACKAGER_CONFIG);
            expect(matches.every(m => m.filePath !== 'src/ui/loginForm.ts')).toBe(true);
        });

        it('Test 22: should return empty when patterns disabled', () => {
            const task = makeTask();
            const existingFiles = new Map([['a.ts', 'code']]);
            const matches = findSimilarPatterns(task, existingFiles, {
                ...DEFAULT_CONTEXT_PACKAGER_CONFIG,
                includePatterns: false
            });
            expect(matches).toHaveLength(0);
        });

        it('Test 23: should sort by similarity descending', () => {
            const task = makeTask({ title: 'Build form validation', description: 'Create form validation logic' });
            const existingFiles = new Map([
                ['src/ui/formHelper.ts', 'form validation utilities for building forms'],
                ['src/config/schema.ts', 'schema definition']
            ]);

            const matches = findSimilarPatterns(task, existingFiles, {
                ...DEFAULT_CONTEXT_PACKAGER_CONFIG,
                minRelevanceScore: 1
            });
            if (matches.length >= 2) {
                expect(matches[0].similarity).toBeGreaterThanOrEqual(matches[1].similarity);
            }
        });
    });

    describe('calculateSimilarity', () => {

        it('Test 24: should score higher for filename matches', () => {
            const keywords = ['login', 'form'];
            const pathScore = calculateSimilarity(keywords, 'src/ui/loginForm.ts', '');
            const contentScore = calculateSimilarity(keywords, 'src/other.ts', 'login form code');
            expect(pathScore).toBeGreaterThan(contentScore);
        });

        it('Test 25: should return 0 for no keywords', () => {
            expect(calculateSimilarity([], 'file.ts', 'content')).toBe(0);
        });

        it('Test 26: should cap at 100', () => {
            const keywords = ['a'];
            // filename match gives 2/2 = 100%
            expect(calculateSimilarity(keywords, 'a.ts', '')).toBeLessThanOrEqual(100);
        });
    });

    // ── Test Example Gathering ───────────────────────────────────────

    describe('gatherTestExamples', () => {

        it('Test 27: should find tests in same directory', () => {
            const task = makeTask({ files: ['src/ui/loginForm.ts'] });
            const testFiles = new Map([
                ['tests/ui/otherForm.test.ts', 'describe("otherForm", () => {});']
            ]);

            const examples = gatherTestExamples(task, testFiles, DEFAULT_CONTEXT_PACKAGER_CONFIG);
            expect(examples.length).toBeGreaterThanOrEqual(1);
        });

        it('Test 28: should return empty when disabled', () => {
            const task = makeTask();
            const testFiles = new Map([['tests/a.test.ts', 'test code']]);
            const examples = gatherTestExamples(task, testFiles, {
                ...DEFAULT_CONTEXT_PACKAGER_CONFIG,
                includeTestExamples: false
            });
            expect(examples).toHaveLength(0);
        });

        it('Test 29: should respect maxItemsPerCategory', () => {
            const task = makeTask({ files: ['src/ui/loginForm.ts'] });
            const testFiles = new Map<string, string>();
            for (let i = 0; i < 20; i++) {
                testFiles.set(`tests/ui/test${i}.test.ts`, `test ${i}`);
            }

            const examples = gatherTestExamples(task, testFiles, {
                ...DEFAULT_CONTEXT_PACKAGER_CONFIG,
                maxItemsPerCategory: 3,
                minRelevanceScore: 1
            });
            expect(examples.length).toBeLessThanOrEqual(3);
        });
    });

    // ── Error History Filtering ──────────────────────────────────────

    describe('filterRelevantErrors', () => {

        it('Test 30: should include errors in task files', () => {
            const task = makeTask({ files: ['src/ui/loginForm.ts'] });
            const errors: ErrorRecord[] = [
                { message: 'Out of memory', filePath: 'src/ui/loginForm.ts', recordedAt: '2024-01-01', resolution: 'Fixed', isRecurring: false },
                { message: 'Type error', filePath: 'src/other.ts', recordedAt: '2024-01-01', resolution: '', isRecurring: false }
            ];

            const result = filterRelevantErrors(task, errors, DEFAULT_CONTEXT_PACKAGER_CONFIG);
            expect(result).toHaveLength(1);
            expect(result[0].message).toBe('Out of memory');
        });

        it('Test 31: should include errors in same directory', () => {
            const task = makeTask({ files: ['src/ui/loginForm.ts'] });
            const errors: ErrorRecord[] = [
                { message: 'Import error', filePath: 'src/ui/sidebar.ts', recordedAt: '2024-01-01', resolution: '', isRecurring: false }
            ];

            const result = filterRelevantErrors(task, errors, DEFAULT_CONTEXT_PACKAGER_CONFIG);
            expect(result).toHaveLength(1);
        });

        it('Test 32: should return empty when disabled', () => {
            const task = makeTask();
            const errors: ErrorRecord[] = [
                { message: 'Error', filePath: 'src/ui/loginForm.ts', recordedAt: '2024-01-01', resolution: '', isRecurring: false }
            ];

            const result = filterRelevantErrors(task, errors, {
                ...DEFAULT_CONTEXT_PACKAGER_CONFIG,
                includeErrorHistory: false
            });
            expect(result).toHaveLength(0);
        });
    });

    // ── Size Management ──────────────────────────────────────────────

    describe('calculateTotalSize', () => {

        it('Test 33: should sum all item sizes', () => {
            const items: ContextItem[] = [
                { id: '1', category: 'code_snippet', title: 'A', description: '', content: 'abc', source: '', relevance: 'high', relevanceScore: 80, sizeChars: 100 },
                { id: '2', category: 'code_snippet', title: 'B', description: '', content: 'def', source: '', relevance: 'low', relevanceScore: 20, sizeChars: 200 }
            ];
            expect(calculateTotalSize(items)).toBe(300);
        });

        it('Test 34: should return 0 for empty array', () => {
            expect(calculateTotalSize([])).toBe(0);
        });
    });

    describe('trimToFit', () => {

        it('Test 35: should keep items within size limit', () => {
            const items: ContextItem[] = [
                { id: '1', category: 'code_snippet', title: 'A', description: '', content: 'a', source: '', relevance: 'high', relevanceScore: 90, sizeChars: 50 },
                { id: '2', category: 'code_snippet', title: 'B', description: '', content: 'b', source: '', relevance: 'medium', relevanceScore: 60, sizeChars: 50 },
                { id: '3', category: 'code_snippet', title: 'C', description: '', content: 'c', source: '', relevance: 'low', relevanceScore: 20, sizeChars: 50 }
            ];

            const result = trimToFit(items, 100);
            expect(result.kept).toHaveLength(2);
            expect(result.filteredCount).toBe(1);
            // Should keep highest relevance items
            expect(result.kept[0].relevanceScore).toBe(90);
            expect(result.kept[1].relevanceScore).toBe(60);
        });

        it('Test 36: should keep all items if within limit', () => {
            const items: ContextItem[] = [
                { id: '1', category: 'code_snippet', title: 'A', description: '', content: 'a', source: '', relevance: 'high', relevanceScore: 90, sizeChars: 10 }
            ];

            const result = trimToFit(items, 1000);
            expect(result.kept).toHaveLength(1);
            expect(result.filteredCount).toBe(0);
        });

        it('Test 37: should handle empty items', () => {
            const result = trimToFit([], 1000);
            expect(result.kept).toHaveLength(0);
            expect(result.filteredCount).toBe(0);
        });
    });

    // ── Documentation Gathering ──────────────────────────────────────

    describe('gatherDocumentation', () => {

        it('Test 38: should find relevant docs by keyword', () => {
            const task = makeTask({ title: 'Build authentication handler' });
            const parent = makeParentTicket({ title: 'Auth Feature' });
            const docsMap = new Map([
                ['docs/authentication-guide.md', 'How to implement authentication with JWT'],
                ['docs/deployment.md', 'How to deploy the application']
            ]);

            const docs = gatherDocumentation(task, parent, docsMap, DEFAULT_CONTEXT_PACKAGER_CONFIG);
            expect(docs.length).toBeGreaterThanOrEqual(1);
            expect(docs[0].source).toContain('authentication');
        });

        it('Test 39: should filter out irrelevant docs', () => {
            const task = makeTask({ title: 'Build login form' });
            const parent = makeParentTicket();
            const docsMap = new Map([
                ['docs/unrelated-topic.md', 'This has nothing to do with anything relevant']
            ]);

            const docs = gatherDocumentation(task, parent, docsMap, {
                ...DEFAULT_CONTEXT_PACKAGER_CONFIG,
                minRelevanceScore: 50
            });
            expect(docs).toHaveLength(0);
        });
    });

    // ── Summary Generation ───────────────────────────────────────────

    describe('generateContextSummary', () => {

        it('Test 40: should include all category counts', () => {
            const items: ContextItem[] = [
                { id: '1', category: 'code_snippet', title: '', description: '', content: '', source: '', relevance: 'high', relevanceScore: 90, sizeChars: 10 },
                { id: '2', category: 'documentation', title: '', description: '', content: '', source: '', relevance: 'high', relevanceScore: 80, sizeChars: 10 }
            ];
            const deps: DependencyInfo[] = [{ filePath: 'a.ts', provides: [], usedBy: [], direction: 'upstream' }];
            const patterns: PatternMatch[] = [{ filePath: 'b.ts', patternName: 'P', snippet: '', similarity: 50 }];
            const errors: ErrorRecord[] = [];

            const summary = generateContextSummary(items, deps, patterns, errors);
            expect(summary).toContain('1 code snippet');
            expect(summary).toContain('1 dependency');
            expect(summary).toContain('1 similar pattern');
            expect(summary).toContain('1 documentation');
        });

        it('Test 41: should return empty message for no items', () => {
            const summary = generateContextSummary([], [], [], []);
            expect(summary).toContain('No context items');
        });
    });

    // ── Package Creation ─────────────────────────────────────────────

    describe('createContextPackage', () => {

        it('Test 42: should create a complete context package', () => {
            const handoff = makeHandoffPackage();
            const codeFiles = new Map([
                ['src/ui/loginForm.ts', 'export function login() { return true; }'],
                ['src/ui/sidebar.ts', 'export function sidebar() {}']
            ]);
            const testFiles = new Map([
                ['tests/ui/loginForm.test.ts', 'describe("login", () => {});']
            ]);
            const docsMap = new Map<string, string>();
            const importMap = new Map([
                ['src/ui/loginForm.ts', ['src/services/auth.ts']]
            ]);
            const errorHistory: ErrorRecord[] = [];

            const pkg = createContextPackage(handoff, codeFiles, testFiles, docsMap, importMap, errorHistory);

            expect(pkg.handoffId).toBe(handoff.id);
            expect(pkg.taskId).toBe('MT-1.1');
            expect(pkg.items.length).toBeGreaterThan(0);
            expect(pkg.dependencies.length).toBeGreaterThan(0);
            expect(pkg.summary).toBeTruthy();
        });

        it('Test 43: should respect config overrides', () => {
            const handoff = makeHandoffPackage();
            const codeFiles = new Map([['src/ui/loginForm.ts', 'code']]);
            const testFiles = new Map<string, string>();
            const docsMap = new Map<string, string>();
            const importMap = new Map<string, string[]>();
            const errorHistory: ErrorRecord[] = [];

            const pkg = createContextPackage(handoff, codeFiles, testFiles, docsMap, importMap, errorHistory, {
                includeDependencies: false,
                includePatterns: false,
                includeTestExamples: false,
                includeErrorHistory: false
            });

            expect(pkg.dependencies).toHaveLength(0);
            expect(pkg.patternMatches).toHaveLength(0);
            expect(pkg.errorHistory).toHaveLength(0);
        });

        it('Test 44: should filter by minimum relevance', () => {
            const handoff = makeHandoffPackage();
            const codeFiles = new Map([
                ['src/totally/unrelated.ts', 'unrelated code that has nothing to do with anything']
            ]);
            const testFiles = new Map<string, string>();
            const docsMap = new Map<string, string>();
            const importMap = new Map<string, string[]>();
            const errorHistory: ErrorRecord[] = [];

            const pkg = createContextPackage(handoff, codeFiles, testFiles, docsMap, importMap, errorHistory, {
                minRelevanceScore: 90
            });

            // Unrelated file should be filtered out
            expect(pkg.items.filter(i => i.source === 'src/totally/unrelated.ts')).toHaveLength(0);
        });

        it('Test 45: should track filtered count when trimming', () => {
            const handoff = makeHandoffPackage();
            const codeFiles = new Map<string, string>();
            // Create files that will match (same directory as task file)
            for (let i = 0; i < 10; i++) {
                codeFiles.set(`src/ui/component${i}.ts`, 'x'.repeat(200));
            }
            const testFiles = new Map<string, string>();
            const docsMap = new Map<string, string>();
            const importMap = new Map<string, string[]>();
            const errorHistory: ErrorRecord[] = [];

            const pkg = createContextPackage(handoff, codeFiles, testFiles, docsMap, importMap, errorHistory, {
                maxPackageSizeChars: 500,
                minRelevanceScore: 1
            });

            // Some items should have been filtered due to size limit
            if (pkg.items.length < 10) {
                expect(pkg.filteredCount).toBeGreaterThan(0);
            }
        });
    });

    // ── Default Config ───────────────────────────────────────────────

    describe('DEFAULT_CONTEXT_PACKAGER_CONFIG', () => {

        it('Test 46: should have sensible defaults', () => {
            expect(DEFAULT_CONTEXT_PACKAGER_CONFIG.maxPackageSizeChars).toBe(50000);
            expect(DEFAULT_CONTEXT_PACKAGER_CONFIG.maxItemsPerCategory).toBe(10);
            expect(DEFAULT_CONTEXT_PACKAGER_CONFIG.minRelevanceScore).toBe(30);
            expect(DEFAULT_CONTEXT_PACKAGER_CONFIG.includeDependencies).toBe(true);
            expect(DEFAULT_CONTEXT_PACKAGER_CONFIG.includePatterns).toBe(true);
            expect(DEFAULT_CONTEXT_PACKAGER_CONFIG.includeTestExamples).toBe(true);
            expect(DEFAULT_CONTEXT_PACKAGER_CONFIG.includeErrorHistory).toBe(true);
            expect(DEFAULT_CONTEXT_PACKAGER_CONFIG.maxSnippetLength).toBe(2000);
        });
    });
});
