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

/** @aiContributed-2026-02-04 */
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

    /** @aiContributed-2026-02-04 */
    it('should reveal an existing panel if it already exists', async () => {
        const mockReveal = jest.fn();
        const mockPanel = {
            panel: { reveal: mockReveal },
        } as unknown as InstanceType<typeof ConversationWebviewPanel>;

        (ConversationWebviewPanel as typeof ConversationWebviewPanel & { panels: Map<string, InstanceType<typeof ConversationWebviewPanel>> }).panels = new Map([['chat1', mockPanel]]);

        const result = await ConversationWebviewPanel.createOrShow('chat1', mockContext);

        expect(mockReveal).toHaveBeenCalled();
        expect(result).toBe(mockPanel);
    });

    /** @aiContributed-2026-02-04 */
    it('should create a new panel if none exists for the chatId', async () => {
        const mockWebviewPanel = {};
        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockWebviewPanel);

        (ConversationWebviewPanel as typeof ConversationWebviewPanel & { panels: Map<string, InstanceType<typeof ConversationWebviewPanel>> }).panels = new Map();

        const result = await ConversationWebviewPanel.createOrShow('chat2', mockContext);

        expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
            'coeConversation',
            'Conversation chat2...',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [],
            }
        );
        expect(mockContext.globalState.update).toHaveBeenCalledWith('lastActiveChatId', 'chat2');
        expect(logInfo).toHaveBeenCalledWith('Opened conversation webview: chat2');
        expect(result).toBeInstanceOf(ConversationWebviewPanel);
    });

    /** @aiContributed-2026-02-04 */
    it('should handle undefined initialMessages gracefully', async () => {
        const mockWebviewPanel = {};
        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockWebviewPanel);

        (ConversationWebviewPanel as typeof ConversationWebviewPanel & { panels: Map<string, InstanceType<typeof ConversationWebviewPanel>> }).panels = new Map();

        const result = await ConversationWebviewPanel.createOrShow('chat3', mockContext, undefined);

        expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
        expect(mockContext.globalState.update).toHaveBeenCalledWith('lastActiveChatId', 'chat3');
        expect(result).toBeInstanceOf(ConversationWebviewPanel);
    });

    /** @aiContributed-2026-02-04 */
    it('should throw an error if globalState update fails', async () => {
        mockContext.globalState.update = jest.fn().mockRejectedValue(new Error('Update failed'));

        const mockWebviewPanel = {};
        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockWebviewPanel);

        (ConversationWebviewPanel as typeof ConversationWebviewPanel & { panels: Map<string, InstanceType<typeof ConversationWebviewPanel>> }).panels = new Map();

        await expect(
            ConversationWebviewPanel.createOrShow('chat4', mockContext)
        ).rejects.toThrow('Update failed');
    });

    /** @aiContributed-2026-02-04 */
    it('should save the chatId to globalState when creating a new panel', async () => {
        const mockWebviewPanel = {};
        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockWebviewPanel);

        (ConversationWebviewPanel as typeof ConversationWebviewPanel & { panels: Map<string, InstanceType<typeof ConversationWebviewPanel>> }).panels = new Map();

        await ConversationWebviewPanel.createOrShow('chat5', mockContext);

        expect(mockContext.globalState.update).toHaveBeenCalledWith('lastActiveChatId', 'chat5');
    });

    /** @aiContributed-2026-02-04 */
    it('should log information when a new panel is created', async () => {
        const mockWebviewPanel = {};
        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockWebviewPanel);

        (ConversationWebviewPanel as typeof ConversationWebviewPanel & { panels: Map<string, InstanceType<typeof ConversationWebviewPanel>> }).panels = new Map();

        await ConversationWebviewPanel.createOrShow('chat6', mockContext);

        expect(logInfo).toHaveBeenCalledWith('Opened conversation webview: chat6');
    });
});