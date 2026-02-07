import { ExtensionContext } from '../__mocks__/vscode';
import type { CacheIndexItem } from '../../src/services/cache/index';
import {
    DEFAULT_SIZE_THRESHOLD,
    MIN_ITEMS_TO_KEEP,
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

    it('Test 9: should handle deletion throwing an error', async () => {
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

        // Make deletePayload throw an error instead of returning false
        deletePayloadMock.mockRejectedValue(new Error('Disk full'));

        const result = await pruneCacheLRU(context, 5);

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('Disk full');
    });

    it('Test 10: should handle loadCacheIndex throwing in pruneCacheLRU', async () => {
        loadCacheIndexMock.mockImplementation(() => {
            throw new Error('Index corrupted');
        });

        const result = await pruneCacheLRU(context, 1024);

        expect(result.success).toBe(false);
        expect(result.errors[0]).toContain('Index corrupted');
    });

    it('Test 11: should respect MIN_ITEMS_TO_KEEP in pruneCacheLRU', async () => {
        const now = new Date().toISOString();
        // Create exactly MIN_ITEMS_TO_KEEP + 1 items with all exceeding threshold
        const items: CacheIndexItem[] = Array.from({ length: MIN_ITEMS_TO_KEEP + 1 }, (_, index) => ({
            hash: `item-${index}`,
            source: 'test',
            type: 'response',
            cachedAt: now,
            lastAccessedAt: now,
            sizeBytes: 1000,  // 1000 bytes each, total much higher than threshold
            accessCount: 0,
        }));

        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: now,
            updatedAt: now,
            totalItems: items.length,
            totalSizeBytes: items.length * 1000,
            items,
        });

        deletePayloadMock.mockResolvedValue(true);

        // Threshold of 1 byte - all items exceed, but should keep MIN_ITEMS_TO_KEEP
        const result = await pruneCacheLRU(context, 1);

        // Should only delete 1 item (we have 11, must keep 10)
        expect(result.itemsDeleted).toBe(1);
    });

    it('Test 12: should respect MIN_ITEMS_TO_KEEP in getPruneableItems', () => {
        const now = new Date().toISOString();
        // Create exactly MIN_ITEMS_TO_KEEP + 1 items
        const items: CacheIndexItem[] = Array.from({ length: MIN_ITEMS_TO_KEEP + 1 }, (_, index) => ({
            hash: `item-${index}`,
            source: 'test',
            type: 'response',
            cachedAt: now,
            lastAccessedAt: now,
            sizeBytes: 1000,
            accessCount: 0,
        }));

        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: now,
            updatedAt: now,
            totalItems: items.length,
            totalSizeBytes: items.length * 1000,
            items,
        });

        // Threshold of 1 byte - should mark only 1 item for pruning
        const pruneable = getPruneableItems(context, 1);

        // Should only return 1 item to prune (keeping MIN_ITEMS_TO_KEEP)
        expect(pruneable.length).toBe(1);
    });

    it('Test 13: should format various byte sizes correctly', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(512)).toBe('512 B');  // Below 1KB stays as bytes
        expect(formatBytes(1024)).toBe('1 KB');
        expect(formatBytes(1536)).toBe('1.5 KB');
        expect(formatBytes(1024 * 1024)).toBe('1 MB');
        expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MB');
        expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('Test 14: should handle no items to delete when minimum reached', async () => {
        const now = new Date().toISOString();
        // Create exactly MIN_ITEMS_TO_KEEP items (no room to prune)
        const items: CacheIndexItem[] = Array.from({ length: MIN_ITEMS_TO_KEEP }, (_, index) => ({
            hash: `item-${index}`,
            source: 'test',
            type: 'response',
            cachedAt: now,
            lastAccessedAt: now,
            sizeBytes: 1000,
            accessCount: 0,
        }));

        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: now,
            updatedAt: now,
            totalItems: items.length,
            totalSizeBytes: items.length * 1000,
            items,
        });

        // Threshold of 1 byte - all exceed but can't delete any
        const result = await pruneCacheLRU(context, 1);

        expect(result.itemsDeleted).toBe(0);
        expect(result.success).toBe(true);
    });

    it('Test 15: should sort by lastAccessedAt when available', () => {
        const old = new Date('2024-01-01').toISOString();
        const recent = new Date('2024-06-01').toISOString();
        
        const items: CacheIndexItem[] = [
            {
                hash: 'recent-item',
                source: 'test',
                type: 'response',
                cachedAt: old,
                lastAccessedAt: recent,  // Recently accessed
                sizeBytes: 1000,
                accessCount: 5,
            },
            {
                hash: 'old-item',
                source: 'test',
                type: 'response',
                cachedAt: recent,  // Cached later but...
                lastAccessedAt: old,  // Accessed earlier (should be pruned first)
                sizeBytes: 1000,
                accessCount: 1,
            },
        ];

        // Add filler items to get past MIN_ITEMS_TO_KEEP
        for (let i = 0; i < MIN_ITEMS_TO_KEEP; i++) {
            items.push({
                hash: `filler-${i}`,
                source: 'test',
                type: 'response',
                cachedAt: recent,
                lastAccessedAt: new Date().toISOString(),  // Most recent
                sizeBytes: 100,
                accessCount: 0,
            });
        }

        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: old,
            updatedAt: recent,
            totalItems: items.length,
            totalSizeBytes: items.reduce((sum, i) => sum + i.sizeBytes, 0),
            items,
        });

        // Need to prune 1 item
        const pruneable = getPruneableItems(context, 1000);

        // old-item should be first to be pruned (oldest lastAccessedAt)
        expect(pruneable[0]).toBe('old-item');
    });

    it('Test 16: should use cachedAt when lastAccessedAt is missing', () => {
        const old = new Date('2024-01-01').toISOString();
        const recent = new Date('2024-06-01').toISOString();
        
        const items: CacheIndexItem[] = [
            {
                hash: 'old-cached',
                source: 'test',
                type: 'response',
                cachedAt: old,  // Older cachedAt
                lastAccessedAt: undefined,  // No lastAccessedAt
                sizeBytes: 1000,
                accessCount: 0,
            },
            {
                hash: 'recent-cached',
                source: 'test',
                type: 'response',
                cachedAt: recent,
                lastAccessedAt: undefined,  // No lastAccessedAt
                sizeBytes: 1000,
                accessCount: 0,
            },
        ];

        // Add filler items
        for (let i = 0; i < MIN_ITEMS_TO_KEEP; i++) {
            items.push({
                hash: `filler-${i}`,
                source: 'test',
                type: 'response',
                cachedAt: new Date().toISOString(),
                lastAccessedAt: undefined,
                sizeBytes: 100,
                accessCount: 0,
            });
        }

        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: old,
            updatedAt: recent,
            totalItems: items.length,
            totalSizeBytes: items.reduce((sum, i) => sum + i.sizeBytes, 0),
            items,
        });

        const pruneable = getPruneableItems(context, 1000);

        // old-cached should be first (oldest cachedAt since no lastAccessedAt)
        expect(pruneable[0]).toBe('old-cached');
    });

    it('Test 17: should handle empty items array in getCacheSizeInfo', () => {
        const now = new Date().toISOString();
        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: now,
            updatedAt: now,
            totalItems: 0,
            totalSizeBytes: 0,
            items: [],
        });

        const info = getCacheSizeInfo(context);

        expect(info.totalBytes).toBe(0);
        expect(info.itemCount).toBe(0);
        expect(info.largestItem).toBeNull();
        expect(info.averageItemSize).toBe(0);
    });

    it('Test 18: should stop pruning once below threshold', async () => {
        const now = new Date().toISOString();
        // Create 20 items, each 100 bytes (2000 total)
        const items: CacheIndexItem[] = Array.from({ length: 20 }, (_, index) => ({
            hash: `item-${index}`,
            source: 'test',
            type: 'response',
            cachedAt: now,
            lastAccessedAt: now,
            sizeBytes: 100,
            accessCount: 0,
        }));

        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: now,
            updatedAt: now,
            totalItems: items.length,
            totalSizeBytes: 2000,
            items,
        });

        deletePayloadMock.mockResolvedValue(true);

        // Threshold of 1500 bytes - need to delete 5 items (500 bytes)
        const result = await pruneCacheLRU(context, 1500);

        // Should delete ~5-6 items to get under 1500 (2000 - 500 = 1500)
        expect(result.itemsDeleted).toBeGreaterThanOrEqual(5);
        expect(result.itemsDeleted).toBeLessThanOrEqual(6);
    });

    it('Test 19: should handle mixed success/failure in deletion', async () => {
        const now = new Date().toISOString();
        const items: CacheIndexItem[] = Array.from({ length: 15 }, (_, index) => ({
            hash: `item-${index}`,
            source: 'test',
            type: 'response',
            cachedAt: now,
            lastAccessedAt: now,
            sizeBytes: 100,
            accessCount: 0,
        }));

        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: now,
            updatedAt: now,
            totalItems: items.length,
            totalSizeBytes: 1500,
            items,
        });

        // Alternate between success and failure
        let callCount = 0;
        deletePayloadMock.mockImplementation(() => {
            callCount++;
            return Promise.resolve(callCount % 2 === 0);
        });

        const result = await pruneCacheLRU(context, 500);

        // Should have some errors but also some successes
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.success).toBe(false);
    });

    it('Test 20: should calculate totalMB correctly', () => {
        const now = new Date().toISOString();
        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: now,
            updatedAt: now,
            totalItems: 1,
            totalSizeBytes: 1024 * 1024 * 5,  // 5 MB
            items: [{
                hash: 'large-item',
                source: 'test',
                type: 'response',
                cachedAt: now,
                lastAccessedAt: now,
                sizeBytes: 1024 * 1024 * 5,
                accessCount: 0,
            }],
        });

        const info = getCacheSizeInfo(context);

        expect(info.totalMB).toBe(5);
    });

    it('Test 21: should export MIN_ITEMS_TO_KEEP constant', () => {
        expect(MIN_ITEMS_TO_KEEP).toBe(10);
    });

    it('Test 22: should export DEFAULT_SIZE_THRESHOLD constant', () => {
        // 100MB
        expect(DEFAULT_SIZE_THRESHOLD).toBe(100 * 1024 * 1024);
    });
});
