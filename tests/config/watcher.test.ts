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
});
