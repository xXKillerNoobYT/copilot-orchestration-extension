// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import * as ticketDb from '../../src/services/ticketDb';

jest.mock('../../src/services/ticketDb');

/** @aiContributed-2026-02-04 */
describe('OrchestratorService', () => {
    let orchestrator: OrchestratorService;

    beforeEach(() => {
        orchestrator = new OrchestratorService();
        orchestrator.resetForTests();
    });

    /** @aiContributed-2026-02-04 */
    describe('processConversationTicketInternal', () => {
        /** @aiContributed-2026-02-04 */
        it('should return if thread is empty', async () => {
            const ticket = { id: '1', thread: [] } as { id: string; thread: { role: string; content: string }[] };

            await (orchestrator as unknown as { processConversationTicketInternal: (ticket: typeof ticket) => Promise<void> })
                .processConversationTicketInternal(ticket);

            expect(ticketDb.updateTicket).not.toHaveBeenCalled();
        });

        /** @aiContributed-2026-02-04 */
        it('should return if thread length is less than or equal to last processed', async () => {
            const ticket = { id: '1', thread: [{ role: 'user', content: 'test' }] } as { id: string; thread: { role: string; content: string }[] };
            (orchestrator as unknown as { conversationThreadLengths: Map<string, number> })
                .conversationThreadLengths.set('1', 1);

            await (orchestrator as unknown as { processConversationTicketInternal: (ticket: typeof ticket) => Promise<void> })
                .processConversationTicketInternal(ticket);

            expect(ticketDb.updateTicket).not.toHaveBeenCalled();
        });

        /** @aiContributed-2026-02-04 */
        it('should return if last message role is not user', async () => {
            const ticket = { id: '1', thread: [{ role: 'system', content: 'test' }] } as { id: string; thread: { role: string; content: string }[] };

            await (orchestrator as unknown as { processConversationTicketInternal: (ticket: typeof ticket) => Promise<void> })
                .processConversationTicketInternal(ticket);

            expect(ticketDb.updateTicket).not.toHaveBeenCalled();
        });

        /** @aiContributed-2026-02-04 */
        it('should append system message and handle planning conversation', async () => {
            const ticket = { id: '1', thread: [{ role: 'user', content: 'test' }] } as { id: string; thread: { role: string; content: string }[] };
            jest.spyOn(orchestrator as unknown as { determineConversationAgent: (ticket: typeof ticket) => Promise<string> }, 'determineConversationAgent')
                .mockResolvedValue('planning');
            jest.spyOn(orchestrator as unknown as { handlePlanningConversation: (ticket: typeof ticket, content: string) => Promise<void> }, 'handlePlanningConversation')
                .mockResolvedValue();

            await (orchestrator as unknown as { processConversationTicketInternal: (ticket: typeof ticket) => Promise<void> })
                .processConversationTicketInternal(ticket);

            expect(orchestrator.appendThreadMessage).toHaveBeenCalledWith(ticket, {
                role: 'system',
                content: 'Status: Reviewing request...',
            });
            expect(orchestrator.handlePlanningConversation).toHaveBeenCalledWith(ticket, 'test');
        });

        /** @aiContributed-2026-02-04 */
        it('should append system message and handle verification conversation', async () => {
            const ticket = { id: '1', thread: [{ role: 'user', content: 'test' }] } as { id: string; thread: { role: string; content: string }[] };
            jest.spyOn(orchestrator as unknown as { determineConversationAgent: (ticket: typeof ticket) => Promise<string> }, 'determineConversationAgent')
                .mockResolvedValue('verification');
            jest.spyOn(orchestrator as unknown as { handleVerificationConversation: (ticket: typeof ticket, content: string) => Promise<void> }, 'handleVerificationConversation')
                .mockResolvedValue();

            await (orchestrator as unknown as { processConversationTicketInternal: (ticket: typeof ticket) => Promise<void> })
                .processConversationTicketInternal(ticket);

            expect(orchestrator.appendThreadMessage).toHaveBeenCalledWith(ticket, {
                role: 'system',
                content: 'Status: Reviewing request...',
            });
            expect(orchestrator.handleVerificationConversation).toHaveBeenCalledWith(ticket, 'test');
        });

        /** @aiContributed-2026-02-04 */
        it('should append system message and handle answer conversation', async () => {
            const ticket = { id: '1', thread: [{ role: 'user', content: 'test' }] } as { id: string; thread: { role: string; content: string }[] };
            jest.spyOn(orchestrator as unknown as { determineConversationAgent: (ticket: typeof ticket) => Promise<string> }, 'determineConversationAgent')
                .mockResolvedValue('answer');
            jest.spyOn(orchestrator as unknown as { handleAnswerConversation: (ticket: typeof ticket, content: string) => Promise<void> }, 'handleAnswerConversation')
                .mockResolvedValue();

            await (orchestrator as unknown as { processConversationTicketInternal: (ticket: typeof ticket) => Promise<void> })
                .processConversationTicketInternal(ticket);

            expect(orchestrator.appendThreadMessage).toHaveBeenCalledWith(ticket, {
                role: 'system',
                content: 'Status: Reviewing request...',
            });
            expect(orchestrator.handleAnswerConversation).toHaveBeenCalledWith(ticket, 'test');
        });
    });
});