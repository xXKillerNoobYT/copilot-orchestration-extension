// ./logger.Test.ts
import * as vscode from 'vscode';
import { logInfo } from '../../src/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    window: {
        createOutputChannel: jest.fn(),
    },
}));

/** @aiContributed-2026-02-03 */
describe('logInfo', () => {
    let mockOutputChannel: { appendLine: jest.Mock };

    beforeEach(() => {
        mockOutputChannel = { appendLine: jest.fn() };
        (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should log an info message to the output channel and console', () => {
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        const mockDate = new Date('2023-01-01T00:00:00.000Z');
        jest.useFakeTimers().setSystemTime(mockDate);

        logInfo('Test message');

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
            '[INFO] 2023-01-01T00:00:00.000Z Test message'
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
            '[INFO] 2023-01-01T00:00:00.000Z Test message'
        );

        consoleLogSpy.mockRestore();
        jest.useRealTimers();
    });

    /** @aiContributed-2026-02-03 */
    it('should not throw an error if the message is empty', () => {
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        const mockDate = new Date('2023-01-01T00:00:00.000Z');
        jest.useFakeTimers().setSystemTime(mockDate);

        expect(() => logInfo('')).not.toThrow();

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
            '[INFO] 2023-01-01T00:00:00.000Z '
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
            '[INFO] 2023-01-01T00:00:00.000Z '
        );

        consoleLogSpy.mockRestore();
        jest.useRealTimers();
    });

    /** @aiContributed-2026-02-03 */
    it('should handle undefined message gracefully', () => {
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        const mockDate = new Date('2023-01-01T00:00:00.000Z');
        jest.useFakeTimers().setSystemTime(mockDate);

        expect(() => logInfo(undefined as unknown as string)).not.toThrow();

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
            '[INFO] 2023-01-01T00:00:00.000Z undefined'
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
            '[INFO] 2023-01-01T00:00:00.000Z undefined'
        );

        consoleLogSpy.mockRestore();
        jest.useRealTimers();
    });

    /** @aiContributed-2026-02-03 */
    it('should handle special characters in the message', () => {
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        const mockDate = new Date('2023-01-01T00:00:00.000Z');
        jest.useFakeTimers().setSystemTime(mockDate);

        logInfo('Special chars: !@#$%^&*()_+');

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
            '[INFO] 2023-01-01T00:00:00.000Z Special chars: !@#$%^&*()_+'
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
            '[INFO] 2023-01-01T00:00:00.000Z Special chars: !@#$%^&*()_+'
        );

        consoleLogSpy.mockRestore();
        jest.useRealTimers();
    });

    /** @aiContributed-2026-02-03 */
    it('should handle long messages without truncation', () => {
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        const mockDate = new Date('2023-01-01T00:00:00.000Z');
        jest.useFakeTimers().setSystemTime(mockDate);

        const longMessage = 'a'.repeat(1000);
        logInfo(longMessage);

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
            `[INFO] 2023-01-01T00:00:00.000Z ${longMessage}`
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
            `[INFO] 2023-01-01T00:00:00.000Z ${longMessage}`
        );

        consoleLogSpy.mockRestore();
        jest.useRealTimers();
    });
});