// ./logger.Test.ts
import * as vscode from 'vscode';
import { logInfo } from '../../src/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    window: {
    createOutputChannel: jest.fn(),
  },
}));

/** @aiContributed-2026-02-02 */
describe('logInfo', () => {
  let mockOutputChannel: { appendLine: jest.Mock };

  beforeEach(() => {
    mockOutputChannel = { appendLine: jest.fn() };
    (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-02 */
    it('should log an info message to the output channel and console', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    logInfo('Test message');

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringMatching(/^\[INFO\] .* Test message$/)
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[INFO\] .* Test message$/));

    consoleLogSpy.mockRestore();
  });

  /** @aiContributed-2026-02-02 */
    it('should not throw an error if the message is empty', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => logInfo('')).not.toThrow();

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringMatching(/^\[INFO\] .* $/)
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[INFO\] .* $/));

    consoleLogSpy.mockRestore();
  });

  /** @aiContributed-2026-02-02 */
    it('should handle undefined message gracefully', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => logInfo(undefined as unknown as string)).not.toThrow();

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringMatching(/^\[INFO\] .* undefined$/)
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[INFO\] .* undefined$/));

    consoleLogSpy.mockRestore();
  });
});