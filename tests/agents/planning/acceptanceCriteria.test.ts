/**
 * @file Tests for AcceptanceCriteria Generator
 */

// Mock vscode before any imports
jest.mock('vscode', () => ({
    EventEmitter: jest.fn().mockImplementation(() => ({
        event: jest.fn(),
        fire: jest.fn()
    })),
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn()
    }
}), { virtual: true });

// Mock logger
const mockLogInfo = jest.fn();
const mockLogError = jest.fn();
const mockLogWarn = jest.fn();
jest.mock('../../../src/logger', () => ({
    logInfo: (...args: unknown[]) => mockLogInfo(...args),
    logError: (...args: unknown[]) => mockLogError(...args),
    logWarn: (...args: unknown[]) => mockLogWarn(...args)
}));

// Mock LLM service
const mockCompleteLLM = jest.fn();
jest.mock('../../../src/services/llmService', () => ({
    completeLLM: (...args: unknown[]) => mockCompleteLLM(...args)
}));

import {
    AcceptanceCriteriaGenerator,
    getAcceptanceCriteriaGenerator,
    resetAcceptanceCriteriaGeneratorForTests,
    type AcceptanceCriteriaConfig,
    type GeneratedCriteria,
    type SMARTValidation
} from '../../../src/agents/planning/acceptanceCriteria';
import type { AtomicTask } from '../../../src/agents/planning/decomposer';

