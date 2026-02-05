// ./logger.Test.ts
import * as vscode from 'vscode';
import { logError } from '../../src/logger';

jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  window: {
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
    })),
  },
}));

/** @aiContributed-2026-02-04 */
describe('logError', () => {
  let mockOutputChannel: vscode.OutputChannel;

  beforeEach(() => {
    mockOutputChannel = vscode.window.createOutputChannel('COE Logs');
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
    it('should log an error message to the output channel and console', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const message = 'Test error message';

    logError(message);

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]')
    );
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining(message)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(message)
    );

    consoleErrorSpy.mockRestore();
  });

  /** @aiContributed-2026-02-04 */
    it('should log an Error object message to the output channel and console', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const error = new Error('Test Error object');

    logError(error);

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]')
    );
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining(error.message)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(error.message)
    );

    consoleErrorSpy.mockRestore();
  });

  /** @aiContributed-2026-02-04 */
    it('should handle undefined message gracefully', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    logError(undefined);

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]')
    );
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('undefined')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('undefined')
    );

    consoleErrorSpy.mockRestore();
  });

  /** @aiContributed-2026-02-04 */
    it('should handle null message gracefully', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    logError(null);

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]')
    );
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('null')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('null')
    );

    consoleErrorSpy.mockRestore();
  });

  /** @aiContributed-2026-02-04 */
    it('should handle an empty string message gracefully', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const message = '';

    logError(message);

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]')
    );
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining(message)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(message)
    );

    consoleErrorSpy.mockRestore();
  });

  /** @aiContributed-2026-02-04 */
    it('should handle an Error object with no message gracefully', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const error = new Error();

    logError(error);

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]')
    );
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('')
    );

    consoleErrorSpy.mockRestore();
  });

  /** @aiContributed-2026-02-04 */
    it('should handle an Error object with a stack trace', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const error = new Error('Test Error with stack');
    error.stack = 'Error: Test Error with stack\n    at someFunction (file.js:10:5)';

    logError(error);

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]')
    );
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining(error.message)
    );
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining(error.stack)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(error.message)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(error.stack)
    );

    consoleErrorSpy.mockRestore();
  });
});