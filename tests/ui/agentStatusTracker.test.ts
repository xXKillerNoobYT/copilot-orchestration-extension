/**
 * Tests for AgentStatusTracker
 * 
 * Tests the singleton agent status tracking system including:
 * - Singleton instance management
 * - Agent status get/set operations
 * - Batch reset functionality
 * - Non-existent agent handling
 * - Status update with truncation
 */

import { agentStatusTracker } from '../../src/ui/agentStatusTracker';
import { logInfo } from '../../src/logger';

// Mock vscode EventEmitter
jest.mock('vscode', () => {
    const EventEmitter = jest.fn().mockImplementation(() => {
        const listeners: Array<(data: any) => void> = [];
        return {
            event: (listener: (data: any) => void) => {
                listeners.push(listener);
                return {
                    dispose: () => {
                        const index = listeners.indexOf(listener);
                        if (index > -1) listeners.splice(index, 1);
                    }
                };
            },
            fire: (data: any) => {
                listeners.forEach(listener => listener(data));
            }
        };
    });
    return { EventEmitter };
}, { virtual: true });

// Mock logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

describe('AgentStatusTracker', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset tracker state before each test to ensure clean isolation
        agentStatusTracker.resetAll();
    });

    describe('Singleton Instance', () => {
        it('should return same instance on multiple calls', () => {
            // Get instance via export
            const instance1 = agentStatusTracker;
            const instance2 = agentStatusTracker;

            expect(instance1).toBe(instance2);
        });

        it('should initialize all agents to Idle status', () => {
            const statuses = agentStatusTracker.getAllStatuses();

            expect(statuses.size).toBe(4);
            expect(statuses.get('Planning')?.status).toBe('Idle');
            expect(statuses.get('Orchestrator')?.status).toBe('Idle');
            expect(statuses.get('Answer')?.status).toBe('Idle');
            expect(statuses.get('Verification')?.status).toBe('Idle');
        });
    });

    describe('setAgentStatus', () => {
        it('should set agent status to Active with result', () => {
            agentStatusTracker.setAgentStatus('Planning', 'Active', 'Starting plan...');

            const status = agentStatusTracker.getAgentStatus('Planning');
            expect(status?.status).toBe('Active');
            expect(status?.lastResult).toBe('Starting plan...');
            expect(status?.timestamp).toBeDefined();
            expect(typeof status?.timestamp).toBe('number');
        });

        it('should set agent status without result (undefined)', () => {
            agentStatusTracker.setAgentStatus('Answer', 'Waiting');

            const status = agentStatusTracker.getAgentStatus('Answer');
            expect(status?.status).toBe('Waiting');
            expect(status?.lastResult).toBeUndefined();
            expect(status?.timestamp).toBeDefined();
        });

        it('should update existing agent status', () => {
            // Set initial status
            agentStatusTracker.setAgentStatus('Verification', 'Active', 'Checking');
            let status = agentStatusTracker.getAgentStatus('Verification');
            expect(status?.status).toBe('Active');

            // Update to different status
            agentStatusTracker.setAgentStatus('Verification', 'Waiting', 'PASS - All checks passed');
            status = agentStatusTracker.getAgentStatus('Verification');
            expect(status?.status).toBe('Waiting');
            expect(status?.lastResult).toBe('PASS - All checks passed');
        });

        it('should set agent to Failed status with error message', () => {
            const errorMsg = 'LLM timeout after 30 seconds';
            agentStatusTracker.setAgentStatus('Orchestrator', 'Failed', errorMsg);

            const status = agentStatusTracker.getAgentStatus('Orchestrator');
            expect(status?.status).toBe('Failed');
            expect(status?.lastResult).toBe(errorMsg);
        });

        it('should log agent status update', () => {
            agentStatusTracker.setAgentStatus('Planning', 'Active', 'Step 1: Design');

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('[AgentTracker] Planning → Active')
            );
        });

        it('should truncate result in logs to 50 chars', () => {
            jest.clearAllMocks(); // Clear beforeEach logs to isolate this test

            const longResult = 'This is a very long result that exceeds fifty characters';
            agentStatusTracker.setAgentStatus('Answer', 'Waiting', longResult);

            // Check the last log call from setAgentStatus (not resetAll)
            const allCalls = (logInfo as jest.Mock).mock.calls;
            const logCall = allCalls[allCalls.length - 1][0];
            expect(logCall).toContain('This is a very long result that exceeds fif');
        });

        it('should not include result in log if undefined', () => {
            jest.clearAllMocks(); // Clear beforeEach logs to isolate this test

            agentStatusTracker.setAgentStatus('Planning', 'Idle');

            // Check the last log call (not resetAll from beforeEach)
            const allCalls = (logInfo as jest.Mock).mock.calls;
            const logCall = allCalls[allCalls.length - 1][0];
            expect(logCall).toBe('[AgentTracker] Planning → Idle');
        });

        it('should handle empty string result', () => {
            agentStatusTracker.setAgentStatus('Verification', 'Active', '');

            const status = agentStatusTracker.getAgentStatus('Verification');
            expect(status?.lastResult).toBeUndefined();
        });

        it('should update timestamp on each call', (done) => {
            agentStatusTracker.setAgentStatus('Planning', 'Active', 'First');
            const timestamp1 = agentStatusTracker.getAgentStatus('Planning')?.timestamp;

            // Wait a bit to ensure timestamp difference
            setTimeout(() => {
                agentStatusTracker.setAgentStatus('Planning', 'Waiting', 'Second');
                const timestamp2 = agentStatusTracker.getAgentStatus('Planning')?.timestamp;

                expect(timestamp2).toBeGreaterThan(timestamp1 || 0);
                done();
            }, 10);
        });
    });

    describe('getAgentStatus', () => {
        it('should return agent status when it exists', () => {
            agentStatusTracker.setAgentStatus('Planning', 'Active', 'Running');

            const status = agentStatusTracker.getAgentStatus('Planning');
            expect(status).toBeDefined();
            expect(status?.status).toBe('Active');
            expect(status?.lastResult).toBe('Running');
        });

        it('should return undefined for non-existent agent', () => {
            const status = agentStatusTracker.getAgentStatus('NonExistentAgent');
            expect(status).toBeUndefined();
        });

        it('should return Idle status initially for all agents', () => {
            // Before any updates, all should be Idle
            expect(agentStatusTracker.getAgentStatus('Planning')?.status).toBe('Idle');
            expect(agentStatusTracker.getAgentStatus('Orchestrator')?.status).toBe('Idle');
            expect(agentStatusTracker.getAgentStatus('Answer')?.status).toBe('Idle');
            expect(agentStatusTracker.getAgentStatus('Verification')?.status).toBe('Idle');
        });

        it('should return same reference after multiple gets', () => {
            agentStatusTracker.setAgentStatus('Planning', 'Active', 'Test');
            const status1 = agentStatusTracker.getAgentStatus('Planning');
            const status2 = agentStatusTracker.getAgentStatus('Planning');

            expect(status1?.status).toBe(status2?.status);
            expect(status1?.lastResult).toBe(status2?.lastResult);
        });
    });

    describe('resetAll', () => {
        it('should reset all agents to Idle status', () => {
            // Setup: Set agents to different statuses
            agentStatusTracker.setAgentStatus('Planning', 'Active', 'Working');
            agentStatusTracker.setAgentStatus('Verification', 'Failed', 'Error');
            agentStatusTracker.setAgentStatus('Answer', 'Waiting', 'Result');

            // Execute: Reset all
            agentStatusTracker.resetAll();

            // Verify: All back to Idle
            expect(agentStatusTracker.getAgentStatus('Planning')?.status).toBe('Idle');
            expect(agentStatusTracker.getAgentStatus('Verification')?.status).toBe('Idle');
            expect(agentStatusTracker.getAgentStatus('Answer')?.status).toBe('Idle');
            expect(agentStatusTracker.getAgentStatus('Orchestrator')?.status).toBe('Idle');
        });

        it('should clear lastResult on reset', () => {
            // Setup: Set result
            agentStatusTracker.setAgentStatus('Planning', 'Waiting', 'Step 1: Design\nStep 2: Code');

            // Execute: Reset
            agentStatusTracker.resetAll();

            // Verify: Result cleared
            const status = agentStatusTracker.getAgentStatus('Planning');
            expect(status?.lastResult).toBeUndefined();
        });

        it('should log reset action', () => {
            agentStatusTracker.resetAll();

            expect(logInfo).toHaveBeenCalledWith('[AgentTracker] All agents reset to Idle');
        });

        it('should reset only to Idle, not remove agents', () => {
            agentStatusTracker.resetAll();

            const statuses = agentStatusTracker.getAllStatuses();
            expect(statuses.size).toBe(4);
            expect(statuses.has('Planning')).toBe(true);
            expect(statuses.has('Orchestrator')).toBe(true);
        });

        it('should handle reset when agents already Idle', () => {
            // Initially all Idle
            agentStatusTracker.resetAll();

            // Should not throw
            expect(() => agentStatusTracker.resetAll()).not.toThrow();

            // Still all Idle
            expect(agentStatusTracker.getAgentStatus('Planning')?.status).toBe('Idle');
        });

        it('should reset multiple times independently', () => {
            // First cycle
            agentStatusTracker.setAgentStatus('Planning', 'Active', 'First run');
            agentStatusTracker.resetAll();
            expect(agentStatusTracker.getAgentStatus('Planning')?.status).toBe('Idle');

            // Second cycle
            agentStatusTracker.setAgentStatus('Planning', 'Waiting', 'Second run');
            agentStatusTracker.resetAll();
            expect(agentStatusTracker.getAgentStatus('Planning')?.status).toBe('Idle');
        });
    });

    describe('getAllStatuses', () => {
        it('should return map of all agent statuses', () => {
            const statuses = agentStatusTracker.getAllStatuses();

            expect(statuses instanceof Map).toBe(true);
            expect(statuses.size).toBe(4);
            expect(statuses.has('Planning')).toBe(true);
            expect(statuses.has('Orchestrator')).toBe(true);
            expect(statuses.has('Answer')).toBe(true);
            expect(statuses.has('Verification')).toBe(true);
        });

        it('should return copy of internal map (not reference)', () => {
            const snapshot1 = agentStatusTracker.getAllStatuses();

            // Update an agent
            agentStatusTracker.setAgentStatus('Planning', 'Active', 'Work');

            const snapshot2 = agentStatusTracker.getAllStatuses();

            // Snapshots should be identical at time of call but independent
            expect(snapshot1.get('Planning')?.status).toBe('Idle');
            expect(snapshot2.get('Planning')?.status).toBe('Active');
        });

        it('should include all four agents with initial Idle status', () => {
            const statuses = agentStatusTracker.getAllStatuses();

            const mapping = {
                Planning: 'Idle',
                Orchestrator: 'Idle',
                Answer: 'Idle',
                Verification: 'Idle'
            };

            for (const [agent, expectedStatus] of Object.entries(mapping)) {
                expect(statuses.get(agent)?.status).toBe(expectedStatus);
            }
        });

        it('should include updated statuses after set operations', () => {
            agentStatusTracker.setAgentStatus('Planning', 'Active', 'Plan1');
            agentStatusTracker.setAgentStatus('Verification', 'Waiting', 'PASS');

            const statuses = agentStatusTracker.getAllStatuses();

            expect(statuses.get('Planning')?.status).toBe('Active');
            expect(statuses.get('Planning')?.lastResult).toBe('Plan1');
            expect(statuses.get('Verification')?.status).toBe('Waiting');
            expect(statuses.get('Verification')?.lastResult).toBe('PASS');
        });

        it('should include timestamp in all statuses after setAgentStatus', () => {
            // After resetAll, timestamps are undefined. Need to set status first.
            agentStatusTracker.setAgentStatus('Planning', 'Active', 'Work');
            agentStatusTracker.setAgentStatus('Verification', 'Waiting', 'Result');
            agentStatusTracker.setAgentStatus('Answer', 'Failed', 'Error');

            const statuses = agentStatusTracker.getAllStatuses();

            let allHaveTimestamp = true;
            statuses.forEach((status, agent) => {
                // Planning, Verification, Answer should have timestamp from setAgentStatus
                if (['Planning', 'Verification', 'Answer'].includes(agent) && !status.timestamp) {
                    allHaveTimestamp = false;
                }
            });

            expect(allHaveTimestamp).toBe(true);
        });

        it('should reflect state after resetAll', () => {
            agentStatusTracker.setAgentStatus('Planning', 'Active', 'Task');
            agentStatusTracker.resetAll();

            const statuses = agentStatusTracker.getAllStatuses();
            expect(statuses.get('Planning')?.status).toBe('Idle');
            expect(statuses.get('Planning')?.lastResult).toBeUndefined();
        });
    });

    describe('Complex Workflows', () => {
        it('should handle planning workflow: Idle → Active → Waiting', () => {
            // Initial state
            expect(agentStatusTracker.getAgentStatus('Planning')?.status).toBe('Idle');

            // Start planning
            agentStatusTracker.setAgentStatus('Planning', 'Active', 'Generating plan...');
            expect(agentStatusTracker.getAgentStatus('Planning')?.status).toBe('Active');

            // Complete planning
            agentStatusTracker.setAgentStatus('Planning', 'Waiting', 'Step 1: Design\nStep 2: Code');
            expect(agentStatusTracker.getAgentStatus('Planning')?.status).toBe('Waiting');
        });

        it('should handle verification workflow: Idle → Active → Waiting with result', () => {
            agentStatusTracker.setAgentStatus('Verification', 'Active', 'Checking code...');
            expect(agentStatusTracker.getAgentStatus('Verification')?.status).toBe('Active');

            agentStatusTracker.setAgentStatus('Verification', 'Waiting', 'PASS - All criteria met');
            expect(agentStatusTracker.getAgentStatus('Verification')?.status).toBe('Waiting');
            expect(agentStatusTracker.getAgentStatus('Verification')?.lastResult).toContain('PASS');
        });

        it('should handle error workflow: Idle → Active → Failed', () => {
            agentStatusTracker.setAgentStatus('Answer', 'Active', 'Querying...');
            expect(agentStatusTracker.getAgentStatus('Answer')?.status).toBe('Active');

            agentStatusTracker.setAgentStatus('Answer', 'Failed', 'LLM timeout: Request exceeded 30s');
            expect(agentStatusTracker.getAgentStatus('Answer')?.status).toBe('Failed');
        });

        it('should track multiple agents independently', () => {
            agentStatusTracker.setAgentStatus('Planning', 'Active', 'Plan');
            agentStatusTracker.setAgentStatus('Verification', 'Active', 'Verify');
            agentStatusTracker.setAgentStatus('Answer', 'Waiting', 'Response');

            expect(agentStatusTracker.getAgentStatus('Planning')?.status).toBe('Active');
            expect(agentStatusTracker.getAgentStatus('Verification')?.status).toBe('Active');
            expect(agentStatusTracker.getAgentStatus('Answer')?.status).toBe('Waiting');

            // Reset
            agentStatusTracker.resetAll();
            expect(agentStatusTracker.getAgentStatus('Planning')?.status).toBe('Idle');
            expect(agentStatusTracker.getAgentStatus('Verification')?.status).toBe('Idle');
            expect(agentStatusTracker.getAgentStatus('Answer')?.status).toBe('Idle');
        });
    });

    describe('Edge Cases', () => {
        it('should handle very long result strings', () => {
            const longResult = 'A'.repeat(1000);
            agentStatusTracker.setAgentStatus('Planning', 'Waiting', longResult);

            const status = agentStatusTracker.getAgentStatus('Planning');
            expect(status?.lastResult).toBe(longResult);
        });

        it('should handle special characters in result', () => {
            const specialResult = '<>&"\'^@$%#*(){}[]\n\r\t';
            agentStatusTracker.setAgentStatus('Answer', 'Waiting', specialResult);

            const status = agentStatusTracker.getAgentStatus('Answer');
            expect(status?.lastResult).toBe(specialResult);
        });

        it('should handle all valid status types', () => {
            const statuses: Array<'Idle' | 'Active' | 'Waiting' | 'Failed'> = ['Idle', 'Active', 'Waiting', 'Failed'];

            for (const statusValue of statuses) {
                agentStatusTracker.setAgentStatus('Planning', statusValue);
                expect(agentStatusTracker.getAgentStatus('Planning')?.status).toBe(statusValue);
            }
        });

        it('should handle rapid status updates', () => {
            for (let i = 0; i < 10; i++) {
                agentStatusTracker.setAgentStatus('Planning', 'Active', `Update ${i}`);
            }

            expect(agentStatusTracker.getAgentStatus('Planning')?.lastResult).toBe('Update 9');
        });

        it('should handle getting status for all agent names', () => {
            const agents = ['Planning', 'Orchestrator', 'Answer', 'Verification'];

            for (const agent of agents) {
                const status = agentStatusTracker.getAgentStatus(agent);
                expect(status).toBeDefined();
                expect(status?.status).toBe('Idle');
            }
        });
    });

    describe('currentTask field', () => {
        it('should set currentTask via setAgentTask', () => {
            agentStatusTracker.setAgentTask('Planning', 'Generating requirements...');

            const status = agentStatusTracker.getAgentStatus('Planning');
            expect(status?.currentTask).toBe('Generating requirements...');
        });

        it('should preserve currentTask when setAgentStatus is called without clearing it', () => {
            agentStatusTracker.setAgentTask('Planning', 'Planning task X');
            agentStatusTracker.setAgentStatus('Planning', 'Active', 'Working on plan');

            const status = agentStatusTracker.getAgentStatus('Planning');
            expect(status?.currentTask).toBe('Planning task X');
            expect(status?.status).toBe('Active');
            expect(status?.lastResult).toBe('Working on plan');
        });

        it('should clear currentTask when set to undefined', () => {
            agentStatusTracker.setAgentTask('Planning', 'Task 1');
            const status1 = agentStatusTracker.getAgentStatus('Planning');
            expect(status1?.currentTask).toBe('Task 1');

            agentStatusTracker.setAgentTask('Planning', undefined);
            const status2 = agentStatusTracker.getAgentStatus('Planning');
            expect(status2?.currentTask).toBeUndefined();
        });

        it('should update timestamp when setting currentTask', (done) => {
            agentStatusTracker.setAgentTask('Planning', 'First task');
            const timestamp1 = agentStatusTracker.getAgentStatus('Planning')?.timestamp;

            setTimeout(() => {
                agentStatusTracker.setAgentTask('Planning', 'Second task');
                const timestamp2 = agentStatusTracker.getAgentStatus('Planning')?.timestamp;

                expect(timestamp2).toBeGreaterThan(timestamp1 || 0);
                done();
            }, 10);
        });

        it('should log currentTask changes', () => {
            jest.clearAllMocks();

            agentStatusTracker.setAgentTask('Planning', 'Analyzing code');

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('[AgentTracker] Planning task: Analyzing code')
            );
        });

        it('should truncate currentTask in logs to 50 chars', () => {
            jest.clearAllMocks();

            const longTask = 'A'.repeat(100);
            agentStatusTracker.setAgentTask('Planning', longTask);

            const allCalls = (logInfo as jest.Mock).mock.calls;
            const logCall = allCalls[allCalls.length - 1][0];
            expect(logCall).toContain('A'.repeat(50));
            expect(logCall).not.toContain('A'.repeat(51));
        });

        it('should handle setting task for non-existent agent gracefully', () => {
            // Should not throw even if agent doesn't exist
            expect(() => {
                agentStatusTracker.setAgentTask('NonExistent', 'Task');
            }).not.toThrow();
        });

        it('should clear currentTask on resetAll', () => {
            agentStatusTracker.setAgentTask('Planning', 'Task 1');
            agentStatusTracker.setAgentTask('Answer', 'Task 2');

            agentStatusTracker.resetAll();

            expect(agentStatusTracker.getAgentStatus('Planning')?.currentTask).toBeUndefined();
            expect(agentStatusTracker.getAgentStatus('Answer')?.currentTask).toBeUndefined();
        });
    });

    describe('event emission', () => {
        it('should expose onStatusChange event emitter', () => {
            expect(agentStatusTracker.onStatusChange).toBeDefined();
            expect(typeof agentStatusTracker.onStatusChange).toBe('function');
        });

        it('should fire event when setAgentStatus is called', () => {
            const listener = jest.fn();
            const subscription = agentStatusTracker.onStatusChange(listener);

            agentStatusTracker.setAgentStatus('Planning', 'Active', 'Working');

            expect(listener).toHaveBeenCalledWith({
                agentName: 'Planning',
                status: expect.objectContaining({
                    status: 'Active',
                    lastResult: 'Working',
                })
            });

            subscription.dispose();
        });

        it('should fire event when setAgentTask is called', () => {
            const listener = jest.fn();
            const subscription = agentStatusTracker.onStatusChange(listener);

            agentStatusTracker.setAgentTask('Planning', 'Task X');

            expect(listener).toHaveBeenCalledWith({
                agentName: 'Planning',
                status: expect.objectContaining({
                    currentTask: 'Task X',
                })
            });

            subscription.dispose();
        });

        it('should fire events for each agent on resetAll', () => {
            const listener = jest.fn();
            const subscription = agentStatusTracker.onStatusChange(listener);

            agentStatusTracker.resetAll();

            // Should fire 4 events (one per agent)
            expect(listener).toHaveBeenCalledTimes(4);

            subscription.dispose();
        });

        it('should allow multiple listeners to subscribe', () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();

            const sub1 = agentStatusTracker.onStatusChange(listener1);
            const sub2 = agentStatusTracker.onStatusChange(listener2);

            agentStatusTracker.setAgentStatus('Planning', 'Active');

            expect(listener1).toHaveBeenCalled();
            expect(listener2).toHaveBeenCalled();

            sub1.dispose();
            sub2.dispose();
        });

        it('should not notify disposed listeners', () => {
            const listener = jest.fn();
            const subscription = agentStatusTracker.onStatusChange(listener);

            agentStatusTracker.setAgentStatus('Planning', 'Active');
            expect(listener).toHaveBeenCalledTimes(1);

            subscription.dispose();

            agentStatusTracker.setAgentStatus('Planning', 'Waiting');
            // Should still be 1 (not called after disposal)
            expect(listener).toHaveBeenCalledTimes(1);
        });
    });
});
