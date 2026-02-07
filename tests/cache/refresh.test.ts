import { ExtensionContext } from '../__mocks__/vscode';
import type { CacheIndexItem } from '../../src/services/cache/index';
import {
    DEFAULT_STALENESS_THRESHOLD,
    MAX_CONCURRENT_REFRESHES,
    VSCodeOnlineDetector,
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

    describe('VSCodeOnlineDetector', () => {
        it('Test 7: should return true for isOnline', () => {
            const detector = new VSCodeOnlineDetector();
            
            expect(detector.isOnline()).toBe(true);
        });

        it('Test 8: should register onOnline callbacks', () => {
            const detector = new VSCodeOnlineDetector();
            const callback = jest.fn();
            
            detector.onOnline(callback);
            // Manually trigger callbacks (simulating going online)
            detector.triggerOnlineCallbacks();
            
            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('Test 9: should call multiple onOnline callbacks', () => {
            const detector = new VSCodeOnlineDetector();
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            
            detector.onOnline(callback1);
            detector.onOnline(callback2);
            detector.triggerOnlineCallbacks();
            
            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledTimes(1);
        });
    });

    describe('Error handling', () => {
        it('Test 10: should handle getStaleItems throw', () => {
            loadCacheIndexMock.mockImplementation(() => {
                throw new Error('Index read failed');
            });

            const items = getStaleItems(context);

            expect(items).toEqual([]);
        });

        it('Test 11: should handle refreshCallback throwing exception', async () => {
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

            const refreshCallback = jest.fn().mockRejectedValue(new Error('Network error'));
            const result = await refreshStaleItems(context, refreshCallback, DEFAULT_STALENESS_THRESHOLD, 1);

            expect(result.success).toBe(false);
            expect(result.itemsFailed).toBe(1);
            expect(result.errors[0]).toContain('Network error');
        });

        it('Test 12: should return success when getStaleItems returns empty due to error', async () => {
            // When loadCacheIndex throws in getStaleItems, it returns [] (not rethrows)
            // So refreshStaleItems sees no stale items and returns success
            loadCacheIndexMock.mockImplementation(() => {
                throw new Error('Catastrophic failure');
            });

            const refreshCallback = jest.fn().mockResolvedValue({ success: true });
            const result = await refreshStaleItems(context, refreshCallback);

            // getStaleItems catches the error and returns [], so no refresh needed
            expect(result.success).toBe(true);
            expect(result.itemsRefreshed).toBe(0);
            expect(refreshCallback).not.toHaveBeenCalled();
        });
    });

    describe('Batch processing', () => {
        it('Test 13: should process items in batches', async () => {
            jest.useFakeTimers();
            
            // Create 6 stale items (2 batches needed with MAX_CONCURRENT_REFRESHES=3)
            const staleItems = Array.from({ length: 6 }, (_, i) => ({
                hash: `stale-${i}`,
                source: 'test',
                type: 'response',
                cachedAt: new Date(Date.now() - DEFAULT_STALENESS_THRESHOLD - 1000).toISOString(),
                lastAccessedAt: undefined,
                sizeBytes: 10,
                accessCount: 0,
            })) as CacheIndexItem[];

            loadCacheIndexMock.mockReturnValue({
                version: '1.0.0',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                totalItems: staleItems.length,
                totalSizeBytes: 60,
                items: staleItems,
            });

            const refreshCallback = jest.fn().mockImplementation(() => 
                Promise.resolve({ success: true })
            );

            const resultPromise = refreshStaleItems(
                context, 
                refreshCallback, 
                DEFAULT_STALENESS_THRESHOLD, 
                MAX_CONCURRENT_REFRESHES
            );

            // Allow async operations to run
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            expect(result.itemsRefreshed).toBe(6);
            expect(refreshCallback).toHaveBeenCalledTimes(6);
            
            jest.useRealTimers();
        });

        it('Test 14: should return early when no stale items', async () => {
            loadCacheIndexMock.mockReturnValue({
                version: '1.0.0',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                totalItems: 0,
                totalSizeBytes: 0,
                items: [],
            });

            const refreshCallback = jest.fn();
            const result = await refreshStaleItems(context, refreshCallback);

            expect(result.itemsRefreshed).toBe(0);
            expect(result.success).toBe(true);
            expect(refreshCallback).not.toHaveBeenCalled();
        });
    });

    describe('Priority calculation', () => {
        it('Test 15: should give higher priority to more accessed items', () => {
            const lowAccess: CacheIndexItem = {
                hash: 'low',
                source: 'test',
                type: 'response',
                cachedAt: new Date().toISOString(),
                lastAccessedAt: new Date().toISOString(),
                sizeBytes: 100,
                accessCount: 1,
            };
            const highAccess: CacheIndexItem = {
                hash: 'high',
                source: 'test',
                type: 'response',
                cachedAt: new Date().toISOString(),
                lastAccessedAt: new Date().toISOString(),
                sizeBytes: 100,
                accessCount: 10,
            };

            expect(calculateRefreshPriority(highAccess)).toBeGreaterThan(
                calculateRefreshPriority(lowAccess)
            );
        });

        it('Test 16: should give higher priority to smaller items', () => {
            const large: CacheIndexItem = {
                hash: 'large',
                source: 'test',
                type: 'response',
                cachedAt: new Date().toISOString(),
                lastAccessedAt: new Date().toISOString(),
                sizeBytes: 50 * 1024 * 1024,  // 50MB
                accessCount: 1,
            };
            const small: CacheIndexItem = {
                hash: 'small',
                source: 'test',
                type: 'response',
                cachedAt: new Date().toISOString(),
                lastAccessedAt: new Date().toISOString(),
                sizeBytes: 1024,  // 1KB
                accessCount: 1,
            };

            expect(calculateRefreshPriority(small)).toBeGreaterThan(
                calculateRefreshPriority(large)
            );
        });

        it('Test 17: should use cachedAt when lastAccessedAt is missing', () => {
            const item: CacheIndexItem = {
                hash: 'no-access',
                source: 'test',
                type: 'response',
                cachedAt: new Date().toISOString(),
                lastAccessedAt: undefined,  // No lastAccessedAt
                sizeBytes: 100,
                accessCount: 0,
            };

            // Should not throw when calculating priority
            const priority = calculateRefreshPriority(item);
            expect(priority).toBeGreaterThan(0);
        });
    });

    describe('Staleness detection', () => {
        it('Test 18: should mark fresh items as not stale', () => {
            const freshItem: CacheIndexItem = {
                hash: 'fresh',
                source: 'test',
                type: 'response',
                cachedAt: new Date().toISOString(),
                lastAccessedAt: undefined,
                sizeBytes: 10,
                accessCount: 0,
            };

            expect(isItemStale(freshItem)).toBe(false);
        });

        it('Test 19: should allow custom staleness threshold', () => {
            // Item cached 1 hour ago
            const item: CacheIndexItem = {
                hash: 'one-hour-old',
                source: 'test',
                type: 'response',
                cachedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                lastAccessedAt: undefined,
                sizeBytes: 10,
                accessCount: 0,
            };

            // Not stale with default 24-hour threshold
            expect(isItemStale(item, DEFAULT_STALENESS_THRESHOLD)).toBe(false);
            
            // Stale with 30-minute threshold
            expect(isItemStale(item, 30 * 60 * 1000)).toBe(true);
        });
    });

    describe('Constants', () => {
        it('Test 20: should export DEFAULT_STALENESS_THRESHOLD as 24 hours', () => {
            expect(DEFAULT_STALENESS_THRESHOLD).toBe(24 * 60 * 60 * 1000);
        });

        it('Test 21: should export MAX_CONCURRENT_REFRESHES as 3', () => {
            expect(MAX_CONCURRENT_REFRESHES).toBe(3);
        });
    });

    describe('refresh callback error message', () => {
        it('Test 22: should use Unknown error when callback returns success false without error', async () => {
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

            // Return success: false but no error message
            const refreshCallback = jest.fn().mockResolvedValue({ success: false });
            const result = await refreshStaleItems(context, refreshCallback, DEFAULT_STALENESS_THRESHOLD, 1);

            expect(result.itemsFailed).toBe(1);
            expect(result.errors[0]).toContain('Unknown error');
        });
    });
});
