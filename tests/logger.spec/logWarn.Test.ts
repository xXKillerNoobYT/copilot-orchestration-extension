// ./logger.Test.ts
import * as vscode from 'vscode';
import { logWarn } from '../../src/logger';

jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
    })),
  },
}));

/** @aiContributed-2026-02-02 */
describe('logWarn', () => {
  let mockOutputChannel: vscode.OutputChannel;

  beforeEach(() => {
    mockOutputChannel = vscode.window.createOutputChannel('COE Logs');
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-02 */
  it('should log a warning message to the output channel and console', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const message = 'This is a warning message';

    logWarn(message);

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[WARN]')
    );
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining(message)
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[WARN]')
    );
    consoleWarnSpy.mockRestore();
  });

  /** @aiContributed-2026-02-02 */
  it('should not log if logLevel is set to "error"', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const message = 'This is a warning message';

    // Simulate logLevel being "error"
    const globalWithLogLevel = global as typeof global & { logLevel: string };
    globalWithLogLevel.logLevel = 'error';

    logWarn(message);

    expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  /** @aiContributed-2026-02-02 */
  it('should handle undefined message gracefully', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    logWarn(undefined as unknown as string);

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[WARN]')
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[WARN]')
    );
    consoleWarnSpy.mockRestore();
  });
});