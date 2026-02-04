// ./conversationWebview.Test.ts
import { Logger } from '../../utils/logger';
import * as vscode from 'vscode';
import { ConversationWebviewPanel } from '../../src/ui/conversationWebview';

jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  WebviewPanel: jest.fn(),
  ExtensionContext: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
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
    jest.spyOn(instance, 'getNonce').mockReturnValue('mockNonce');
    jest.spyOn(instance, 'renderMessage').mockImplementation((msg) => `<div>${msg.content}</div>`);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
  describe('updateWebviewContent', () => {
    /** @aiContributed-2026-02-03 */
    it('should update webview HTML with filtered messages', () => {
      const messages = [
        { role: 'system', content: 'System message' },
        { role: 'user', content: 'User message' },
        { role: 'assistant', content: 'Assistant message' },
      ];

      instance.updateWebviewContent(messages);

      expect(instance.getNonce).toHaveBeenCalled();
      expect(instance.renderMessage).toHaveBeenCalledTimes(2);
      expect(instance.renderMessage).toHaveBeenCalledWith({ role: 'user', content: 'User message' });
      expect(instance.renderMessage).toHaveBeenCalledWith({ role: 'assistant', content: 'Assistant message' });
      expect(mockPanel.webview.html).toContain('<div>User message</div>');
      expect(mockPanel.webview.html).toContain('<div>Assistant message</div>');
      expect(mockPanel.webview.html).not.toContain('System message');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle empty messages array', () => {
      instance.updateWebviewContent([]);

      expect(instance.getNonce).toHaveBeenCalled();
      expect(instance.renderMessage).not.toHaveBeenCalled();
      expect(mockPanel.webview.html).toContain('<div id="messages"></div>');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle null or undefined messages', () => {
      instance.updateWebviewContent(null);

      expect(instance.getNonce).toHaveBeenCalled();
      expect(instance.renderMessage).not.toHaveBeenCalled();
      expect(mockPanel.webview.html).toContain('<div id="messages"></div>');

      instance.updateWebviewContent(undefined);

      expect(instance.getNonce).toHaveBeenCalled();
      expect(instance.renderMessage).not.toHaveBeenCalled();
      expect(mockPanel.webview.html).toContain('<div id="messages"></div>');
    });

    /** @aiContributed-2026-02-03 */
    it('should log errors if renderMessage throws', () => {
      jest.spyOn(instance, 'renderMessage').mockImplementation(() => {
        throw new Error('Render error');
      });
      const messages = [{ role: 'user', content: 'User message' }];

      expect(() => instance.updateWebviewContent(messages)).not.toThrow();
      expect(Logger.error).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});