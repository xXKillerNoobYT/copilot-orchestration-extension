// ./logger.Test.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { initializeLogger } from '../../src/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    window: {
        createOutputChannel: jest.fn(),
    },
}));

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
}));

jest.mock('path', () => ({
    ...jest.requireActual('path'),
    join: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('initializeLogger', () => {
    let mockContext: vscode.ExtensionContext;
    let mockOutputChannel: vscode.OutputChannel;

    beforeEach(() => {
        mockOutputChannel = {
            appendLine: jest.fn(),
        } as unknown as vscode.OutputChannel;

        (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);

        mockContext = {
            extensionPath: '/mock/extension/path',
        } as vscode.ExtensionContext;

        (path.join as jest.Mock).mockImplementation((...args: string[]) => args.join('/'));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should initialize the logger with default log level when config file does not exist', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        initializeLogger(mockContext);

        expect(fs.existsSync).toHaveBeenCalledWith('/mock/extension/path/.coe/config.json');
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[INFO] Logger initialized – level: info');
    });

    /** @aiContributed-2026-02-03 */
    it('should initialize the logger with log level from config file', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ debug: { logLevel: 'warn' } }));

        initializeLogger(mockContext);

        expect(fs.readFileSync).toHaveBeenCalledWith('/mock/extension/path/.coe/config.json', 'utf-8');
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[INFO] Logger initialized – level: warn');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle invalid log level in config file gracefully', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ debug: { logLevel: 'invalid' } }));

        initializeLogger(mockContext);

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[INFO] Logger initialized – level: info');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle errors while reading the config file gracefully', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
            throw new Error('File read error');
        });

        initializeLogger(mockContext);

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[INFO] Logger initialized – level: info');
    });

    /** @aiContributed-2026-02-03 */
    it('should create the output channel only once', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        initializeLogger(mockContext);
        initializeLogger(mockContext);

        expect(vscode.window.createOutputChannel).toHaveBeenCalledTimes(1);
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[INFO] Logger initialized – level: info');
    });

    /** @aiContributed-2026-02-03 */
    it('should log the initialization message with the correct timestamp', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        const mockDate = new Date('2023-01-01T00:00:00.000Z');
        jest.useFakeTimers().setSystemTime(mockDate);

        initializeLogger(mockContext);

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[INFO] Logger initialized – level: info');

        jest.useRealTimers();
    });
});