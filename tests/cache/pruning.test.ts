import { ExtensionContext } from '../__mocks__/vscode';
import type { CacheIndexItem } from '../../src/services/cache/index';
import {
    DEFAULT_SIZE_THRESHOLD,
    formatBytes,
    getCacheSizeInfo,
    getPruneableItems,
    pruneCacheLRU,
    scheduleSizePruning,
} from '../../src/services/cache/pruning';
import { loadCacheIndex, removeFromIndex } from '../../src/services/cache/index';
import { deletePayload } from '../../src/services/cache/storage';

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('../../src/services/cache/index', () => ({
    loadCacheIndex: jest.fn(),
    removeFromIndex: jest.fn(),
}));

jest.mock('../../src/services/cache/storage', () => ({
    deletePayload: jest.fn(),
}));

describe('Cache Pruning', () => {
    const loadCacheIndexMock = loadCacheIndex as jest.MockedFunction<typeof loadCacheIndex>;
    const removeFromIndexMock = removeFromIndex as jest.MockedFunction<typeof removeFromIndex>;
    const deletePayloadMock = deletePayload as jest.MockedFunction<typeof deletePayload>;
    let context: ExtensionContext;

    beforeEach(() => {
        jest.clearAllMocks();
        context = new ExtensionContext('/mock/extension/path');
    });

    it('Test 1: should format bytes for display', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(1024)).toBe('1 KB');
    });

    it('Test 2: should return empty prune list when under threshold', () => {
        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalItems: 1,
            totalSizeBytes: 1024,
            items: [],
        });

        const items = getPruneableItems(context, DEFAULT_SIZE_THRESHOLD);

        expect(items).toEqual([]);
    });

    it('Test 3: should calculate cache size info', () => {
        const now = new Date().toISOString();
        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: now,
            updatedAt: now,
            totalItems: 2,
            totalSizeBytes: 3000,
            items: [
                {
                    hash: 'a',
                    source: 'test',
                    type: 'response',
                    cachedAt: now,
                    lastAccessedAt: now,
                    sizeBytes: 1000,
                    accessCount: 0,
                },
                {
                    hash: 'b',
                    source: 'test',
                    type: 'response',
                    cachedAt: now,
                    lastAccessedAt: now,
                    sizeBytes: 2000,
                    accessCount: 0,
                },
            ],
        });

        const info = getCacheSizeInfo(context);

        expect(info.totalBytes).toBe(3000);
        expect(info.largestItem?.hash).toBe('b');
        expect(info.averageItemSize).toBe(1500);
    });

    it('Test 4: should prune least recently used items', async () => {
        const now = new Date().toISOString();
        const items: CacheIndexItem[] = Array.from({ length: 11 }, (_, index) => ({
            hash: `item-${index}`,
            source: 'test',
            type: 'response',
            cachedAt: now,
            lastAccessedAt: now,
            sizeBytes: 1,
            accessCount: 0,
        }));

        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: now,
            updatedAt: now,
            totalItems: items.length,
            totalSizeBytes: items.length,
            items,
        });

        deletePayloadMock.mockResolvedValue(true);

        const result = await pruneCacheLRU(context, 5);

        expect(result.itemsDeleted).toBeGreaterThan(0);
        expect(removeFromIndexMock).toHaveBeenCalled();
    });

    it('Test 5: should schedule size pruning', () => {
        jest.useFakeTimers();
        const setIntervalSpy = jest.spyOn(global, 'setInterval');

        const timer = scheduleSizePruning(context, 1, 5);

        jest.advanceTimersByTime(5);

        expect(setIntervalSpy).toHaveBeenCalled();
        clearInterval(timer);
        setIntervalSpy.mockRestore();
        jest.useRealTimers();
    });

    it('Test 6: should return empty prune list on load errors', () => {
        loadCacheIndexMock.mockImplementation(() => {
            throw new Error('load failed');
        });

        const result = getPruneableItems(context, 1024);

        expect(result).toEqual([]);
    });

    it('Test 7: should report errors when deletion fails', async () => {
        const now = new Date().toISOString();
        const items: CacheIndexItem[] = Array.from({ length: 11 }, (_, index) => ({
            hash: `item-${index}`,
            source: 'test',
            type: 'response',
            cachedAt: now,
            lastAccessedAt: now,
            sizeBytes: 1,
            accessCount: 0,
        }));

        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: now,
            updatedAt: now,
            totalItems: items.length,
            totalSizeBytes: items.length,
            items,
        });

        deletePayloadMock.mockResolvedValue(false);

        const result = await pruneCacheLRU(context, 5);

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('Test 8: should return defaults when size info fails', () => {
        loadCacheIndexMock.mockImplementation(() => {
            throw new Error('load failed');
        });

        const info = getCacheSizeInfo(context);

        expect(info.totalBytes).toBe(0);
        expect(info.itemCount).toBe(0);
    });
});
