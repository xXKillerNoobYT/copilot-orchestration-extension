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

/** @aiContributed-2026-02-04 */
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

    /** @aiContributed-2026-02-04 */
    it('should return null if no lastActiveChatId is found', async () => {
        (mockContext.globalState.get as jest.Mock).mockReturnValue(null);

        const result = await ConversationWebviewPanel.restoreLastActive(mockContext);

        expect(mockContext.globalState.get).toHaveBeenCalledWith('lastActiveChatId');
        expect(result).toBeNull();
    });

    /** @aiContributed-2026-02-04 */
    it('should return null and log a warning if getConversationHistory throws an error', async () => {
        const chatId = 'testChatId';
        (mockContext.globalState.get as jest.Mock).mockReturnValue(chatId);
        (getConversationHistory as jest.Mock).mockRejectedValue(new Error('Test error'));

        const result = await ConversationWebviewPanel.restoreLastActive(mockContext);

        expect(mockContext.globalState.get).toHaveBeenCalledWith('lastActiveChatId');
        expect(getConversationHistory).toHaveBeenCalledWith(chatId);
        expect(logWarn).toHaveBeenCalledWith(`Failed to restore conversation ${chatId}: Error: Test error`);
        expect(result).toBeNull();
    });

    /** @aiContributed-2026-02-04 */
    it('should call createOrShow and return a ConversationWebviewPanel instance on success', async () => {
        const chatId = 'testChatId';
        const mockHistory = [{ role: 'user', content: 'Hello' }];
        const mockPanel = {} as ConversationWebviewPanel;

        (mockContext.globalState.get as jest.Mock).mockReturnValue(chatId);
        (getConversationHistory as jest.Mock).mockResolvedValue(mockHistory);
        jest.spyOn(ConversationWebviewPanel, 'createOrShow').mockResolvedValue(mockPanel);

        const result = await ConversationWebviewPanel.restoreLastActive(mockContext);

        expect(mockContext.globalState.get).toHaveBeenCalledWith('lastActiveChatId');
        expect(getConversationHistory).toHaveBeenCalledWith(chatId);
        expect(ConversationWebviewPanel.createOrShow).toHaveBeenCalledWith(chatId, mockContext, mockHistory);
        expect(result).toBe(mockPanel);
    });

    /** @aiContributed-2026-02-04 */
    it('should handle unexpected errors gracefully and return null', async () => {
        const chatId = 'testChatId';
        (mockContext.globalState.get as jest.Mock).mockReturnValue(chatId);
        (getConversationHistory as jest.Mock).mockImplementation(() => {
            throw new Error('Unexpected error');
        });

        const result = await ConversationWebviewPanel.restoreLastActive(mockContext);

        expect(mockContext.globalState.get).toHaveBeenCalledWith('lastActiveChatId');
        expect(getConversationHistory).toHaveBeenCalledWith(chatId);
        expect(logWarn).toHaveBeenCalledWith(`Failed to restore conversation ${chatId}: Error: Unexpected error`);
        expect(result).toBeNull();
    });
});