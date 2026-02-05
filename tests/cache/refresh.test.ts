import { ExtensionContext } from '../__mocks__/vscode';
import type { CacheIndexItem } from '../../src/services/cache/index';
import {
    DEFAULT_STALENESS_THRESHOLD,
    calculateRefreshPriority,
    getStaleItems,
    isItemStale,
    refreshStaleItems,
    setupAutoRefresh,
    sortByRefreshPriority,
} from '../../src/services/cache/refresh';
import { loadCacheIndex, updateLastAccessed } from '../../src/services/cache/index';

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('../../src/services/cache/index', () => ({
    loadCacheIndex: jest.fn(),
    updateLastAccessed: jest.fn(),
}));

describe('Cache Refresh', () => {
    const loadCacheIndexMock = loadCacheIndex as jest.MockedFunction<typeof loadCacheIndex>;
    const updateLastAccessedMock = updateLastAccessed as jest.MockedFunction<typeof updateLastAccessed>;
    let context: ExtensionContext;

    beforeEach(() => {
        jest.clearAllMocks();
        context = new ExtensionContext('/mock/extension/path');
    });

    it('Test 1: should detect stale items based on age', () => {
        const staleItem: CacheIndexItem = {
            hash: 'stale',
            source: 'test',
            type: 'response',
            cachedAt: new Date(Date.now() - DEFAULT_STALENESS_THRESHOLD - 1000).toISOString(),
            lastAccessedAt: undefined,
            sizeBytes: 10,
            accessCount: 0,
        };

        expect(isItemStale(staleItem)).toBe(true);
    });

    it('Test 2: should return stale items from index', () => {
        const staleItem: CacheIndexItem = {
            hash: 'stale',
            source: 'test',
            type: 'response',
            cachedAt: new Date(Date.now() - DEFAULT_STALENESS_THRESHOLD - 1000).toISOString(),
            lastAccessedAt: undefined,
            sizeBytes: 10,
            accessCount: 0,
        };
        const freshItem: CacheIndexItem = {
            hash: 'fresh',
            source: 'test',
            type: 'response',
            cachedAt: new Date().toISOString(),
            lastAccessedAt: undefined,
            sizeBytes: 10,
            accessCount: 0,
        };

        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalItems: 2,
            totalSizeBytes: 20,
            items: [staleItem, freshItem],
        });

        const staleItems = getStaleItems(context);

        expect(staleItems).toHaveLength(1);
        expect(staleItems[0].hash).toBe('stale');
    });

    it('Test 3: should refresh stale items successfully', async () => {
        const staleItem: CacheIndexItem = {
            hash: 'stale',
            source: 'test',
            type: 'response',
            cachedAt: new Date(Date.now() - DEFAULT_STALENESS_THRESHOLD - 1000).toISOString(),
            lastAccessedAt: undefined,
            sizeBytes: 10,
            accessCount: 0,
        };

        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalItems: 1,
            totalSizeBytes: 10,
            items: [staleItem],
        });

        const refreshCallback = jest.fn().mockResolvedValue({ success: true });
        const result = await refreshStaleItems(context, refreshCallback, DEFAULT_STALENESS_THRESHOLD, 1);

        expect(result.itemsRefreshed).toBe(1);
        expect(result.itemsFailed).toBe(0);
        expect(updateLastAccessedMock).toHaveBeenCalledWith(context, 'stale');
    });

    it('Test 4: should track errors when refresh fails', async () => {
        const staleItem: CacheIndexItem = {
            hash: 'stale',
            source: 'test',
            type: 'response',
            cachedAt: new Date(Date.now() - DEFAULT_STALENESS_THRESHOLD - 1000).toISOString(),
            lastAccessedAt: undefined,
            sizeBytes: 10,
            accessCount: 0,
        };

        loadCacheIndexMock.mockReturnValue({
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalItems: 1,
            totalSizeBytes: 10,
            items: [staleItem],
        });

        const refreshCallback = jest.fn().mockResolvedValue({ success: false, error: 'Nope' });
        const result = await refreshStaleItems(context, refreshCallback, DEFAULT_STALENESS_THRESHOLD, 1);

        expect(result.success).toBe(false);
        expect(result.itemsFailed).toBe(1);
        expect(result.errors[0]).toContain('Nope');
    });

    it('Test 5: should set up auto-refresh hook', () => {
        const refreshCallback = jest.fn().mockResolvedValue({ success: true });
        const onlineCallbacks: Array<() => void> = [];
        const detector = {
            isOnline: () => true,
            onOnline: (callback: () => void) => onlineCallbacks.push(callback),
        };

        setupAutoRefresh(context, detector, refreshCallback, DEFAULT_STALENESS_THRESHOLD);

        expect(onlineCallbacks).toHaveLength(1);
        expect(() => onlineCallbacks[0]()).not.toThrow();
    });

    it('Test 6: should sort items by refresh priority', () => {
        const olderItem: CacheIndexItem = {
            hash: 'older',
            source: 'test',
            type: 'response',
            cachedAt: new Date(Date.now() - DEFAULT_STALENESS_THRESHOLD * 2).toISOString(),
            lastAccessedAt: undefined,
            sizeBytes: 100,
            accessCount: 1,
        };
        const recentItem: CacheIndexItem = {
            hash: 'recent',
            source: 'test',
            type: 'response',
            cachedAt: new Date().toISOString(),
            lastAccessedAt: new Date().toISOString(),
            sizeBytes: 10,
            accessCount: 5,
        };

        const sorted = sortByRefreshPriority([olderItem, recentItem]);

        expect(calculateRefreshPriority(sorted[0])).toBeGreaterThanOrEqual(
            calculateRefreshPriority(sorted[1])
        );
    });
});
