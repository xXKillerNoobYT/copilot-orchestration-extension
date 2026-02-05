// ./conversationWebview.Test.ts
import { ConversationWebviewPanel } from '../../src/ui/conversationWebview';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
  ...jest.requireActual('../../utils/logger'),
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

type Panel = { dispose: jest.Mock };

/** @aiContributed-2026-02-04 */
describe('ConversationWebviewPanel.disposeAll', () => {
  let mockDispose: jest.Mock;

  beforeEach(() => {
    mockDispose = jest.fn();
    (ConversationWebviewPanel as { panels: Map<string, Panel> }).panels = new Map([
      ['panel1', { dispose: mockDispose }],
      ['panel2', { dispose: mockDispose }],
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
    (ConversationWebviewPanel as { panels: Map<string, Panel> }).panels.clear();
  });

  /** @aiContributed-2026-02-04 */
    it('should dispose all panels and clear the panels map', () => {
    ConversationWebviewPanel.disposeAll();

    expect(mockDispose).toHaveBeenCalledTimes(2);
    expect((ConversationWebviewPanel as { panels: Map<string, Panel> }).panels.size).toBe(0);
    expect(Logger.debug).toHaveBeenCalledWith('Disposing all panels');
  });

  /** @aiContributed-2026-02-04 */
    it('should handle an empty panels map gracefully', () => {
    (ConversationWebviewPanel as { panels: Map<string, Panel> }).panels.clear();

    ConversationWebviewPanel.disposeAll();

    expect(mockDispose).not.toHaveBeenCalled();
    expect((ConversationWebviewPanel as { panels: Map<string, Panel> }).panels.size).toBe(0);
    expect(Logger.debug).toHaveBeenCalledWith('Disposing all panels');
  });

  /** @aiContributed-2026-02-04 */
    it('should handle errors thrown during panel disposal', () => {
    mockDispose.mockImplementationOnce(() => {
      throw new Error('Dispose error');
    });

    expect(() => ConversationWebviewPanel.disposeAll()).not.toThrow();
    expect(Logger.error).toHaveBeenCalledWith(expect.any(Error));
    expect((ConversationWebviewPanel as { panels: Map<string, Panel> }).panels.size).toBe(0);
  });

  /** @aiContributed-2026-02-04 */
    it('should ensure panels map is cleared even if an error occurs', () => {
    mockDispose.mockImplementationOnce(() => {
      throw new Error('Dispose error');
    });

    ConversationWebviewPanel.disposeAll();

    expect((ConversationWebviewPanel as { panels: Map<string, Panel> }).panels.size).toBe(0);
    expect(Logger.error).toHaveBeenCalledWith(expect.any(Error));
  });
});