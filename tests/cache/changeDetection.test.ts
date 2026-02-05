import * as fs from 'fs';
import * as path from 'path';
import * as changeDetection from '../../src/services/cache/changeDetection';
import { ExtensionContext } from '../__mocks__/vscode';
import { deletePayload } from '../../src/services/cache/storage';
import { removeFromIndex } from '../../src/services/cache/index';
import { logWarn } from '../../src/logger';

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
}));

jest.mock('crypto', () => ({
    createHash: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('hash'),
    })),
}));

jest.mock('../../src/services/cache/index', () => ({
    loadCacheIndex: jest.fn(),
    removeFromIndex: jest.fn(),
}));

jest.mock('../../src/services/cache/storage', () => ({
    deletePayload: jest.fn(),
}));

describe('Cache Change Detection', () => {
    const fsMock = fs as jest.Mocked<typeof fs>;
    const deletePayloadMock = deletePayload as jest.MockedFunction<typeof deletePayload>;
    const removeFromIndexMock = removeFromIndex as jest.MockedFunction<typeof removeFromIndex>;
    let context: ExtensionContext;

    beforeEach(() => {
        jest.clearAllMocks();
        context = new ExtensionContext('/mock/extension/path');
    });

    it('Test 1: should return null when hashing fails', () => {
        fsMock.readFileSync.mockImplementation(() => {
            throw new Error('read failed');
        });

        const result = changeDetection.computeFileHash('/missing.txt');

        expect(result).toBeNull();
        expect(logWarn).toHaveBeenCalledWith(
            expect.stringContaining('Failed to compute hash')
        );
    });

    it('Test 2: should create new registry when missing', () => {
        fsMock.existsSync.mockReturnValue(false);
        fsMock.writeFileSync.mockImplementation(() => undefined);

        const registry = changeDetection.loadHashRegistry(context);

        expect(registry.files).toEqual([]);
        expect(fsMock.writeFileSync).toHaveBeenCalled();
    });

    it('Test 3: should register file hashes', () => {
        const registryPath = path.join(context.extensionPath, '.coe', 'hash-registry.json');
        fsMock.existsSync.mockImplementation((target) => target === registryPath);
        fsMock.readFileSync.mockReturnValue(
            JSON.stringify({
                version: '1.0.0',
                updatedAt: new Date().toISOString(),
                files: [],
            })
        );
        fsMock.writeFileSync.mockImplementation(() => undefined);

        const result = changeDetection.registerFileHash(context, '/file.txt', ['hash-1']);

        expect(result).toBe(true);
        expect(fsMock.writeFileSync).toHaveBeenCalled();
    });

    it('Test 4: should invalidate cache when files change', async () => {
        const registryPath = path.join(context.extensionPath, '.coe', 'hash-registry.json');
        fsMock.existsSync.mockImplementation((target) => {
            if (target === registryPath) {
                return true;
            }
            if (String(target).includes('missing.txt')) {
                return false;
            }
            return true;
        });

        fsMock.readFileSync.mockReturnValue(
            JSON.stringify({
                version: '1.0.0',
                updatedAt: new Date().toISOString(),
                files: [
                    {
                        filePath: 'missing.txt',
                        hash: 'old',
                        computedAt: new Date().toISOString(),
                        relatedCacheHashes: ['cache-a'],
                    },
                    {
                        filePath: 'changed.txt',
                        hash: 'old-hash',
                        computedAt: new Date().toISOString(),
                        relatedCacheHashes: ['cache-b'],
                    },
                ],
            })
        );

        jest.spyOn(changeDetection, 'computeFileHash').mockImplementation((filePath) => {
            if (String(filePath).includes('changed.txt')) {
                return 'new-hash';
            }
            return 'old-hash';
        });

        deletePayloadMock.mockResolvedValue(true);

        const result = await changeDetection.detectAndInvalidateChanges(context);

        expect(result.filesChanged).toBe(2);
        expect(result.cacheEntriesInvalidated).toBe(2);
        expect(deletePayloadMock).toHaveBeenCalledWith(context, 'cache-a');
        expect(removeFromIndexMock).toHaveBeenCalledWith(context, 'cache-b');
    });

    it('Test 5: should schedule change detection', () => {
        jest.useFakeTimers();
        const setIntervalSpy = jest.spyOn(global, 'setInterval');

        const timer = changeDetection.scheduleChangeDetection(context, 1000);

        jest.advanceTimersByTime(1000);

        expect(setIntervalSpy).toHaveBeenCalled();
        clearInterval(timer);
        setIntervalSpy.mockRestore();
        jest.useRealTimers();
    });

    it('Test 6: should return tracked files from registry', () => {
        const registryPath = path.join(context.extensionPath, '.coe', 'hash-registry.json');
        fsMock.existsSync.mockImplementation((target) => target === registryPath);
        fsMock.readFileSync.mockReturnValue(
            JSON.stringify({
                version: '1.0.0',
                updatedAt: new Date().toISOString(),
                files: [
                    {
                        filePath: 'tracked.txt',
                        hash: 'hash',
                        computedAt: new Date().toISOString(),
                        relatedCacheHashes: ['cache-1'],
                    },
                ],
            })
        );

        const tracked = changeDetection.getTrackedFiles(context);

        expect(tracked).toHaveLength(1);
        expect(tracked[0].filePath).toBe('tracked.txt');
    });

    it('Test 7: should untrack files and save registry', () => {
        const registryPath = path.join(context.extensionPath, '.coe', 'hash-registry.json');
        fsMock.existsSync.mockImplementation((target) => target === registryPath);
        fsMock.readFileSync.mockReturnValue(
            JSON.stringify({
                version: '1.0.0',
                updatedAt: new Date().toISOString(),
                files: [
                    {
                        filePath: 'remove.txt',
                        hash: 'hash',
                        computedAt: new Date().toISOString(),
                        relatedCacheHashes: ['cache-1'],
                    },
                ],
            })
        );
        fsMock.writeFileSync.mockImplementation(() => undefined);

        const result = changeDetection.untrackFile(context, 'remove.txt');

        expect(result).toBe(true);
        expect(fsMock.writeFileSync).toHaveBeenCalled();
    });

    it('Test 8: should return false when untracking missing files', () => {
        const registryPath = path.join(context.extensionPath, '.coe', 'hash-registry.json');
        fsMock.existsSync.mockImplementation((target) => target === registryPath);
        fsMock.readFileSync.mockReturnValue(
            JSON.stringify({
                version: '1.0.0',
                updatedAt: new Date().toISOString(),
                files: [
                    {
                        filePath: 'other.txt',
                        hash: 'hash',
                        computedAt: new Date().toISOString(),
                        relatedCacheHashes: ['cache-1'],
                    },
                ],
            })
        );

        const result = changeDetection.untrackFile(context, 'missing.txt');

        expect(result).toBe(false);
    });
});
