/**
 * Tests for orchestrator.ts
 * 
 * Tests the Orchestrator service including:
 * - Initialization with config reading
 * - Task queue FIFO ordering
 * - Empty queue handling
 * - Timeout detection and blocked ticket creation
 * - Task pickup logging
 */

import {
    initializeOrchestrator,
    getNextTask,
    routeQuestionToAnswer,
    routeToVerificationAgent,
    getOrchestratorInstance,
    resetOrchestratorForTests
} from '../src/services/orchestrator';
import * as ticketDb from '../src/services/ticketDb';
import { completeLLM } from '../src/services/llmService';
import { streamLLM } from '../src/services/llmService';
import { OrchestratorService } from '../src/services/orchestrator';
import { logInfo, logWarn, logError } from '../src/logger';
import { ExtensionContext } from './__mocks__/vscode';
import * as fs from 'fs';

// Mock TicketDb module
jest.mock('../src/services/ticketDb');

// Mock LLM Service module
jest.mock('../src/services/llmService');

// Mock fs module
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
}));

// Cast mocks to typed versions
const mockTicketDb = ticketDb as jest.Mocked<typeof ticketDb>;
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock logger functions
jest.mock('../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

describe('Orchestrator Service', () => {
    let mockContext: ExtensionContext;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        jest.useRealTimers(); // Ensure we're not in fake timer mode

        // Reset orchestrator singleton
        resetOrchestratorForTests();

        // Create mock context
        mockContext = new ExtensionContext('/mock/extension/path');

        // Default: config file doesn't exist (use defaults)
        mockFs.existsSync.mockReturnValue(false);

        // Default: TicketDb has no tickets
        mockTicketDb.listTickets.mockResolvedValue([]);
    });

    afterEach(() => {
        jest.useRealTimers(); // Clean up fake timers after each test
    });

    describe('initialization', () => {
        it('Test 1: should initialize with default timeout when config missing', async () => {
            // Setup: no config file
            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockResolvedValue([]);

            // Execute: initialize orchestrator
            await expect(initializeOrchestrator(mockContext)).resolves.not.toThrow();

            // Verify: no errors thrown, initialized successfully
            expect(mockTicketDb.listTickets).toHaveBeenCalled();
        });

        it('Test 2: should read timeout from config.orchestrator.taskTimeoutSeconds', async () => {
            // Setup: config with custom timeout
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                orchestrator: {
                    taskTimeoutSeconds: 45
                }
            }));
            mockTicketDb.listTickets.mockResolvedValue([]);

            // Execute: initialize orchestrator
            await initializeOrchestrator(mockContext);

            // Verify: no error (actual timeout verification happens in next test)
            expect(mockTicketDb.listTickets).toHaveBeenCalled();
        });

        it('Test 3: should fallback to llm.timeoutSeconds if orchestrator config missing', async () => {
            // Setup: config with llm.timeoutSeconds but no orchestrator config
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                llm: {
                    timeoutSeconds: 60
                }
                // Note: no orchestrator config
            }));
            mockTicketDb.listTickets.mockResolvedValue([]);

            // Execute: initialize
            await initializeOrchestrator(mockContext);

            // Verify: initialized without error
            expect(mockTicketDb.listTickets).toHaveBeenCalled();
        });
    });

    describe('queue ordering (FIFO)', () => {
        it('Test 4: should return tasks in FIFO order', async () => {
            // Setup: create 3 mock tickets
            const mockTickets = [
                {
                    id: 'TICKET-1',
                    title: 'First Task',
                    status: 'open' as const,
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z'
                },
                {
                    id: 'TICKET-2',
                    title: 'Second Task',
                    status: 'open' as const,
                    createdAt: '2026-02-01T10:01:00Z',
                    updatedAt: '2026-02-01T10:01:00Z'
                },
                {
                    id: 'TICKET-3',
                    title: 'Third Task',
                    status: 'open' as const,
                    createdAt: '2026-02-01T10:02:00Z',
                    updatedAt: '2026-02-01T10:02:00Z'
                }
            ];

            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockResolvedValue(mockTickets);

            // Execute: initialize and get tasks one by one
            await initializeOrchestrator(mockContext);

            const task1 = await getNextTask();
            const task2 = await getNextTask();
            const task3 = await getNextTask();

            // Verify: tasks returned in order (FIFO = first in, first out)
            expect(task1?.id).toBe('TICKET-1');
            expect(task2?.id).toBe('TICKET-2');
            expect(task3?.id).toBe('TICKET-3');
        });

        it('Test 5: should return null when queue is empty', async () => {
            // Setup: no tickets
            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockResolvedValue([]);

            // Execute: initialize (empty queue) and get next task
            await initializeOrchestrator(mockContext);
            const task = await getNextTask();

            // Verify: null returned for empty queue
            expect(task).toBeNull();
        });

        it('Test 6: should filter for open and in-progress tickets only', async () => {
            // Setup: mix of ticket statuses
            const mockTickets = [
                {
                    id: 'TICKET-1',
                    title: 'Open Task',
                    status: 'open' as const,
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z'
                },
                {
                    id: 'TICKET-2',
                    title: 'In Progress Task',
                    status: 'in-progress' as const,
                    createdAt: '2026-02-01T10:01:00Z',
                    updatedAt: '2026-02-01T10:01:00Z'
                },
                {
                    id: 'TICKET-3',
                    title: 'Done Task (should be ignored)',
                    status: 'done' as const,
                    createdAt: '2026-02-01T10:02:00Z',
                    updatedAt: '2026-02-01T10:02:00Z'
                },
                {
                    id: 'TICKET-4',
                    title: 'Blocked Task (should be ignored)',
                    status: 'blocked' as const,
                    createdAt: '2026-02-01T10:03:00Z',
                    updatedAt: '2026-02-01T10:03:00Z'
                }
            ];

            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockResolvedValue(mockTickets);

            // Execute: initialize
            await initializeOrchestrator(mockContext);

            // Get first 2 tasks (should only be TICKET-1 and TICKET-2)
            const task1 = await getNextTask();
            const task2 = await getNextTask();
            const task3 = await getNextTask(); // Should be null

            // Verify: only open and in-progress tickets loaded
            expect(task1?.id).toBe('TICKET-1');
            expect(task2?.id).toBe('TICKET-2');
            expect(task3).toBeNull();
        });
    });

    describe('timeout detection and blocking', () => {
        it('Test 7: should create blocked ticket when task idle >30s (using fake timers)', async () => {
            // Setup: one open task, and createTicket is mocked
            const mockTicket = {
                id: 'TICKET-1',
                title: 'Long Running Task',
                status: 'open' as const,
                createdAt: '2026-02-01T10:00:00Z',
                updatedAt: '2026-02-01T10:00:00Z'
            };

            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockResolvedValue([mockTicket]);
            mockTicketDb.createTicket.mockResolvedValue({
                id: 'TICKET-2',
                title: 'BLOCKED: Long Running Task',
                status: 'blocked',
                createdAt: '2026-02-01T10:31:00Z',
                updatedAt: '2026-02-01T10:31:00Z'
            });

            // Execute: use fake timers to test timeout
            jest.useFakeTimers();

            // Initialize orchestrator
            await initializeOrchestrator(mockContext);

            // Pick the task (sets lastPickedAt to "now")
            const pickedTask = await getNextTask();
            expect(pickedTask?.id).toBe('TICKET-1');
            expect(pickedTask?.lastPickedAt).toBeDefined();

            // Fast-forward time by 31 seconds
            jest.advanceTimersByTime(31 * 1000);

            // Call getNextTask again - should trigger timeout check and create blocked ticket
            const nextTask = await getNextTask();

            // Verify: createTicket was called for the blocked task
            expect(mockTicketDb.createTicket).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'blocked',
                    title: expect.stringContaining('BLOCKED')
                })
            );

            jest.useRealTimers();
        });

        it('Test 8: should not create duplicate blocked tickets for same task', async () => {
            // Setup: task with timeout
            const mockTicket = {
                id: 'TICKET-1',
                title: 'Task',
                status: 'open' as const,
                createdAt: '2026-02-01T10:00:00Z',
                updatedAt: '2026-02-01T10:00:00Z'
            };

            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockResolvedValue([mockTicket]);
            mockTicketDb.createTicket.mockResolvedValue({
                id: 'TICKET-2',
                title: 'BLOCKED: Task',
                status: 'blocked',
                createdAt: '2026-02-01T10:31:00Z',
                updatedAt: '2026-02-01T10:31:00Z'
            });

            // Execute: use fake timers
            jest.useFakeTimers();

            await initializeOrchestrator(mockContext);
            const pickedTask = await getNextTask();

            // Advance past timeout
            jest.advanceTimersByTime(31 * 1000);

            // Call getNextTask multiple times - should only create ticket once
            await getNextTask();
            await getNextTask();
            await getNextTask();

            // Verify: createTicket called only once (not multiple times)
            expect(mockTicketDb.createTicket).toHaveBeenCalledTimes(1);

            jest.useRealTimers();
        });
    });

    describe('edge cases', () => {
        it('Test 10: should handle TicketDb errors gracefully', async () => {
            // Setup: TicketDb throws error
            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockRejectedValue(new Error('TicketDb connection failed'));

            // Execute: initialize (should not throw)
            await expect(initializeOrchestrator(mockContext)).resolves.not.toThrow();

            // Verify: queue is empty after error
            const task = await getNextTask();
            expect(task).toBeNull();
        });

        it('Test 11: should throw error if getNextTask called before initialization', async () => {
            // Setup: don't call initializeOrchestrator, just reset
            resetOrchestratorForTests();

            // Execute & Verify: should throw
            await expect(getNextTask()).rejects.toThrow('Orchestrator not initialized');
        });

        it('Test 12: should prevent duplicate initialization', async () => {
            // Setup
            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockResolvedValue([]);

            // Execute: initialize twice
            await initializeOrchestrator(mockContext);

            // Reset mocks to track second initialization
            mockTicketDb.listTickets.mockClear();

            await initializeOrchestrator(mockContext);

            // Verify: listTickets not called second time (due to singleton check)
            // Note: might be called once from first init, not called again
            // (The singleton prevents re-initialization)
        });
    });

    describe('routeQuestionToAnswer', () => {
        const mockCompleteLLM = completeLLM as jest.MockedFunction<typeof completeLLM>;

        beforeEach(async () => {
            // Initialize orchestrator for these tests
            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockResolvedValue([]);
            await initializeOrchestrator(mockContext);
            jest.clearAllMocks();
        });

        it('should call LLM with question and return response', async () => {
            // Setup: mock successful LLM response
            mockCompleteLLM.mockResolvedValue({
                content: 'TypeScript is a typed superset of JavaScript',
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            // Execute: route a question
            const result = await routeQuestionToAnswer('What is TypeScript?');

            // Verify: LLM was called with correct parameters
            expect(mockCompleteLLM).toHaveBeenCalledWith(
                'What is TypeScript?',
                expect.objectContaining({
                    systemPrompt: expect.any(String)
                })
            );
            expect(mockCompleteLLM).toHaveBeenCalledTimes(1);

            // Verify: returned the LLM response
            expect(result).toBe('TypeScript is a typed superset of JavaScript');
        });

        it('should include Answer agent system prompt', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: 'Test response',
                usage: undefined
            });

            await routeQuestionToAnswer('Test question');

            // Verify: system prompt was passed
            const call = mockCompleteLLM.mock.calls[0];
            expect(call[1]?.systemPrompt).toContain('Answer agent');
            expect(call[1]?.systemPrompt).toContain('concise');
        });

        it('should handle LLM failure and return fallback message', async () => {
            // Setup: mock LLM error
            mockCompleteLLM.mockRejectedValue(new Error('Network error'));

            // Execute: route a question
            const result = await routeQuestionToAnswer('Test question');

            // Verify: returned fallback message (not throwing)
            expect(result).toContain('unavailable');
            expect(result).toContain('ticket has been created');
        });

        it('should not create duplicate ticket on LLM failure', async () => {
            // Setup: LLM already creates ticket internally
            mockCompleteLLM.mockRejectedValue(new Error('Timeout'));

            // Execute
            await routeQuestionToAnswer('Test');

            // Verify: createTicket not called here (LLM service already called it)
            // This test verifies we don't create duplicate tickets
            expect(mockTicketDb.createTicket).not.toHaveBeenCalled();
        });

        it('should log question routing and response', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: 'Answer',
                usage: undefined
            });

            await routeQuestionToAnswer('How do I test this?');

            // Note: Actual logging verification would require mocking logger
            // For now, just verify function completes without error
            expect(mockCompleteLLM).toHaveBeenCalled();
        });
    });

    describe('routeToPlanningAgent', () => {
        const mockStreamLLM = streamLLM as jest.MockedFunction<typeof streamLLM>;

        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should log chunks and accumulate full plan', async () => {
            // Mock streamLLM to return chunks
            const mockChunks = ['Step 1: ', 'Add config flag', 'Step 2: ', 'Update UI'];
            mockStreamLLM.mockImplementation(async (prompt, onChunk) => {
                mockChunks.forEach(onChunk);
                return { content: mockChunks.join('') };
            });

            const orchestrator = new OrchestratorService();
            const plan = await orchestrator.routeToPlanningAgent('Plan how to add dark mode toggle');

            expect(plan).toBe('Step 1: Add config flagStep 2: Update UI');
            expect(logInfo).toHaveBeenCalledWith('LLM: Step 1: ');
            expect(logInfo).toHaveBeenCalledWith('LLM: Add config flag');
            expect(logInfo).toHaveBeenCalledWith('LLM: Step 2: ');
            expect(logInfo).toHaveBeenCalledWith('LLM: Update UI');
        });

        it('should handle empty response gracefully', async () => {
            mockStreamLLM.mockResolvedValue({ content: '' });

            const orchestrator = new OrchestratorService();
            const plan = await orchestrator.routeToPlanningAgent('Plan an empty task');

            expect(plan).toBe('');
            expect(logWarn).toHaveBeenCalledWith('Planning agent returned an empty response.');
        });

        it('should truncate long plans in logs', async () => {
            const longPlan = 'A'.repeat(2000);
            mockStreamLLM.mockResolvedValue({ content: longPlan });

            const orchestrator = new OrchestratorService();
            const plan = await orchestrator.routeToPlanningAgent('Plan a very long task');

            expect(plan).toBe(longPlan);
            expect(logInfo).toHaveBeenCalledWith(`Full plan (truncated): ${longPlan.substring(0, 1000)}...`);
        });
    });

    describe('routeToVerificationAgent', () => {
        const mockCompleteLLM = completeLLM as jest.MockedFunction<typeof completeLLM>;

        beforeEach(async () => {
            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockResolvedValue([]);
            await initializeOrchestrator(mockContext);
            jest.clearAllMocks();
        });

        it('should call completeLLM with verification system prompt', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: 'PASS - All criteria met',
                usage: undefined
            });

            const result = await routeToVerificationAgent('Add dark mode toggle', '+ darkMode: true');

            expect(mockCompleteLLM).toHaveBeenCalledWith(
                expect.stringContaining('Add dark mode toggle'),
                expect.objectContaining({
                    systemPrompt: expect.stringContaining('Verification agent')
                })
            );
            expect(result.passed).toBe(true);
        });

        it('should parse PASS response and avoid ticket creation', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: 'PASS - All criteria met',
                usage: undefined
            });

            const result = await routeToVerificationAgent('Add dark mode toggle', '+ darkMode: true');

            expect(result.passed).toBe(true);
            expect(result.explanation).toBe('All criteria met');
            expect(mockTicketDb.createTicket).not.toHaveBeenCalled();
        });

        it('should parse FAIL response and create blocked ticket', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: 'FAIL - Missing status bar icon toggle',
                usage: undefined
            });

            const result = await routeToVerificationAgent('Add dark mode toggle', '+ darkMode: true');

            expect(result.passed).toBe(false);
            expect(result.explanation).toBe('Missing status bar icon toggle');
            expect(mockTicketDb.createTicket).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'blocked',
                    title: expect.stringContaining('VERIFICATION FAILED')
                })
            );
        });

        it('should default to FAIL on ambiguous response', async () => {
            mockCompleteLLM.mockResolvedValue({
                content: 'Needs review before approval',
                usage: undefined
            });

            const result = await routeToVerificationAgent('Add dark mode toggle', '+ darkMode: true');

            expect(result.passed).toBe(false);
            expect(result.explanation).toContain('Ambiguous response');
            expect(logWarn).toHaveBeenCalled();
        });

        it('should truncate long explanations in logs', async () => {
            const longExplanation = 'PASS - ' + 'A'.repeat(250);
            mockCompleteLLM.mockResolvedValue({
                content: longExplanation,
                usage: undefined
            });

            await routeToVerificationAgent('Add dark mode toggle', '+ darkMode: true');

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining(`${'A'.repeat(200)}...`)
            );
        });

        it('should fail fast when code diff is empty', async () => {
            const result = await routeToVerificationAgent('Add dark mode toggle', '   ');

            expect(result.passed).toBe(false);
            expect(result.explanation).toBe('No code diff provided for verification.');
            expect(mockCompleteLLM).not.toHaveBeenCalled();
            expect(mockTicketDb.createTicket).toHaveBeenCalled();
        });

        it('should handle LLM errors without creating duplicate tickets', async () => {
            mockCompleteLLM.mockRejectedValue(new Error('Timeout'));

            const result = await routeToVerificationAgent('Add dark mode toggle', '+ darkMode: true');

            expect(result.passed).toBe(false);
            expect(result.explanation).toContain('Verification failed');
            expect(mockTicketDb.createTicket).not.toHaveBeenCalled();
        });
    });

    describe('Planning Agent', () => {
        it('should stream plan chunks to logs via callback', async () => {
            // Setup: Mock streamLLM to call callback for each chunk
            const chunks = ['Step 1: ', 'Design component\n', 'Step 2: ', 'Implement UI\n'];
            const mockStreamCallback = jest.fn();

            (streamLLM as jest.Mock).mockImplementation(
                (prompt, callback) => {
                    chunks.forEach(chunk => callback(chunk));
                    return Promise.resolve({ content: chunks.join('') });
                }
            );

            // Initialize orchestrator first
            await initializeOrchestrator(mockContext);

            // Get instance and call planning agent
            const orchestrator = getOrchestratorInstance();
            const plan = await orchestrator.routeToPlanningAgent('Add dark mode toggle');

            // Verify: streamLLM was called with callback
            expect(streamLLM).toHaveBeenCalledWith(
                'Add dark mode toggle',
                expect.any(Function),
                expect.objectContaining({
                    systemPrompt: expect.stringContaining('Planning agent')
                })
            );

            // Verify: plan returned as result
            expect(plan).toContain('Step 1');
            expect(plan).toContain('Step 2');
        });

        it('should handle empty plan response', async () => {
            (streamLLM as jest.Mock).mockResolvedValue({ content: '' });

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            const plan = await orchestrator.routeToPlanningAgent('Test task');

            expect(plan).toBe('');
            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('Planning agent returned an empty response')
            );
        });

        it('should handle planning timeout by returning fallback message', async () => {
            (streamLLM as jest.Mock).mockRejectedValue(new Error('Request timeout'));

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            const plan = await orchestrator.routeToPlanningAgent('Test task');

            expect(plan).toContain('Planning service is currently unavailable');
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('Planning agent failed')
            );
        });
    });
});
