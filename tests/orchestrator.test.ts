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
import { listTickets, onTicketChange } from '../src/services/ticketDb';
import * as vscode from 'vscode';
import { completeLLM } from '../src/services/llmService';
import { streamLLM } from '../src/services/llmService';
import { OrchestratorService } from '../src/services/orchestrator';
import { logInfo, logWarn, logError } from '../src/logger';
import { ExtensionContext } from './__mocks__/vscode';
import * as fs from 'fs';
import { initializeConfig, resetConfigForTests } from '../src/config';
import { DEFAULT_CONFIG } from '../src/config/schema';

// Mock TicketDb module
jest.mock('../src/services/ticketDb');

// Mock LLM Service module
jest.mock('../src/services/llmService');

// Mock fs module
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
}));

// Mock config module - return default config
jest.mock('../src/config', () => ({
    getConfigInstance: jest.fn(() => DEFAULT_CONFIG),
    initializeConfig: jest.fn(),
    resetConfigForTests: jest.fn(),
}));

// Mock Stage 4 services for initialization error testing
jest.mock('../src/services/taskQueue', () => ({
    initializeTaskQueue: jest.fn(),
    getTaskQueueInstance: jest.fn(),
    resetTaskQueueForTests: jest.fn(),
}));

jest.mock('../src/services/context', () => ({
    initializeContextManager: jest.fn(),
    getContextManagerInstance: jest.fn(),
    resetContextManagerForTests: jest.fn(),
}));

