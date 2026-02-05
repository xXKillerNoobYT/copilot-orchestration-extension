// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { listTickets } from '../../src/services/ticketDb';
import { Logger } from '../../utils/logger';

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    listTickets: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('OrchestratorService - getQueueDetails', () => {
    let orchestrator: OrchestratorService;

    beforeEach(() => {
        orchestrator = new OrchestratorService();
        (orchestrator as unknown as { taskQueue: { title: string }[] }).taskQueue = [
            { title: 'Task 1' },
            { title: 'Task 2' },
        ];
        (orchestrator as unknown as { pickedTasks: { title: string }[] }).pickedTasks = [
            { title: 'Picked Task 1' },
        ];
        (orchestrator as unknown as { lastPickedTaskTitle: string }).lastPickedTaskTitle = 'Picked Task 1';
        (orchestrator as unknown as { lastPickedTaskAt: string }).lastPickedTaskAt = '2023-10-01T12:00:00Z';
        jest.spyOn(Logger, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-04 */
    it('should return queue details with blocked P1 tickets', async () => {
        (listTickets as jest.Mock).mockResolvedValue([
            { title: 'Blocked P1 Ticket', status: 'blocked', type: 'P1' },
            { title: 'Normal Ticket', status: 'open', type: 'P2' },
        ]);
        jest.spyOn(orchestrator as unknown as { isBlockedP1Ticket: (ticket: { type: string }) => boolean }, 'isBlockedP1Ticket')
            .mockImplementation((ticket) => ticket.type === 'P1');

        const result = await orchestrator.getQueueDetails();

        expect(result).toEqual({
            queueTitles: ['Task 1', 'Task 2'],
            pickedTitles: ['Picked Task 1'],
            blockedP1Titles: ['Blocked P1 Ticket'],
            lastPickedTitle: 'Picked Task 1',
            lastPickedAt: '2023-10-01T12:00:00Z',
        });
        expect(Logger.debug).toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-04 */
    it('should handle no tickets returned from listTickets', async () => {
        (listTickets as jest.Mock).mockResolvedValue([]);
        jest.spyOn(orchestrator as unknown as { isBlockedP1Ticket: () => boolean }, 'isBlockedP1Ticket')
            .mockImplementation(() => false);

        const result = await orchestrator.getQueueDetails();

        expect(result).toEqual({
            queueTitles: ['Task 1', 'Task 2'],
            pickedTitles: ['Picked Task 1'],
            blockedP1Titles: [],
            lastPickedTitle: 'Picked Task 1',
            lastPickedAt: '2023-10-01T12:00:00Z',
        });
        expect(Logger.debug).toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-04 */
    it('should handle errors thrown by listTickets', async () => {
        (listTickets as jest.Mock).mockRejectedValue(new Error('Database error'));

        await expect(orchestrator.getQueueDetails()).rejects.toThrow('Database error');
        expect(Logger.debug).toHaveBeenCalled();
    });
});