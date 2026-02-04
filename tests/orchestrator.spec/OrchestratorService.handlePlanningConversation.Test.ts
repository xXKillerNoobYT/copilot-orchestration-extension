// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
}));

/** @aiContributed-2026-02-03 */
describe('OrchestratorService', () => {
    let orchestratorService: OrchestratorService;
    let mockAppendThreadMessage: jest.SpyInstance;
    let mockRouteToPlanningAgent: jest.SpyInstance;

    beforeEach(() => {
        orchestratorService = new OrchestratorService();

        mockAppendThreadMessage = jest.spyOn(
            orchestratorService as unknown as { appendThreadMessage: (ticket: { id: string; title: string }, message: { role: string; content: string }) => Promise<void> },
            'appendThreadMessage'
        ).mockResolvedValue(undefined);

        mockRouteToPlanningAgent = jest.spyOn(
            orchestratorService as unknown as { routeToPlanningAgent: (message: string) => Promise<string> },
            'routeToPlanningAgent'
        ).mockResolvedValue('Generated Plan');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    describe('handlePlanningConversation', () => {
        /** @aiContributed-2026-02-03 */
        it('should append system message, generate a plan, and append assistant message', async () => {
            const ticket = { id: '1', title: 'Test Ticket' };
            const userMessage = 'Test user message';

            await (orchestratorService as unknown as { handlePlanningConversation: (ticket: { id: string; title: string }, message: string) => Promise<void> }).handlePlanningConversation(ticket, userMessage);

            expect(mockAppendThreadMessage).toHaveBeenCalledTimes(2);
            expect(mockAppendThreadMessage).toHaveBeenCalledWith(ticket, {
                role: 'system',
                content: 'Status: Building a plan...',
            });
            expect(mockRouteToPlanningAgent).toHaveBeenCalledWith(userMessage);
            expect(mockAppendThreadMessage).toHaveBeenCalledWith(ticket, {
                role: 'assistant',
                content: `Plan ready:\nGenerated Plan\n\nDo you approve this plan?`,
            });
        });

        /** @aiContributed-2026-02-03 */
        it('should handle errors during planning gracefully', async () => {
            const ticket = { id: '1', title: 'Test Ticket' };
            const userMessage = 'Test user message';
            const error = new Error('Planning error');

            mockRouteToPlanningAgent.mockRejectedValueOnce(error);

            await expect((orchestratorService as unknown as { handlePlanningConversation: (ticket: { id: string; title: string }, message: string) => Promise<void> }).handlePlanningConversation(ticket, userMessage)).rejects.toThrow(error);

            expect(mockAppendThreadMessage).toHaveBeenCalledTimes(1);
            expect(mockAppendThreadMessage).toHaveBeenCalledWith(ticket, {
                role: 'system',
                content: 'Status: Building a plan...',
            });
            expect(mockRouteToPlanningAgent).toHaveBeenCalledWith(userMessage);
            expect(Logger.error).toHaveBeenCalledWith(error);
        });

        /** @aiContributed-2026-02-03 */
        it('should handle null or undefined inputs gracefully', async () => {
            const ticket = null;
            const userMessage = undefined;

            await expect((orchestratorService as unknown as { handlePlanningConversation: (ticket: { id: string; title: string } | null, message: string | undefined) => Promise<void> }).handlePlanningConversation(ticket, userMessage)).rejects.toThrow();

            expect(mockAppendThreadMessage).not.toHaveBeenCalled();
            expect(mockRouteToPlanningAgent).not.toHaveBeenCalled();
        });
    });
});