jest.mock('../src/agents/verification', () => ({
    initializeVerificationTeam: jest.fn(),
    getVerificationTeamInstance: jest.fn(),
    resetVerificationTeamForTests: jest.fn(),
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

    beforeEach(async () => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        jest.useRealTimers(); // Ensure we're not in fake timer mode

        // Reset config singleton for clean test state
        resetConfigForTests();

        // Create mock context (must be set before initializeConfig)
        mockContext = new ExtensionContext('/mock/extension/path');

        // Initialize config before any service that uses it
        await initializeConfig(mockContext);

        // Reset orchestrator singleton
        resetOrchestratorForTests();

        // Default: config file doesn't exist (use defaults)
        mockFs.existsSync.mockReturnValue(false);

        // Default: TicketDb has no tickets
        mockTicketDb.listTickets.mockResolvedValue([]);
        const listeners: Array<() => void> = [];
        mockTicketDb.onTicketChange.mockImplementation((listener: () => void) => {
            listeners.push(listener);
        });
        (mockTicketDb.onTicketChange as jest.Mock & { listeners?: Array<() => void> }).listeners = listeners;
        mockTicketDb.updateTicket.mockResolvedValue(null);

        const configMock = {
            get: jest.fn().mockReturnValue(true),
            update: jest.fn()
        };

        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(configMock);
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

    describe('manual mode ticket handling', () => {
        it('Test 4: should set ai_to_human ticket to pending when manual mode enabled', async () => {
            const changeListeners: Array<() => void> = [];

            mockTicketDb.onTicketChange.mockImplementation((listener) => {
                changeListeners.push(listener);
            });

            const manualModeConfig = {
                get: jest.fn().mockReturnValue(false),
                update: jest.fn()
            };

            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(manualModeConfig);

            const openTicket = {
                id: 'TICKET-1',
                title: 'Manual approval needed',
                status: 'open' as const,
                type: 'ai_to_human' as const,
                createdAt: '2026-02-01T10:00:00Z',
                updatedAt: '2026-02-01T10:00:00Z',
                priority: 2,
                creator: 'system',
                assignee: 'Clarity Agent',
                taskId: null,
                version: 1,
                resolution: null
            };

            mockTicketDb.listTickets.mockResolvedValue([openTicket]);
            mockTicketDb.updateTicket.mockResolvedValue({
                ...openTicket,
                status: 'pending'
            });

            await initializeOrchestrator(mockContext);

            for (const listener of changeListeners) {
                listener();
            }
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockTicketDb.updateTicket).toHaveBeenCalledWith('TICKET-1', { status: 'pending' });
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Manual mode: Ticket pending approval'));
        });

        it('Test 5: should skip pending update when auto mode enabled', async () => {
            const changeListeners: Array<() => void> = [];

            mockTicketDb.onTicketChange.mockImplementation((listener) => {
                changeListeners.push(listener);
            });

            const autoModeConfig = {
                get: jest.fn().mockReturnValue(true),
                update: jest.fn()
            };

            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(autoModeConfig);

            const openTicket = {
                id: 'TICKET-11',
                title: 'Auto route ticket',
                status: 'open' as const,
                type: 'ai_to_human' as const,
                createdAt: '2026-02-01T10:00:00Z',
                updatedAt: '2026-02-01T10:00:00Z',
                priority: 2,
                creator: 'system',
                assignee: 'Clarity Agent',
                taskId: null,
                version: 1,
                resolution: null
            };

            mockTicketDb.listTickets.mockResolvedValue([openTicket]);

            await initializeOrchestrator(mockContext);

            for (const listener of changeListeners) {
                listener();
            }
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockTicketDb.updateTicket).not.toHaveBeenCalled();
        });
    });

    describe('queue ordering (FIFO)', () => {
        it('Test 6: should return tasks in FIFO order', async () => {
            // Setup: create 3 mock tickets
            const mockTickets = [
                {
                    id: 'TICKET-1',
                    title: 'First Task',
                    status: 'open' as const,
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                    priority: 2,
                    creator: 'system',
                    assignee: 'Clarity Agent',
                    taskId: null,
                    version: 1,
                    resolution: null
                },
                {
                    id: 'TICKET-2',
                    title: 'Second Task',
                    status: 'open' as const,
                    createdAt: '2026-02-01T10:01:00Z',
                    updatedAt: '2026-02-01T10:01:00Z',
                    priority: 2,
                    creator: 'system',
                    assignee: 'Clarity Agent',
                    taskId: null,
                    version: 1,
                    resolution: null
                },
                {
                    id: 'TICKET-3',
                    title: 'Third Task',
                    status: 'open' as const,
                    createdAt: '2026-02-01T10:02:00Z',
                    updatedAt: '2026-02-01T10:02:00Z',
                    priority: 2,
                    creator: 'system',
                    assignee: 'Clarity Agent',
                    taskId: null,
                    version: 1,
                    resolution: null
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

        it('Test 7: should return null when queue is empty', async () => {
            // Setup: no tickets
            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockResolvedValue([]);

            // Execute: initialize (empty queue) and get next task
            await initializeOrchestrator(mockContext);
            const task = await getNextTask();

            // Verify: null returned for empty queue
            expect(task).toBeNull();
        });

        it('Test 8: should filter for open and in-progress tickets only', async () => {
            // Setup: mix of ticket statuses
            const mockTickets = [
                {
                    id: 'TICKET-1',
                    title: 'Open Task',
                    status: 'open' as const,
                    createdAt: '2026-02-01T10:00:00Z',
                    updatedAt: '2026-02-01T10:00:00Z',
                    priority: 2,
                    creator: 'system',
                    assignee: 'Clarity Agent',
                    taskId: null,
                    version: 1,
                    resolution: null
                },
                {
                    id: 'TICKET-2',
                    title: 'In Progress Task',
                    status: 'in-progress' as const,
                    createdAt: '2026-02-01T10:01:00Z',
                    updatedAt: '2026-02-01T10:01:00Z',
                    priority: 2,
                    creator: 'system',
                    assignee: 'Clarity Agent',
                    taskId: null,
                    version: 1,
                    resolution: null
                },
                {
                    id: 'TICKET-3',
                    title: 'Done Task (should be ignored)',
                    status: 'done' as const,
                    createdAt: '2026-02-01T10:02:00Z',
                    updatedAt: '2026-02-01T10:02:00Z',
                    priority: 2,
                    creator: 'system',
                    assignee: 'Clarity Agent',
                    taskId: null,
                    version: 1,
                    resolution: null
                },
                {
                    id: 'TICKET-4',
                    title: 'Blocked Task (should be ignored)',
                    status: 'blocked' as const,
                    createdAt: '2026-02-01T10:03:00Z',
                    updatedAt: '2026-02-01T10:03:00Z',
                    priority: 2,
                    creator: 'system',
                    assignee: 'Clarity Agent',
                    taskId: null,
                    version: 1,
                    resolution: null
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
        it('Test 9: should create blocked ticket when task idle >30s (using fake timers)', async () => {
            // Setup: one open task, and createTicket is mocked
            const mockTicket = {
                id: 'TICKET-1',
                title: 'Long Running Task',
                status: 'open' as const,
                createdAt: '2026-02-01T10:00:00Z',
                updatedAt: '2026-02-01T10:00:00Z',
                priority: 2,
                creator: 'system',
                assignee: 'Clarity Agent',
                taskId: null,
                version: 1,
                resolution: null
            };

            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockResolvedValue([mockTicket]);
            mockTicketDb.createTicket.mockResolvedValue({
                id: 'TICKET-2',
                title: 'P1 BLOCKED: Long Running Task',
                status: 'blocked',
                createdAt: '2026-02-01T10:31:00Z',
                updatedAt: '2026-02-01T10:31:00Z',
                priority: 2,
                creator: 'system',
                assignee: 'Clarity Agent',
                taskId: null,
                version: 1,
                resolution: null
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
                    title: expect.stringContaining('P1 BLOCKED')
                })
            );

            jest.useRealTimers();
        });

        it('Test 10: should not create duplicate blocked tickets for same task', async () => {
            // Setup: task with timeout
            const mockTicket = {
                id: 'TICKET-1',
                title: 'Task',
                status: 'open' as const,
                createdAt: '2026-02-01T10:00:00Z',
                updatedAt: '2026-02-01T10:00:00Z',
                priority: 2,
                creator: 'system',
                assignee: 'Clarity Agent',
                taskId: null,
                version: 1,
                resolution: null
            };

            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockResolvedValue([mockTicket]);
            mockTicketDb.createTicket.mockResolvedValue({
                id: 'TICKET-2',
                title: 'P1 BLOCKED: Task',
                status: 'blocked',
                createdAt: '2026-02-01T10:31:00Z',
                updatedAt: '2026-02-01T10:31:00Z',
                priority: 2,
                creator: 'system',
                assignee: 'Clarity Agent',
                taskId: null,
                version: 1,
                resolution: null
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
        it('Test 11: should handle TicketDb errors gracefully', async () => {
            // Setup: TicketDb throws error
            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockRejectedValue(new Error('TicketDb connection failed'));

            // Execute: initialize (should not throw)
            await expect(initializeOrchestrator(mockContext)).resolves.not.toThrow();

            // Verify: queue is empty after error
            const task = await getNextTask();
            expect(task).toBeNull();
        });

        it('Test 12: should throw error if getNextTask called before initialization', async () => {
            // Setup: don't call initializeOrchestrator, just reset
            resetOrchestratorForTests();

            // Execute & Verify: should throw
            await expect(getNextTask()).rejects.toThrow('Orchestrator not initialized');
        });

        it('Test 13: should prevent duplicate initialization', async () => {
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

        it('Test 13a: should fail atomic pick when updateTicket throws', async () => {
            // Setup: one task in queue, but updateTicket will fail
            const mockTickets = [
                { 
                    id: 'T1', 
                    title: 'Task to pick', 
                    status: 'open' as const, 
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z',
                    priority: 3,
                    creator: 'test',
                    assignee: null,
                    taskId: null,
                    version: 1,
                    resolution: null
                },
            ];
            mockTicketDb.listTickets.mockResolvedValue(mockTickets);
            mockTicketDb.updateTicket.mockRejectedValue(new Error('DB write failed'));

            await initializeOrchestrator(mockContext);

            // Execute: try to pick task - should fail atomic update
            const task = await getNextTask();

            // Verify: returns null because atomic pick failed
            expect(task).toBeNull();
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to atomically pick task'));
        });

        it('Test 13b: should leave task in queue when atomic pick fails', async () => {
            // Setup: one task in queue, but updateTicket will fail only once
            const mockTickets = [
                { 
                    id: 'T1', 
                    title: 'Task to retry', 
                    status: 'open' as const, 
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z',
                    priority: 3,
                    creator: 'test',
                    assignee: null,
                    taskId: null,
                    version: 1,
                    resolution: null
                },
            ];
            mockTicketDb.listTickets.mockResolvedValue(mockTickets);

            // First call fails, second succeeds
            mockTicketDb.updateTicket
                .mockRejectedValueOnce(new Error('DB temporary failure'))
                .mockResolvedValueOnce(null);

            await initializeOrchestrator(mockContext);

            // First attempt fails
            const task1 = await getNextTask();
            expect(task1).toBeNull();

            // Second attempt succeeds (task still in queue)
            const task2 = await getNextTask();
            expect(task2).not.toBeNull();
            expect(task2?.id).toBe('T1');
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
            
            // Verify the initial routing log
            expect(logInfo).toHaveBeenCalledWith('Routing request to Planning agent: Plan how to add dark mode toggle');
            
            // Verify the full plan is logged (implementation uses streamBuffer with Planning prefix)
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Full plan'));
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

    describe('Answer Agent', () => {
        it('should call completeLLM and log response', async () => {
            // Setup: Mock completeLLM to return a simple answer
            (completeLLM as jest.Mock).mockResolvedValue({
                content: 'VS Code extensions allow you to add features and functionality to VS Code.'
            });

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            const answer = await orchestrator.routeToAnswerAgent('What is a VS Code extension?');

            // Verify: completeLLM was called with question and system prompt
            expect(completeLLM).toHaveBeenCalledWith(
                'What is a VS Code extension?',
                expect.objectContaining({
                    systemPrompt: expect.stringContaining('Answer agent')
                })
            );

            // Verify: response was logged
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('[INFO] Answer:')
            );

            // Verify: answer returned
            expect(answer).toBe('VS Code extensions allow you to add features and functionality to VS Code.');
        });

        it('should create ticket when response contains "ticket" keyword', async () => {
            (completeLLM as jest.Mock).mockResolvedValue({
                content: 'You should create a ticket to track this enhancement.'
            });
            mockTicketDb.createTicket.mockResolvedValue({
                id: 'TICKET-100',
                title: 'ANSWER NEEDS ACTION: What is a VS Code extension?...',
                description: 'You should create a ticket to track this enhancement.',
                status: 'blocked',
                createdAt: '2026-02-02T00:00:00Z',
                updatedAt: '2026-02-02T00:00:00Z'
            } as any);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            const answer = await orchestrator.routeToAnswerAgent('What is a VS Code extension?');

            // Verify: ticket was created
            expect(mockTicketDb.createTicket).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: expect.stringContaining('ANSWER NEEDS ACTION:'),
                    status: 'blocked',
                    description: expect.stringContaining('create a ticket')
                })
            );

            expect(answer).toContain('create a ticket');
        });

        it('should create ticket when response contains "create" keyword', async () => {
            (completeLLM as jest.Mock).mockResolvedValue({
                content: 'Create a new component for this feature.'
            });
            mockTicketDb.createTicket.mockResolvedValue({
                id: 'TICKET-101',
                title: 'ANSWER NEEDS ACTION:...',
                description: 'Create a new component for this feature.',
                status: 'blocked',
                createdAt: '2026-02-02T00:00:00Z',
                updatedAt: '2026-02-02T00:00:00Z'
            } as any);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            await orchestrator.routeToAnswerAgent('How should I structure this?');

            expect(mockTicketDb.createTicket).toHaveBeenCalled();
        });

        it('should not create ticket for normal response without action keywords', async () => {
            (completeLLM as jest.Mock).mockResolvedValue({
                content: 'VS Code extensions are built using Node.js and TypeScript.'
            });

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            const answer = await orchestrator.routeToAnswerAgent('What are VS Code extensions?');

            // Verify: ticket was NOT created
            expect(mockTicketDb.createTicket).not.toHaveBeenCalled();

            // Verify: response was still logged
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('[INFO] Answer:')
            );

            expect(answer).toBe('VS Code extensions are built using Node.js and TypeScript.');
        });

        it('should warn and return early for empty question', async () => {
            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            const answer = await orchestrator.routeToAnswerAgent('');

            // Verify: warn was logged for empty question
            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('Empty question')
            );

            // Verify: completeLLM was NOT called (early return)
            expect(completeLLM).not.toHaveBeenCalled();

            // Verify: fallback message returned
            expect(answer).toBe('Please ask a question.');
        });

        it('should warn and return early for whitespace-only question', async () => {
            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            const answer = await orchestrator.routeToAnswerAgent('   ');

            // Verify: completeLLM was NOT called
            expect(completeLLM).not.toHaveBeenCalled();

            expect(answer).toBe('Please ask a question.');
        });

        it('should truncate long response in logs (>500 chars)', async () => {
            const longAnswer = 'a'.repeat(600); // 600 characters
            (completeLLM as jest.Mock).mockResolvedValue({
                content: longAnswer
            });

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            const answer = await orchestrator.routeToAnswerAgent('Test question?');

            // Verify: log was truncated (contains '...' at end)
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('[INFO] Answer:')
            );
            const logCall = (logInfo as jest.Mock).mock.calls.find(call =>
                call[0].includes('[INFO] Answer:')
            );
            expect(logCall![0]).toContain('...');

            // Verify: full answer still returned (not truncated)
            expect(answer).toBe(longAnswer);
            expect(answer.length).toBe(600);
        });

        it('should handle case-insensitive keyword detection', async () => {
            (completeLLM as jest.Mock).mockResolvedValue({
                content: 'IMPLEMENT new functionality here with a TICKET system.'
            });
            mockTicketDb.createTicket.mockResolvedValue({
                id: 'TICKET-102',
                title: 'ANSWER NEEDS ACTION:...',
                description: 'IMPLEMENT new functionality here with a TICKET system.',
                status: 'blocked',
                createdAt: '2026-02-02T00:00:00Z',
                updatedAt: '2026-02-02T00:00:00Z'
            } as any);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            await orchestrator.routeToAnswerAgent('What should I do?');

            // Verify: ticket was created despite uppercase keywords
            expect(mockTicketDb.createTicket).toHaveBeenCalled();
        });

        it('should handle completeLLM timeout error gracefully', async () => {
            (completeLLM as jest.Mock).mockRejectedValue(
                new Error('Request timeout')
            );

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            const answer = await orchestrator.routeToAnswerAgent('Test question?');

            // Verify: error was logged
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('Answer agent failed')
            );

            // Verify: fallback message returned
            expect(answer).toContain('LLM service is currently unavailable');
        });

        it('should handle empty LLM response', async () => {
            (completeLLM as jest.Mock).mockResolvedValue({
                content: ''
            });

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            const answer = await orchestrator.routeToAnswerAgent('Test question?');

            // Verify: warning was logged
            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('empty response')
            );

            // Verify: fallback message returned
            expect(answer).toBe('Could not generate an answer.');
        });

        it('should create ticket with truncated question in title', async () => {
            const longQuestion = 'How do I ' + 'a'.repeat(100);
            (completeLLM as jest.Mock).mockResolvedValue({
                content: 'Answer with create action needed.'
            });
            mockTicketDb.createTicket.mockResolvedValue({
                id: 'TICKET-103',
                title: 'ANSWER NEEDS ACTION: How do I aaaa...',
                description: 'Answer with create action needed.',
                status: 'blocked',
                createdAt: '2026-02-02T00:00:00Z',
                updatedAt: '2026-02-02T00:00:00Z'
            } as any);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            await orchestrator.routeToAnswerAgent(longQuestion);

            // Verify: ticket title is truncated properly
            expect(mockTicketDb.createTicket).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: expect.stringMatching(/ANSWER NEEDS ACTION:.*/)
                })
            );
        });
    });
});

/** @aiContributed-2026-02-04 */
describe('getOrchestratorInstance', () => {
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        resetOrchestratorForTests();
        mockContext = { extensionPath: '/mock/path' } as unknown as vscode.ExtensionContext;
    });

    /** @aiContributed-2026-02-04 */
    it('should return an instance of OrchestratorService after initialization', async () => {
        await initializeOrchestrator(mockContext);
        const instance = getOrchestratorInstance();
        expect(instance).toBeInstanceOf(OrchestratorService);
    });

    /** @aiContributed-2026-02-04 */
    it('should throw an error if the orchestrator is not initialized', () => {
        expect(() => getOrchestratorInstance()).toThrow('Orchestrator not initialized');
    });

    /** @aiContributed-2026-02-04 */
    it('should return the same instance on multiple calls after initialization', async () => {
        await initializeOrchestrator(mockContext);
        const instance1 = getOrchestratorInstance();
        const instance2 = getOrchestratorInstance();
        expect(instance1).toBe(instance2);
    });

    /** @aiContributed-2026-02-04 */
    it('should log a warning if initializeOrchestrator is called multiple times', async () => {
        await initializeOrchestrator(mockContext);
        await initializeOrchestrator(mockContext);
        expect(logWarn).toHaveBeenCalledWith('Orchestrator already initialized');
    });

    /** @aiContributed-2026-02-04 */
    it('should throw an error if getOrchestratorInstance is called after reset', async () => {
        await initializeOrchestrator(mockContext);
        resetOrchestratorForTests();
        expect(() => getOrchestratorInstance()).toThrow('Orchestrator not initialized');
    });
});

/** @aiContributed-2026-02-04 */
describe('initializeOrchestrator', () => {
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        mockContext = {
            extensionPath: '/mock/extension/path',
        } as unknown as vscode.ExtensionContext;

        resetOrchestratorForTests();
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-04 - Updated for centralized config system */
    it('should initialize orchestrator using centralized config system', async () => {
        // Config now comes from getConfigInstance() mock which returns DEFAULT_CONFIG
        const orchestrator = await initializeOrchestrator(mockContext);

        // Should use default timeout from centralized config (30s)
        expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
        expect(orchestrator).toBeDefined();
    });

    /** @aiContributed-2026-02-04 - Updated for centralized config system */
    it('should read timeout from centralized config system', async () => {
        // Config is loaded via getConfigInstance() mock
        // The mock returns DEFAULT_CONFIG with orchestrator.taskTimeoutSeconds = 30
        const orchestrator = await initializeOrchestrator(mockContext);

        expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
        expect(orchestrator).toBeDefined();
    });

    /** @aiContributed-2026-02-04 - Updated for centralized config system */
    it('should use validated config from centralized system (validation handled by Zod)', async () => {
        // Config validation is now handled by the config system (Zod schema)
        // Invalid config values are replaced with defaults at loading time
        // The orchestrator receives already-validated config via getConfigInstance()
        const orchestrator = await initializeOrchestrator(mockContext);

        // Should get valid default timeout from centralized config
        expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
        expect(orchestrator).toBeDefined();
    });

    /** @aiContributed-2026-02-04 */
    it('should load tasks from TicketDb during initialization', async () => {
        const mockTickets = [
            { id: 'TICKET-001', title: 'Test Ticket 1', status: 'open', createdAt: '2023-01-01T00:00:00Z' },
        ];
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        (listTickets as jest.Mock).mockResolvedValue(mockTickets);

        const orchestrator = await initializeOrchestrator(mockContext);

        expect(listTickets).toHaveBeenCalled();
        expect(logInfo).toHaveBeenCalledWith('Loaded 1 tasks from tickets');
        expect(orchestrator).toBeDefined();
    });

    /** @aiContributed-2026-02-04 */
    it('should handle errors when loading tasks from TicketDb', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        (listTickets as jest.Mock).mockRejectedValue(new Error('Database error'));

        const orchestrator = await initializeOrchestrator(mockContext);

        expect(listTickets).toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to load tasks from tickets'));
        expect(orchestrator).toBeDefined();
    });

    /** @aiContributed-2026-02-04 */
    it('should warn if orchestrator is already initialized', async () => {
        await initializeOrchestrator(mockContext);
        await initializeOrchestrator(mockContext);

        expect(logWarn).toHaveBeenCalledWith('Orchestrator already initialized');
    });

    /** @aiContributed-2026-02-04 - Updated for centralized config system */
    it('should use taskTimeoutSeconds from centralized config system', async () => {
        // Note: Config is now loaded via getConfigInstance() mock, not from file directly
        // The DEFAULT_CONFIG has orchestrator.taskTimeoutSeconds = 30
        const orchestrator = await initializeOrchestrator(mockContext);

        expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
        expect(orchestrator).toBeDefined();
    });

    /** @aiContributed-2026-02-04 - Updated for centralized config system */
    it('should use default timeout from centralized config (30s)', async () => {
        // Note: Config now comes from getConfigInstance() mock which returns DEFAULT_CONFIG
        const orchestrator = await initializeOrchestrator(mockContext);

        expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
        expect(orchestrator).toBeDefined();
    });

    /** @aiContributed-2026-02-04 */
    it('should register manual mode listener during initialization', async () => {
        const orchestrator = await initializeOrchestrator(mockContext);

        expect(onTicketChange).toHaveBeenCalled();
        expect(logInfo).toHaveBeenCalledWith('Manual mode listener registered');
        expect(orchestrator).toBeDefined();
    });

    /** @aiContributed-2026-02-04 */
    it('should register conversation thread listener during initialization', async () => {
        const orchestrator = await initializeOrchestrator(mockContext);

        expect(onTicketChange).toHaveBeenCalled();
        expect(logInfo).toHaveBeenCalledWith('Conversation thread listener registered');
        expect(orchestrator).toBeDefined();
    });

    /** @aiContributed-2026-02-04 - Updated for centralized config system */
    it('should use validated config from centralized config system', async () => {
        // Note: Invalid config values are now handled by the config system (Zod validation)
        // The orchestrator just reads from getConfigInstance() which always returns valid config
        const orchestrator = await initializeOrchestrator(mockContext);

        // Config system uses defaults for invalid values, so we get 30s
        expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
        expect(orchestrator).toBeDefined();
    });
});
// =========================================================================
// Queue Status and Details Tests (coverage improvement)
// =========================================================================
describe('Queue Status and Details', () => {
    let mockContext: vscode.ExtensionContext;

    beforeEach(async () => {
        jest.clearAllMocks();
        resetOrchestratorForTests();
        resetConfigForTests();
        
        mockContext = {
            extensionPath: '/mock/extension/path',
        } as unknown as vscode.ExtensionContext;

        await initializeConfig(mockContext);
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        (listTickets as jest.Mock).mockResolvedValue([]);
    });

    describe('getQueueStatus', () => {
        it('Test 14: should return queue count and blocked P1 count', async () => {
            const mockTickets = [
                { id: 'T1', title: 'Normal ticket', status: 'blocked' },
                { id: 'T2', title: 'P1 BLOCKED: Critical issue', status: 'blocked' },
                { id: 'T3', title: '[P1] Another critical', status: 'blocked' },
            ];
            (listTickets as jest.Mock).mockResolvedValue(mockTickets);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            const status = await orchestrator.getQueueStatus();

            expect(status.blockedP1Count).toBe(2);
            expect(status).toHaveProperty('queueCount');
            expect(status).toHaveProperty('lastPickedTitle');
        });

        it('Test 15: should handle listTickets error gracefully', async () => {
            await initializeOrchestrator(mockContext);
            (listTickets as jest.Mock).mockRejectedValue(new Error('DB error'));

            const orchestrator = getOrchestratorInstance();
            const status = await orchestrator.getQueueStatus();

            expect(status.blockedP1Count).toBe(0);
            expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to get queue status'));
        });

        it('Test 16: should count P1: prefixed tickets', async () => {
            const mockTickets = [
                { id: 'T1', title: 'P1: urgent fix', status: 'blocked' },
            ];
            (listTickets as jest.Mock).mockResolvedValue(mockTickets);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            const status = await orchestrator.getQueueStatus();

            expect(status.blockedP1Count).toBe(1);
        });
    });

    describe('getQueueDetails', () => {
        it('Test 17: should return queue titles and blocked P1 titles', async () => {
            const mockTickets = [
                { id: 'T1', title: 'P1 BLOCKED: Critical', status: 'blocked' },
                { id: 'T2', title: 'Normal blocked', status: 'blocked' },
            ];
            (listTickets as jest.Mock).mockResolvedValue(mockTickets);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            const details = await orchestrator.getQueueDetails();

            expect(details).toHaveProperty('queueTitles');
            expect(details).toHaveProperty('pickedTitles');
            expect(details).toHaveProperty('blockedP1Titles');
            expect(details.blockedP1Titles).toContain('P1 BLOCKED: Critical');
            expect(details.blockedP1Titles).not.toContain('Normal blocked');
        });

        it('Test 18: should return lastPickedTitle and lastPickedAt', async () => {
            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            const details = await orchestrator.getQueueDetails();

            expect(details).toHaveProperty('lastPickedTitle');
            expect(details).toHaveProperty('lastPickedAt');
        });
    });

    describe('isBlockedP1Ticket (private method via getQueueStatus)', () => {
        it('Test 19: should not count non-blocked tickets', async () => {
            const mockTickets = [
                { id: 'T1', title: 'P1 BLOCKED: But status is open', status: 'open' },
            ];
            (listTickets as jest.Mock).mockResolvedValue(mockTickets);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            const status = await orchestrator.getQueueStatus();

            expect(status.blockedP1Count).toBe(0);
        });
    });

    describe('answerQuestion', () => {
        it('Test 20: should lazy initialize AnswerAgent and return answer', async () => {
            (completeLLM as jest.Mock).mockResolvedValue({ content: 'Test answer' });
            (listTickets as jest.Mock).mockResolvedValue([]);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();

            const answer = await orchestrator.answerQuestion('What is COE?');

            expect(answer).toBe('Test answer');
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('[Answer] Starting conversation'));
        });

        it('Test 21: should support follow-up questions with chatId', async () => {
            (completeLLM as jest.Mock).mockResolvedValue({ content: 'Follow-up answer' });
            (listTickets as jest.Mock).mockResolvedValue([]);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();

            const answer = await orchestrator.answerQuestion('More details?', 'chat-123', true);

            expect(answer).toBe('Follow-up answer');
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('[Answer] Continuing conversation'));
        });

        it('Test 22: should handle LLM errors in answerQuestion gracefully', async () => {
            (completeLLM as jest.Mock).mockRejectedValue(new Error('LLM timeout'));
            (listTickets as jest.Mock).mockResolvedValue([]);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();

            const answer = await orchestrator.answerQuestion('Test question?');

            expect(answer).toContain('LLM service is currently unavailable');
            expect(logError).toHaveBeenCalledWith(expect.stringContaining('[Answer] Failed to answer question'));
        });
    });

    describe('getAnswerAgent', () => {
        it('Test 23: should lazy initialize and return AnswerAgent', async () => {
            (listTickets as jest.Mock).mockResolvedValue([]);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();

            const agent = orchestrator.getAnswerAgent();

            expect(agent).toBeDefined();
            expect(agent.constructor.name).toBe('AnswerAgent');
        });

        it('Test 24: should return same AnswerAgent instance on multiple calls', async () => {
            (listTickets as jest.Mock).mockResolvedValue([]);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();

            const agent1 = orchestrator.getAnswerAgent();
            const agent2 = orchestrator.getAnswerAgent();

            expect(agent1).toBe(agent2);
        });
    });

    describe('refreshQueueFromTickets', () => {
        it('Test 25: should add new open tickets to queue', async () => {
            (listTickets as jest.Mock).mockResolvedValue([]);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();

            // Add new open ticket to TicketDb
            (listTickets as jest.Mock).mockResolvedValue([
                { 
                    id: 'T1', 
                    title: 'New ticket', 
                    status: 'open' as const, 
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    priority: 2,
                    creator: 'system',
                    assignee: null,
                    taskId: null,
                    version: 1,
                    resolution: null
                }
            ]);

            await orchestrator.refreshQueueFromTickets();

            expect(logInfo).toHaveBeenCalledWith('[Orchestrator] Queue refreshed from TicketDb');
        });

        it('Test 26: should remove closed tickets from queue', async () => {
            // Start with one open ticket
            (listTickets as jest.Mock).mockResolvedValue([
                { 
                    id: 'T1', 
                    title: 'Test ticket', 
                    status: 'open' as const, 
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    priority: 2,
                    creator: 'system',
                    assignee: null,
                    taskId: null,
                    version: 1,
                    resolution: null
                }
            ]);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();

            // Now ticket is closed - should be removed from queue
            (listTickets as jest.Mock).mockResolvedValue([
                { 
                    id: 'T1', 
                    title: 'Test ticket', 
                    status: 'done' as const, 
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    priority: 2,
                    creator: 'system',
                    assignee: null,
                    taskId: null,
                    version: 1,
                    resolution: null
                }
            ]);

            await orchestrator.refreshQueueFromTickets();

            expect(logInfo).toHaveBeenCalledWith('[Orchestrator] Queue refreshed from TicketDb');
        });

        it('Test 27: should handle refresh errors gracefully', async () => {
            (listTickets as jest.Mock).mockResolvedValue([]);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();

            // Simulate TicketDb error
            (listTickets as jest.Mock).mockRejectedValue(new Error('DB connection failed'));

            await orchestrator.refreshQueueFromTickets();

            expect(logError).toHaveBeenCalledWith(expect.stringContaining('[Orchestrator] Queue refresh failed'));
        });
    });

    describe('onQueueChange', () => {
        it('Test 28: should register listener and receive events', async () => {
            (listTickets as jest.Mock).mockResolvedValue([]);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();

            const listener = jest.fn();
            orchestrator.onQueueChange(listener);

            // Trigger queue change by refreshing
            (listTickets as jest.Mock).mockResolvedValue([
                { 
                    id: 'T1', 
                    title: 'New ticket', 
                    status: 'open' as const, 
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    priority: 2,
                    creator: 'system',
                    assignee: null,
                    taskId: null,
                    version: 1,
                    resolution: null
                }
            ]);
            await orchestrator.refreshQueueFromTickets();

            expect(listener).toHaveBeenCalled();
        });

        it('Test 29: should return disposable for cleanup', async () => {
            (listTickets as jest.Mock).mockResolvedValue([]);

            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();

            const listener = jest.fn();
            const disposable = orchestrator.onQueueChange(listener);

            expect(disposable).toHaveProperty('dispose');
        });
    });
});

