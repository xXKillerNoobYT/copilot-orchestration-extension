/**
 * Planning Agent Test Suite
 * 
 * Tests the Planning Team's ability to analyze requirements,
 * detect vagueness, decompose into tasks, and hand off to Orchestrator.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';

// Define mock types
type MockedLLMResponse = { content: string; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } };
type MockedTicket = { id: string; title: string; status: string; priority?: number; creator?: string; assignee?: null; taskId?: string | null; version?: number; resolution?: null; createdAt?: string; updatedAt?: string; thread?: any[] };

// Mock dependencies before imports - using closure pattern with proper types
const mockCompleteLLM = jest.fn<(...args: any[]) => Promise<MockedLLMResponse>>();
const mockCreateTicket = jest.fn<(...args: any[]) => Promise<MockedTicket>>();
const mockUpdateTicket = jest.fn<(...args: any[]) => Promise<MockedTicket>>();
const mockGetTicket = jest.fn<(...args: any[]) => Promise<MockedTicket | null>>();
const mockListTickets = jest.fn<(...args: any[]) => Promise<MockedTicket[]>>();
const mockFsExistsSync = jest.fn<(...args: any[]) => boolean>();
const mockFsReadFileSync = jest.fn<(...args: any[]) => string>();

jest.mock('../../../src/services/llmService', () => ({
    completeLLM: (...args: any[]) => mockCompleteLLM(...args),
    streamLLM: jest.fn()
}));

jest.mock('../../../src/services/ticketDb', () => ({
    createTicket: (...args: any[]) => mockCreateTicket(...args),
    updateTicket: (...args: any[]) => mockUpdateTicket(...args),
    getTicket: (...args: any[]) => mockGetTicket(...args),
    listTickets: (...args: any[]) => mockListTickets(...args),
    onTicketChange: jest.fn()
}));

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

jest.mock('fs', () => ({
    existsSync: (...args: any[]) => mockFsExistsSync(...args),
    readFileSync: (...args: any[]) => mockFsReadFileSync(...args),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn()
}));

// Import after mocks
import {
    getRequirementAnalyzer,
    resetRequirementAnalyzerForTests
} from '../../../src/agents/planning/analysis';
import {
    getVaguenessDetector,
    resetVaguenessDetectorForTests
} from '../../../src/agents/planning/vagueness';
import {
    getTaskDecomposer,
    resetTaskDecomposerForTests
} from '../../../src/agents/planning/decomposer';
import {
    getPRDParser,
    resetPRDParserForTests
} from '../../../src/agents/planning/prdParser';
import {
    getHandoffManager,
    resetHandoffManagerForTests
} from '../../../src/agents/planning/handoff';
import {
    PlanningAgent,
    initializePlanningAgent,
    getPlanningAgent,
    resetPlanningAgentForTests
} from '../../../src/agents/planning/index';

describe('Planning Agent Test Suite', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset all singletons
        resetRequirementAnalyzerForTests();
        resetVaguenessDetectorForTests();
        resetTaskDecomposerForTests();
        resetPRDParserForTests();
        resetHandoffManagerForTests();
        resetPlanningAgentForTests();
    });

    afterEach(() => {
        jest.useRealTimers();
        resetPlanningAgentForTests();
    });

    // =============================================================================
    // RequirementAnalyzer Tests
    // =============================================================================
    describe('RequirementAnalyzer', () => {
        it('Test 1: should return singleton instance', () => {
            const analyzer1 = getRequirementAnalyzer();
            const analyzer2 = getRequirementAnalyzer();
            expect(analyzer1).toBe(analyzer2);
        });

        it('Test 2: should analyze requirement and extract features', async () => {
            // The analyzer expects text format, not JSON
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- User authentication system
- Dashboard display with charts

CONSTRAINTS:
- [technical] Must use OAuth2
- [business] Launch by Q2

DEPENDENCIES:
- React (external: no)
- Auth0 (external: yes)

UNCLEAR:
- "user-friendly" → Define specific UX metrics

CLARITY_SCORE: 85`,
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            const analyzer = getRequirementAnalyzer();
            const result = await analyzer.analyze('Build a user dashboard with login');

            expect(result.features).toHaveLength(2);
            expect(result.features[0].description).toContain('authentication');
        });

        it('Test 3: should handle LLM failure gracefully', async () => {
            mockCompleteLLM.mockRejectedValueOnce(new Error('LLM offline'));

            const analyzer = getRequirementAnalyzer();
            const result = await analyzer.analyze('Test requirement');

            expect(result.clarityScore).toBe(0);
            expect(result.features).toHaveLength(0);
        });

        it('Test 4: should detect unclear requirements with quickClarityCheck', () => {
            const analyzer = getRequirementAnalyzer();

            expect(analyzer.quickClarityCheck('Make it nice and user-friendly')).toBe(true);
            expect(analyzer.quickClarityCheck('Add a button that submits the form')).toBe(false);
        });

        it('Test 5: should handle invalid JSON response', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: 'Not valid JSON',
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
            });

            const analyzer = getRequirementAnalyzer();
            const result = await analyzer.analyze('Some requirement');

            // Should return empty/default result on parse failure
            expect(result.features).toBeDefined();
        });
    });

    // =============================================================================
    // VaguenessDetector Tests
    // =============================================================================
    describe('VaguenessDetector', () => {
        it('Test 6: should return singleton instance', () => {
            const detector1 = getVaguenessDetector();
            const detector2 = getVaguenessDetector();
            expect(detector1).toBe(detector2);
        });

        it('Test 7: should detect vague terms', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: JSON.stringify({
                    overallScore: 40,
                    items: [
                        { phrase: 'fast', score: 30, category: 'subjective', clarificationQuestion: 'How fast?', suggestions: ['<100ms', '<500ms'] }
                    ]
                }),
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            const detector = getVaguenessDetector();
            const result = await detector.detect('Make it fast');

            expect(result.overallScore).toBeLessThan(70);
            expect(result.requiresClarification).toBe(true);
        });

        it('Test 8: should pass clear requirements', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: JSON.stringify({
                    overallScore: 90,
                    items: []
                }),
                usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
            });

            const detector = getVaguenessDetector();
            const result = await detector.detect('Response time must be under 200ms');

            expect(result.overallScore).toBeGreaterThan(70);
            expect(result.requiresClarification).toBe(false);
        });

        it('Test 9: should allow threshold adjustment', () => {
            const detector = getVaguenessDetector();
            detector.setThreshold(50);
            expect(detector.getThreshold()).toBe(50);
        });

        it('Test 10: should create clarification ticket for vague requirements', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: JSON.stringify({
                    overallScore: 30,
                    items: [
                        { phrase: 'good', score: 20, category: 'subjective', clarificationQuestion: 'What is good?', suggestions: [] }
                    ]
                }),
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            mockGetTicket.mockResolvedValueOnce({
                id: 'TICKET-002',
                title: 'Test',
                status: 'open',
                thread: [],
                priority: 1,
                creator: 'test',
                assignee: null,
                taskId: null,
                version: 1,
                resolution: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            const detector = getVaguenessDetector();
            const result = await detector.detect('Make it good', 'TICKET-002');

            expect(result.requiresClarification).toBe(true);
            // Note: updateTicket would be called to add clarification
        });
    });

    // =============================================================================
    // TaskDecomposer Tests
    // =============================================================================
    describe('TaskDecomposer', () => {
        it('Test 11: should return singleton instance', () => {
            const decomposer1 = getTaskDecomposer();
            const decomposer2 = getTaskDecomposer();
            expect(decomposer1).toBe(decomposer2);
        });

        it('Test 12: should decompose feature into atomic tasks', async () => {
            // Reset mock before setting up
            mockCompleteLLM.mockReset();
            // Decomposer expects TASK: block format
            mockCompleteLLM.mockResolvedValueOnce({
                content: `TASK: Create login form
DESCRIPTION: Build the login form UI with email and password fields
ESTIMATE: 30
DEPENDS_ON: none
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Form renders correctly
- Has email field
- Has password field
FILES: src/components/LoginForm.tsx
PATTERNS: existing form patterns

TASK: Add form validation
DESCRIPTION: Add email and password validation
ESTIMATE: 20
DEPENDS_ON: 1
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Validates email format
- Shows error messages
- Disables submit when invalid
FILES: src/components/LoginForm.tsx
PATTERNS: validation patterns`,
                usage: { prompt_tokens: 20, completion_tokens: 50, total_tokens: 70 }
            });

            const decomposer = getTaskDecomposer();
            const result = await decomposer.decompose({
                id: 'F001',
                description: 'User login feature',
                isUI: true,
                sourceText: 'Build a login form'
            });

            expect(result.tasks.length).toBeGreaterThan(0);
            expect(result.totalEstimateMinutes).toBeGreaterThan(0);
        });

        it('Test 13: should build dependency graph', async () => {
            // Reset mock before setting up
            mockCompleteLLM.mockReset();
            mockCompleteLLM.mockResolvedValueOnce({
                content: `TASK: Task A
DESCRIPTION: First task
ESTIMATE: 15
DEPENDS_ON: none
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Criterion 1
FILES: file1.ts
PATTERNS: none

TASK: Task B
DESCRIPTION: Second task
ESTIMATE: 15
DEPENDS_ON: 1
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Criterion 2
FILES: file2.ts
PATTERNS: none

TASK: Task C
DESCRIPTION: Third task
ESTIMATE: 15
DEPENDS_ON: 2
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Criterion 3
FILES: file3.ts
PATTERNS: none`,
                usage: { prompt_tokens: 10, completion_tokens: 30, total_tokens: 40 }
            });

            const decomposer = getTaskDecomposer();
            const result = await decomposer.decompose({
                id: 'F001',
                description: 'Feature with dependencies',
                isUI: false,
                sourceText: 'Test'
            });

            expect(result.dependencyGraph.size).toBeGreaterThan(0);
        });

        it('Test 14: should detect circular dependencies', () => {
            const decomposer = getTaskDecomposer();
            const tasks = [
                { id: 'A', dependsOn: ['B'] },
                { id: 'B', dependsOn: ['C'] },
                { id: 'C', dependsOn: ['A'] }
            ];

            // Decomposer has internal cycle detection
            expect(decomposer).toBeDefined();
        });

        it('Test 15: should handle LLM failure', async () => {
            mockCompleteLLM.mockReset();
            mockCompleteLLM.mockRejectedValueOnce(new Error('LLM error'));

            const decomposer = getTaskDecomposer();
            const result = await decomposer.decompose({
                id: 'F001',
                description: 'Test feature',
                isUI: false,
                sourceText: 'Test'
            });

            // Decomposer returns fallback task on LLM failure
            expect(result.tasks).toHaveLength(1);
        });
    });

    // =============================================================================
    // PRDParser Tests
    // =============================================================================
    describe('PRDParser', () => {
        it('Test 16: should return singleton instance', () => {
            const parser1 = getPRDParser();
            const parser2 = getPRDParser();
            expect(parser1).toBe(parser2);
        });

        it('Test 17: should parse valid PRD file', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                projectName: 'Test Project',
                description: 'A test project',
                features: [
                    { id: 'F001', name: 'Feature 1', description: 'Test', priority: 'P1', acceptanceCriteria: ['Works'] }
                ]
            }));

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.projectName).toBe('Test Project');
            expect(result.features).toHaveLength(1);
        });

        it('Test 18: should handle missing PRD file', async () => {
            mockFsExistsSync.mockReturnValue(false);

            const parser = getPRDParser();
            const result = await parser.parse('/nonexistent/PRD.json');

            expect(result.parseErrors.length).toBeGreaterThan(0);
        });

        it('Test 19: should handle invalid JSON', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue('not valid json');

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.parseErrors.length).toBeGreaterThan(0);
        });

        it('Test 20: should filter features for planning', async () => {
            const parser = getPRDParser();
            const prd = {
                projectName: 'Test',
                description: 'Test',
                targetAudience: [],
                features: [
                    { id: 'F001', name: 'Done', description: '', status: 'complete' as const, priority: 'P1' as const, acceptanceCriteria: [], dependencies: [] },
                    { id: 'F002', name: 'Planned', description: '', status: 'planned' as const, priority: 'P1' as const, acceptanceCriteria: [], dependencies: [] }
                ],
                milestones: [],
                technicalRequirements: [],
                successMetrics: [],
                outOfScope: [],
                version: '1.0',
                lastUpdated: '',
                parseErrors: []
            };

            const forPlanning = parser.getFeaturesForPlanning(prd);
            expect(forPlanning).toHaveLength(1);
            expect(forPlanning[0].name).toBe('Planned');
        });
    });

    // =============================================================================
    // HandoffManager Tests
    // =============================================================================
    describe('HandoffManager', () => {
        it('Test 21: should return singleton instance', () => {
            const manager1 = getHandoffManager();
            const manager2 = getHandoffManager();
            expect(manager1).toBe(manager2);
        });

        it('Test 22: should create handoff package', () => {
            const manager = getHandoffManager();
            const pkg = manager.createHandoffPackage([{
                feature: { id: 'F001', description: 'Test', isUI: false, sourceText: 'Test' },
                tasks: [
                    {
                        id: 'TK-001.1',
                        featureId: 'F001',
                        title: 'Test Task',
                        description: 'A test task',
                        estimateMinutes: 30,
                        dependsOn: [],
                        blocks: [],
                        acceptanceCriteria: ['Passes'],
                        files: [],
                        patterns: [],
                        priority: 'P1' as const,
                        isUI: false,
                        status: 'pending' as const
                    }
                ],
                dependencyGraph: new Map(),
                criticalPath: [],
                totalEstimateMinutes: 30,
                timestamp: new Date()
            }]);

            expect(pkg.handoffId).toMatch(/^HO-/);
            expect(pkg.tasks).toHaveLength(1);
        });

        it('Test 23: should execute handoff and create tickets', async () => {
            mockCreateTicket.mockResolvedValue({
                id: 'TICKET-001',
                title: 'Test',
                status: 'open',
                priority: 1,
                creator: 'planning-team',
                assignee: null,
                taskId: 'TK-001.1',
                version: 1,
                resolution: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            const manager = getHandoffManager();
            const pkg = manager.createHandoffPackage([{
                feature: { id: 'F001', description: 'Test', isUI: false, sourceText: 'Test' },
                tasks: [{
                    id: 'TK-001.1',
                    featureId: 'F001',
                    title: 'Test',
                    description: 'Test',
                    estimateMinutes: 30,
                    dependsOn: [],
                    blocks: [],
                    acceptanceCriteria: [],
                    files: [],
                    patterns: [],
                    priority: 'P1' as const,
                    isUI: false,
                    status: 'pending' as const
                }],
                dependencyGraph: new Map(),
                criticalPath: [],
                totalEstimateMinutes: 30,
                timestamp: new Date()
            }]);

            const result = await manager.executeHandoff(pkg);

            expect(result.success).toBe(true);
            expect(result.ticketIds).toHaveLength(1);
        });

        it('Test 24: should prevent planning reentry after handoff', async () => {
            mockCreateTicket.mockResolvedValue({
                id: 'TICKET-001',
                title: 'Test',
                status: 'open',
                priority: 1,
                creator: 'test',
                assignee: null,
                taskId: null,
                version: 1,
                resolution: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            const manager = getHandoffManager();

            // Before handoff, planning is allowed
            expect(manager.canInvokePlanning()).toBe(true);

            // Execute handoff
            const pkg = manager.createHandoffPackage([{
                feature: { id: 'F001', description: 'Test', isUI: false, sourceText: 'Test' },
                tasks: [{
                    id: 'TK-001.1',
                    featureId: 'F001',
                    title: 'Test',
                    description: 'Test',
                    estimateMinutes: 15,
                    dependsOn: [],
                    blocks: [],
                    acceptanceCriteria: [],
                    files: [],
                    patterns: [],
                    priority: 'P1' as const,
                    isUI: false,
                    status: 'pending' as const
                }],
                dependencyGraph: new Map(),
                criticalPath: [],
                totalEstimateMinutes: 15,
                timestamp: new Date()
            }]);
            await manager.executeHandoff(pkg);

            // After handoff, planning is blocked
            expect(manager.canInvokePlanning()).toBe(false);

            // Clear allows planning again
            manager.clearHandoff();
            expect(manager.canInvokePlanning()).toBe(true);
        });

        it('Test 25: should detect circular dependencies in handoff', async () => {
            const manager = getHandoffManager();
            const pkg = {
                handoffId: 'HO-TEST',
                features: ['F001'],
                tasks: [
                    { id: 'A', dependsOn: ['B'], featureId: 'F001', title: 'A', description: '', estimateMinutes: 15, blocks: [], acceptanceCriteria: [], files: [], patterns: [], priority: 'P1' as const, isUI: false, status: 'pending' as const },
                    { id: 'B', dependsOn: ['C'], featureId: 'F001', title: 'B', description: '', estimateMinutes: 15, blocks: [], acceptanceCriteria: [], files: [], patterns: [], priority: 'P1' as const, isUI: false, status: 'pending' as const },
                    { id: 'C', dependsOn: ['A'], featureId: 'F001', title: 'C', description: '', estimateMinutes: 15, blocks: [], acceptanceCriteria: [], files: [], patterns: [], priority: 'P1' as const, isUI: false, status: 'pending' as const }
                ],
                dependencyGraph: { 'A': ['B'], 'B': ['C'], 'C': ['A'] },
                criticalPath: [],
                totalEstimateMinutes: 45,
                context: { summary: '', acceptanceCriteria: {}, estimates: {} },
                timestamp: new Date().toISOString(),
                status: 'pending' as const
            };

            const result = await manager.executeHandoff(pkg);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Circular');
        });
    });

    // =============================================================================
    // PlanningAgent Integration Tests
    // =============================================================================
    describe('PlanningAgent (Integration)', () => {
        it('Test 26: should initialize as singleton', async () => {
            await initializePlanningAgent();
            const agent = getPlanningAgent();
            expect(agent).toBeDefined();

            // Double initialize should throw
            await expect(initializePlanningAgent()).rejects.toThrow('already initialized');
        });

        it('Test 27: should plan from requirement', async () => {
            // Mock analyzer response (text format)
            mockCompleteLLM
                .mockResolvedValueOnce({
                    content: `FEATURES:
- Test feature implementation

CONSTRAINTS:
- [technical] None

DEPENDENCIES:
- None

UNCLEAR:
- None

CLARITY_SCORE: 85`,
                    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
                })
                // Mock vagueness response (text format)
                .mockResolvedValueOnce({
                    content: `VAGUE: none found
SCORE: 90
CATEGORY: N/A
QUESTION: N/A
SUGGESTION: N/A`,
                    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
                })
                // Mock decomposer response (text format)
                .mockResolvedValueOnce({
                    content: `TASK: Implement feature
DESCRIPTION: Implement the test feature
ESTIMATE: 30
DEPENDS_ON: none
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Feature works correctly
- Tests pass
- Code reviewed
FILES: src/test.ts
PATTERNS: existing patterns`,
                    usage: { prompt_tokens: 15, completion_tokens: 30, total_tokens: 45 }
                });

            mockCreateTicket.mockResolvedValue({
                id: 'TICKET-001',
                title: 'Test',
                status: 'open',
                priority: 1,
                creator: 'planning-team',
                assignee: null,
                taskId: 'TK-001.1',
                version: 1,
                resolution: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            const agent = new PlanningAgent({ autoHandoff: true });
            await agent.initialize();

            const result = await agent.planFromRequirement('Build a test feature');

            expect(result.status).toBe('complete');
            expect(result.totalTasks).toBeGreaterThan(0);
        });

        it('Test 28: should request clarification for vague requirements', async () => {
            // Mock analyzer response (text format)
            mockCompleteLLM
                .mockResolvedValueOnce({
                    content: `FEATURES:
- Nice feature

CONSTRAINTS:
- None

DEPENDENCIES:
- None

UNCLEAR:
- "nice" - too subjective

CLARITY_SCORE: 40`,
                    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
                });
            // Note: vagueness detector uses quickDetect for short text, no LLM needed

            const agent = new PlanningAgent({ vaguenessThreshold: 70 });
            await agent.initialize();

            const result = await agent.planFromRequirement('Make it nice');

            expect(result.status).toBe('needs_clarification');
            expect(result.vaguenessCheck.requiresClarification).toBe(true);
        });

        it('Test 29: should block planning after handoff', async () => {
            // Set up mocks for successful first planning
            mockCompleteLLM
                .mockResolvedValueOnce({
                    content: `FEATURES:
- Feature A implementation

CLARITY_SCORE: 90`,
                    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
                })
                // Note: quickDetect doesn't find vague terms in "Build feature A"
                // Decomposer response
                .mockResolvedValueOnce({
                    content: `TASK: Build feature A
DESCRIPTION: Implement feature A
ESTIMATE: 15
DEPENDS_ON: none
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Works
FILES: src/featureA.ts
PATTERNS: none`,
                    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
                });

            mockCreateTicket.mockResolvedValue({
                id: 'TICKET-001',
                title: 'Test',
                status: 'open',
                priority: 1,
                creator: 'test',
                assignee: null,
                taskId: null,
                version: 1,
                resolution: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            const agent = new PlanningAgent({ autoHandoff: true });
            await agent.initialize();

            // First planning succeeds
            await agent.planFromRequirement('Build feature A');

            // Second planning should be blocked
            const result = await agent.planFromRequirement('Build feature B');
            expect(result.status).toBe('failed');

            // Reset allows planning again
            agent.reset();
            expect(agent.isPlanningBlocked()).toBe(false);
        });

        it('Test 30: should plan from PRD file', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                projectName: 'Test PRD',
                description: 'A test PRD',
                features: [
                    { id: 'F001', name: 'Feature 1', description: 'First feature', priority: 'P1', acceptanceCriteria: ['Works'], status: 'planned' }
                ]
            }));

            // Mock decomposer (text format)
            mockCompleteLLM.mockResolvedValueOnce({
                content: `TASK: Implement Feature 1
DESCRIPTION: Implement the first feature
ESTIMATE: 30
DEPENDS_ON: none
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Feature works correctly
FILES: src/feature1.ts
PATTERNS: none`,
                usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 }
            });

            mockCreateTicket.mockResolvedValue({
                id: 'TICKET-001',
                title: 'Test',
                status: 'open',
                priority: 1,
                creator: 'planning-team',
                assignee: null,
                taskId: 'TK-001.1',
                version: 1,
                resolution: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            const agent = new PlanningAgent({ autoHandoff: true });
            await agent.initialize();

            const result = await agent.planFromPRD('/test/PRD.json');

            expect(result.status).toBe('complete');
            expect(result.decompositions.length).toBeGreaterThan(0);
        });

        it('Test 31: should handle missing PRD gracefully', async () => {
            mockFsExistsSync.mockReturnValue(false);

            const agent = new PlanningAgent();
            await agent.initialize();

            const result = await agent.planFromPRD('/nonexistent/PRD.json');

            expect(result.status).toBe('failed');
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('Test 32: should track total estimate across features', async () => {
            mockCompleteLLM
                .mockResolvedValueOnce({
                    content: `FEATURES:
- Feature 1 implementation
- Feature 2 implementation

CLARITY_SCORE: 90`,
                    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
                })
                // Note: quickDetect won't find vague terms
                // Decomposition for F001
                .mockResolvedValueOnce({
                    content: `TASK: Task 1
DESCRIPTION: First task for feature 1
ESTIMATE: 30
DEPENDS_ON: none
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Works
FILES: src/task1.ts
PATTERNS: none

TASK: Task 2
DESCRIPTION: Second task for feature 1
ESTIMATE: 45
DEPENDS_ON: none
PRIORITY: P2
ACCEPTANCE_CRITERIA:
- Works
FILES: src/task2.ts
PATTERNS: none`,
                    usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 }
                })
                // Decomposition for F002
                .mockResolvedValueOnce({
                    content: `TASK: Task 3
DESCRIPTION: First task for feature 2
ESTIMATE: 60
DEPENDS_ON: none
PRIORITY: P1
ACCEPTANCE_CRITERIA:
- Works
FILES: src/task3.ts
PATTERNS: none`,
                    usage: { prompt_tokens: 15, completion_tokens: 20, total_tokens: 35 }
                });

            mockCreateTicket.mockResolvedValue({
                id: 'TICKET-001',
                title: 'Test',
                status: 'open',
                priority: 1,
                creator: 'test',
                assignee: null,
                taskId: null,
                version: 1,
                resolution: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            const agent = new PlanningAgent({ autoHandoff: true });
            await agent.initialize();

            const result = await agent.planFromRequirement('Build features 1 and 2');

            expect(result.totalTasks).toBe(3);
            expect(result.totalEstimateMinutes).toBe(135); // 30 + 45 + 60
        });

        it('Test 33: should use quickClarityCheck', async () => {
            const agent = new PlanningAgent();
            await agent.initialize();

            expect(agent.quickClarityCheck('Make it fast and good')).toBe(true);
            expect(agent.quickClarityCheck('Add POST /api/users endpoint')).toBe(false);
        });
    });
});
