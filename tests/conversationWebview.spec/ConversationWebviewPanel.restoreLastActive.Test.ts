// ./conversationWebview.Test.ts
import { ConversationWebviewPanel } from '../../src/ui/conversationWebview';
import * as vscode from 'vscode';
import { getConversationHistory } from '../../src/agents/answerAgent';
import { logWarn } from '../../src/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    ExtensionContext: jest.fn(),
    globalState: {
        get: jest.fn(),
    },
}));

jest.mock('../../src/agents/answerAgent', () => ({
    ...jest.requireActual('../../src/agents/answerAgent'),
    getConversationHistory: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logWarn: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('ConversationWebviewPanel.restoreLastActive', () => {
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        mockContext = {
            globalState: {
                get: jest.fn(),
            },
        } as unknown as vscode.ExtensionContext;

        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should return null if no lastActiveChatId is found', async () => {
        (mockContext.globalState.get as jest.Mock).mockReturnValue(null);

        const result = await ConversationWebviewPanel.restoreLastActive(mockContext);

        expect(mockContext.globalState.get).toHaveBeenCalledWith('lastActiveChatId');
        expect(result).toBeNull();
    });

    /** @aiContributed-2026-02-03 */
    it('should return null and log a warning if getConversationHistory throws an error', async () => {
        (mockContext.globalState.get as jest.Mock).mockReturnValue('chat123');
        (getConversationHistory as jest.Mock).mockRejectedValue(new Error('Test error'));

        const result = await ConversationWebviewPanel.restoreLastActive(mockContext);

        expect(mockContext.globalState.get).toHaveBeenCalledWith('lastActiveChatId');
        expect(getConversationHistory).toHaveBeenCalledWith('chat123');
        expect(logWarn).toHaveBeenCalledWith('Failed to restore conversation chat123: Error: Test error');
        expect(result).toBeNull();
    });

    /** @aiContributed-2026-02-03 */
    it('should call createOrShow and return a ConversationWebviewPanel instance on success', async () => {
        const mockPanel = {} as ConversationWebviewPanel;
        (mockContext.globalState.get as jest.Mock).mockReturnValue('chat123');
        (getConversationHistory as jest.Mock).mockResolvedValue([{ role: 'user', content: 'Hello' }]);
        jest.spyOn(ConversationWebviewPanel, 'createOrShow').mockResolvedValue(mockPanel);

        const result = await ConversationWebviewPanel.restoreLastActive(mockContext);

        expect(mockContext.globalState.get).toHaveBeenCalledWith('lastActiveChatId');
        expect(getConversationHistory).toHaveBeenCalledWith('chat123');
        expect(ConversationWebviewPanel.createOrShow).toHaveBeenCalledWith('chat123', mockContext, [{ role: 'user', content: 'Hello' }]);
        expect(result).toBe(mockPanel);
    });
});