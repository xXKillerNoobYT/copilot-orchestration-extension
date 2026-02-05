import * as fs from 'fs';
import { ExtensionContext } from '../__mocks__/vscode';
import {
    addToIndex,
    loadCacheIndex,
    removeFromIndex,
    saveCacheIndex,
} from '../../src/services/cache/index';

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

describe('Cache Index Additional Coverage', () => {
    const fsMock = fs as jest.Mocked<typeof fs>;
    let context: ExtensionContext;

    beforeEach(() => {
        jest.clearAllMocks();
        context = new ExtensionContext('/mock/extension/path');
    });

    it('Test 1: should return empty index when read fails', () => {
        fsMock.existsSync.mockReturnValue(true);
        fsMock.readFileSync.mockImplementation(() => {
            throw new Error('read failed');
        });

        const index = loadCacheIndex(context);

        expect(index.totalItems).toBe(0);
        expect(index.items).toEqual([]);
    });

    it('Test 2: should return false when save fails', () => {
        fsMock.writeFileSync.mockImplementation(() => {
            throw new Error('write failed');
        });

        const result = saveCacheIndex(context, {
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalItems: 0,
            totalSizeBytes: 0,
            items: [],
        });

        expect(result).toBe(false);
    });

    it('Test 3: should return false when removing missing item', () => {
        fsMock.existsSync.mockReturnValue(true);
        fsMock.readFileSync.mockReturnValue(
            JSON.stringify({
                version: '1.0.0',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                totalItems: 0,
                totalSizeBytes: 0,
                items: [],
            })
        );

        const result = removeFromIndex(context, 'missing');

        expect(result).toBe(false);
    });

    it('Test 4: should update existing index entries', () => {
        const now = new Date().toISOString();
        fsMock.existsSync.mockReturnValue(true);
        fsMock.writeFileSync.mockImplementation(() => undefined);
        fsMock.readFileSync.mockReturnValue(
            JSON.stringify({
                version: '1.0.0',
                createdAt: now,
                updatedAt: now,
                totalItems: 1,
                totalSizeBytes: 10,
                items: [
                    {
                        hash: 'hash-1',
                        source: 'test',
                        type: 'response',
                        cachedAt: now,
                        lastAccessedAt: now,
                        sizeBytes: 10,
                        accessCount: 1,
                    },
                ],
            })
        );

        const result = addToIndex(
            context,
            {
                hash: 'hash-1',
                source: 'test',
                type: 'response',
                cachedAt: now,
                metadata: {},
                data: {},
            },
            10
        );

        expect(result).toBe(true);
        expect(fsMock.writeFileSync).toHaveBeenCalled();
    });

    it('Test 5: should update last accessed timestamp', () => {
        const now = new Date().toISOString();
        fsMock.existsSync.mockReturnValue(true);
        fsMock.writeFileSync.mockImplementation(() => undefined);
        fsMock.readFileSync.mockReturnValue(
            JSON.stringify({
                version: '1.0.0',
                createdAt: now,
                updatedAt: now,
                totalItems: 1,
                totalSizeBytes: 10,
                items: [
                    {
                        hash: 'hash-2',
                        source: 'test',
                        type: 'response',
                        cachedAt: now,
                        lastAccessedAt: now,
                        sizeBytes: 10,
                        accessCount: 1,
                    },
                ],
            })
        );

        const result = require('../../src/services/cache/index').updateLastAccessed(
            context,
            'hash-2'
        );

        expect(result).toBe(true);
        expect(fsMock.writeFileSync).toHaveBeenCalled();
    });

    it('Test 6: should find items by hash and search filters', () => {
        const now = new Date().toISOString();
        fsMock.existsSync.mockReturnValue(true);
        fsMock.readFileSync.mockReturnValue(
            JSON.stringify({
                version: '1.0.0',
                createdAt: now,
                updatedAt: now,
                totalItems: 2,
                totalSizeBytes: 20,
                items: [
                    {
                        hash: 'hash-a',
                        source: 'source-a',
                        type: 'response',
                        cachedAt: now,
                        lastAccessedAt: now,
                        sizeBytes: 10,
                        accessCount: 1,
                    },
                    {
                        hash: 'hash-b',
                        source: 'source-b',
                        type: 'response',
                        cachedAt: now,
                        lastAccessedAt: now,
                        sizeBytes: 10,
                        accessCount: 1,
                    },
                ],
            })
        );

        const indexModule = require('../../src/services/cache/index');
        const foundByHash = indexModule.getIndexItem(context, 'hash-a');
        const foundBySource = indexModule.searchIndex(context, { source: 'source-b' });

        expect(foundByHash?.hash).toBe('hash-a');
        expect(foundBySource).toHaveLength(1);
    });

    it('Test 7: should return empty stats on errors', () => {
        fsMock.existsSync.mockReturnValue(true);
        fsMock.readFileSync.mockImplementation(() => {
            throw new Error('read failed');
        });

        const indexModule = require('../../src/services/cache/index');
        const results = indexModule.searchIndex(context, { source: 'missing' });
        const stats = indexModule.getCacheStats(context);

        expect(results).toEqual([]);
        expect(stats.totalItems).toBe(0);
    });

    it('Test 8: should filter search results by metadata', () => {
        const now = new Date();
        const older = new Date(now.getTime() - 1000 * 60 * 60);
        fsMock.existsSync.mockReturnValue(true);
        fsMock.readFileSync.mockReturnValue(
            JSON.stringify({
                version: '1.0.0',
                createdAt: older.toISOString(),
                updatedAt: now.toISOString(),
                totalItems: 2,
                totalSizeBytes: 30,
                items: [
                    {
                        hash: 'hash-old',
                        source: 'source-a',
                        type: 'response',
                        cachedAt: older.toISOString(),
                        lastAccessedAt: older.toISOString(),
                        sizeBytes: 5,
                        accessCount: 1,
                    },
                    {
                        hash: 'hash-new',
                        source: 'source-b',
                        type: 'request',
                        cachedAt: now.toISOString(),
                        lastAccessedAt: now.toISOString(),
                        sizeBytes: 25,
                        accessCount: 2,
                    },
                ],
            })
        );

        const indexModule = require('../../src/services/cache/index');
        const results = indexModule.searchIndex(context, {
            source: 'source-b',
            type: 'request',
            cachedAfter: new Date(now.getTime() - 1000),
            cachedBefore: new Date(now.getTime() + 1000),
            minSize: 10,
            maxSize: 30,
        });

        expect(results).toHaveLength(1);
        expect(results[0].hash).toBe('hash-new');
    });

    it('Test 9: should compute cache stats for normal index', () => {
        const now = new Date().toISOString();
        const older = new Date(Date.now() - 1000).toISOString();
        fsMock.existsSync.mockReturnValue(true);
        fsMock.readFileSync.mockReturnValue(
            JSON.stringify({
                version: '1.0.0',
                createdAt: older,
                updatedAt: now,
                totalItems: 2,
                totalSizeBytes: 30,
                items: [
                    {
                        hash: 'hash-old',
                        source: 'source-a',
                        type: 'response',
                        cachedAt: older,
                        lastAccessedAt: older,
                        sizeBytes: 10,
                        accessCount: 1,
                    },
                    {
                        hash: 'hash-new',
                        source: 'source-a',
                        type: 'request',
                        cachedAt: now,
                        lastAccessedAt: now,
                        sizeBytes: 20,
                        accessCount: 1,
                    },
                ],
            })
        );

        const indexModule = require('../../src/services/cache/index');
        const stats = indexModule.getCacheStats(context);

        expect(stats.totalItems).toBe(2);
        expect(stats.bySource['source-a']).toBe(2);
        expect(stats.byType.request).toBe(1);
    });
});
