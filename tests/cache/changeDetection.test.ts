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

    it('Test 9: should handle loadHashRegistry parse errors gracefully', () => {
        const registryPath = path.join(context.extensionPath, '.coe', 'hash-registry.json');
        fsMock.existsSync.mockReturnValue(true);
        fsMock.readFileSync.mockImplementation(() => {
            throw new Error('Read error');
        });

        const registry = changeDetection.loadHashRegistry(context);

        expect(registry.files).toEqual([]);
        expect(registry.version).toBe('1.0.0');
    });

    it('Test 10: should handle saveHashRegistry write errors', () => {
        fsMock.writeFileSync.mockImplementation(() => {
            throw new Error('Write error');
        });

        const result = changeDetection.saveHashRegistry(context, {
            version: '1.0.0',
            updatedAt: new Date().toISOString(),
            files: [],
        });

        expect(result).toBe(false);
    });

    it('Test 11: should return false when registerFileHash cannot compute hash', () => {
        // When readFileSync throws, computeFileHash returns null
        fsMock.readFileSync.mockImplementation(() => {
            throw new Error('Cannot read file');
        });

        const result = changeDetection.registerFileHash(context, '/bad-file.txt', ['hash-1']);

        expect(result).toBe(false);
    });

    it('Test 12: should update existing file in registerFileHash', () => {
        const registryPath = path.join(context.extensionPath, '.coe', 'hash-registry.json');
        let calls = 0;
        fsMock.existsSync.mockImplementation((target) => target === registryPath);
        // First call for readFileSync reads the registry, second is for hash computation
        fsMock.readFileSync.mockImplementation((target) => {
            if (String(target) === registryPath) {
                return JSON.stringify({
                    version: '1.0.0',
                    updatedAt: new Date().toISOString(),
                    files: [
                        {
                            filePath: '/file.txt',
                            hash: 'old-hash',
                            computedAt: new Date().toISOString(),
                            relatedCacheHashes: ['cache-old'],
                        },
                    ],
                });
            }
            // File content read for hash
            return Buffer.from('file content');
        });
        fsMock.writeFileSync.mockImplementation(() => undefined);

        const result = changeDetection.registerFileHash(context, '/file.txt', ['cache-new']);

        expect(result).toBe(true);
        // Verify writeFileSync was called with updated registry
        expect(fsMock.writeFileSync).toHaveBeenCalled();
    });

    it('Test 13: should handle registerFileHash exception in registry load', () => {
        const registryPath = path.join(context.extensionPath, '.coe', 'hash-registry.json');
        // First call succeeds for the file hash
        let callCount = 0;
        fsMock.existsSync.mockReturnValue(true);
        fsMock.readFileSync.mockImplementation((target) => {
            callCount++;
            if (callCount === 1) {
                // First call is in computeFileHash - return valid content
                return Buffer.from('file content');
            }
            // Second call is in loadHashRegistry - throw error
            throw new Error('Registry load failure');
        });

        const result = changeDetection.registerFileHash(context, '/file.txt', ['hash-1']);

        // Should still succeed because loadHashRegistry handles errors gracefully
        expect(result).toBe(true);
    });

    it('Test 14: should add hash compute failure to errors array in detectAndInvalidateChanges', async () => {
        const registryPath = path.join(context.extensionPath, '.coe', 'hash-registry.json');
        let readCount = 0;
        fsMock.existsSync.mockImplementation((target) => {
            if (target === registryPath) return true;
            if (String(target).includes('exists.txt')) return true;
            return false;
        });
        fsMock.readFileSync.mockImplementation((target) => {
            readCount++;
            if (String(target) === registryPath || readCount === 1) {
                return JSON.stringify({
                    version: '1.0.0',
                    updatedAt: new Date().toISOString(),
                    files: [
                        {
                            filePath: 'exists.txt',
                            hash: 'old-hash',
                            computedAt: new Date().toISOString(),
                            relatedCacheHashes: [],
                        },
                    ],
                });
            }
            // Fail hash computation
            throw new Error('Cannot read for hash');
        });

        const result = await changeDetection.detectAndInvalidateChanges(context);

        expect(result.errors).toContain('Failed to compute hash for exists.txt');
    });

    it('Test 15: should handle cache invalidation errors in detectAndInvalidateChanges', async () => {
        const registryPath = path.join(context.extensionPath, '.coe', 'hash-registry.json');
        fsMock.existsSync.mockImplementation((target) => {
            if (target === registryPath) return true;
            if (String(target).includes('changed.txt')) return true;
            return false;
        });
        fsMock.readFileSync.mockImplementation((target) => {
            if (String(target) === registryPath) {
                return JSON.stringify({
                    version: '1.0.0',
                    updatedAt: new Date().toISOString(),
                    files: [
                        {
                            filePath: 'changed.txt',
                            hash: 'old-hash',
                            computedAt: new Date().toISOString(),
                            relatedCacheHashes: ['cache-fail'],
                        },
                    ],
                });
            }
            // Return different content for hash computation to trigger "changed" state
            return Buffer.from('different content');
        });
        fsMock.writeFileSync.mockImplementation(() => undefined);
        deletePayloadMock.mockRejectedValue(new Error('Delete failed'));

        const result = await changeDetection.detectAndInvalidateChanges(context);

        expect(result.errors.some(e => e.includes('Failed to invalidate cache'))).toBe(true);
        expect(result.success).toBe(false);
    });

    it('Test 16: should handle main exception in detectAndInvalidateChanges', async () => {
        // The outer catch in detectAndInvalidateChanges catches errors after loadHashRegistry runs.
        // loadHashRegistry has its own error handler, so we need to throw after it succeeds.
        // We'll create a scenario where registry loads but iteration fails.
        const registryPath = path.join(context.extensionPath, '.coe', 'hash-registry.json');
        fsMock.existsSync.mockReturnValue(true);
        
        // Return a registry whose files property throws on iteration
        const badRegistry = {
            version: '1.0.0',
            updatedAt: new Date().toISOString(),
            files: null as unknown as Array<unknown>, // Will throw when trying to iterate
        };
        fsMock.readFileSync.mockReturnValue(JSON.stringify(badRegistry));

        const result = await changeDetection.detectAndInvalidateChanges(context);

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('Test 17: should return empty array when getTrackedFiles throws', () => {
        // Make loadHashRegistry throw internally
        fsMock.existsSync.mockImplementation(() => {
            throw new Error('Load failure');
        });

        const tracked = changeDetection.getTrackedFiles(context);

        expect(tracked).toEqual([]);
    });

    it('Test 18: should handle untrackFile exceptions', () => {
        // Make loadHashRegistry throw
        fsMock.existsSync.mockImplementation(() => {
            throw new Error('Registry error');
        });

        const result = changeDetection.untrackFile(context, '/file.txt');

        expect(result).toBe(false);
    });
});
