// ./conversationWebview.Test.ts
import { ConversationWebviewPanel } from '../../src/ui/conversationWebview';
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
describe('ConversationWebviewPanel', () => {
    /** @aiContributed-2026-02-03 */
    describe('getOpenPanels', () => {
        let mockPanels: Map<string, ConversationWebviewPanel>;

        beforeEach(() => {
            mockPanels = new Map();
            (ConversationWebviewPanel as unknown as { panels: Map<string, ConversationWebviewPanel> }).panels = mockPanels;
        });

        /** @aiContributed-2026-02-03 */
        it('should return an empty array when no panels are open', () => {
            const result = ConversationWebviewPanel.getOpenPanels();
            expect(result).toEqual([]);
            expect(Logger.debug).toHaveBeenCalledWith('getOpenPanels called, returning 0 panels');
        });

        /** @aiContributed-2026-02-03 */
        it('should return all open panels', () => {
            const panel1 = {} as ConversationWebviewPanel;
            const panel2 = {} as ConversationWebviewPanel;
            mockPanels.set('panel1', panel1);
            mockPanels.set('panel2', panel2);

            const result = ConversationWebviewPanel.getOpenPanels();
            expect(result).toEqual([panel1, panel2]);
            expect(Logger.debug).toHaveBeenCalledWith('getOpenPanels called, returning 2 panels');
        });

        /** @aiContributed-2026-02-03 */
        it('should handle concurrent modifications to the panels map', () => {
            const panel1 = {} as ConversationWebviewPanel;
            mockPanels.set('panel1', panel1);

            const result = ConversationWebviewPanel.getOpenPanels();
            mockPanels.delete('panel1'); // Simulate concurrent modification

            expect(result).toEqual([panel1]);
            expect(Logger.debug).toHaveBeenCalledWith('getOpenPanels called, returning 1 panels');
        });
    });
});