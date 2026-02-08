/**
 * Tests for Conversation Webview Panel
 * 
 * Tests the webview-based chat UI that manages conversation panels.
 * Focus areas: panel lifecycle, message handling, streaming, and HTML generation.
 */

import * as vscode from 'vscode';
import { ConversationWebviewPanel } from '../../src/ui/conversationWebview';

// Mock dependencies
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('../../src/agents/answerAgent', () => ({
    answerQuestion: jest.fn(),
    getConversationHistory: jest.fn(),
}));

import { logInfo, logWarn, logError } from '../../src/logger';
import { answerQuestion, getConversationHistory } from '../../src/agents/answerAgent';

describe('ConversationWebviewPanel', () => {
    let mockContext: vscode.ExtensionContext;
    let mockPanel: vscode.WebviewPanel;
    let messageHandler: ((message: any) => void) | null = null;
    let disposeHandler: (() => void) | null = null;

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset static state by disposing all panels
        ConversationWebviewPanel.disposeAll();

        // Create mock webview panel
        mockPanel = {
            webview: {
                html: '',
                postMessage: jest.fn().mockResolvedValue(true),
                onDidReceiveMessage: jest.fn((handler: any) => {
                    messageHandler = handler;
                    return { dispose: jest.fn() };
                }),
            },
            onDidDispose: jest.fn((handler: any) => {
                disposeHandler = handler;
                return { dispose: jest.fn() };
            }),
            reveal: jest.fn(),
            dispose: jest.fn(),
            title: '',
        } as unknown as vscode.WebviewPanel;

        // Mock vscode.window.createWebviewPanel
        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

        // Create mock extension context
        mockContext = {
            globalState: {
                get: jest.fn(),
                update: jest.fn().mockResolvedValue(undefined),
            },
            subscriptions: [],
        } as unknown as vscode.ExtensionContext;

        // Reset answer agent mock
        (getConversationHistory as jest.Mock).mockResolvedValue([]);
        (answerQuestion as jest.Mock).mockResolvedValue('AI response');
    });

    afterEach(() => {
        ConversationWebviewPanel.disposeAll();
        messageHandler = null;
        disposeHandler = null;
    });

    describe('createOrShow', () => {
        it('Test 1: should create a new webview panel for new chatId', async () => {
            const panel = await ConversationWebviewPanel.createOrShow('chat-123', mockContext);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'coeConversation',
                'Conversation chat-123...',
                vscode.ViewColumn.One,
                expect.objectContaining({
                    enableScripts: true,
                    retainContextWhenHidden: true,
                })
            );
            expect(panel).toBeDefined();
        });

        it('Test 2: should save chatId to globalState', async () => {
            await ConversationWebviewPanel.createOrShow('chat-456', mockContext);

            expect(mockContext.globalState.update).toHaveBeenCalledWith('lastActiveChatId', 'chat-456');
        });

        it('Test 3: should log when panel is opened', async () => {
            await ConversationWebviewPanel.createOrShow('chat-789', mockContext);

            expect(logInfo).toHaveBeenCalledWith('Opened conversation webview: chat-789');
        });

        it('Test 4: should reveal existing panel instead of creating duplicate', async () => {
            // Create first panel
            await ConversationWebviewPanel.createOrShow('same-chat', mockContext);

            // Reset mock to verify it's not called again
            (vscode.window.createWebviewPanel as jest.Mock).mockClear();

            // Try to create second panel with same chatId
            await ConversationWebviewPanel.createOrShow('same-chat', mockContext);

            expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
            expect(mockPanel.reveal).toHaveBeenCalled();
        });

        it('Test 5: should initialize webview HTML with initial messages', async () => {
            const initialMessages = [
                { role: 'user' as const, content: 'Hello' },
                { role: 'assistant' as const, content: 'Hi there!' },
            ];

            await ConversationWebviewPanel.createOrShow('chat-init', mockContext, initialMessages);

            expect(mockPanel.webview.html).toContain('Hello');
            expect(mockPanel.webview.html).toContain('Hi there!');
        });

        it('Test 6: should filter out system messages from display', async () => {
            const messages = [
                { role: 'system' as const, content: 'System prompt' },
                { role: 'user' as const, content: 'User message' },
            ];

            await ConversationWebviewPanel.createOrShow('chat-system', mockContext, messages);

            expect(mockPanel.webview.html).not.toContain('System prompt');
            expect(mockPanel.webview.html).toContain('User message');
        });

        it('Test 7: should set up message handler', async () => {
            await ConversationWebviewPanel.createOrShow('chat-handler', mockContext);

            expect(mockPanel.webview.onDidReceiveMessage).toHaveBeenCalled();
            expect(messageHandler).not.toBeNull();
        });

        it('Test 8: should set up dispose handler', async () => {
            await ConversationWebviewPanel.createOrShow('chat-dispose', mockContext);

            expect(mockPanel.onDidDispose).toHaveBeenCalled();
            expect(disposeHandler).not.toBeNull();
        });
    });

    describe('restoreLastActive', () => {
        it('Test 9: should return null if no last active chatId', async () => {
            (mockContext.globalState.get as jest.Mock).mockReturnValue(undefined);

            const result = await ConversationWebviewPanel.restoreLastActive(mockContext);

            expect(result).toBeNull();
        });

        it('Test 10: should restore conversation with history', async () => {
            const history = [{ role: 'user' as const, content: 'Previous message' }];
            (mockContext.globalState.get as jest.Mock).mockReturnValue('restored-chat');
            (getConversationHistory as jest.Mock).mockResolvedValue(history);

            const panel = await ConversationWebviewPanel.restoreLastActive(mockContext);

            expect(panel).toBeDefined();
            expect(getConversationHistory).toHaveBeenCalledWith('restored-chat');
        });

        it('Test 11: should handle restore errors gracefully', async () => {
            (mockContext.globalState.get as jest.Mock).mockReturnValue('error-chat');
            (getConversationHistory as jest.Mock).mockRejectedValue(new Error('DB error'));

            const result = await ConversationWebviewPanel.restoreLastActive(mockContext);

            expect(result).toBeNull();
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to restore conversation'));
        });
    });

    describe('getOpenPanels', () => {
        it('Test 12: should return empty array when no panels open', () => {
            const panels = ConversationWebviewPanel.getOpenPanels();

            expect(panels).toHaveLength(0);
        });

        it('Test 13: should return all open panels', async () => {
            // Create multiple panels (need unique mockPanels)
            await ConversationWebviewPanel.createOrShow('chat-1', mockContext);

            // Create a new mock panel for second chat
            const mockPanel2 = {
                ...mockPanel,
                webview: { ...mockPanel.webview, html: '', postMessage: jest.fn(), onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })) },
                onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
            };
            (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel2);

            await ConversationWebviewPanel.createOrShow('chat-2', mockContext);

            const panels = ConversationWebviewPanel.getOpenPanels();

            expect(panels).toHaveLength(2);
        });
    });

    describe('disposeAll', () => {
        it('Test 14: should dispose all panels', async () => {
            await ConversationWebviewPanel.createOrShow('chat-dispose-1', mockContext);

            expect(ConversationWebviewPanel.getOpenPanels()).toHaveLength(1);

            ConversationWebviewPanel.disposeAll();

            expect(ConversationWebviewPanel.getOpenPanels()).toHaveLength(0);
        });
    });

    describe('message handling', () => {
        it('Test 15: should handle sendMessage from webview', async () => {
            await ConversationWebviewPanel.createOrShow('chat-msg', mockContext);

            // Simulate message from webview
            await messageHandler?.({ type: 'sendMessage', text: 'Hello AI' });

            expect(answerQuestion).toHaveBeenCalledWith(
                'Hello AI',
                'chat-msg',
                expect.objectContaining({
                    onStream: expect.any(Function),
                })
            );
        });

        it('Test 16: should ignore empty messages', async () => {
            await ConversationWebviewPanel.createOrShow('chat-empty', mockContext);

            await messageHandler?.({ type: 'sendMessage', text: '   ' });

            expect(answerQuestion).not.toHaveBeenCalled();
        });

        it('Test 17: should post userMessage to webview', async () => {
            await ConversationWebviewPanel.createOrShow('chat-post', mockContext);

            await messageHandler?.({ type: 'sendMessage', text: 'Test' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'userMessage',
                text: 'Test',
            });
        });

        it('Test 18: should post streamStart before calling answerQuestion', async () => {
            await ConversationWebviewPanel.createOrShow('chat-stream', mockContext);

            await messageHandler?.({ type: 'sendMessage', text: 'Test' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'streamStart',
            });
        });

        it('Test 19: should post streamEnd after completion', async () => {
            await ConversationWebviewPanel.createOrShow('chat-end', mockContext);

            await messageHandler?.({ type: 'sendMessage', text: 'Test' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'streamEnd',
            });
        });

        it('Test 20: should stream chunks to webview', async () => {
            (answerQuestion as jest.Mock).mockImplementation(async (text, chatId, options) => {
                options.onStream('chunk1');
                options.onStream('chunk2');
                return 'final';
            });

            await ConversationWebviewPanel.createOrShow('chat-chunk', mockContext);

            await messageHandler?.({ type: 'sendMessage', text: 'Test' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'streamChunk',
                text: 'chunk1',
            });
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'streamChunk',
                text: 'chunk2',
            });
        });

        it('Test 21: should prevent concurrent streaming', async () => {
            let resolveAnswer: () => void;
            const answerPromise = new Promise<void>(r => { resolveAnswer = r; });

            (answerQuestion as jest.Mock).mockImplementation(async () => {
                await answerPromise;
                return 'done';
            });

            await ConversationWebviewPanel.createOrShow('chat-concurrent', mockContext);

            // First message - starts streaming
            const promise1 = messageHandler?.({ type: 'sendMessage', text: 'First' });

            // Reset postMessage to check second message
            (mockPanel.webview.postMessage as jest.Mock).mockClear();

            // Second message - should show error
            await messageHandler?.({ type: 'sendMessage', text: 'Second' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'error',
                text: 'AI is already responding. Please wait.',
            });

            // Clean up
            resolveAnswer!();
            await promise1;
        });

        it('Test 22: should handle answerQuestion errors', async () => {
            (answerQuestion as jest.Mock).mockRejectedValue(new Error('LLM offline'));

            await ConversationWebviewPanel.createOrShow('chat-error', mockContext);

            await messageHandler?.({ type: 'sendMessage', text: 'Test' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'error',
                text: 'Error: LLM offline',
            });
            expect(logError).toHaveBeenCalledWith(expect.stringContaining('Answer agent error'));
        });

        it('Test 23: should handle unknown message types', async () => {
            await ConversationWebviewPanel.createOrShow('chat-unknown', mockContext);

            await messageHandler?.({ type: 'unknownType' });

            expect(logWarn).toHaveBeenCalledWith('Unknown message type from webview: unknownType');
        });

        it('Test 24: should log successful response completion', async () => {
            (answerQuestion as jest.Mock).mockImplementation(async (text, chatId, options) => {
                options.onStream('Hello ');
                options.onStream('World');
                return 'Hello World';
            });

            await ConversationWebviewPanel.createOrShow('chat-log', mockContext);

            await messageHandler?.({ type: 'sendMessage', text: 'Test' });

            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Conversation response completed'));
        });
    });

    describe('panel disposal', () => {
        it('Test 25: should remove panel from static map on dispose', async () => {
            await ConversationWebviewPanel.createOrShow('chat-to-dispose', mockContext);

            expect(ConversationWebviewPanel.getOpenPanels()).toHaveLength(1);

            // Trigger dispose
            disposeHandler?.();

            expect(ConversationWebviewPanel.getOpenPanels()).toHaveLength(0);
        });

        it('Test 26: should log when panel is disposed', async () => {
            await ConversationWebviewPanel.createOrShow('chat-log-dispose', mockContext);

            disposeHandler?.();

            expect(logInfo).toHaveBeenCalledWith('Disposed conversation webview: chat-log-dispose');
        });
    });

    describe('HTML generation', () => {
        it('Test 27: should generate valid HTML structure', async () => {
            await ConversationWebviewPanel.createOrShow('chat-html', mockContext);

            const html = mockPanel.webview.html;

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<html lang="en">');
            expect(html).toContain('<head>');
            expect(html).toContain('<body>');
        });

        it('Test 28: should include nonce for CSP security', async () => {
            await ConversationWebviewPanel.createOrShow('chat-nonce', mockContext);

            const html = mockPanel.webview.html;

            // Nonce should appear in both style and script tags
            expect(html).toMatch(/nonce="[A-Za-z0-9]+"/);
            expect(html).toMatch(/<style nonce="[A-Za-z0-9]+">/);
            expect(html).toMatch(/<script nonce="[A-Za-z0-9]+">/);
        });

        it('Test 29: should include messages container', async () => {
            await ConversationWebviewPanel.createOrShow('chat-container', mockContext);

            expect(mockPanel.webview.html).toContain('id="messages"');
        });

        it('Test 30: should include input elements', async () => {
            await ConversationWebviewPanel.createOrShow('chat-input', mockContext);

            const html = mockPanel.webview.html;

            expect(html).toContain('id="input-box"');
            expect(html).toContain('id="send-button"');
            expect(html).toContain('placeholder="Type your message..."');
        });

        it('Test 31: should include typing indicator', async () => {
            await ConversationWebviewPanel.createOrShow('chat-typing', mockContext);

            const html = mockPanel.webview.html;

            expect(html).toContain('id="typing-indicator"');
            expect(html).toContain('AI is thinking');
        });

        it('Test 32: should include error display element', async () => {
            await ConversationWebviewPanel.createOrShow('chat-error-div', mockContext);

            expect(mockPanel.webview.html).toContain('id="error-message"');
        });

        it('Test 33: should use VS Code theme variables', async () => {
            await ConversationWebviewPanel.createOrShow('chat-theme', mockContext);

            const html = mockPanel.webview.html;

            expect(html).toContain('--vscode-editor-background');
            expect(html).toContain('--vscode-editor-foreground');
            expect(html).toContain('--vscode-button-background');
        });

        it('Test 34: should escape HTML in messages', async () => {
            const messages = [
                { role: 'user' as const, content: '<script>alert("XSS")</script>' },
            ];

            await ConversationWebviewPanel.createOrShow('chat-escape', mockContext, messages);

            const html = mockPanel.webview.html;

            expect(html).not.toContain('<script>alert');
            expect(html).toContain('&lt;script&gt;');
        });

        it('Test 35: should escape ampersands in messages', async () => {
            const messages = [
                { role: 'user' as const, content: 'A & B' },
            ];

            await ConversationWebviewPanel.createOrShow('chat-amp', mockContext, messages);

            expect(mockPanel.webview.html).toContain('A &amp; B');
        });

        it('Test 36: should escape quotes in messages', async () => {
            const messages = [
                { role: 'user' as const, content: 'Say "hello"' },
            ];

            await ConversationWebviewPanel.createOrShow('chat-quote', mockContext, messages);

            expect(mockPanel.webview.html).toContain('&quot;hello&quot;');
        });

        it('Test 37: should assign correct CSS class for user messages', async () => {
            const messages = [
                { role: 'user' as const, content: 'User text' },
            ];

            await ConversationWebviewPanel.createOrShow('chat-user-class', mockContext, messages);

            expect(mockPanel.webview.html).toContain('class="message user"');
        });

        it('Test 38: should assign correct CSS class for assistant messages', async () => {
            const messages = [
                { role: 'assistant' as const, content: 'Assistant text' },
            ];

            await ConversationWebviewPanel.createOrShow('chat-asst-class', mockContext, messages);

            expect(mockPanel.webview.html).toContain('class="message assistant"');
        });

        it('Test 39: should include message bubble wrapper', async () => {
            const messages = [
                { role: 'user' as const, content: 'Test' },
            ];

            await ConversationWebviewPanel.createOrShow('chat-bubble', mockContext, messages);

            expect(mockPanel.webview.html).toContain('class="message-bubble"');
        });

        it('Test 40: should include JavaScript for sending messages', async () => {
            await ConversationWebviewPanel.createOrShow('chat-js', mockContext);

            const html = mockPanel.webview.html;

            expect(html).toContain('function sendMessage()');
            expect(html).toContain('vscode.postMessage');
        });

        it('Test 41: should include Enter key handler', async () => {
            await ConversationWebviewPanel.createOrShow('chat-enter', mockContext);

            const html = mockPanel.webview.html;

            expect(html).toContain("e.key === 'Enter'");
        });

        it('Test 42: should include message event listener', async () => {
            await ConversationWebviewPanel.createOrShow('chat-listener', mockContext);

            expect(mockPanel.webview.html).toContain("window.addEventListener('message'");
        });

        it('Test 43: should include scrollToBottom function', async () => {
            await ConversationWebviewPanel.createOrShow('chat-scroll', mockContext);

            expect(mockPanel.webview.html).toContain('function scrollToBottom()');
        });

        it('Test 44: should include auto-expand textarea logic', async () => {
            await ConversationWebviewPanel.createOrShow('chat-expand', mockContext);

            expect(mockPanel.webview.html).toContain('inputBox.scrollHeight');
        });
    });

    describe('CSS styling', () => {
        it('Test 45: should include animation keyframes', async () => {
            await ConversationWebviewPanel.createOrShow('chat-animation', mockContext);

            const html = mockPanel.webview.html;

            expect(html).toContain('@keyframes slideIn');
            expect(html).toContain('@keyframes typingBounce');
        });

        it('Test 46: should style user messages alignment', async () => {
            await ConversationWebviewPanel.createOrShow('chat-user-align', mockContext);

            expect(mockPanel.webview.html).toContain('.message.user');
            expect(mockPanel.webview.html).toContain('justify-content: flex-end');
        });

        it('Test 47: should style assistant messages alignment', async () => {
            await ConversationWebviewPanel.createOrShow('chat-asst-align', mockContext);

            expect(mockPanel.webview.html).toContain('.message.assistant');
            expect(mockPanel.webview.html).toContain('justify-content: flex-start');
        });

        it('Test 48: should include flexbox layout', async () => {
            await ConversationWebviewPanel.createOrShow('chat-flex', mockContext);

            const html = mockPanel.webview.html;

            expect(html).toContain('display: flex');
            expect(html).toContain('flex-direction: column');
        });

        it('Test 49: should configure max-width for message bubbles', async () => {
            await ConversationWebviewPanel.createOrShow('chat-maxwidth', mockContext);

            expect(mockPanel.webview.html).toContain('max-width: 70%');
        });

        it('Test 50: should style disabled button state', async () => {
            await ConversationWebviewPanel.createOrShow('chat-disabled', mockContext);

            expect(mockPanel.webview.html).toContain('button:disabled');
        });
    });

    describe('webview options', () => {
        it('Test 51: should enable scripts in webview', async () => {
            await ConversationWebviewPanel.createOrShow('chat-scripts', mockContext);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.objectContaining({
                    enableScripts: true,
                })
            );
        });

        it('Test 52: should retain context when hidden', async () => {
            await ConversationWebviewPanel.createOrShow('chat-retain', mockContext);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.objectContaining({
                    retainContextWhenHidden: true,
                })
            );
        });

        it('Test 53: should set empty localResourceRoots', async () => {
            await ConversationWebviewPanel.createOrShow('chat-roots', mockContext);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.objectContaining({
                    localResourceRoots: [],
                })
            );
        });

        it('Test 54: should open in ViewColumn.One', async () => {
            await ConversationWebviewPanel.createOrShow('chat-column', mockContext);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                vscode.ViewColumn.One,
                expect.anything()
            );
        });
    });

    describe('edge cases', () => {
        it('Test 55: should handle empty initial messages', async () => {
            await ConversationWebviewPanel.createOrShow('chat-empty-init', mockContext, []);

            expect(mockPanel.webview.html).toContain('id="messages"');
        });

        it('Test 56: should handle message with empty content', async () => {
            const messages = [
                { role: 'user' as const, content: '' },
            ];

            await ConversationWebviewPanel.createOrShow('chat-empty-content', mockContext, messages);

            expect(mockPanel.webview.html).toContain('class="message-bubble"');
        });

        it('Test 57: should handle non-Error thrown from answerQuestion', async () => {
            (answerQuestion as jest.Mock).mockRejectedValue('String error');

            await ConversationWebviewPanel.createOrShow('chat-string-err', mockContext);

            await messageHandler?.({ type: 'sendMessage', text: 'Test' });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'error',
                text: 'Error: String error',
            });
        });

        it('Test 58: should handle single quotes in messages', async () => {
            const messages = [
                { role: 'user' as const, content: "It's working" },
            ];

            await ConversationWebviewPanel.createOrShow('chat-apostrophe', mockContext, messages);

            expect(mockPanel.webview.html).toContain('&#39;');
        });

        it('Test 59: should generate unique nonces for each panel', async () => {
            await ConversationWebviewPanel.createOrShow('chat-nonce-1', mockContext);
            const html1 = mockPanel.webview.html;
            const nonce1Match = html1.match(/nonce="([A-Za-z0-9]+)"/);

            // Create new mock panel for second chat
            const mockPanel2 = {
                ...mockPanel,
                webview: { ...mockPanel.webview, html: '', postMessage: jest.fn(), onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })) },
                onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
            };
            (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel2);

            await ConversationWebviewPanel.createOrShow('chat-nonce-2', mockContext);
            const html2 = mockPanel2.webview.html;
            const nonce2Match = html2.match(/nonce="([A-Za-z0-9]+)"/);

            // Nonces should be different (high probability with 32 char random string)
            if (nonce1Match && nonce2Match) {
                expect(nonce1Match[1]).not.toEqual(nonce2Match[1]);
            }
        });

        it('Test 60: should truncate long chatId in panel title', async () => {
            const longChatId = 'abcdefghijklmnopqrstuvwxyz123456';

            await ConversationWebviewPanel.createOrShow(longChatId, mockContext);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                expect.anything(),
                'Conversation abcdefgh...',
                expect.anything(),
                expect.anything()
            );
        });
    });
});
