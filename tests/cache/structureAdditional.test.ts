import * as fs from 'fs';
import { ExtensionContext } from '../__mocks__/vscode';
import { cleanupTempFiles, initializeCacheStructure, isCacheStructureValid } from '../../src/services/cache/structure';

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('fs', () => ({
    existsSync: jest.fn(),
    accessSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn(),
    unlinkSync: jest.fn(),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    constants: { W_OK: 2 },
}));

describe('Cache Structure Additional Coverage', () => {
    const fsMock = fs as jest.Mocked<typeof fs>;
    const readdirMock = fs.readdirSync as unknown as jest.Mock;
    let context: ExtensionContext;

    beforeEach(() => {
        jest.clearAllMocks();
        context = new ExtensionContext('/mock/extension/path');
    });

    it('Test 1: should return false when cache directories are not writable', () => {
        fsMock.existsSync.mockReturnValue(true);
        fsMock.accessSync.mockImplementation(() => {
            throw new Error('no access');
        });

        const result = isCacheStructureValid(context);

        expect(result).toBe(false);
    });

    it('Test 2: should clean up stale temp files', async () => {
        fsMock.existsSync.mockReturnValue(true);
        readdirMock.mockReturnValue(['old.tmp', 'new.tmp']);
        fsMock.statSync.mockImplementation((filePath: fs.PathLike) => {
            const isOld = String(filePath).includes('old.tmp');
            return { mtimeMs: Date.now() - (isOld ? 100000 : 100) } as fs.Stats;
        });

        const cleaned = await cleanupTempFiles(context, 1000);

        expect(cleaned).toBe(1);
        expect(fsMock.unlinkSync).toHaveBeenCalled();
    });

    it('Test 3: should handle cleanup errors gracefully', async () => {
        fsMock.existsSync.mockReturnValue(true);
        readdirMock.mockImplementation(() => {
            throw new Error('read failed');
        });

        const cleaned = await cleanupTempFiles(context, 1000);

        expect(cleaned).toBe(0);
    });

    it('Test 4: should report initialization errors', async () => {
        fsMock.existsSync.mockReturnValue(false);
        fsMock.mkdirSync.mockImplementation(() => {
            throw new Error('mkdir failed');
        });
        fsMock.writeFileSync.mockImplementation(() => {
            throw new Error('write failed');
        });

        const result = await initializeCacheStructure(context);

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });
});
