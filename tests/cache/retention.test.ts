import { ExtensionContext } from '../__mocks__/vscode';
import type { CacheIndexItem } from '../../src/services/cache/index';
import {
    applyRetentionPolicy,
    calculateItemAge,
    DEFAULT_RETENTION_MS,
    formatAge,
    getExpiredItems,
    scheduleRetentionCleanup,
} from '../../src/services/cache/retention';
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
    saveCacheIndex: jest.fn(),
}));

jest.mock('../../src/services/cache/storage', () => ({
    deletePayload: jest.fn(),
}));

describe('Cache Retention', () => {
    const loadCacheIndexMock = loadCacheIndex as jest.MockedFunction<typeof loadCacheIndex>;
    const removeFromIndexMock = removeFromIndex as jest.MockedFunction<typeof removeFromIndex>;
    const deletePayloadMock = deletePayload as jest.MockedFunction<typeof deletePayload>;
    let context: ExtensionContext;

    beforeEach(() => {
        jest.clearAllMocks();
        context = new ExtensionContext('/mock/extension/path');
    });

    it('Test 1: should return expired item hashes', () => {
        const now = Date.now();
        const expiredItem: CacheIndexItem = {
            hash: 'old',
            source: 'test',
            type: 'response',
            cachedAt: new Date(now - DEFAULT_RETENTION_MS - 1000).toISOString(),
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
            items: [expiredItem],
        });

        const result = getExpiredItems(context);

        expect(result).toEqual(['old']);
    });

    it('Test 2: should handle errors when getting expired items', () => {
        loadCacheIndexMock.mockImplementation(() => {
            throw new Error('load failure');
        });

        const result = getExpiredItems(context);

        expect(result).toEqual([]);
    });

    it('Test 3: should apply retention policy and delete expired items', async () => {
        const now = Date.now();
        const expiredItem: CacheIndexItem = {
            hash: 'old',
            source: 'test',
            type: 'response',
            cachedAt: new Date(now - DEFAULT_RETENTION_MS - 1000).toISOString(),
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
            items: [expiredItem],
        });

        deletePayloadMock.mockResolvedValue(true);

        const result = await applyRetentionPolicy(context);

        expect(result.itemsDeleted).toBe(1);
        expect(removeFromIndexMock).toHaveBeenCalledWith(context, 'old');
    });

    it('Test 4: should report errors when deletion fails', async () => {
        const now = Date.now();
        const expiredItem: CacheIndexItem = {
            hash: 'old',
            source: 'test',
            type: 'response',
            cachedAt: new Date(now - DEFAULT_RETENTION_MS - 1000).toISOString(),
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
            items: [expiredItem],
        });

        deletePayloadMock.mockResolvedValue(false);

        const result = await applyRetentionPolicy(context);

        expect(result.success).toBe(false);
        expect(result.errors[0]).toContain('Failed to delete');
    });

    it('Test 5: should schedule retention cleanup', () => {
        jest.useFakeTimers();
        const setIntervalSpy = jest.spyOn(global, 'setInterval');

        const timer = scheduleRetentionCleanup(context, DEFAULT_RETENTION_MS, 5);

        jest.advanceTimersByTime(5);

        expect(setIntervalSpy).toHaveBeenCalled();
        clearInterval(timer);
        setIntervalSpy.mockRestore();
        jest.useRealTimers();
    });

    it('Test 6: should format cache item ages', () => {
        expect(formatAge(24 * 60 * 60 * 1000)).toBe('1 day');
        expect(formatAge(2 * 60 * 60 * 1000)).toBe('2 hours');
        expect(formatAge(10 * 60 * 1000)).toBe('10 minutes');
    });

    it('Test 7: should calculate cache item age', () => {
        const age = calculateItemAge(new Date(Date.now() - 5000).toISOString());

        expect(age).toBeGreaterThan(0);
    });
});
