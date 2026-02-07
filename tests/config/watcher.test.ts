import * as fs from 'fs';
import { ExtensionContext } from '../__mocks__/vscode';
import {
    getWatcherInstance,
    isWatcherActive,
    resetWatcherForTests,
    startConfigWatcher,
    stopConfigWatcher,
} from '../../src/config/watcher';
import { loadConfigFromFile } from '../../src/config/loader';
import * as logger from '../../src/logger';

jest.mock('fs', () => ({
    watch: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('../../src/config/loader', () => ({
    loadConfigFromFile: jest.fn().mockResolvedValue({ source: 'mock' }),
}));

describe('Config Watcher', () => {
    const fsMock = fs as jest.Mocked<typeof fs>;
    const watchMock = fs.watch as unknown as jest.Mock;
    const loadConfigMock = loadConfigFromFile as jest.MockedFunction<typeof loadConfigFromFile>;
    let context: ExtensionContext;
    let changeHandler: ((eventType: string, filename?: string) => void) | null;
    let errorHandler: ((error: Error) => void) | null;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        resetWatcherForTests();
        context = new ExtensionContext('/mock/extension/path');
        changeHandler = null;
        errorHandler = null;

        watchMock.mockImplementation((...args: any[]) => {
            const callback = args.length > 2 ? args[2] : args[1];
            changeHandler = callback as (eventType: string, filename?: string) => void;
            return {
                on: jest.fn((event: string, handler: (error: Error) => void) => {
                    if (event === 'error') {
                        errorHandler = handler;
                    }
                }),
                close: jest.fn(),
            } as unknown as fs.FSWatcher;
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        resetWatcherForTests();
    });

    it('Test 1: should start watcher and mark active', () => {
        const watcher = startConfigWatcher(context, jest.fn(), 10);

        expect(watcher.isActive).toBe(true);
        expect(isWatcherActive()).toBe(true);
        expect(getWatcherInstance()).not.toBeNull();
    });

    it('Test 2: should reload config after debounce', async () => {
        const onChange = jest.fn();
        startConfigWatcher(context, onChange, 10);

        expect(changeHandler).not.toBeNull();
        changeHandler?.('change', 'config.json');

        jest.advanceTimersByTime(10);
        await Promise.resolve();
        await Promise.resolve();

        expect(loadConfigMock).toHaveBeenCalled();
        expect(onChange).toHaveBeenCalledWith({ source: 'mock' });
    });

    it('Test 3: should stop watcher successfully', () => {
        startConfigWatcher(context, jest.fn(), 10);

        const stopped = stopConfigWatcher();

        expect(stopped).toBe(true);
        expect(isWatcherActive()).toBe(false);
    });

    it('Test 4: should stop watcher on ENOENT error', () => {
        startConfigWatcher(context, jest.fn(), 10);

        expect(errorHandler).not.toBeNull();
        errorHandler?.(new Error('ENOENT: missing config'));

        expect(isWatcherActive()).toBe(false);
    });

    it('Test 5: should reset watcher for tests', () => {
        startConfigWatcher(context, jest.fn(), 10);

        resetWatcherForTests();

        expect(getWatcherInstance()).toBeNull();
    });

    it('Test 6: should handle EPERM error', () => {
        startConfigWatcher(context, jest.fn(), 10);

        expect(errorHandler).not.toBeNull();
        errorHandler?.(new Error('EPERM: operation not permitted'));

        expect(isWatcherActive()).toBe(false);
        expect(logger.logWarn).toHaveBeenCalledWith(
            expect.stringContaining('Permission denied')
        );
    });

    it('Test 7: should handle unknown error', () => {
        startConfigWatcher(context, jest.fn(), 10);

        expect(errorHandler).not.toBeNull();
        errorHandler?.(new Error('Unknown error occurred'));

        expect(isWatcherActive()).toBe(false);
        expect(logger.logError).toHaveBeenCalledWith(
            expect.stringContaining('Config watcher error')
        );
    });

    it('Test 8: should return false when stopping non-existent watcher', () => {
        resetWatcherForTests();

        const result = stopConfigWatcher();

        expect(result).toBe(false);
    });

    it('Test 9: should clear debounce timer when stopping', () => {
        const onChange = jest.fn();
        startConfigWatcher(context, onChange, 100);

        // Trigger change to start debounce
        changeHandler?.('change', 'config.json');

        // Stop before debounce completes
        const stopped = stopConfigWatcher();

        expect(stopped).toBe(true);
        
        // Advance timers - onChange should NOT be called
        jest.advanceTimersByTime(200);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('Test 10: should handle config reload error', async () => {
        loadConfigMock.mockRejectedValueOnce(new Error('Reload failed'));
        const onChange = jest.fn();
        startConfigWatcher(context, onChange, 10);

        changeHandler?.('change', 'config.json');

        jest.advanceTimersByTime(10);
        await Promise.resolve();
        await Promise.resolve();

        expect(logger.logError).toHaveBeenCalledWith(
            expect.stringContaining('Failed to reload config')
        );
    });

    it('Test 11: should ignore non-change events', async () => {
        const onChange = jest.fn();
        startConfigWatcher(context, onChange, 10);

        changeHandler?.('rename', 'config.json');

        jest.advanceTimersByTime(20);
        await Promise.resolve();

        expect(onChange).not.toHaveBeenCalled();
    });

    it('Test 12: should stop existing watcher before starting new one', () => {
        const onChange1 = jest.fn();
        const onChange2 = jest.fn();

        startConfigWatcher(context, onChange1, 10);
        startConfigWatcher(context, onChange2, 10);

        // Only the second watcher should be active
        changeHandler?.('change', 'config.json');
        jest.advanceTimersByTime(10);

        // Second watcher gets the events
        expect(getWatcherInstance()?.onChange).toBe(onChange2);
    });

    it('Test 13: should handle watch creation error', () => {
        watchMock.mockImplementationOnce(() => {
            throw new Error('ENOENT: no such file');
        });

        const watcher = startConfigWatcher(context, jest.fn(), 10);

        expect(watcher.isActive).toBe(false);
        expect(logger.logWarn).toHaveBeenCalledWith(
            expect.stringContaining('Config file does not exist')
        );
    });

    it('Test 14: should handle watch creation with non-ENOENT error', () => {
        watchMock.mockImplementationOnce(() => {
            throw new Error('Some other error');
        });

        const watcher = startConfigWatcher(context, jest.fn(), 10);

        expect(watcher.isActive).toBe(false);
        expect(logger.logError).toHaveBeenCalledWith(
            expect.stringContaining('Failed to start config watcher')
        );
    });

    it('Test 15: should debounce multiple rapid changes', async () => {
        const onChange = jest.fn();
        startConfigWatcher(context, onChange, 50);

        // Simulate multiple rapid changes
        changeHandler?.('change', 'config.json');
        jest.advanceTimersByTime(20);
        changeHandler?.('change', 'config.json');
        jest.advanceTimersByTime(20);
        changeHandler?.('change', 'config.json');

        // Only 50ms of debounce have passed since last change
        jest.advanceTimersByTime(50);
        await Promise.resolve();
        await Promise.resolve();

        // Should only reload once
        expect(loadConfigMock).toHaveBeenCalledTimes(1);
    });

    it('Test 16: should handle change without filename', async () => {
        const onChange = jest.fn();
        startConfigWatcher(context, onChange, 10);

        // Trigger change with undefined filename
        changeHandler?.('change', undefined);

        jest.advanceTimersByTime(10);
        await Promise.resolve();
        await Promise.resolve();

        expect(loadConfigMock).toHaveBeenCalled();
        expect(logger.logInfo).toHaveBeenCalledWith(
            expect.stringContaining('Config file changed')
        );
    });

    it('Test 17: should handle close() throwing error', () => {
        const closeError = new Error('Close failed');
        watchMock.mockImplementationOnce((...args: any[]) => {
            const callback = args.length > 2 ? args[2] : args[1];
            changeHandler = callback as (eventType: string, filename?: string) => void;
            return {
                on: jest.fn((event: string, handler: (error: Error) => void) => {
                    if (event === 'error') {
                        errorHandler = handler;
                    }
                }),
                close: jest.fn(() => {
                    throw closeError;
                }),
            } as unknown as fs.FSWatcher;
        });

        startConfigWatcher(context, jest.fn(), 10);

        const result = stopConfigWatcher();

        expect(result).toBe(false);
        expect(logger.logError).toHaveBeenCalledWith(
            expect.stringContaining('Error stopping config watcher')
        );
    });
});
