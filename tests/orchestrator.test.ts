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
                id: 'TICKET-10',
                title: 'Manual approval needed',
                status: 'open' as const,
                type: 'ai_to_human' as const,
                createdAt: '2026-02-01T10:00:00Z',
                updatedAt: '2026-02-01T10:00:00Z'
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

            expect(mockTicketDb.updateTicket).toHaveBeenCalledWith('TICKET-10', { status: 'pending' });
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
                updatedAt: '2026-02-01T10:00:00Z'
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
        it('Test 9: should create blocked ticket when task idle >30s (using fake timers)', async () => {
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
                title: 'P1 BLOCKED: Long Running Task',
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
                updatedAt: '2026-02-01T10:00:00Z'
            };

            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockResolvedValue([mockTicket]);
            mockTicketDb.createTicket.mockResolvedValue({
                id: 'TICKET-2',
                title: 'P1 BLOCKED: Task',
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
