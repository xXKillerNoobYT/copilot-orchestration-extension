// ./conversationWebview.Test.ts
import { ConversationWebviewPanel } from '../../src/ui/conversationWebview';
import { answerQuestion } from '../../src/agents/answerAgent';
import { logInfo, logError } from '../../src/logger';
import * as vscode from 'vscode';

jest.mock('../../src/agents/answerAgent');
jest.mock('../../src/logger');
jest.mock('vscode');

/** @aiContributed-2026-02-03 */
describe('ConversationWebviewPanel.handleUserMessage', () => {
    let panelMock: vscode.WebviewPanel;
    let contextMock: vscode.ExtensionContext;
    let instance: InstanceType<typeof ConversationWebviewPanel>;

    beforeEach(() => {
        panelMock = {
            webview: {
                postMessage: jest.fn(),
            },
        } as unknown as vscode.WebviewPanel;

        contextMock = {} as vscode.ExtensionContext;

        instance = new ConversationWebviewPanel(panelMock, 'testChatId', contextMock);
        instance.isStreaming = false;
    });

    /** @aiContributed-2026-02-03 */
    it('should return immediately if userText is empty or whitespace', async () => {
        await instance.handleUserMessage('');
        await instance.handleUserMessage('   ');

        expect(panelMock.webview.postMessage).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-03 */
    it('should send an error message if already streaming', async () => {
        instance.isStreaming = true;

        await instance.handleUserMessage('test message');

        expect(panelMock.webview.postMessage).toHaveBeenCalledWith({
            type: 'error',
            text: 'AI is already responding. Please wait.',
        });
    });

    /** @aiContributed-2026-02-03 */
    it('should handle the happy path correctly', async () => {
        (answerQuestion as jest.Mock).mockImplementation(async (question, chatId, options) => {
            options.onStream('chunk1');
            options.onStream('chunk2');
            return 'full response';
        });

        await instance.handleUserMessage('test message');

        expect(panelMock.webview.postMessage).toHaveBeenCalledWith({
            type: 'userMessage',
            text: 'test message',
        });
        expect(panelMock.webview.postMessage).toHaveBeenCalledWith({
            type: 'streamStart',
        });
        expect(panelMock.webview.postMessage).toHaveBeenCalledWith({
            type: 'streamChunk',
            text: 'chunk1',
        });
        expect(panelMock.webview.postMessage).toHaveBeenCalledWith({
            type: 'streamChunk',
            text: 'chunk2',
        });
        expect(panelMock.webview.postMessage).toHaveBeenCalledWith({
            type: 'streamEnd',
        });
        expect(logInfo).toHaveBeenCalledWith('Conversation response completed (12 chars)');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle errors from answerQuestion gracefully', async () => {
        (answerQuestion as jest.Mock).mockRejectedValue(new Error('Test error'));

        await instance.handleUserMessage('test message');

        expect(panelMock.webview.postMessage).toHaveBeenCalledWith({
            type: 'error',
            text: 'Error: Test error',
        });
        expect(logError).toHaveBeenCalledWith('Answer agent error: Error: Test error');
    });

    /** @aiContributed-2026-02-03 */
    it('should reset isStreaming flag after execution', async () => {
        (answerQuestion as jest.Mock).mockResolvedValue('response');

        await instance.handleUserMessage('test message');
        expect(instance.isStreaming).toBe(false);

        (answerQuestion as jest.Mock).mockRejectedValue(new Error('Test error'));
        await instance.handleUserMessage('test message');
        expect(instance.isStreaming).toBe(false);
    });
});