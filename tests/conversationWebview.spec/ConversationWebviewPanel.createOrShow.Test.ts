// ./conversationWebview.Test.ts
import * as vscode from 'vscode';
import { ConversationWebviewPanel } from '../../src/ui/conversationWebview';
import { logInfo } from '../../src/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    window: {
        createWebviewPanel: jest.fn(),
    },
    ViewColumn: {
        One: 1,
    },
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('ConversationWebviewPanel', () => {
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        mockContext = {
            globalState: {
                update: jest.fn(),
            },
        } as unknown as vscode.ExtensionContext;

        (vscode.window.createWebviewPanel as jest.Mock).mockReset();
        (logInfo as jest.Mock).mockReset();
    });

    /** @aiContributed-2026-02-03 */
    describe('createOrShow', () => {
        /** @aiContributed-2026-02-03 */
        it('should reveal an existing panel if it already exists', async () => {
            const mockReveal = jest.fn();
            const mockPanel = {
                panel: { reveal: mockReveal },
            } as unknown as ConversationWebviewPanel;

            (ConversationWebviewPanel as Map<string, ConversationWebviewPanel>).panels = new Map([['chatId1', mockPanel]]);

            const result = await ConversationWebviewPanel.createOrShow('chatId1', mockContext);

            expect(mockReveal).toHaveBeenCalled();
            expect(result).toBe(mockPanel);
        });

        /** @aiContributed-2026-02-03 */
        it('should create a new panel if none exists for the chatId', async () => {
            const mockWebviewPanel = {
                reveal: jest.fn(),
            } as unknown as vscode.WebviewPanel;

            (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockWebviewPanel);
            (ConversationWebviewPanel as Map<string, ConversationWebviewPanel>).panels = new Map();

            const result = await ConversationWebviewPanel.createOrShow('chatId2', mockContext);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'coeConversation',
                'Conversation chatId2...',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [],
                }
            );
            expect(mockContext.globalState.update).toHaveBeenCalledWith('lastActiveChatId', 'chatId2');
            expect(logInfo).toHaveBeenCalledWith('Opened conversation webview: chatId2');
            expect(result).toBeInstanceOf(ConversationWebviewPanel);
        });

        /** @aiContributed-2026-02-03 */
        it('should handle undefined initialMessages gracefully', async () => {
            const mockWebviewPanel = {
                reveal: jest.fn(),
            } as unknown as vscode.WebviewPanel;

            (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockWebviewPanel);
            (ConversationWebviewPanel as Map<string, ConversationWebviewPanel>).panels = new Map();

            const result = await ConversationWebviewPanel.createOrShow('chatId3', mockContext, undefined);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
            expect(result).toBeInstanceOf(ConversationWebviewPanel);
        });

        /** @aiContributed-2026-02-03 */
        it('should throw an error if globalState update fails', async () => {
            const mockWebviewPanel = {
                reveal: jest.fn(),
            } as unknown as vscode.WebviewPanel;

            (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockWebviewPanel);
            (ConversationWebviewPanel as Map<string, ConversationWebviewPanel>).panels = new Map();
            (mockContext.globalState.update as jest.Mock).mockRejectedValue(new Error('Update failed'));

            await expect(
                ConversationWebviewPanel.createOrShow('chatId4', mockContext)
            ).rejects.toThrow('Update failed');
        });
    });
});