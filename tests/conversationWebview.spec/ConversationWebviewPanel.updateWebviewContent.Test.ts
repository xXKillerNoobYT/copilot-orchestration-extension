// ./conversationWebview.Test.ts
import * as vscode from 'vscode';
import { ConversationWebviewPanel } from '../../src/ui/conversationWebview';

jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  WebviewPanel: jest.fn(),
  Disposable: jest.fn(),
  ExtensionContext: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('ConversationWebviewPanel', () => {
  let mockPanel: vscode.WebviewPanel;
  let mockContext: vscode.ExtensionContext;
  let instance: ConversationWebviewPanel;

  beforeEach(() => {
    mockPanel = {
      webview: {
        html: '',
      },
    } as unknown as vscode.WebviewPanel;

    mockContext = {} as vscode.ExtensionContext;

    instance = new ConversationWebviewPanel(mockPanel, 'testChatId', mockContext, []);
    jest.spyOn(instance as unknown as { getNonce: () => string }, 'getNonce').mockReturnValue('mockNonce');
    jest.spyOn(instance as unknown as { renderMessage: (msg: { role: string; content: string }) => string }, 'renderMessage').mockImplementation((msg) => `<div>${msg.content}</div>`);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
  describe('updateWebviewContent', () => {
    /** @aiContributed-2026-02-04 */
    it('should update the webview HTML with filtered and rendered messages', () => {
      const messages = [
        { role: 'system', content: 'System message' },
        { role: 'user', content: 'User message' },
        { role: 'assistant', content: 'Assistant message' },
      ];

      (instance as unknown as { updateWebviewContent: (msgs: { role: string; content: string }[]) => void }).updateWebviewContent(messages);

      expect((instance as unknown as { getNonce: () => string }).getNonce).toHaveBeenCalled();
      expect((instance as unknown as { renderMessage: (msg: { role: string; content: string }) => string }).renderMessage).toHaveBeenCalledTimes(2);
      expect((instance as unknown as { renderMessage: (msg: { role: string; content: string }) => string }).renderMessage).toHaveBeenCalledWith({ role: 'user', content: 'User message' });
      expect((instance as unknown as { renderMessage: (msg: { role: string; content: string }) => string }).renderMessage).toHaveBeenCalledWith({ role: 'assistant', content: 'Assistant message' });
      expect(mockPanel.webview.html).toContain('<div>User message</div>');
      expect(mockPanel.webview.html).toContain('<div>Assistant message</div>');
      expect(mockPanel.webview.html).not.toContain('System message');
    });

    /** @aiContributed-2026-02-04 */
    it('should handle empty messages array', () => {
      (instance as unknown as { updateWebviewContent: (msgs: { role: string; content: string }[]) => void }).updateWebviewContent([]);

      expect((instance as unknown as { getNonce: () => string }).getNonce).toHaveBeenCalled();
      expect((instance as unknown as { renderMessage: (msg: { role: string; content: string }) => string }).renderMessage).not.toHaveBeenCalled();
      expect(mockPanel.webview.html).toContain('<div id="messages"></div>');
    });

    /** @aiContributed-2026-02-04 */
    it('should handle null or undefined messages gracefully', () => {
      (instance as unknown as { updateWebviewContent: (msgs: { role: string; content: string }[] | null | undefined) => void }).updateWebviewContent(null);
      (instance as unknown as { updateWebviewContent: (msgs: { role: string; content: string }[] | null | undefined) => void }).updateWebviewContent(undefined);

      expect((instance as unknown as { getNonce: () => string }).getNonce).toHaveBeenCalledTimes(2);
      expect((instance as unknown as { renderMessage: (msg: { role: string; content: string }) => string }).renderMessage).not.toHaveBeenCalled();
      expect(mockPanel.webview.html).toContain('<div id="messages"></div>');
    });

    /** @aiContributed-2026-02-04 */
    it('should include typing indicator and input container in the HTML', () => {
      const messages = [
        { role: 'user', content: 'User message' },
        { role: 'assistant', content: 'Assistant message' },
      ];

      (instance as unknown as { updateWebviewContent: (msgs: { role: string; content: string }[]) => void }).updateWebviewContent(messages);

      expect(mockPanel.webview.html).toContain('<div id="typing-indicator">');
      expect(mockPanel.webview.html).toContain('<div id="input-container">');
    });

    /** @aiContributed-2026-02-04 */
    it('should generate consistent nonce for the style tag', () => {
      const messages = [{ role: 'user', content: 'User message' }];

      (instance as unknown as { updateWebviewContent: (msgs: { role: string; content: string }[]) => void }).updateWebviewContent(messages);

      expect(mockPanel.webview.html).toContain('<style nonce="mockNonce">');
    });
  });
});