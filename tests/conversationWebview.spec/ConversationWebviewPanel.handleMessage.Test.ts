// ./conversationWebview.Test.ts
import { ConversationWebviewPanel } from '../../src/ui/conversationWebview';
import { logWarn, logError } from '../../src/logger';

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('ConversationWebviewPanel', () => {
    let instance: ConversationWebviewPanel;

    beforeEach(() => {
        instance = new ConversationWebviewPanel(
            {} as Record<string, unknown>, 
            'testChatId', 
            {} as Record<string, unknown>, 
            []
        );
        instance.handleUserMessage = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    describe('handleMessage', () => {
        /** @aiContributed-2026-02-03 */
        it('should call handleUserMessage when message type is sendMessage', async () => {
            const message = { type: 'sendMessage', text: 'Hello' };

            await instance.handleMessage(message);

            expect(instance.handleUserMessage).toHaveBeenCalledWith('Hello');
            expect(logWarn).not.toHaveBeenCalled();
            expect(logError).not.toHaveBeenCalled();
        });

        /** @aiContributed-2026-02-03 */
        it('should log a warning for unknown message types', async () => {
            const message = { type: 'unknownType' };

            await instance.handleMessage(message);

            expect(instance.handleUserMessage).not.toHaveBeenCalled();
            expect(logWarn).toHaveBeenCalledWith('Unknown message type from webview: unknownType');
            expect(logError).not.toHaveBeenCalled();
        });

        /** @aiContributed-2026-02-03 */
        it('should log an error if handleUserMessage throws', async () => {
            const message = { type: 'sendMessage', text: 'Hello' };
            const error = new Error('Test error');
            (instance.handleUserMessage as jest.Mock).mockRejectedValueOnce(error);

            await instance.handleMessage(message);

            expect(instance.handleUserMessage).toHaveBeenCalledWith('Hello');
            expect(logWarn).not.toHaveBeenCalled();
            expect(logError).toHaveBeenCalledWith(`Error handling message: ${error}`);
        });

        /** @aiContributed-2026-02-03 */
        it('should handle null or undefined message gracefully', async () => {
            await instance.handleMessage(null);
            await instance.handleMessage(undefined);

            expect(instance.handleUserMessage).not.toHaveBeenCalled();
            expect(logWarn).not.toHaveBeenCalled();
            expect(logError).not.toHaveBeenCalled();
        });
    });
});