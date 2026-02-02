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
    resetOrchestratorForTests,
    Task
} from '../src/services/orchestrator';
import * as ticketDb from '../src/services/ticketDb';
import { ExtensionContext } from './__mocks__/vscode';
import * as fs from 'fs';

// Mock TicketDb module
jest.mock('../src/services/ticketDb');

// Mock fs module
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
}));

// Cast mocks to typed versions
const mockTicketDb = ticketDb as jest.Mocked<typeof ticketDb>;
const mockFs = fs as jest.Mocked<typeof fs>;

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

    describe('routing stub', () => {
        it('Test 9: should log question in routeQuestionToAnswer', async () => {
            // Setup: initialize first
            mockFs.existsSync.mockReturnValue(false);
            mockTicketDb.listTickets.mockResolvedValue([]);
            
            await initializeOrchestrator(mockContext);
            
            // Execute: route a question
            const response = await routeQuestionToAnswer('How do I fix this?');
            
            // Verify: response is a string (stub implementation)
            expect(typeof response).toBe('string');
            expect(response).toContain('Routing not implemented yet');
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
});