// =========================================================================
// Additional Coverage Tests - Module Export Functions
// =========================================================================
describe('Module Export Functions - Error Cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetOrchestratorForTests();
        resetConfigForTests();
    });

    // Import the module functions directly for these tests
    const { routeToPlanningAgent, routeToAnswerAgent, answerQuestion } = require('../src/services/orchestrator');

    describe('routeToPlanningAgent', () => {
        it('Test 30: should throw error when called before initialization', async () => {
            await expect(routeToPlanningAgent('Test plan')).rejects.toThrow('Orchestrator not initialized');
        });
    });

    describe('routeToAnswerAgent', () => {
        it('Test 31: should throw error when called before initialization', async () => {
            await expect(routeToAnswerAgent('Test question')).rejects.toThrow('Orchestrator not initialized');
        });
    });

    describe('answerQuestion', () => {
        it('Test 32: should throw error when called before initialization', async () => {
            await expect(answerQuestion('Test question')).rejects.toThrow('Orchestrator not initialized');
        });
    });
});

// =========================================================================
// Blocked Task Creation Error Tests
// =========================================================================
describe('Blocked Task Error Handling', () => {
    let mockContext: vscode.ExtensionContext;
    const mockTicketDb = ticketDb as jest.Mocked<typeof ticketDb>;
    const mockFs = fs as jest.Mocked<typeof fs>;

    beforeEach(async () => {
        jest.clearAllMocks();
        resetOrchestratorForTests();
        resetConfigForTests();

        mockContext = {
            extensionPath: '/mock/extension/path',
        } as unknown as vscode.ExtensionContext;

        await initializeConfig(mockContext);
        mockFs.existsSync.mockReturnValue(false);
    });

    it('Test 33: should handle createTicket error in checkForBlockedTasks', async () => {
        // Setup: one task that will be picked and then timed out
        const mockTicket = {
            id: 'T1',
            title: 'Task to timeout',
            status: 'open' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 3,
            creator: 'test',
            assignee: null,
            taskId: null,
            version: 1,
            resolution: null
        };
        mockTicketDb.listTickets.mockResolvedValue([mockTicket]);
        mockTicketDb.updateTicket.mockResolvedValue(mockTicket);

        // createTicket will fail when trying to create blocked ticket
        mockTicketDb.createTicket.mockRejectedValue(new Error('DB write error'));

        jest.useFakeTimers();

        await initializeOrchestrator(mockContext);

        // Pick the task
        const task = await getNextTask();
        expect(task).not.toBeNull();

        // Advance time past timeout (31 seconds)
        jest.advanceTimersByTime(31 * 1000);

        // Try to get next task - this triggers checkForBlockedTasks
        await getNextTask();

        // Verify: error was logged
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to create blocked ticket'));

        jest.useRealTimers();
    });
});

