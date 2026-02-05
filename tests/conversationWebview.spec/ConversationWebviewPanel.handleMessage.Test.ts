// ./conversationWebview.Test.ts
import { ConversationWebviewPanel } from '../../src/ui/conversationWebview';
import { logWarn, logError } from '../../src/logger';

jest.mock('../../src/logger', () => ({
  ...jest.requireActual('../../src/logger'),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('ConversationWebviewPanel.handleMessage', () => {
  let instance: ConversationWebviewPanel;

  beforeEach(() => {
    instance = new ConversationWebviewPanel(
      {} as Record<string, unknown>, 
      'testChatId', 
      {} as Record<string, unknown>, 
      []
    );
    instance.handleUserMessage = jest.fn();
  });

  /** @aiContributed-2026-02-04 */
  it('should call handleUserMessage for "sendMessage" type', async () => {
    const message: { type: string; text?: string } = { type: 'sendMessage', text: 'Hello' };

    await instance.handleMessage(message);

    expect(instance.handleUserMessage).toHaveBeenCalledWith('Hello');
    expect(logWarn).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should log a warning for unknown message type', async () => {
    const message: { type: string } = { type: 'unknownType' };

    await instance.handleMessage(message);

    expect(instance.handleUserMessage).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith('Unknown message type from webview: unknownType');
    expect(logError).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should log an error if handleUserMessage throws', async () => {
    const message: { type: string; text?: string } = { type: 'sendMessage', text: 'Hello' };
    const error = new Error('Test error');
    (instance.handleUserMessage as jest.Mock).mockRejectedValueOnce(error);

    await instance.handleMessage(message);

    expect(instance.handleUserMessage).toHaveBeenCalledWith('Hello');
    expect(logWarn).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(`Error handling message: ${error}`);
  });

  /** @aiContributed-2026-02-04 */
  it('should handle null message gracefully', async () => {
    await instance.handleMessage(null as unknown as { type: string });

    expect(instance.handleUserMessage).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith('Unknown message type from webview: undefined');
    expect(logError).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should handle undefined message gracefully', async () => {
    await instance.handleMessage(undefined as unknown as { type: string });

    expect(instance.handleUserMessage).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith('Unknown message type from webview: undefined');
    expect(logError).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should log an error if an unexpected error occurs', async () => {
    const message: { type: string; text?: string } = { type: 'sendMessage', text: 'Hello' };
    const error = new Error('Unexpected error');
    jest.spyOn(instance, 'handleUserMessage').mockImplementationOnce(() => {
      throw error;
    });

    await instance.handleMessage(message);

    expect(instance.handleUserMessage).toHaveBeenCalledWith('Hello');
    expect(logWarn).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(`Error handling message: ${error}`);
  });
});