/**
 * Conversation Webview Panel
 * 
 * Manages webview panels for chat conversations. One instance per unique chatId.
 * Implements VS Code webview security best practices (CSP, nonce, no external resources).
 * 
 * **Simple explanation**: Like opening a chat window for each conversation. Each window
 * is isolated (can't access extension code directly), communicates via messages, and
 * auto-saves which conversation was last open.
 */

import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../logger';
import { answerQuestion, getConversationHistory } from '../agents/answerAgent';
import type { Message } from '../agents/answerAgent';

/**
 * Manages a single webview panel for a conversation.
 * Singleton pattern: one instance per chatId.
 */
class ConversationWebviewPanel {
    private static readonly panels: Map<string, ConversationWebviewPanel> = new Map();
    
    private panel: vscode.WebviewPanel;
    private chatId: string;
    private disposables: vscode.Disposable[] = [];
    private isStreaming = false;
    private context: vscode.ExtensionContext;

    private constructor(
        panel: vscode.WebviewPanel,
        chatId: string,
        context: vscode.ExtensionContext,
        initialMessages?: Message[]
    ) {
        this.panel = panel;
        this.chatId = chatId;
        this.context = context;

        // Update webview HTML with initial messages
        this.updateWebviewContent(initialMessages || []);

        // Handle webview disposal
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            (message) => this.handleMessage(message),
            null,
            this.disposables
        );
    }

    /**
     * Create or show a conversation webview panel.
     * 
     * **Simple explanation**: Opens a chat window. If one already exists for this
     * conversation ID, bring it to front. Otherwise create a new one.
     */
    static async createOrShow(
        chatId: string,
        context: vscode.ExtensionContext,
        initialMessages?: Message[]
    ): Promise<ConversationWebviewPanel> {
        // If panel already exists for this chatId, show it
        const existing = this.panels.get(chatId);
        if (existing) {
            existing.panel.reveal();
            return existing;
        }

        // Create new webview panel
        const panel = vscode.window.createWebviewPanel(
            'coeConversation',
            `Conversation ${chatId.substring(0, 8)}...`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [], // No local files needed
            }
        );

        const newPanel = new ConversationWebviewPanel(
            panel,
            chatId,
            context,
            initialMessages
        );
        this.panels.set(chatId, newPanel);

        // Save active chatId to globalState for restoration
        await context.globalState.update('lastActiveChatId', chatId);
        logInfo(`Opened conversation webview: ${chatId}`);

        return newPanel;
    }

    /**
     * Restore and show the last active conversation.
     * Called on extension activation if user was in a conversation.
     */
    static async restoreLastActive(
        context: vscode.ExtensionContext
    ): Promise<ConversationWebviewPanel | null> {
        const lastChatId = context.globalState.get<string>('lastActiveChatId');
        if (!lastChatId) {
            return null;
        }

        try {
            const history = await getConversationHistory(lastChatId);
            return await this.createOrShow(lastChatId, context, history);
        } catch (err) {
            logWarn(`Failed to restore conversation ${lastChatId}: ${err}`);
            return null;
        }
    }

    /**
     * Dispose all open webview panels.
     * Called on extension deactivation.
     */
    static disposeAll(): void {
        for (const panel of this.panels.values()) {
            panel.dispose();
        }
        this.panels.clear();
    }

    /**
     * Get all open conversation panels.
     */
    static getOpenPanels(): ConversationWebviewPanel[] {
        return Array.from(this.panels.values());
    }

    /**
     * Handle messages from webview to extension.
     */
    private async handleMessage(message: any): Promise<void> {
        try {
            if (message.type === 'sendMessage') {
                await this.handleUserMessage(message.text);
            } else {
                logWarn(`Unknown message type from webview: ${message.type}`);
            }
        } catch (err) {
            logError(`Error handling message: ${err}`);
        }
    }

    /**
     * Process user message and get AI response with streaming.
     */
    private async handleUserMessage(userText: string): Promise<void> {
        if (!userText.trim()) {
            return;
        }

        if (this.isStreaming) {
            this.panel.webview.postMessage({
                type: 'error',
                text: 'AI is already responding. Please wait.',
            });
            return;
        }

        this.isStreaming = true;

        // Show user message immediately
        this.panel.webview.postMessage({
            type: 'userMessage',
            text: userText,
        });

        // Add streaming indicator
        this.panel.webview.postMessage({
            type: 'streamStart',
        });

        try {
            // Stream response from answer agent
            let fullResponse = '';
            await answerQuestion(
                userText,
                this.chatId,
                {
                    // onStream callback: post each chunk to webview
                    onStream: (chunk: string) => {
                        fullResponse += chunk;
                        this.panel.webview.postMessage({
                            type: 'streamChunk',
                            text: chunk,
                        });
                    },
                }
            );

            // Stream complete
            this.panel.webview.postMessage({
                type: 'streamEnd',
            });

            logInfo(`Conversation response completed (${fullResponse.length} chars)`);
        } catch (err) {
            this.isStreaming = false;
            logError(`Answer agent error: ${err}`);
            this.panel.webview.postMessage({
                type: 'error',
                text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            });
        }

        this.isStreaming = false;
    }

    private updateWebviewContent(messages: Message[]): void {
        const nonce = this.getNonce();
        // Filter out system messages - only show user and assistant messages
        const displayMessages = messages.filter(msg => msg.role !== 'system');
        const messagesHtml = displayMessages
            .map((msg) => this.renderMessage(msg as Omit<Message, 'system'> & { role: 'user' | 'assistant' }))
            .join('');

        this.panel.webview.html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Conversation</title>
                <style nonce="${nonce}">
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }

                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }

                    #messages {
                        flex: 1;
                        overflow-y: auto;
                        padding: 16px;
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }

                    .message {
                        display: flex;
                        gap: 8px;
                        animation: slideIn 0.3s ease-out;
                    }

                    @keyframes slideIn {
                        from {
                            opacity: 0;
                            transform: translateY(10px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }

                    .message.user {
                        justify-content: flex-end;
                    }

                    .message.assistant {
                        justify-content: flex-start;
                    }

                    .message-bubble {
                        max-width: 70%;
                        padding: 12px 16px;
                        border-radius: 8px;
                        word-wrap: break-word;
                        white-space: pre-wrap;
                        font-size: 13px;
                        line-height: 1.4;
                    }

                    .message.user .message-bubble {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }

                    .message.assistant .message-bubble {
                        background: var(--vscode-editor-lineHighlightBackground);
                        color: var(--vscode-editor-foreground);
                        border: 1px solid var(--vscode-editor-lineHighlightBorder, transparent);
                    }

                    #typing-indicator {
                        display: none;
                        padding: 12px 16px;
                        font-style: italic;
                        color: var(--vscode-descriptionForeground);
                    }

                    #typing-indicator.active {
                        display: block;
                    }

                    .typing-dots {
                        display: inline-block;
                    }

                    .typing-dots span {
                        animation: typingBounce 1.4s infinite;
                    }

                    .typing-dots span:nth-child(2) {
                        animation-delay: 0.2s;
                    }

                    .typing-dots span:nth-child(3) {
                        animation-delay: 0.4s;
                    }

                    @keyframes typingBounce {
                        0%, 60%, 100% {
                            opacity: 0.5;
                            transform: translateY(0);
                        }
                        30% {
                            opacity: 1;
                            transform: translateY(-10px);
                        }
                    }

                    #input-container {
                        padding: 12px;
                        border-top: 1px solid var(--vscode-editor-lineHighlightBorder);
                        display: flex;
                        gap: 8px;
                    }

                    #input-box {
                        flex: 1;
                        padding: 8px 12px;
                        border: 1px solid var(--vscode-inputOption-activeBorder);
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border-radius: 4px;
                        font-family: inherit;
                        font-size: 13px;
                        resize: none;
                        max-height: 100px;
                    }

                    #input-box:focus {
                        outline: none;
                        border-color: var(--vscode-focusBorder);
                    }

                    button {
                        padding: 8px 16px;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                        font-weight: 500;
                    }

                    button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }

                    button:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }

                    #error-message {
                        padding: 12px 16px;
                        background: var(--vscode-inputValidation-errorBackground);
                        color: var(--vscode-inputValidation-errorForeground);
                        border-left: 3px solid var(--vscode-inputValidation-errorBorder);
                        display: none;
                        margin: 0 12px;
                        border-radius: 4px;
                    }

                    #error-message.active {
                        display: block;
                    }
                </style>
            </head>
            <body>
                <div id="messages">
                    ${messagesHtml}
                </div>
                <div id="typing-indicator">
                    AI is thinking
                    <span class="typing-dots">
                        <span>.</span><span>.</span><span>.</span>
                    </span>
                </div>
                <div id="error-message"></div>
                <div id="input-container">
                    <textarea id="input-box" placeholder="Type your message..." rows="1"></textarea>
                    <button id="send-button">Send</button>
                </div>

                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                    const inputBox = document.getElementById('input-box');
                    const sendButton = document.getElementById('send-button');
                    const messagesDiv = document.getElementById('messages');
                    const typingIndicator = document.getElementById('typing-indicator');
                    const errorDiv = document.getElementById('error-message');

                    // Auto-expand textarea as user types
                    inputBox.addEventListener('input', () => {
                        inputBox.style.height = 'auto';
                        inputBox.style.height = (inputBox.scrollHeight) + 'px';
                    });

                    // Send on Enter (not Shift+Enter)
                    inputBox.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    });

                    sendButton.addEventListener('click', sendMessage);

                    function sendMessage() {
                        const text = inputBox.value.trim();
                        if (!text || sendButton.disabled) return;

                        sendButton.disabled = true;
                        inputBox.disabled = true;
                        inputBox.value = '';
                        inputBox.style.height = 'auto';

                        vscode.postMessage({
                            type: 'sendMessage',
                            text: text,
                        });
                    }

                    // Handle messages from extension
                    window.addEventListener('message', (event) => {
                        const message = event.data;

                        if (message.type === 'userMessage') {
                            addMessage('user', message.text);
                        } else if (message.type === 'streamStart') {
                            typingIndicator.classList.add('active');
                            errorDiv.classList.remove('active');
                        } else if (message.type === 'streamChunk') {
                            // Append to last assistant message or create new one
                            let lastMsg = messagesDiv.lastElementChild;
                            if (!lastMsg || lastMsg.classList.contains('user')) {
                                lastMsg = createMessageElement('assistant', '');
                                messagesDiv.appendChild(lastMsg);
                            }
                            const bubble = lastMsg.querySelector('.message-bubble');
                            bubble.textContent += message.text;
                            scrollToBottom();
                        } else if (message.type === 'streamEnd') {
                            typingIndicator.classList.remove('active');
                            sendButton.disabled = false;
                            inputBox.disabled = false;
                            inputBox.focus();
                            scrollToBottom();
                        } else if (message.type === 'error') {
                            typingIndicator.classList.remove('active');
                            errorDiv.textContent = message.text;
                            errorDiv.classList.add('active');
                            sendButton.disabled = false;
                            inputBox.disabled = false;
                            inputBox.focus();
                        }
                    });

                    function addMessage(role, text) {
                        const element = createMessageElement(role, text);
                        messagesDiv.appendChild(element);
                        scrollToBottom();
                    }

                    function createMessageElement(role, text) {
                        const div = document.createElement('div');
                        div.className = 'message ' + role;
                        
                        const bubble = document.createElement('div');
                        bubble.className = 'message-bubble';
                        bubble.textContent = text;
                        
                        div.appendChild(bubble);
                        return div;
                    }

                    function scrollToBottom() {
                        messagesDiv.scrollTop = messagesDiv.scrollHeight;
                    }

                    // Initial focus
                    inputBox.focus();
                </script>
            </body>
            </html>
        `;
    }

    /**
     * Render a single message as HTML.
     */
    private renderMessage(msg: Omit<Message, 'role'> & { role: 'user' | 'assistant' }): string {
        const safeContent = (msg.content || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        return `
            <div class="message ${msg.role}">
                <div class="message-bubble">${safeContent}</div>
            </div>
        `;
    }

    /**
     * Generate a nonce for inline scripts (security: prevents CSP violations).
     * 
     * **Simple explanation**: A random token that tells VS Code "this script is allowed
     * because it came from me (the extension)". Prevents malicious scripts from running
     * if they somehow got injected into the HTML.
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Clean up and dispose the webview panel.
     */
    private dispose(): void {
        ConversationWebviewPanel.panels.delete(this.chatId);
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        logInfo(`Disposed conversation webview: ${this.chatId}`);
    }
}

export { ConversationWebviewPanel };