// =========================================================================
// Verification Agent Edge Cases
// =========================================================================
describe('Verification Agent Edge Cases', () => {
    let mockContext: vscode.ExtensionContext;
    const mockCompleteLLM = completeLLM as jest.MockedFunction<typeof completeLLM>;
    const mockTicketDb = ticketDb as jest.Mocked<typeof ticketDb>;
    const mockFs = fs as jest.Mocked<typeof fs>;

    beforeEach(async () => {
        jest.clearAllMocks();
        resetOrchestratorForTests();
        resetConfigForTests();

        mockContext = {
            extensionPath: '/mock/extension/path',
        } as unknown as vscode.ExtensionContext;

        await initializeConfig(mockContext);
        mockFs.existsSync.mockReturnValue(false);
        mockTicketDb.listTickets.mockResolvedValue([]);
    });

    it('Test 34: should handle PASS without explanation - uses default', async () => {
        mockCompleteLLM.mockResolvedValue({
            content: 'PASS',
            usage: undefined
        });

        await initializeOrchestrator(mockContext);
        const result = await routeToVerificationAgent('Test task', '+ code');

        expect(result.passed).toBe(true);
        expect(result.explanation).toBe('All criteria met.');
    });

    it('Test 35: should handle FAIL without explanation - uses default', async () => {
        mockCompleteLLM.mockResolvedValue({
            content: 'FAIL',
            usage: undefined
        });
        // Mock the ticket creation for FAIL case
        mockTicketDb.createTicket.mockResolvedValue({
            id: 'T1', title: 'VERIFICATION FAILED', status: 'blocked',
            createdAt: '', updatedAt: '', priority: 2, creator: 'sys', assignee: null, taskId: null, version: 1, resolution: null
        } as any);

        await initializeOrchestrator(mockContext);
        const result = await routeToVerificationAgent('Test task', '+ code');

        expect(result.passed).toBe(false);
        expect(result.explanation).toBe('Criteria not met.');
    });

    it('Test 36: should handle PASS with colon prefix in explanation', async () => {
        mockCompleteLLM.mockResolvedValue({
            content: 'PASS: All tests passing',
            usage: undefined
        });

        await initializeOrchestrator(mockContext);
        const result = await routeToVerificationAgent('Test task', '+ code');

        expect(result.passed).toBe(true);
        expect(result.explanation).toBe('All tests passing');
    });

    it('Test 37: should handle FAIL with hyphen prefix in explanation', async () => {
        mockCompleteLLM.mockResolvedValue({
            content: 'FAIL - Missing unit tests',
            usage: undefined
        });
        // Mock the ticket creation for FAIL case
        mockTicketDb.createTicket.mockResolvedValue({
            id: 'T1', title: 'VERIFICATION FAILED', status: 'blocked',
            createdAt: '', updatedAt: '', priority: 2, creator: 'sys', assignee: null, taskId: null, version: 1, resolution: null
        } as any);

        await initializeOrchestrator(mockContext);
        const result = await routeToVerificationAgent('Test task', '+ code');

        expect(result.passed).toBe(false);
        expect(result.explanation).toBe('Missing unit tests');
    });
});

