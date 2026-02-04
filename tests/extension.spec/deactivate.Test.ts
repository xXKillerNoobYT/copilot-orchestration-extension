// ./extension.Test.ts
import { deactivate } from '../../src/extension';
import { getOrchestratorInstance } from '../../src/services/orchestrator';
import { listTickets, updateTicket } from '../../src/services/ticketDb';
import { logInfo, logWarn } from '../../src/logger';
import { ConversationWebviewPanel } from '../../src/ui/conversationWebview';

jest.mock('../../src/services/orchestrator', () => ({
    ...jest.requireActual('../../src/services/orchestrator'),
    getOrchestratorInstance: jest.fn(),
}));

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    listTickets: jest.fn(),
    updateTicket: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
    logWarn: jest.fn(),
}));

jest.mock('../../src/ui/conversationWebview', () => ({
    ...jest.requireActual('../../src/ui/conversationWebview'),
    ConversationWebviewPanel: {
        disposeAll: jest.fn(),
    },
}));

/** @aiContributed-2026-02-03 */
describe('deactivate', () => {
    let mockOrchestrator: { getAnswerAgent: jest.Mock };
    let mockAnswerAgent: { serializeHistory: jest.Mock };

    beforeEach(() => {
        mockAnswerAgent = {
            serializeHistory: jest.fn(),
        };
        mockOrchestrator = {
            getAnswerAgent: jest.fn(() => mockAnswerAgent),
        };
        (getOrchestratorInstance as jest.Mock).mockReturnValue(mockOrchestrator);
        (listTickets as jest.Mock).mockResolvedValue([]);
        (updateTicket as jest.Mock).mockResolvedValue(null);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should dispose all conversation webview panels', async () => {
        await deactivate();

        expect(ConversationWebviewPanel.disposeAll).toHaveBeenCalled();
        expect(logInfo).toHaveBeenCalledWith('Disposed all conversation webview panels');
    });

    /** @aiContributed-2026-02-03 */
    it('should log the number of saved conversation histories', async () => {
        mockAnswerAgent.serializeHistory.mockReturnValue({
            ticket1: 'history1',
            ticket2: 'history2',
        });
        (listTickets as jest.Mock).mockResolvedValue([
            { id: 'ticket1' },
            { id: 'ticket2' },
        ]);
        (updateTicket as jest.Mock).mockResolvedValue({});

        await deactivate();

        expect(logInfo).toHaveBeenCalledWith('Saved 2 conversation histories on deactivate');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle tickets without conversation history', async () => {
        mockAnswerAgent.serializeHistory.mockReturnValue({
            ticket1: 'history1',
        });
        (listTickets as jest.Mock).mockResolvedValue([
            { id: 'ticket1' },
            { id: 'ticket2' },
        ]);
        (updateTicket as jest.Mock).mockResolvedValue({});

        await deactivate();

        expect(updateTicket).toHaveBeenCalledTimes(1);
        expect(updateTicket).toHaveBeenCalledWith('ticket1', { conversationHistory: 'history1' });
        expect(logInfo).toHaveBeenCalledWith('Saved 1 conversation histories on deactivate');
    });

    /** @aiContributed-2026-02-03 */
    it('should log a warning if updating a ticket fails', async () => {
        mockAnswerAgent.serializeHistory.mockReturnValue({
            ticket1: 'history1',
        });
        (listTickets as jest.Mock).mockResolvedValue([{ id: 'ticket1' }]);
        (updateTicket as jest.Mock).mockRejectedValue(new Error('Update failed'));

        await deactivate();

        expect(logWarn).toHaveBeenCalledWith(
            'Failed to persist Answer Agent history for ticket ticket1: Update failed'
        );
    });

    /** @aiContributed-2026-02-03 */
    it('should log a warning if listTickets throws an error', async () => {
        (listTickets as jest.Mock).mockRejectedValue(new Error('DB error'));

        await deactivate();

        expect(logWarn).toHaveBeenCalledWith(
            'Failed to persist Answer Agent history on deactivate: DB error'
        );
    });

    /** @aiContributed-2026-02-03 */
    it('should handle an empty ticket list gracefully', async () => {
        mockAnswerAgent.serializeHistory.mockReturnValue({});
        (listTickets as jest.Mock).mockResolvedValue([]);

        await deactivate();

        expect(updateTicket).not.toHaveBeenCalled();
        expect(logInfo).toHaveBeenCalledWith('Saved 0 conversation histories on deactivate');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle errors during serialization gracefully', async () => {
        mockAnswerAgent.serializeHistory.mockImplementation(() => {
            throw new Error('Serialization error');
        });
        (listTickets as jest.Mock).mockResolvedValue([{ id: 'ticket1' }]);

        await deactivate();

        expect(logWarn).toHaveBeenCalledWith(
            'Failed to persist Answer Agent history on deactivate: Serialization error'
        );
    });
});