// ./conversationWebview.test.ts
import * as vscode from 'vscode';
import { ConversationWebviewPanel } from '../src/ui/conversationWebview';
import { logInfo, logWarn, logError } from '../src/logger';
import { getConversationHistory } from '../src/agents/answerAgent';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    window: {
        createWebviewPanel: jest.fn(),
    },
    ViewColumn: {
        One: 1,
    },
    ExtensionContext: jest.fn(),
}));

jest.mock('../src/logger', () => ({
    ...jest.requireActual('../src/logger'),
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('../src/agents/answerAgent', () => ({
    ...jest.requireActual('../src/agents/answerAgent'),
    getConversationHistory: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('ConversationWebviewPanel', () => {
    let mockContext: vscode.ExtensionContext;
    let mockPanel: vscode.WebviewPanel;

    beforeEach(() => {
        mockContext = {
            globalState: {
                update: jest.fn(),
                get: jest.fn(),
            },
        } as unknown as vscode.ExtensionContext;

        mockPanel = {
            reveal: jest.fn(),
            onDidDispose: jest.fn((callback) => {
                // Return a disposable
                return { dispose: jest.fn() };
            }),
            onDidChangeViewState: jest.fn((callback) => {
                return { dispose: jest.fn() };
            }),
            webview: {
                html: '',
                postMessage: jest.fn(),
                onDidReceiveMessage: jest.fn((callback) => {
                    return { dispose: jest.fn() };
                }),
                asWebviewUri: jest.fn((uri) => uri),
            },
            dispose: jest.fn(),
        } as unknown as vscode.WebviewPanel;

        (vscode.window.createWebviewPanel as jest.Mock).mockReset();
        (logInfo as jest.Mock).mockReset();
        (logWarn as jest.Mock).mockReset();
        (logError as jest.Mock).mockReset();
        (getConversationHistory as jest.Mock).mockReset();
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    describe('createOrShow', () => {
        /** @aiContributed-2026-02-03 */
        it('should reveal an existing panel if it already exists', async () => {
            const mockReveal = jest.fn();
            const existingPanel = {
                panel: { reveal: mockReveal },
            } as unknown as ConversationWebviewPanel;

            (ConversationWebviewPanel as unknown as { panels: Map<string, ConversationWebviewPanel> }).panels = new Map([['chatId1', existingPanel]]);

            const result = await ConversationWebviewPanel.createOrShow('chatId1', mockContext);

            expect(mockReveal).toHaveBeenCalled();
            expect(result).toBe(existingPanel);
        });

        /** @aiContributed-2026-02-03 */
        it('should create a new panel if none exists for the chatId', async () => {
            (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);
            (ConversationWebviewPanel as unknown as { panels: Map<string, ConversationWebviewPanel> }).panels = new Map();

            const result = await ConversationWebviewPanel.createOrShow('chatId2', mockContext);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'coeConversation',
                expect.stringContaining('chatId2'),
                vscode.ViewColumn.One,
                expect.objectContaining({
                    enableScripts: true,
                    retainContextWhenHidden: true,
                })
            );
            expect(mockContext.globalState.update).toHaveBeenCalledWith('lastActiveChatId', 'chatId2');
            expect(logInfo).toHaveBeenCalledWith('Opened conversation webview: chatId2');
            expect(result).toBeInstanceOf(ConversationWebviewPanel);
        });

        /** @aiContributed-2026-02-03 */
        it('should handle undefined initialMessages gracefully', async () => {
            (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);
            (ConversationWebviewPanel as unknown as { panels: Map<string, ConversationWebviewPanel> }).panels = new Map();

            const result = await ConversationWebviewPanel.createOrShow('chatId3', mockContext, undefined);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
            expect(result).toBeInstanceOf(ConversationWebviewPanel);
        });

        /** @aiContributed-2026-02-03 */
        it('should throw an error if globalState update fails', async () => {
            (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);
            (ConversationWebviewPanel as unknown as { panels: Map<string, ConversationWebviewPanel> }).panels = new Map();
            (mockContext.globalState.update as jest.Mock).mockRejectedValue(new Error('Update failed'));

            await expect(
                ConversationWebviewPanel.createOrShow('chatId4', mockContext)
            ).rejects.toThrow('Update failed');
        });

        /** @aiContributed-2026-02-03 */
        it('should log info when a new panel is created', async () => {
            (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);
            (ConversationWebviewPanel as unknown as { panels: Map<string, ConversationWebviewPanel> }).panels = new Map();

            await ConversationWebviewPanel.createOrShow('chatId5', mockContext);

            expect(logInfo).toHaveBeenCalledWith('Opened conversation webview: chatId5');
        });
    });

    /** @aiContributed-2026-02-03 */
    describe('disposeAll', () => {
        /** @aiContributed-2026-02-03 */
        it('should dispose all panels and clear the panels map', () => {
            const mockDispose = jest.fn();
            (ConversationWebviewPanel as unknown as { panels: Map<string, { dispose: jest.Mock }> }).panels = new Map([
                ['panel1', { dispose: mockDispose }],
                ['panel2', { dispose: mockDispose }],
            ]);

            ConversationWebviewPanel.disposeAll();

            expect(mockDispose).toHaveBeenCalledTimes(2);
            expect((ConversationWebviewPanel as unknown as { panels: Map<string, { dispose: jest.Mock }> }).panels.size).toBe(0);
        });

        /** @aiContributed-2026-02-03 */
        it('should handle empty panels map gracefully', () => {
            (ConversationWebviewPanel as unknown as { panels: Map<string, unknown> }).panels = new Map();

            ConversationWebviewPanel.disposeAll();

            expect((ConversationWebviewPanel as unknown as { panels: Map<string, unknown> }).panels.size).toBe(0);
        });

        /** @aiContributed-2026-02-03 */
        it('should handle errors during panel disposal', () => {
            const mockDispose = jest.fn();
            mockDispose.mockImplementationOnce(() => {
                throw new Error('Dispose error');
            });

            (ConversationWebviewPanel as unknown as { panels: Map<string, { dispose: jest.Mock }> }).panels = new Map([
                ['panel1', { dispose: mockDispose }],
                ['panel2', { dispose: mockDispose }],
            ]);

            expect(() => ConversationWebviewPanel.disposeAll()).toThrow();
            expect(mockDispose).toHaveBeenCalledTimes(1);
        });
    });

    /** @aiContributed-2026-02-03 */
    describe('getOpenPanels', () => {
        /** @aiContributed-2026-02-03 */
        it('should return an empty array when no panels are open', () => {
            (ConversationWebviewPanel as unknown as { panels: Map<string, ConversationWebviewPanel> }).panels = new Map();

            const result = ConversationWebviewPanel.getOpenPanels();
            expect(result).toEqual([]);
        });

        /** @aiContributed-2026-02-03 */
        it('should return all open panels', () => {
            const panel1 = {} as ConversationWebviewPanel;
            const panel2 = {} as ConversationWebviewPanel;
            (ConversationWebviewPanel as unknown as { panels: Map<string, ConversationWebviewPanel> }).panels = new Map([
                ['panel1', panel1],
                ['panel2', panel2],
            ]);

            const result = ConversationWebviewPanel.getOpenPanels();
            expect(result).toEqual([panel1, panel2]);
        });

        /** @aiContributed-2026-02-03 */
        it('should handle concurrent modifications to the panels map', () => {
            const panel1 = {} as ConversationWebviewPanel;
            const panelsMap = new Map([['panel1', panel1]]);
            (ConversationWebviewPanel as unknown as { panels: Map<string, ConversationWebviewPanel> }).panels = panelsMap;

            const result = ConversationWebviewPanel.getOpenPanels();
            panelsMap.delete('panel1');

            expect(result).toEqual([panel1]);
        });

        /** @aiContributed-2026-02-03 */
        it('should return panels in insertion order', () => {
            const panel1 = {} as ConversationWebviewPanel;
            const panel2 = {} as ConversationWebviewPanel;
            const panel3 = {} as ConversationWebviewPanel;
            (ConversationWebviewPanel as unknown as { panels: Map<string, ConversationWebviewPanel> }).panels = new Map([
                ['panel1', panel1],
                ['panel2', panel2],
                ['panel3', panel3],
            ]);

            const result = ConversationWebviewPanel.getOpenPanels();
            expect(result).toEqual([panel1, panel2, panel3]);
        });

        /** @aiContributed-2026-02-03 */
        it('should not mutate the original panels map', () => {
            const panel1 = {} as ConversationWebviewPanel;
            const panelsMap = new Map([['panel1', panel1]]);
            (ConversationWebviewPanel as unknown as { panels: Map<string, ConversationWebviewPanel> }).panels = panelsMap;

            const result = ConversationWebviewPanel.getOpenPanels();
            result.pop();

            expect(panelsMap.size).toBe(1);
            expect(panelsMap.get('panel1')).toBe(panel1);
        });
    });

    /** @aiContributed-2026-02-03 */
    describe('restoreLastActive', () => {
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
            const mockRestorePanel = {} as ConversationWebviewPanel;
            (mockContext.globalState.get as jest.Mock).mockReturnValue('chat123');
            (getConversationHistory as jest.Mock).mockResolvedValue([{ role: 'user', content: 'Hello' }]);
            jest.spyOn(ConversationWebviewPanel, 'createOrShow').mockResolvedValue(mockRestorePanel);

            const result = await ConversationWebviewPanel.restoreLastActive(mockContext);

            expect(mockContext.globalState.get).toHaveBeenCalledWith('lastActiveChatId');
            expect(getConversationHistory).toHaveBeenCalledWith('chat123');
            expect(ConversationWebviewPanel.createOrShow).toHaveBeenCalledWith('chat123', mockContext, [{ role: 'user', content: 'Hello' }]);
            expect(result).toBe(mockRestorePanel);
        });
    });
});