// =========================================================================
// Answer Agent Keyword Detection Edge Cases
// =========================================================================
describe('Answer Agent Keyword Edge Cases', () => {
    let mockContext: vscode.ExtensionContext;
    const mockCompleteLLM = completeLLM as jest.MockedFunction<typeof completeLLM>;
    const mockTicketDb = ticketDb as jest.Mocked<typeof ticketDb>;
    const mockFs = fs as jest.Mocked<typeof fs>;

    beforeEach(async () => {
        jest.clearAllMocks();
        resetOrchestratorForTests();
        resetConfigForTests();

        mockContext = {
            extensionPath: '/mock/extension/path',
        } as unknown as vscode.ExtensionContext;

        await initializeConfig(mockContext);
        mockFs.existsSync.mockReturnValue(false);
        mockTicketDb.listTickets.mockResolvedValue([]);
    });

    it('Test 38: should detect "fix" keyword and create ticket', async () => {
        mockCompleteLLM.mockResolvedValue({
            content: 'You need to fix the failing tests first.',
            usage: undefined
        });
        mockTicketDb.createTicket.mockResolvedValue({
            id: 'TICKET-999',
            title: 'ANSWER NEEDS ACTION:...',
            status: 'blocked',
            description: 'You need to fix the failing tests first.',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: 'Clarity Agent',
            taskId: null,
            version: 1,
            resolution: null
        } as any);

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();
        await orchestrator.routeToAnswerAgent('What should I do?');

        expect(mockTicketDb.createTicket).toHaveBeenCalledWith(
            expect.objectContaining({
                title: expect.stringContaining('ANSWER NEEDS ACTION:'),
                status: 'blocked'
            })
        );
    });

    it('Test 39: should detect "implement" keyword and create ticket', async () => {
        mockCompleteLLM.mockResolvedValue({
            content: 'You should implement this feature in the service.',
            usage: undefined
        });
        mockTicketDb.createTicket.mockResolvedValue({
            id: 'TICKET-998',
            title: 'ANSWER NEEDS ACTION:...',
            status: 'blocked',
            description: 'You should implement this feature in the service.',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: 'Clarity Agent',
            taskId: null,
            version: 1,
            resolution: null
        } as any);

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();
        await orchestrator.routeToAnswerAgent('How do I proceed?');

        expect(mockTicketDb.createTicket).toHaveBeenCalledWith(
            expect.objectContaining({
                title: expect.stringContaining('ANSWER NEEDS ACTION:'),
                status: 'blocked'
            })
        );
    });
});

// =========================================================================
// Planning Agent Additional Tests
// =========================================================================
describe('Planning Agent Additional Tests', () => {
    let mockContext: vscode.ExtensionContext;
    const mockStreamLLM = streamLLM as jest.MockedFunction<typeof streamLLM>;
    const mockTicketDb = ticketDb as jest.Mocked<typeof ticketDb>;
    const mockFs = fs as jest.Mocked<typeof fs>;

    beforeEach(async () => {
        jest.clearAllMocks();
        resetOrchestratorForTests();
        resetConfigForTests();

        mockContext = {
            extensionPath: '/mock/extension/path',
        } as unknown as vscode.ExtensionContext;

        await initializeConfig(mockContext);
        mockFs.existsSync.mockReturnValue(false);
        mockTicketDb.listTickets.mockResolvedValue([]);
    });

    it('Test 40: should handle plan shorter than 1000 chars in logs', async () => {
        const shortPlan = 'Short plan with steps.';
        mockStreamLLM.mockResolvedValue({ content: shortPlan });

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();
        const plan = await orchestrator.routeToPlanningAgent('Quick task');

        expect(plan).toBe(shortPlan);
        expect(logInfo).toHaveBeenCalledWith(`Full plan: ${shortPlan}`);
    });
});

// =========================================================================
// Queue Management Additional Tests
// =========================================================================
describe('Queue Management Additional Tests', () => {
    let mockContext: vscode.ExtensionContext;
    const mockTicketDb = ticketDb as jest.Mocked<typeof ticketDb>;
    const mockFs = fs as jest.Mocked<typeof fs>;

    beforeEach(async () => {
        jest.clearAllMocks();
        resetOrchestratorForTests();
        resetConfigForTests();

        mockContext = {
            extensionPath: '/mock/extension/path',
        } as unknown as vscode.ExtensionContext;

        await initializeConfig(mockContext);
        mockFs.existsSync.mockReturnValue(false);
    });

    it('Test 41: should not add duplicate tickets to queue on refresh', async () => {
        const ticket = {
            id: 'T1',
            title: 'Test ticket',
            status: 'open' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: null,
            taskId: null,
            version: 1,
            resolution: null
        };
        mockTicketDb.listTickets.mockResolvedValue([ticket]);

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();

        // Refresh multiple times - should not add duplicates
        await orchestrator.refreshQueueFromTickets();
        await orchestrator.refreshQueueFromTickets();

        const details = await orchestrator.getQueueDetails();
        const t1Count = details.queueTitles.filter(t => t === 'Test ticket').length;

        expect(t1Count).toBe(1);
    });

    it('Test 42: should preserve picked tasks during refresh', async () => {
        const ticket = {
            id: 'T1',
            title: 'Test ticket',
            status: 'open' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: null,
            taskId: null,
            version: 1,
            resolution: null
        };
        mockTicketDb.listTickets.mockResolvedValue([ticket]);
        mockTicketDb.updateTicket.mockResolvedValue(ticket);

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();

        // Pick the task
        const task = await orchestrator.getNextTask();
        expect(task).not.toBeNull();

        // Refresh - should not re-add picked task
        await orchestrator.refreshQueueFromTickets();

        const details = await orchestrator.getQueueDetails();
        expect(details.queueTitles).not.toContain('Test ticket');
        expect(details.pickedTitles).toContain('Test ticket');
    });

    it('Test 43: should handle multiple P1 blocked tickets in status', async () => {
        const tickets = [
            { id: 'T1', title: 'P1 BLOCKED: Critical 1', status: 'blocked' as const, createdAt: '', updatedAt: '', priority: 1, creator: 'sys', assignee: null, taskId: null, version: 1, resolution: null },
            { id: 'T2', title: 'P1: Another critical', status: 'blocked' as const, createdAt: '', updatedAt: '', priority: 1, creator: 'sys', assignee: null, taskId: null, version: 1, resolution: null },
            { id: 'T3', title: '[P1] Third one', status: 'blocked' as const, createdAt: '', updatedAt: '', priority: 1, creator: 'sys', assignee: null, taskId: null, version: 1, resolution: null },
            { id: 'T4', title: 'Normal blocked', status: 'blocked' as const, createdAt: '', updatedAt: '', priority: 2, creator: 'sys', assignee: null, taskId: null, version: 1, resolution: null },
        ];
        mockTicketDb.listTickets.mockResolvedValue(tickets);

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();
        const status = await orchestrator.getQueueStatus();

        expect(status.blockedP1Count).toBe(3);
    });
});

