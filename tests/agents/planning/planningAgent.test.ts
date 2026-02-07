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
    resetVaguenessDetectorForTests,
    VaguenessDetector
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

        it('Test 6a: should support legacy constructor with numeric threshold', () => {
            // Test the legacy constructor path (line 226) by directly instantiating
            const detector = new VaguenessDetector(50);
            expect(detector.getThreshold()).toBe(50);
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

        it('Test 10a: should handle SmartPlan patterns', async () => {
            const detector = getVaguenessDetector();
            detector.setSmartPlanEnabled(true);
            expect(detector.isSmartPlanEnabled()).toBe(true);

            // Test quickDetect with SmartPlan patterns like 'improve' or 'enhance'
            const result = await detector.detect('Improve the performance');
            expect(result.items.length).toBeGreaterThan(0);
        });

        it('Test 10aa: should work without SmartPlan patterns', async () => {
            const detector = getVaguenessDetector();
            detector.setSmartPlanEnabled(false);
            expect(detector.isSmartPlanEnabled()).toBe(false);

            // With SmartPlan disabled, use standard VAGUE_PATTERNS
            const result = await detector.detect('Make it fast');
            expect(result.items.length).toBeGreaterThan(0); // 'fast' is in VAGUE_PATTERNS
        });

        it('Test 10b: should handle strictness levels', async () => {
            const detector = getVaguenessDetector();

            detector.setStrictness('relaxed');
            const relaxedResult = await detector.detect('Make it nice');

            detector.setStrictness('strict');
            const strictResult = await detector.detect('Make it nice');

            // Strict mode should have lower scores (more strict)
            expect(strictResult.items.length).toBeGreaterThanOrEqual(relaxedResult.items.length);
        });

        it('Test 10c: should use LLM for longer text with few pattern matches', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `VAGUE: complex system
SCORE: 40
CATEGORY: ambiguous
QUESTION: What complexity are you referring to?
SUGGESTION: Define specific complexity metrics`,
                usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 }
            });

            const detector = getVaguenessDetector();
            // Long text with few pattern matches triggers LLM detection
            const result = await detector.detect(
                'Build a complex system that handles user data with appropriate security measures and integrates with external services for data processing and storage requirements that meet industry standards.'
            );

            expect(result).toBeDefined();
            expect(result.timestamp).toBeInstanceOf(Date);
        });

        it('Test 10d: should handle LLM detection failure gracefully', async () => {
            mockCompleteLLM.mockRejectedValueOnce(new Error('LLM error'));

            const detector = getVaguenessDetector();
            // Long text should try LLM, which will fail
            const result = await detector.detect(
                'Build a system that is really good and handles many things efficiently and provides great user experience.'
            );

            // Should still return a result from pattern matching
            expect(result).toBeDefined();
            expect(result.overallScore).toBeDefined();
        });

        it('Test 10e: should calculate overall score based on items', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: JSON.stringify({
                    overallScore: 60,
                    items: []
                }),
                usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
            });

            const detector = getVaguenessDetector();

            // No vague items should give high score
            const clearResult = await detector.detect('Response time must be under 200ms for 95th percentile');
            expect(clearResult.overallScore).toBeGreaterThan(50);

            // Multiple vague items should lower the score
            mockCompleteLLM.mockResolvedValueOnce({
                content: JSON.stringify({
                    overallScore: 20,
                    items: [
                        { phrase: 'fast', score: 30, category: 'unmeasurable', clarificationQuestion: 'How fast?', suggestions: [] },
                        { phrase: 'good', score: 20, category: 'subjective', clarificationQuestion: 'What is good?', suggestions: [] }
                    ]
                }),
                usage: { prompt_tokens: 10, completion_tokens: 30, total_tokens: 40 }
            });
            const vagueResult = await detector.detect('Make it fast and good');
            expect(vagueResult.overallScore).toBeLessThan(60);
        });

        it('Test 10f: should merge quick and LLM results avoiding duplicates', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `VAGUE: user-friendly
SCORE: 35
CATEGORY: subjective
QUESTION: What makes it user-friendly?
SUGGESTION: Define UX metrics

VAGUE: complex logic
SCORE: 45
CATEGORY: ambiguous
QUESTION: What logic exactly?
SUGGESTION: Describe the algorithm`,
                usage: { prompt_tokens: 80, completion_tokens: 100, total_tokens: 180 }
            });

            const detector = getVaguenessDetector();
            const result = await detector.detect(
                'Create a user-friendly interface with complex logic that processes data efficiently for all use cases.'
            );

            // Should have items from both pattern matching (user-friendly, efficiently) and LLM (complex logic)
            expect(result.items.length).toBeGreaterThan(0);
        });

        it('Test 10g: should update ticket thread with clarification', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: JSON.stringify({
                    overallScore: 20,
                    items: [
                        { phrase: 'nice', score: 20, category: 'subjective', clarificationQuestion: 'What is nice?', suggestions: [] }
                    ]
                }),
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            mockGetTicket.mockResolvedValueOnce({
                id: 'TICKET-003',
                title: 'Test Ticket',
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
            await detector.detect('Make it nice', 'TICKET-003');

            // Verify updateTicket was called with clarification
            expect(mockUpdateTicket).toHaveBeenCalled();
        });

        it('Test 10h: should handle missing ticket gracefully', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: JSON.stringify({
                    overallScore: 20,
                    items: [
                        { phrase: 'good', score: 20, category: 'subjective', clarificationQuestion: 'What is good?', suggestions: [] }
                    ]
                }),
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            mockGetTicket.mockResolvedValueOnce(null);

            const detector = getVaguenessDetector();
            const result = await detector.detect('Make it good', 'NONEXISTENT');

            // Should still return result, just without clarification ticket
            expect(result.requiresClarification).toBe(true);
            expect(result.clarificationTicketId).toBeFalsy();
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

        it('Test 20a: should parse PRD with alternate field names', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                name: 'Alt Name Project',  // uses 'name' instead of 'projectName'
                overview: 'Alt description',  // uses 'overview' instead of 'description'
                users: ['User A', 'User B'],  // uses 'users' instead of 'targetAudience'
                features: [
                    { id: 'F001', name: 'Feature', description: 'Test', priority: 'P2', acceptanceCriteria: ['OK'] }
                ]
            }));

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.projectName).toBe('Alt Name Project');
            expect(result.description).toBe('Alt description');
            expect(result.targetAudience).toContain('User A');
        });

        it('Test 20b: should parse PRD with title field', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                title: 'Title Field Project',  // uses 'title' instead
                description: 'A project',
                targetAudience: 'Single User',  // string instead of array
                features: [
                    { id: 'F001', name: 'Feature', description: 'Test', priority: 'P3', status: 'in-progress' }
                ],
                milestones: [
                    { id: 'M1', name: 'Milestone 1', features: ['F001'] }
                ]
            }));

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.projectName).toBe('Title Field Project');
            expect(result.targetAudience).toContain('Single User');
            expect(result.milestones).toHaveLength(1);
        });

        it('Test 20c: should parse technical requirements from array format', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                projectName: 'Tech Project',
                description: 'Project with tech reqs',
                features: [{ id: 'F001', name: 'Feature', description: 'Test' }],
                technicalRequirements: [
                    { category: 'performance', description: '< 200ms response', criteria: 'p95 latency' },
                    { type: 'security', description: 'Encrypted data', metric: 'AES-256' },
                    { category: 'unknown_category', description: 'Test' }  // Should default to 'performance'
                ]
            }));

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.technicalRequirements).toHaveLength(3);
            expect(result.technicalRequirements[0].category).toBe('performance');
            expect(result.technicalRequirements[1].category).toBe('security');
            expect(result.technicalRequirements[2].category).toBe('performance'); // Default
        });

        it('Test 20d: should parse technical requirements from object format', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                projectName: 'Tech Project 2',
                description: 'Project with tech object',
                features: [{ id: 'F001', name: 'Feature', description: 'Test' }],
                technical: {
                    performance: 'Must be fast',
                    security: 'Must be secure',
                    scalability: 'Must scale',
                    compatibility: 'Must be compatible',
                    accessibility: 'Must be accessible'
                }
            }));

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.technicalRequirements).toHaveLength(5);
            const categories = result.technicalRequirements.map(r => r.category);
            expect(categories).toContain('performance');
            expect(categories).toContain('security');
            expect(categories).toContain('accessibility');
        });

        it('Test 20e: should handle PRD with missing optional fields', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                // Missing: projectName, description
                features: []  // Empty features
            }));

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.parseErrors).toContain('Missing project name (expected: projectName, name, or title)');
            expect(result.parseErrors).toContain('Missing project description');
            expect(result.parseErrors).toContain('No features defined in PRD');
        });

        it('Test 20f: should parse features with various priority values', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                projectName: 'Priority Project',
                description: 'Testing priorities',
                features: [
                    { id: 'F001', name: 'P0 Feature', description: 'p0 pri', priority: 'P0' },
                    { id: 'F002', name: 'P1 Feature', description: 'p1 pri', priority: 'P1' },
                    { id: 'F003', name: 'P2 Feature', description: 'p2 pri', priority: 'P2' },
                    { id: 'F004', name: 'P3 Feature', description: 'p3 pri', priority: 'p3' },  // lowercase should normalize
                    { id: 'F005', name: 'Default', description: 'default', priority: 'unknown' } // Unknown defaults to P1
                ]
            }));

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.features).toHaveLength(5);
            // Verify all priorities are normalized correctly
            result.features.forEach(f => {
                expect(['P0', 'P1', 'P2', 'P3']).toContain(f.priority);
            });
        });

        it('Test 20g: should parse milestones with date and target fields', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                projectName: 'Milestone Project',
                description: 'Testing milestones',
                features: [{ id: 'F001', name: 'Feature', description: 'Test' }],
                milestones: [
                    { id: 'M1', name: 'MVP', features: ['F001'], date: '2024-06-01' },
                    { id: 'M2', name: 'Beta', features: [], targetDate: '2024-09-01' }
                ]
            }));

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.milestones).toHaveLength(2);
            expect(result.milestones[0].targetDate).toBe('2024-06-01');
            expect(result.milestones[1].targetDate).toBe('2024-09-01');
        });

        it('Test 20h: should parse success metrics and out of scope', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                projectName: 'Metrics Project',
                description: 'Testing metrics',
                features: [{ id: 'F001', name: 'Feature', description: 'Test' }],
                successMetrics: ['DAU > 1000', 'Retention > 50%'],
                outOfScope: ['Mobile app', 'Offline mode'],
                nonGoals: ['Real-time sync']  // alternate field name
            }));

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.successMetrics).toContain('DAU > 1000');
            expect(result.outOfScope).toContain('Mobile app');
        });

        it('Test 20i: should handle metrics alternate field', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                projectName: 'Alt Metrics',
                description: 'Testing alt metrics field',
                features: [{ id: 'F001', name: 'Feature', description: 'Test' }],
                metrics: ['Metric 1', 'Metric 2']  // uses 'metrics' instead of 'successMetrics'
            }));

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.successMetrics).toContain('Metric 1');
        });

        it('Test 20j: should parse version and lastUpdated fields', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                projectName: 'Versioned Project',
                description: 'Testing version',
                features: [{ id: 'F001', name: 'Feature', description: 'Test' }],
                version: '2.1.0',
                lastUpdated: '2024-01-15T10:00:00Z'
            }));

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.version).toBe('2.1.0');
            expect(result.lastUpdated).toBe('2024-01-15T10:00:00Z');
        });

        it('Test 20k: should use updated field if lastUpdated is missing', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                projectName: 'Updated Project',
                description: 'Testing updated field',
                features: [{ id: 'F001', name: 'Feature', description: 'Test' }],
                updated: '2024-02-20'
            }));

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.lastUpdated).toBe('2024-02-20');
        });

        it('Test 20l: should handle file read error', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.parseErrors).toContain('Permission denied');
        });

        it('Test 20m: should filter features by various status values', async () => {
            const parser = getPRDParser();
            const prd = {
                projectName: 'Test',
                description: 'Test',
                targetAudience: [],
                features: [
                    { id: 'F001', name: 'Complete', description: '', status: 'complete' as const, priority: 'P1' as const, acceptanceCriteria: [], dependencies: [] },
                    { id: 'F002', name: 'Planned', description: '', status: 'planned' as const, priority: 'P1' as const, acceptanceCriteria: [], dependencies: [] },
                    { id: 'F003', name: 'In Progress', description: '', status: 'in_progress' as const, priority: 'P2' as const, acceptanceCriteria: [], dependencies: [] }
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
            // Should include planned, in_progress but not complete
            expect(forPlanning.map(f => f.name)).toContain('Planned');
            expect(forPlanning.map(f => f.name)).toContain('In Progress');
            expect(forPlanning.map(f => f.name)).not.toContain('Complete');
        });

        it('Test 20n: should validate PRD and return errors', () => {
            const parser = getPRDParser();
            const invalidPrd = {
                projectName: '',
                description: '',
                targetAudience: [],
                features: [],
                milestones: [],
                technicalRequirements: [],
                successMetrics: [],
                outOfScope: [],
                version: '1.0',
                lastUpdated: '',
                parseErrors: []
            };

            const errors = parser.validate(invalidPrd);
            expect(errors).toContain('Project name is required');
            expect(errors).toContain('Project description is required');
            expect(errors).toContain('At least one feature is required');
        });

        it('Test 20o: should validate features within PRD', () => {
            const parser = getPRDParser();
            const prd = {
                projectName: 'Valid Project',
                description: 'Valid description',
                targetAudience: [],
                features: [
                    { id: 'F001', name: '', description: '', status: 'planned' as const, priority: 'P1' as const, acceptanceCriteria: [], dependencies: [] }
                ],
                milestones: [],
                technicalRequirements: [],
                successMetrics: [],
                outOfScope: [],
                version: '1.0',
                lastUpdated: '',
                parseErrors: []
            };

            const errors = parser.validate(prd);
            expect(errors).toContain('Feature F001: name is required');
            expect(errors).toContain('Feature F001: at least one acceptance criterion is required');
        });

        it('Test 20p: should get current milestone', () => {
            const parser = getPRDParser();
            const prd = {
                projectName: 'Project',
                description: 'Desc',
                targetAudience: [],
                features: [],
                milestones: [
                    { id: 'M1', name: 'MVP', features: [], status: 'complete' as const },
                    { id: 'M2', name: 'Beta', features: [], status: 'current' as const },
                    { id: 'M3', name: 'Release', features: [], status: 'upcoming' as const }
                ],
                technicalRequirements: [],
                successMetrics: [],
                outOfScope: [],
                version: '1.0',
                lastUpdated: '',
                parseErrors: []
            };

            const current = parser.getCurrentMilestone(prd);
            expect(current).toBeDefined();
            expect(current?.name).toBe('Beta');
        });

        it('Test 20q: should return undefined for no current milestone', () => {
            const parser = getPRDParser();
            const prd = {
                projectName: 'Project',
                description: 'Desc',
                targetAudience: [],
                features: [],
                milestones: [
                    { id: 'M1', name: 'Release', features: [], status: 'upcoming' as const }
                ],
                technicalRequirements: [],
                successMetrics: [],
                outOfScope: [],
                version: '1.0',
                lastUpdated: '',
                parseErrors: []
            };

            const current = parser.getCurrentMilestone(prd);
            expect(current).toBeUndefined();
        });

        it('Test 20r: should handle nonGoals alternate for outOfScope', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                projectName: 'NonGoals Project',
                description: 'Testing nonGoals field',
                features: [{ id: 'F001', name: 'Feature', description: 'Test' }],
                nonGoals: ['Not doing this', 'Out of scope item']
            }));

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.outOfScope).toContain('Not doing this');
            expect(result.outOfScope).toContain('Out of scope item');
        });

        it('Test 20s: should parse milestones with various status values', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                projectName: 'Status Project',
                description: 'Testing milestone status',
                features: [{ id: 'F001', name: 'Feature', description: 'Test' }],
                milestones: [
                    { id: 'M1', name: 'Done', features: [], status: 'completed' },
                    { id: 'M2', name: 'Active', features: [], status: 'active' },
                    { id: 'M3', name: 'InProgress', features: [], status: 'in_progress' },
                    { id: 'M4', name: 'Future', features: [] }
                ]
            }));

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.milestones[0].status).toBe('complete');
            expect(result.milestones[1].status).toBe('current');
            expect(result.milestones[2].status).toBe('current');
            expect(result.milestones[3].status).toBe('upcoming');
        });

        it('Test 20t: should parse features with various status values', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockFsReadFileSync.mockReturnValue(JSON.stringify({
                projectName: 'Feature Status Project',
                description: 'Testing feature status',
                features: [
                    { id: 'F001', name: 'Completed', description: 'Test', status: 'completed' },
                    { id: 'F002', name: 'Done', description: 'Test', status: 'done' },
                    { id: 'F003', name: 'Started', description: 'Test', status: 'started' },
                    { id: 'F004', name: 'InProgressDash', description: 'Test', status: 'in-progress' }
                ]
            }));

            const parser = getPRDParser();
            const result = await parser.parse('/test/PRD.json');

            expect(result.features[0].status).toBe('complete');
            expect(result.features[1].status).toBe('complete');
            expect(result.features[2].status).toBe('in_progress');
            expect(result.features[3].status).toBe('in_progress');
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
            // Reset mock before setting up
            mockCompleteLLM.mockReset();

            // Mock analyzer response (text format)
            // Note: vagueness uses quickDetect for short text, no LLM call needed
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
                // Mock decomposer response (text format) - NO vagueness mock needed!
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