describe('AcceptanceCriteriaGenerator', () => {
    let generator: AcceptanceCriteriaGenerator;

    const createMockTask = (overrides: Partial<AtomicTask> = {}): AtomicTask => ({
        id: 'task-1',
        featureId: 'feature-1',
        title: 'Implement user authentication',
        description: 'Add login and logout functionality',
        files: ['src/auth.ts', 'src/user.ts'],
        estimateMinutes: 60,
        dependsOn: [],
        blocks: [],
        acceptanceCriteria: ['Users can log in', 'Users can log out'],
        patterns: [],
        isUI: false,
        priority: 'P1' as const,
        status: 'pending' as const,
        ...overrides
    });

    beforeEach(() => {
        jest.clearAllMocks();
        resetAcceptanceCriteriaGeneratorForTests();
        generator = new AcceptanceCriteriaGenerator();
    });

    describe('constructor', () => {
        it('Test 1: should create generator with default config', () => {
            const g = new AcceptanceCriteriaGenerator();
            expect(g).toBeInstanceOf(AcceptanceCriteriaGenerator);
        });

        it('Test 2: should create generator with custom config', () => {
            const config: Partial<AcceptanceCriteriaConfig> = {
                minCriteria: 5,
                maxCriteria: 10
            };
            const g = new AcceptanceCriteriaGenerator(config);
            expect(g).toBeInstanceOf(AcceptanceCriteriaGenerator);
        });
    });

    describe('generateCriteria', () => {
        it('Test 3: should generate criteria using LLM', async () => {
            const llmResponse = `CRITERION: Users should be able to log in with valid credentials
TYPE: functional
AUTOMATABLE: yes
TEST_METHOD: unit

CRITERION: Login should fail with invalid credentials
TYPE: behavioral
AUTOMATABLE: yes
TEST_METHOD: unit`;

            mockCompleteLLM.mockResolvedValueOnce({ content: llmResponse });

            const task = createMockTask();
            const result = await generator.generateCriteria(task);

            expect(result.taskId).toBe('task-1');
            expect(result.criteria.length).toBeGreaterThanOrEqual(2);
            expect(mockLogInfo).toHaveBeenCalled();
        });

        it('Test 4: should use fallback when LLM fails', async () => {
            mockCompleteLLM.mockRejectedValueOnce(new Error('LLM unavailable'));

            const task = createMockTask();
            const result = await generator.generateCriteria(task);

            expect(result.taskId).toBe('task-1');
            expect(result.criteria.length).toBeGreaterThanOrEqual(3); // min criteria
        });

        it('Test 5: should include edge case when configured', async () => {
            const g = new AcceptanceCriteriaGenerator({ includeEdgeCases: true });
            mockCompleteLLM.mockRejectedValueOnce(new Error('LLM unavailable'));

            const task = createMockTask();
            const result = await g.generateCriteria(task);

            const hasEdgeCase = result.criteria.some((c: GeneratedCriteria) => c.type === 'edge-case');
            expect(hasEdgeCase).toBe(true);
        });

        it('Test 6: should calculate coverage score', async () => {
            mockCompleteLLM.mockRejectedValueOnce(new Error('LLM unavailable'));

            const task = createMockTask();
            const result = await generator.generateCriteria(task);

            expect(result.coverageScore).toBeGreaterThanOrEqual(0);
            expect(result.coverageScore).toBeLessThanOrEqual(100);
        });
    });

    describe('SMART validation', () => {
        it('Test 7: should detect specific criteria', async () => {
            // Use validateExisting to access SMART validation
            const task = createMockTask({
                acceptanceCriteria: ['The function should return a valid user object']
            });
            const validations = generator.validateExisting(task);

            expect(validations[0].isSpecific).toBe(true);
        });

        it('Test 8: should detect vague criteria', () => {
            const task = createMockTask({
                acceptanceCriteria: ['The feature should be nice and fast']
            });
            const validations = generator.validateExisting(task);

            expect(validations[0].isSpecific).toBe(false);
        });

        it('Test 9: should detect measurable criteria', () => {
            const task = createMockTask({
                acceptanceCriteria: ['The function should return 200 status code']
            });
            const validations = generator.validateExisting(task);

            expect(validations[0].isMeasurable).toBe(true);
        });

        it('Test 10: should detect achievable criteria (short)', () => {
            const task = createMockTask({
                acceptanceCriteria: ['Login should work']
            });
            const validations = generator.validateExisting(task);

            expect(validations[0].isAchievable).toBe(true);
        });

        it('Test 11: should flag complex criteria as not achievable', () => {
            const task = createMockTask({
                acceptanceCriteria: ['The system should implement comprehensive user authentication and authorization and session management and token refresh and password reset and two-factor authentication and single sign-on and OAuth integration together']
            });
            const validations = generator.validateExisting(task);

            expect(validations[0].isAchievable).toBe(false);
        });

        it('Test 12: should detect relevant criteria (dev-related)', () => {
            const task = createMockTask({
                acceptanceCriteria: ['The function should create a new user record']
            });
            const validations = generator.validateExisting(task);

            expect(validations[0].isRelevant).toBe(true);
        });

        it('Test 13: should detect time-bound criteria (when/then)', () => {
            const task = createMockTask({
                acceptanceCriteria: ['When user logs in, then a session token should be created']
            });
            const validations = generator.validateExisting(task);

            expect(validations[0].isTimeBound).toBe(true);
        });

        it('Test 14: should calculate SMART score', () => {
            const task = createMockTask({
                acceptanceCriteria: ['When the function is called with valid data, the method should return a success status']
            });
            const validations = generator.validateExisting(task);

            expect(validations[0].score).toBeGreaterThan(0);
            expect(validations[0].score).toBeLessThanOrEqual(1);
        });

        it('Test 15: should provide suggestions for improvements', () => {
            const task = createMockTask({
                acceptanceCriteria: ['Make it better']
            });
            const validations = generator.validateExisting(task);

            expect(validations[0].suggestions.length).toBeGreaterThan(0);
        });
    });

    describe('validateExisting', () => {
        it('Test 16: should validate all existing criteria', () => {
            const task = createMockTask({
                acceptanceCriteria: ['Criterion 1', 'Criterion 2', 'Criterion 3']
            });
            const validations = generator.validateExisting(task);

            expect(validations.length).toBe(3);
        });

        it('Test 17: should return empty array for empty criteria', () => {
            const task = createMockTask({ acceptanceCriteria: [] });
            const validations = generator.validateExisting(task);

            expect(validations).toEqual([]);
        });
    });

    describe('enhanceExisting', () => {
        it('Test 18: should return unchanged task if criteria are good', async () => {
            const task = createMockTask({
                acceptanceCriteria: [
                    'When the user submits the form, the function should create a new record',
                    'The method should return an error when given invalid input'
                ]
            });

            // High score criteria should not trigger enhancement
            const g = new AcceptanceCriteriaGenerator({ minSmartScore: 0.2 });
            const result = await g.enhanceExisting(task);

            expect(result.acceptanceCriteria).toEqual(task.acceptanceCriteria);
        });

        it('Test 19: should generate new criteria for low-score items', async () => {
            const g = new AcceptanceCriteriaGenerator({ minSmartScore: 1.0 }); // Very high threshold
            mockCompleteLLM.mockRejectedValueOnce(new Error('LLM unavailable'));

            const task = createMockTask({
                acceptanceCriteria: ['Make it work']
            });

            const result = await g.enhanceExisting(task);

            // Should have enhanced/replaced criteria
            expect(result.acceptanceCriteria.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('parsing LLM responses', () => {
        it('Test 20: should parse functional type', async () => {
            const llmResponse = `CRITERION: The function should validate input
TYPE: functional
AUTOMATABLE: yes
TEST_METHOD: unit`;

            mockCompleteLLM.mockResolvedValueOnce({ content: llmResponse });

            const task = createMockTask();
            const result = await generator.generateCriteria(task);

            // First parsed criterion should be functional
            const functional = result.criteria.find((c: GeneratedCriteria) => c.text.includes('validate'));
            expect(functional?.type).toBe('functional');
        });

        it('Test 21: should parse behavioral type', async () => {
            const llmResponse = `CRITERION: System should log user actions
TYPE: behavioral
AUTOMATABLE: yes
TEST_METHOD: integration`;

            mockCompleteLLM.mockResolvedValueOnce({ content: llmResponse });

            const task = createMockTask();
            const result = await generator.generateCriteria(task);

            const behavioral = result.criteria.find((c: GeneratedCriteria) => c.text.includes('log'));
            expect(behavioral?.type).toBe('behavioral');
        });

        it('Test 22: should parse performance type', async () => {
            const llmResponse = `CRITERION: Response time should be under 200ms
TYPE: performance
AUTOMATABLE: yes
TEST_METHOD: unit`;

            mockCompleteLLM.mockResolvedValueOnce({ content: llmResponse });

            const task = createMockTask();
            const result = await generator.generateCriteria(task);

            const performance = result.criteria.find((c: GeneratedCriteria) => c.text.includes('200ms'));
            expect(performance?.type).toBe('performance');
        });

        it('Test 23: should parse edge-case type', async () => {
            const llmResponse = `CRITERION: Handle null input gracefully
TYPE: edge-case
AUTOMATABLE: yes
TEST_METHOD: unit`;

            mockCompleteLLM.mockResolvedValueOnce({ content: llmResponse });

            const task = createMockTask();
            const result = await generator.generateCriteria(task);

            const edgeCase = result.criteria.find((c: GeneratedCriteria) => c.text.includes('null'));
            expect(edgeCase?.type).toBe('edge-case');
        });

        it('Test 24: should parse quality type', async () => {
            const llmResponse = `CRITERION: Code coverage should be above 80%
TYPE: quality
AUTOMATABLE: yes
TEST_METHOD: unit`;

            mockCompleteLLM.mockResolvedValueOnce({ content: llmResponse });

            const task = createMockTask();
            const result = await generator.generateCriteria(task);

            const quality = result.criteria.find((c: GeneratedCriteria) => c.text.includes('coverage'));
            expect(quality?.type).toBe('quality');
        });

        it('Test 25: should parse automatable flag', async () => {
            const llmResponse = `CRITERION: Check visual rendering
TYPE: functional
AUTOMATABLE: no
TEST_METHOD: manual`;

            mockCompleteLLM.mockResolvedValueOnce({ content: llmResponse });

            const task = createMockTask();
            const result = await generator.generateCriteria(task);

            const criterion = result.criteria.find((c: GeneratedCriteria) => c.text.includes('visual'));
            expect(criterion?.isAutomatable).toBe(false);
        });

        it('Test 26: should parse test method as visual', async () => {
            const llmResponse = `CRITERION: UI renders correctly
TYPE: functional
AUTOMATABLE: yes
TEST_METHOD: visual`;

            mockCompleteLLM.mockResolvedValueOnce({ content: llmResponse });

            const task = createMockTask({ isUI: true });
            const result = await generator.generateCriteria(task);

            const criterion = result.criteria.find((c: GeneratedCriteria) => c.text.includes('renders'));
            expect(criterion?.testMethod).toBe('visual');
        });

        it('Test 27: should parse test method as integration', async () => {
            const llmResponse = `CRITERION: API call succeeds
TYPE: functional
AUTOMATABLE: yes
TEST_METHOD: integration`;

            mockCompleteLLM.mockResolvedValueOnce({ content: llmResponse });

            const task = createMockTask();
            const result = await generator.generateCriteria(task);

            const criterion = result.criteria.find((c: GeneratedCriteria) => c.text.includes('API'));
            expect(criterion?.testMethod).toBe('integration');
        });
    });

    describe('coverage calculation', () => {
        it('Test 28: should give points for functional criteria', async () => {
            const llmResponse = `CRITERION: Create user record
TYPE: functional
AUTOMATABLE: yes
TEST_METHOD: unit`;

            mockCompleteLLM.mockResolvedValueOnce({ content: llmResponse });

            const task = createMockTask();
            const result = await generator.generateCriteria(task);

            expect(result.coverageScore).toBeGreaterThanOrEqual(40);
        });

        it('Test 29: should identify missing areas', async () => {
            // With rule-based generation (no edge case initially)
            mockCompleteLLM.mockRejectedValueOnce(new Error('LLM unavailable'));

            const g = new AcceptanceCriteriaGenerator({ includeEdgeCases: false });
            const task = createMockTask();
            const result = await g.generateCriteria(task);

            // May have missing areas depending on generated criteria
            expect(result.missingAreas).toBeDefined();
        });
    });

    describe('UI task handling', () => {
        it('Test 30: should generate UI-specific criteria for UI tasks', async () => {
            mockCompleteLLM.mockRejectedValueOnce(new Error('LLM unavailable'));

            const task = createMockTask({ isUI: true });
            const result = await generator.generateCriteria(task);

            const hasUIRelated = result.criteria.some((c: GeneratedCriteria) =>
                c.text.toLowerCase().includes('render') ||
                c.text.toLowerCase().includes('component') ||
                c.text.toLowerCase().includes('ui')
            );
            expect(hasUIRelated).toBe(true);
        });

        it('Test 31: should include visual test method for UI tasks', async () => {
            mockCompleteLLM.mockRejectedValueOnce(new Error('LLM unavailable'));

            const task = createMockTask({ isUI: true });
            const result = await generator.generateCriteria(task);

            const hasVisualTest = result.criteria.some((c: GeneratedCriteria) => c.testMethod === 'visual');
            expect(hasVisualTest).toBe(true);
        });
    });

    describe('edge case criteria', () => {
        it('Test 32: should generate edge case for UI tasks', async () => {
            const g = new AcceptanceCriteriaGenerator({ includeEdgeCases: true });
            mockCompleteLLM.mockRejectedValueOnce(new Error('LLM unavailable'));

            const task = createMockTask({ isUI: true });
            const result = await g.generateCriteria(task);

            const edgeCase = result.criteria.find((c: GeneratedCriteria) => c.type === 'edge-case');
            expect(edgeCase?.text).toContain('empty');
        });

        it('Test 33: should generate edge case for non-UI tasks', async () => {
            const g = new AcceptanceCriteriaGenerator({ includeEdgeCases: true });
            mockCompleteLLM.mockRejectedValueOnce(new Error('LLM unavailable'));

            const task = createMockTask({ isUI: false });
            const result = await g.generateCriteria(task);

            const edgeCase = result.criteria.find((c: GeneratedCriteria) => c.type === 'edge-case');
            expect(edgeCase?.text).toContain('null');
        });
    });

    describe('singleton functions', () => {
        it('Test 34: getAcceptanceCriteriaGenerator should create instance', () => {
            resetAcceptanceCriteriaGeneratorForTests();
            const g = getAcceptanceCriteriaGenerator();

            expect(g).toBeInstanceOf(AcceptanceCriteriaGenerator);
        });

        it('Test 35: getAcceptanceCriteriaGenerator should return same instance', () => {
            resetAcceptanceCriteriaGeneratorForTests();
            const g1 = getAcceptanceCriteriaGenerator();
            const g2 = getAcceptanceCriteriaGenerator();

            expect(g1).toBe(g2);
        });

        it('Test 36: resetAcceptanceCriteriaGeneratorForTests should clear instance', () => {
            const g1 = getAcceptanceCriteriaGenerator();
            resetAcceptanceCriteriaGeneratorForTests();
            const g2 = getAcceptanceCriteriaGenerator();

            expect(g1).not.toBe(g2);
        });
    });

    describe('criteria limits', () => {
        it('Test 37: should respect minCriteria', async () => {
            const g = new AcceptanceCriteriaGenerator({ minCriteria: 5 });
            mockCompleteLLM.mockResolvedValueOnce({ content: 'CRITERION: Test\nTYPE: functional\nAUTOMATABLE: yes\nTEST_METHOD: unit' });

            const task = createMockTask();
            const result = await g.generateCriteria(task);

            expect(result.criteria.length).toBeGreaterThanOrEqual(5);
        });

        it('Test 38: should respect maxCriteria', async () => {
            const g = new AcceptanceCriteriaGenerator({ maxCriteria: 3, minCriteria: 1 });
            const llmResponse = Array(10).fill(`CRITERION: Test criterion
TYPE: functional
AUTOMATABLE: yes
TEST_METHOD: unit`).join('\n\n');

            mockCompleteLLM.mockResolvedValueOnce({ content: llmResponse });

            const task = createMockTask();
            const result = await g.generateCriteria(task);

            expect(result.criteria.length).toBeLessThanOrEqual(3);
        });
    });

    describe('error handling', () => {
        it('Test 39: should handle complete generation failure', async () => {
            mockCompleteLLM.mockRejectedValueOnce(new Error('Network error'));

            const task = createMockTask();
            const result = await generator.generateCriteria(task);

            // Should return fallback result with rule-based criteria
            expect(result.taskId).toBe('task-1');
            expect(result.criteria.length).toBeGreaterThan(0);
            // Rule-based generation can get full coverage if all categories are present
            expect(result.coverageScore).toBeGreaterThanOrEqual(60);
        });

        it('Test 40: should handle malformed LLM response', async () => {
            mockCompleteLLM.mockResolvedValueOnce({ content: 'Invalid response format' });

            const task = createMockTask();
            const result = await generator.generateCriteria(task);

            // Should still return valid result with defaults
            expect(result.criteria.length).toBeGreaterThanOrEqual(3);
        });
    });
});
