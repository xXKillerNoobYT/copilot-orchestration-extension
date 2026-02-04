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

/** @aiContributed-2026-02-03 */
describe('ConversationWebviewPanel', () => {
  /** @aiContributed-2026-02-03 */
  describe('disposeAll', () => {
    let mockDispose: jest.Mock;

    beforeEach(() => {
      mockDispose = jest.fn();
      (ConversationWebviewPanel as unknown as { panels: Map<string, { dispose: jest.Mock }> }).panels = new Map([
        ['panel1', { dispose: mockDispose }],
        ['panel2', { dispose: mockDispose }],
      ]);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should dispose all panels and clear the panels map', () => {
      ConversationWebviewPanel.disposeAll();

      expect(mockDispose).toHaveBeenCalledTimes(2);
      expect((ConversationWebviewPanel as unknown as { panels: Map<string, { dispose: jest.Mock }> }).panels.size).toBe(0);
      expect(Logger.debug).toHaveBeenCalledWith('Disposing all panels');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle empty panels map gracefully', () => {
      (ConversationWebviewPanel as unknown as { panels: Map<string, { dispose: jest.Mock }> }).panels.clear();

      ConversationWebviewPanel.disposeAll();

      expect(mockDispose).not.toHaveBeenCalled();
      expect((ConversationWebviewPanel as unknown as { panels: Map<string, { dispose: jest.Mock }> }).panels.size).toBe(0);
      expect(Logger.debug).toHaveBeenCalledWith('Disposing all panels');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle errors during panel disposal', () => {
      mockDispose.mockImplementationOnce(() => {
        throw new Error('Dispose error');
      });

      expect(() => ConversationWebviewPanel.disposeAll()).not.toThrow();
      expect(mockDispose).toHaveBeenCalledTimes(2);
      expect(Logger.error).toHaveBeenCalledWith(expect.any(Error));
      expect((ConversationWebviewPanel as unknown as { panels: Map<string, { dispose: jest.Mock }> }).panels.size).toBe(0);
    });
  });
});