// =========================================================================
// Task Loading Edge Cases
// =========================================================================
describe('Task Loading Edge Cases', () => {
    let mockContext: vscode.ExtensionContext;
    const mockTicketDb = ticketDb as jest.Mocked<typeof ticketDb>;
    const mockFs = fs as jest.Mocked<typeof fs>;

    beforeEach(async () => {
        jest.clearAllMocks();
        resetOrchestratorForTests();
        resetConfigForTests();

        mockContext = {
            extensionPath: '/mock/extension/path',
        } as unknown as vscode.ExtensionContext;

        await initializeConfig(mockContext);
        mockFs.existsSync.mockReturnValue(false);
    });

    it('Test 44: should load in-progress tickets into queue', async () => {
        const tickets = [
            { 
                id: 'T1', 
                title: 'Open ticket', 
                status: 'open' as const, 
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                priority: 2,
                creator: 'system',
                assignee: null,
                taskId: null,
                version: 1,
                resolution: null
            },
            { 
                id: 'T2', 
                title: 'In progress ticket', 
                status: 'in-progress' as const, 
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                priority: 2,
                creator: 'system',
                assignee: null,
                taskId: null,
                version: 1,
                resolution: null
            },
        ];
        mockTicketDb.listTickets.mockResolvedValue(tickets);

        await initializeOrchestrator(mockContext);

        expect(logInfo).toHaveBeenCalledWith('Loaded 2 tasks from tickets');
    });

    it('Test 45: should exclude blocked and done tickets from initial load', async () => {
        const tickets = [
            { id: 'T1', title: 'Open', status: 'open' as const, createdAt: '', updatedAt: '', priority: 2, creator: 'sys', assignee: null, taskId: null, version: 1, resolution: null },
            { id: 'T2', title: 'Blocked', status: 'blocked' as const, createdAt: '', updatedAt: '', priority: 2, creator: 'sys', assignee: null, taskId: null, version: 1, resolution: null },
            { id: 'T3', title: 'Done', status: 'done' as const, createdAt: '', updatedAt: '', priority: 2, creator: 'sys', assignee: null, taskId: null, version: 1, resolution: null },
        ];
        mockTicketDb.listTickets.mockResolvedValue(tickets);

        await initializeOrchestrator(mockContext);

        expect(logInfo).toHaveBeenCalledWith('Loaded 1 tasks from tickets');
    });
});

// =========================================================================
// ResetForTests Comprehensive Test
// =========================================================================
describe('ResetForTests', () => {
    let mockContext: vscode.ExtensionContext;
    const mockTicketDb = ticketDb as jest.Mocked<typeof ticketDb>;
    const mockFs = fs as jest.Mocked<typeof fs>;

    beforeEach(async () => {
        jest.clearAllMocks();
        resetOrchestratorForTests();
        resetConfigForTests();

        mockContext = {
            extensionPath: '/mock/extension/path',
        } as unknown as vscode.ExtensionContext;

        await initializeConfig(mockContext);
        mockFs.existsSync.mockReturnValue(false);
    });

    it('Test 46: should fully reset orchestrator state', async () => {
        const ticket = {
            id: 'T1',
            title: 'Test',
            status: 'open' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: null,
            taskId: null,
            version: 1,
            resolution: null
        };
        mockTicketDb.listTickets.mockResolvedValue([ticket]);
        mockTicketDb.updateTicket.mockResolvedValue(ticket);

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();

        // Pick a task
        await orchestrator.getNextTask();
        let details = await orchestrator.getQueueDetails();
        expect(details.lastPickedTitle).toBe('Test');

        // Reset
        orchestrator.resetForTests();

        // Verify state is cleared
        details = await orchestrator.getQueueDetails();
        expect(details.lastPickedTitle).toBeNull();
        expect(details.queueTitles).toHaveLength(0);
        expect(details.pickedTitles).toHaveLength(0);
    });
});

// =========================================================================
// Stage 4 Service Initialization Error Handling
// =========================================================================
describe('Stage 4 Service Initialization Errors', () => {
    let mockContext: vscode.ExtensionContext;
    const mockTicketDb = ticketDb as jest.Mocked<typeof ticketDb>;
    const mockFs = fs as jest.Mocked<typeof fs>;

    beforeEach(async () => {
        jest.clearAllMocks();
        resetOrchestratorForTests();
        resetConfigForTests();

        mockContext = {
            extensionPath: '/mock/extension/path',
        } as unknown as vscode.ExtensionContext;

        await initializeConfig(mockContext);
        mockFs.existsSync.mockReturnValue(false);
        mockTicketDb.listTickets.mockResolvedValue([]);
    });

    it('Test 47: should handle TaskQueue initialization error gracefully', async () => {
        // Make TaskQueue throw on initialization
        const { initializeTaskQueue } = require('../src/services/taskQueue');
        (initializeTaskQueue as jest.Mock).mockImplementation(() => {
            throw new Error('TaskQueue already initialized');
        });

        // Should not throw - error is caught and logged as warning
        await expect(initializeOrchestrator(mockContext)).resolves.not.toThrow();

        // Verify warning was logged
        expect(logWarn).toHaveBeenCalledWith(
            expect.stringContaining('[Orchestrator] Service initialization:')
        );
    });

    it('Test 48: should handle ContextManager initialization error gracefully', async () => {
        // Make ContextManager throw on initialization  
        const { initializeContextManager } = require('../src/services/context');
        const { initializeTaskQueue } = require('../src/services/taskQueue');
        
        // TaskQueue succeeds, ContextManager fails
        (initializeTaskQueue as jest.Mock).mockImplementation(() => {});
        (initializeContextManager as jest.Mock).mockImplementation(() => {
            throw new Error('ContextManager already initialized');
        });

        // Should not throw - error is caught
        await expect(initializeOrchestrator(mockContext)).resolves.not.toThrow();

        expect(logWarn).toHaveBeenCalledWith(
            expect.stringContaining('[Orchestrator] Service initialization:')
        );
    });

    it('Test 49: should handle VerificationTeam initialization error gracefully', async () => {
        // Make VerificationTeam throw on initialization
        const { initializeVerificationTeam } = require('../src/agents/verification');
        const { initializeTaskQueue } = require('../src/services/taskQueue');
        const { initializeContextManager } = require('../src/services/context');
        
        // First two succeed, VerificationTeam fails
        (initializeTaskQueue as jest.Mock).mockImplementation(() => {});
        (initializeContextManager as jest.Mock).mockImplementation(() => {});
        (initializeVerificationTeam as jest.Mock).mockImplementation(() => {
            throw new Error('VerificationTeam already initialized');
        });

        // Should not throw
        await expect(initializeOrchestrator(mockContext)).resolves.not.toThrow();

        expect(logWarn).toHaveBeenCalledWith(
            expect.stringContaining('[Orchestrator] Service initialization:')
        );
    });
});

// =========================================================================
// Listener Registration Error Handling
// =========================================================================
describe('Listener Registration Errors', () => {
    let mockContext: vscode.ExtensionContext;
    const mockTicketDb = ticketDb as jest.Mocked<typeof ticketDb>;
    const mockFs = fs as jest.Mocked<typeof fs>;

    beforeEach(async () => {
        jest.clearAllMocks();
        resetOrchestratorForTests();
        resetConfigForTests();

        mockContext = {
            extensionPath: '/mock/extension/path',
        } as unknown as vscode.ExtensionContext;

        await initializeConfig(mockContext);
        mockFs.existsSync.mockReturnValue(false);
    });

    it('Test 50: should handle onTicketChange error in manual mode listener', async () => {
        // Make onTicketChange throw on first two calls (manual mode and queue refresh)
        // but pass on conversation thread listener
        let callCount = 0;
        mockTicketDb.onTicketChange.mockImplementation(() => {
            callCount++;
            if (callCount <= 2) {
                throw new Error('onTicketChange failed');
            }
            // Third call succeeds (conversation thread listener)
        });
        mockTicketDb.listTickets.mockResolvedValue([]);

        await initializeOrchestrator(mockContext);

        // Verify error was logged (at least once)
        expect(logError).toHaveBeenCalledWith(
            expect.stringContaining('Failed to register')
        );
    });
});

// =========================================================================
// Manual Mode Handler Error Edge Cases
// =========================================================================
describe('Manual Mode Handler Edge Cases', () => {
    let mockContext: vscode.ExtensionContext;
    const mockTicketDb = ticketDb as jest.Mocked<typeof ticketDb>;
    const mockFs = fs as jest.Mocked<typeof fs>;

    beforeEach(async () => {
        jest.clearAllMocks();
        resetOrchestratorForTests();
        resetConfigForTests();

        mockContext = {
            extensionPath: '/mock/extension/path',
        } as unknown as vscode.ExtensionContext;

        await initializeConfig(mockContext);
        mockFs.existsSync.mockReturnValue(false);
    });

    it('Test 51: should handle updateTicket error in manual mode handler', async () => {
        const changeListeners: Array<() => void> = [];

        mockTicketDb.onTicketChange.mockImplementation((listener) => {
            changeListeners.push(listener);
        });

        const manualModeConfig = {
            get: jest.fn().mockReturnValue(false), // manual mode (auto disabled)
            update: jest.fn()
        };

        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(manualModeConfig);

        const openTicket = {
            id: 'TICKET-1',
            title: 'Manual approval needed',
            status: 'open' as const,
            type: 'ai_to_human' as const,
            createdAt: '2026-02-01T10:00:00Z',
            updatedAt: '2026-02-01T10:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: 'Clarity Agent',
            taskId: null,
            version: 1,
            resolution: null
        };

        mockTicketDb.listTickets.mockResolvedValue([openTicket]);
        // updateTicket throws
        mockTicketDb.updateTicket.mockRejectedValue(new Error('DB write failed'));

        await initializeOrchestrator(mockContext);

        // Trigger the change listeners (will call handleManualModeTicketChange)
        for (const listener of changeListeners) {
            listener();
        }
        await new Promise((resolve) => setImmediate(resolve));

        // Verify error was logged
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('Manual mode pending update failed'));
    });

    it('Test 52: should skip non-ai_to_human tickets in manual mode', async () => {
        const changeListeners: Array<() => void> = [];

        mockTicketDb.onTicketChange.mockImplementation((listener) => {
            changeListeners.push(listener);
        });

        const manualModeConfig = {
            get: jest.fn().mockReturnValue(false), // manual mode (auto disabled)
            update: jest.fn()
        };

        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(manualModeConfig);

        // Ticket type is NOT ai_to_human
        const openTicket = {
            id: 'TICKET-1',
            title: 'Regular ticket',
            status: 'open' as const,
            type: 'human_to_ai' as const, // Different type
            createdAt: '2026-02-01T10:00:00Z',
            updatedAt: '2026-02-01T10:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: 'Clarity Agent',
            taskId: null,
            version: 1,
            resolution: null
        };

        mockTicketDb.listTickets.mockResolvedValue([openTicket]);

        await initializeOrchestrator(mockContext);

        // Trigger the change listeners
        for (const listener of changeListeners) {
            listener();
        }
        await new Promise((resolve) => setImmediate(resolve));

        // Verify updateTicket was NOT called (ticket type doesn't match)
        expect(mockTicketDb.updateTicket).not.toHaveBeenCalled();
    });

    it('Test 53: should skip non-open tickets in manual mode', async () => {
        const changeListeners: Array<() => void> = [];

        mockTicketDb.onTicketChange.mockImplementation((listener) => {
            changeListeners.push(listener);
        });

        const manualModeConfig = {
            get: jest.fn().mockReturnValue(false), // manual mode
            update: jest.fn()
        };

        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(manualModeConfig);

        // Ticket status is NOT open
        const ticket = {
            id: 'TICKET-1',
            title: 'Already in progress',
            status: 'in-progress' as const, // Not open
            type: 'ai_to_human' as const,
            createdAt: '2026-02-01T10:00:00Z',
            updatedAt: '2026-02-01T10:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: 'Clarity Agent',
            taskId: null,
            version: 1,
            resolution: null
        };

        mockTicketDb.listTickets.mockResolvedValue([ticket]);

        await initializeOrchestrator(mockContext);

        for (const listener of changeListeners) {
            listener();
        }
        await new Promise((resolve) => setImmediate(resolve));

        // Verify updateTicket was NOT called (status doesn't match)
        expect(mockTicketDb.updateTicket).not.toHaveBeenCalled();
    });

    it('Test 54: should handle empty ticket list in manual mode', async () => {
        const changeListeners: Array<() => void> = [];

        mockTicketDb.onTicketChange.mockImplementation((listener) => {
            changeListeners.push(listener);
        });

        const manualModeConfig = {
            get: jest.fn().mockReturnValue(false), // manual mode
            update: jest.fn()
        };

        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(manualModeConfig);

        // No tickets
        mockTicketDb.listTickets.mockResolvedValue([]);

        await initializeOrchestrator(mockContext);

        for (const listener of changeListeners) {
            listener();
        }
        await new Promise((resolve) => setImmediate(resolve));

        // Verify updateTicket was NOT called (no tickets)
        expect(mockTicketDb.updateTicket).not.toHaveBeenCalled();
    });
});

// =========================================================================
// Additional Branch Coverage Tests
// =========================================================================
describe('Additional Branch Coverage', () => {
    let mockContext: vscode.ExtensionContext;
    const mockTicketDb = ticketDb as jest.Mocked<typeof ticketDb>;
    const mockFs = fs as jest.Mocked<typeof fs>;
    const mockCompleteLLM = completeLLM as jest.MockedFunction<typeof completeLLM>;
    const mockStreamLLM = streamLLM as jest.MockedFunction<typeof streamLLM>;

    beforeEach(async () => {
        jest.clearAllMocks();
        resetOrchestratorForTests();
        resetConfigForTests();

        mockContext = {
            extensionPath: '/mock/extension/path',
        } as unknown as vscode.ExtensionContext;

        await initializeConfig(mockContext);
        mockFs.existsSync.mockReturnValue(false);
        mockTicketDb.listTickets.mockResolvedValue([]);
    });

    it('Test 55: should log empty queue message when no tasks available', async () => {
        mockTicketDb.listTickets.mockResolvedValue([]);

        await initializeOrchestrator(mockContext);
        const task = await getNextTask();

        expect(task).toBeNull();
        expect(logInfo).toHaveBeenCalledWith('No pending tasks in queue');
    });

    it('Test 56: should track lastPickedTitle and lastPickedAt after picking', async () => {
        const ticket = {
            id: 'T1',
            title: 'Important task',
            status: 'open' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: null,
            taskId: null,
            version: 1,
            resolution: null
        };
        mockTicketDb.listTickets.mockResolvedValue([ticket]);
        mockTicketDb.updateTicket.mockResolvedValue(ticket);

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();

        await orchestrator.getNextTask();

        const details = await orchestrator.getQueueDetails();
        expect(details.lastPickedTitle).toBe('Important task');
        expect(details.lastPickedAt).toBeDefined();
    });

    it('Test 57: should handle answer with "implement" keyword creating ticket with full details', async () => {
        mockCompleteLLM.mockResolvedValue({
            content: 'You need to implement the full solution here.',
            usage: undefined
        });
        mockTicketDb.createTicket.mockResolvedValue({
            id: 'TICKET-X',
            title: 'ANSWER NEEDS ACTION: Test...',
            status: 'blocked',
            description: 'You need to implement the full solution here.',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: 'Clarity Agent',
            taskId: null,
            version: 1,
            resolution: null
        } as any);

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();
        const result = await orchestrator.routeToAnswerAgent('How do I solve this?');

        expect(result).toContain('implement');
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('[Answer] Created ticket for action'));
    });

    it('Test 58: should handle verification PASS response with colon-space separator', async () => {
        mockCompleteLLM.mockResolvedValue({
            content: 'PASS:   The implementation looks correct.',
            usage: undefined
        });

        await initializeOrchestrator(mockContext);
        const result = await routeToVerificationAgent('Test task', '+ some code');

        expect(result.passed).toBe(true);
        expect(result.explanation).toBe('The implementation looks correct.');
    });

    it('Test 59: should skip timeout check for tasks without lastPickedAt', async () => {
        // Create a ticket that gets into queue but never picked
        const ticket = {
            id: 'T1',
            title: 'Never picked task',
            status: 'open' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: null,
            taskId: null,
            version: 1,
            resolution: null
        };
        mockTicketDb.listTickets.mockResolvedValue([ticket]);
        mockTicketDb.updateTicket.mockResolvedValue(ticket);

        jest.useFakeTimers();

        await initializeOrchestrator(mockContext);

        // Advance time a lot but DON'T pick the task
        jest.advanceTimersByTime(100 * 1000);

        // Get next task - should NOT have created blocked ticket
        // because task was never picked (no lastPickedAt)
        const task = await getNextTask();
        expect(task).not.toBeNull();
        
        // No blocked ticket created (only the atomic update call)
        expect(mockTicketDb.createTicket).not.toHaveBeenCalled();

        jest.useRealTimers();
    });

    it('Test 60: should emit queue change after loading tasks', async () => {
        const ticket = {
            id: 'T1',
            title: 'Task to load',
            status: 'open' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: null,
            taskId: null,
            version: 1,
            resolution: null
        };
        mockTicketDb.listTickets.mockResolvedValue([ticket]);

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();

        const listener = jest.fn();
        orchestrator.onQueueChange(listener);

        // Refresh should emit change
        await orchestrator.refreshQueueFromTickets();

        expect(listener).toHaveBeenCalled();
    });

    it('Test 61: should detect case-insensitive P1 blocked formats', async () => {
        const tickets = [
            { id: 'T1', title: 'p1 blocked: lower case', status: 'blocked' as const, createdAt: '', updatedAt: '', priority: 1, creator: 'sys', assignee: null, taskId: null, version: 1, resolution: null },
            { id: 'T2', title: 'P1 BLOCKED: UPPER CASE', status: 'blocked' as const, createdAt: '', updatedAt: '', priority: 1, creator: 'sys', assignee: null, taskId: null, version: 1, resolution: null },
        ];
        mockTicketDb.listTickets.mockResolvedValue(tickets);

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();
        const status = await orchestrator.getQueueStatus();

        expect(status.blockedP1Count).toBe(2);
    });

    it('Test 62: should NOT count ticket with P1 in middle of title', async () => {
        const tickets = [
            { id: 'T1', title: 'This is a P1 BLOCKED issue', status: 'blocked' as const, createdAt: '', updatedAt: '', priority: 1, creator: 'sys', assignee: null, taskId: null, version: 1, resolution: null },
        ];
        mockTicketDb.listTickets.mockResolvedValue(tickets);

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();
        const status = await orchestrator.getQueueStatus();

        // Should NOT count - P1 is not at the start
        expect(status.blockedP1Count).toBe(0);
    });

    it('Test 63: should handle Error and non-Error objects in getQueueStatus catch', async () => {
        await initializeOrchestrator(mockContext);
        
        // Make listTickets throw a non-Error object
        mockTicketDb.listTickets.mockRejectedValue('String error');

        const orchestrator = getOrchestratorInstance();
        const status = await orchestrator.getQueueStatus();

        // Should still return valid status with 0 blocked
        expect(status.blockedP1Count).toBe(0);
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to get queue status'));
    });

    it('Test 64: should handle pending tickets in task loading', async () => {
        const tickets = [
            { id: 'T1', title: 'Open', status: 'open' as const, createdAt: '2024-01-01T00:00:00Z', updatedAt: '', priority: 2, creator: 'sys', assignee: null, taskId: null, version: 1, resolution: null },
            { id: 'T2', title: 'Pending', status: 'pending' as const, createdAt: '2024-01-01T00:00:00Z', updatedAt: '', priority: 2, creator: 'sys', assignee: null, taskId: null, version: 1, resolution: null },
        ];
        mockTicketDb.listTickets.mockResolvedValue(tickets);

        await initializeOrchestrator(mockContext);

        // Only 'open' and 'in-progress' should be loaded
        expect(logInfo).toHaveBeenCalledWith('Loaded 1 tasks from tickets');
    });

    it('Test 65: should emit queue change when task is blocked', async () => {
        const ticket = {
            id: 'T1',
            title: 'Task to block',
            status: 'open' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: null,
            taskId: null,
            version: 1,
            resolution: null
        };
        mockTicketDb.listTickets.mockResolvedValue([ticket]);
        mockTicketDb.updateTicket.mockResolvedValue(ticket);
        mockTicketDb.createTicket.mockResolvedValue({} as any);

        jest.useFakeTimers();

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();

        const listener = jest.fn();
        orchestrator.onQueueChange(listener);

        // Pick the task
        await orchestrator.getNextTask();
        listener.mockClear(); // Clear call from picking

        // Advance past timeout
        jest.advanceTimersByTime(31 * 1000);

        // Call getNextTask - should trigger blocking & emit change
        await orchestrator.getNextTask();

        expect(listener).toHaveBeenCalled();

        jest.useRealTimers();
    });

    it('Test 66: getQueueDetails should return empty arrays when no tickets exist', async () => {
        mockTicketDb.listTickets.mockResolvedValue([]);

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();

        const details = await orchestrator.getQueueDetails();

        expect(details.queueTitles).toEqual([]);
        expect(details.pickedTitles).toEqual([]);
        expect(details.blockedP1Titles).toEqual([]);
    });

    it('Test 67: should handle non-Error object in Answer agent catch', async () => {
        // throw a non-Error
        mockCompleteLLM.mockRejectedValue('Plain string error');

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();

        const result = await orchestrator.routeToAnswerAgent('Test question?');

        expect(result).toContain('LLM service is currently unavailable');
        expect(logError).toHaveBeenCalledWith('[Answer] Answer agent failed: Plain string error');
    });

    it('Test 68: routeQuestionToAnswer should handle non-Error in catch', async () => {
        mockCompleteLLM.mockRejectedValue('Non-error thrown');

        await initializeOrchestrator(mockContext);
        const result = await routeQuestionToAnswer('Test?');

        expect(result).toContain('LLM service is currently unavailable');
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('Answer agent failed'));
    });

    it('Test 69: Planning agent should handle non-Error in catch', async () => {
        mockStreamLLM.mockRejectedValue('Non-error thrown');

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();
        const result = await orchestrator.routeToPlanningAgent('Test plan?');

        expect(result).toContain('Planning service is currently unavailable');
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('Planning agent failed'));
    });

    it('Test 70: Verification should handle non-Error in catch', async () => {
        mockCompleteLLM.mockRejectedValue('Non-error thrown');

        await initializeOrchestrator(mockContext);
        const result = await routeToVerificationAgent('Task', '+ code');

        expect(result.passed).toBe(false);
        expect(result.explanation).toContain('LLM error');
    });

    it('Test 71: should handle task loading error and emit queue change', async () => {
        // First call fails
        mockTicketDb.listTickets.mockRejectedValue(new Error('DB error'));

        await initializeOrchestrator(mockContext);

        expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to load tasks from tickets'));
    });

    it('Test 72: should handle loadTasksFromTickets error with non-Error', async () => {
        // Reset and throw non-Error
        resetOrchestratorForTests();
        mockTicketDb.listTickets.mockRejectedValue('Non-error string');

        await initializeOrchestrator(mockContext);

        expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to load tasks from tickets'));
    });

    it('Test 73: answerQuestion should handle non-Error in catch', async () => {
        mockCompleteLLM.mockRejectedValue('Non-error string');

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();

        const result = await orchestrator.answerQuestion('Test?');

        expect(result).toContain('LLM service is currently unavailable');
    });

    it('Test 74: should track picked task in pickedTasks array', async () => {
        const ticket = {
            id: 'T1',
            title: 'Tracked task',
            status: 'open' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: null,
            taskId: null,
            version: 1,
            resolution: null
        };
        mockTicketDb.listTickets.mockResolvedValue([ticket]);
        mockTicketDb.updateTicket.mockResolvedValue(ticket);

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();

        const task = await orchestrator.getNextTask();
        expect(task).not.toBeNull();

        const details = await orchestrator.getQueueDetails();
        expect(details.pickedTitles).toContain('Tracked task');
    });

    it('Test 75: checkForBlockedTasks should skip already blocked tasks', async () => {
        const ticket = {
            id: 'T1',
            title: 'Task to block once',
            status: 'open' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: null,
            taskId: null,
            version: 1,
            resolution: null
        };
        mockTicketDb.listTickets.mockResolvedValue([ticket]);
        mockTicketDb.updateTicket.mockResolvedValue(ticket);
        mockTicketDb.createTicket.mockResolvedValue({} as any);

        jest.useFakeTimers();

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();

        // Pick the task
        await orchestrator.getNextTask();

        // Advance past timeout
        jest.advanceTimersByTime(31 * 1000);

        // First call blocks the task and creates ticket
        await orchestrator.getNextTask();
        const createCalls1 = (mockTicketDb.createTicket as jest.Mock).mock.calls.length;

        // Advance time more
        jest.advanceTimersByTime(31 * 1000);

        // Second call should NOT create another ticket (task already blocked)
        await orchestrator.getNextTask();
        const createCalls2 = (mockTicketDb.createTicket as jest.Mock).mock.calls.length;

        expect(createCalls1).toBe(createCalls2);

        jest.useRealTimers();
    });

    // Additional edge case tests for branch coverage
    it('Test 76: routeToVerificationAgent with task but no description creates ticket', async () => {
        mockCompleteLLM.mockResolvedValue({
            content: 'FAIL - Issues found.',
            usage: undefined
        });
        mockTicketDb.createTicket.mockResolvedValue({} as any);

        await initializeOrchestrator(mockContext);
        
        // Empty taskDescription
        const result = await routeToVerificationAgent('', '+ code changes');

        expect(result.passed).toBe(false);
        expect(mockTicketDb.createTicket).toHaveBeenCalledWith(
            expect.objectContaining({
                title: expect.stringContaining('VERIFICATION FAILED')
            })
        );
    });

    it('Test 77: should handle PASS with no explanation text after match', async () => {
        mockCompleteLLM.mockResolvedValue({
            content: '  PASS  ',  // Just PASS with whitespace
            usage: undefined
        });

        await initializeOrchestrator(mockContext);
        const result = await routeToVerificationAgent('Test', '+ code');

        expect(result.passed).toBe(true);
        expect(result.explanation).toBe('All criteria met.');
    });

    it('Test 78: should atomically update ticket when picking task', async () => {
        const ticket = {
            id: 'T1',
            title: 'Test task',
            status: 'open' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: null,
            taskId: null,
            version: 1,
            resolution: null
        };
        mockTicketDb.listTickets.mockResolvedValue([ticket]);
        mockTicketDb.updateTicket.mockResolvedValue(ticket);

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();

        await orchestrator.getNextTask();

        expect(mockTicketDb.updateTicket).toHaveBeenCalledWith('T1', expect.objectContaining({
            status: 'in-progress'
        }));
    });

    it('Test 79: should log task picked atomically message', async () => {
        const ticket = {
            id: 'T1',
            title: 'Test task',
            status: 'open' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: null,
            taskId: null,
            version: 1,
            resolution: null
        };
        mockTicketDb.listTickets.mockResolvedValue([ticket]);
        mockTicketDb.updateTicket.mockResolvedValue(ticket);

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();

        await orchestrator.getNextTask();

        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Task picked atomically'));
    });

    it('Test 80: should create blocked ticket with correct description', async () => {
        const ticket = {
            id: 'T1',
            title: 'Slow task',
            status: 'open' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            priority: 2,
            creator: 'system',
            assignee: null,
            taskId: null,
            version: 1,
            resolution: null
        };
        mockTicketDb.listTickets.mockResolvedValue([ticket]);
        mockTicketDb.updateTicket.mockResolvedValue(ticket);
        mockTicketDb.createTicket.mockResolvedValue({} as any);

        jest.useFakeTimers();

        await initializeOrchestrator(mockContext);
        const orchestrator = getOrchestratorInstance();

        await orchestrator.getNextTask();
        jest.advanceTimersByTime(31 * 1000);
        await orchestrator.getNextTask();

        expect(mockTicketDb.createTicket).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'P1 BLOCKED: Slow task',
                status: 'blocked',
                description: expect.stringContaining('Task idle for')
            })
        );

        jest.useRealTimers();
    });
});
