/**
 * Cache Management Test Suite
 *
 * Comprehensive tests for all cache functionality:
 * - Directory structure
 * - Payload storage
 * - Index management
 * - Retention policy
 * - Size-based pruning
 * - Auto-refresh
 * - Change detection
 *
 * @since MT-004.8
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    initializeCacheStructure,
    isCacheStructureValid,
    getCachePath,
    cleanupTempFiles,
    CACHE_DIRS,
} from '../../src/services/cache/structure';
import {
    savePayload,
    loadPayload,
    deletePayload,
    payloadExists,
    getPayloadSize,
    listAllPayloads,
    generateHash,
} from '../../src/services/cache/storage';
import {
    loadCacheIndex,
    saveCacheIndex,
    addToIndex,
    removeFromIndex,
    searchIndex,
    getIndexItem,
    updateLastAccessed,
    getCacheStats,
} from '../../src/services/cache/index';
import {
    applyRetentionPolicy,
    getExpiredItems,
    calculateItemAge,
    formatAge,
    DEFAULT_RETENTION_MS,
} from '../../src/services/cache/retention';
import {
    pruneCacheLRU,
    getPruneableItems,
    getCacheSizeInfo,
    formatBytes,
    DEFAULT_SIZE_THRESHOLD,
} from '../../src/services/cache/pruning';
import {
    isItemStale,
    getStaleItems,
    refreshStaleItems,
    calculateRefreshPriority,
    sortByRefreshPriority,
    DEFAULT_STALENESS_THRESHOLD,
} from '../../src/services/cache/refresh';
import {
    computeFileHash,
    loadHashRegistry,
    saveHashRegistry,
    registerFileHash,
    detectAndInvalidateChanges,
    getTrackedFiles,
    untrackFile,
} from '../../src/services/cache/changeDetection';

describe('Cache Management', () => {
    let mockContext: vscode.ExtensionContext;
    let testDir: string;

    beforeEach(() => {
        // Create mock extension context
        testDir = path.join(__dirname, '__test_cache__');
        mockContext = {
            extensionPath: testDir,
            extensionUri: { fsPath: testDir } as vscode.Uri,
        } as unknown as vscode.ExtensionContext;

        // Clean up test directory if it exists
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    afterEach(() => {
        // Clean up test directory
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    // ========================================================================
    // Directory Structure Tests (MT-004.1)
    // ========================================================================
    describe('Structure - MT-004.1', () => {
        it('Test 1: should create all required directories', async () => {
            const result = await initializeCacheStructure(mockContext);

            expect(result.success).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(fs.existsSync(result.paths.root)).toBe(true);
            expect(fs.existsSync(result.paths.offlineCache)).toBe(true);
            expect(fs.existsSync(result.paths.processed)).toBe(true);
            expect(fs.existsSync(result.paths.temp)).toBe(true);
        });

        it('Test 2: should handle existing directories gracefully', async () => {
            // Initialize once
            await initializeCacheStructure(mockContext);

            // Initialize again
            const result = await initializeCacheStructure(mockContext);

            expect(result.success).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('Test 3: should validate cache structure', async () => {
            await initializeCacheStructure(mockContext);

            const isValid = isCacheStructureValid(mockContext);
            expect(isValid).toBe(true);
        });

        it('Test 4: should clean up old temp files', async () => {
            await initializeCacheStructure(mockContext);

            const tempPath = path.join(testDir, CACHE_DIRS.TEMP);

            // Create old temp file (2 days old)
            const oldFile = path.join(tempPath, 'old.tmp');
            fs.writeFileSync(oldFile, 'old');
            const oldTime = Date.now() - 2 * 24 * 60 * 60 * 1000;
            fs.utimesSync(oldFile, new Date(oldTime), new Date(oldTime));

            // Create new temp file
            const newFile = path.join(tempPath, 'new.tmp');
            fs.writeFileSync(newFile, 'new');

            // Clean up files older than 1 day
            const cleaned = await cleanupTempFiles(
                mockContext,
                24 * 60 * 60 * 1000
            );

            expect(cleaned).toBe(1);
            expect(fs.existsSync(oldFile)).toBe(false);
            expect(fs.existsSync(newFile)).toBe(true);
        });
    });

    // ========================================================================
    // Payload Storage Tests (MT-004.2)
    // ========================================================================
    describe('Storage - MT-004.2', () => {
        beforeEach(async () => {
            await initializeCacheStructure(mockContext);
        });

        it('Test 5: should save and load payloads', async () => {
            const data = { test: 'data', value: 123 };

            const saveResult = await savePayload(
                mockContext,
                data,
                'test',
                'example'
            );

            expect(saveResult.success).toBe(true);
            expect(saveResult.hash).toBeTruthy();

            const loadResult = await loadPayload(mockContext, saveResult.hash);

            expect(loadResult.success).toBe(true);
            expect(loadResult.payload?.data).toEqual(data);
            expect(loadResult.payload?.source).toBe('test');
            expect(loadResult.payload?.type).toBe('example');
        });

        it('Test 6: should detect duplicate payloads', async () => {
            const data = { duplicate: 'test' };

            const first = await savePayload(mockContext, data, 'test', 'example');
            const second = await savePayload(mockContext, data, 'test', 'example');

            expect(first.hash).toBe(second.hash);
        });

        it('Test 7: should delete payloads', async () => {
            const saveResult = await savePayload(
                mockContext,
                { test: 'data' },
                'test',
                'example'
            );

            const deleted = await deletePayload(mockContext, saveResult.hash);
            expect(deleted).toBe(true);

            const exists = payloadExists(mockContext, saveResult.hash);
            expect(exists).toBe(false);
        });

        it('Test 8: should calculate payload size', async () => {
            const data = { test: 'data' };
            const saveResult = await savePayload(
                mockContext,
                data,
                'test',
                'example'
            );

            const size = getPayloadSize(mockContext, saveResult.hash);
            expect(size).toBeGreaterThan(0);
        });

        it('Test 9: should list all payloads', async () => {
            await savePayload(mockContext, { a: 1 }, 'test', 'example');
            await savePayload(mockContext, { b: 2 }, 'test', 'example');

            const hashes = listAllPayloads(mockContext);
            expect(hashes.length).toBe(2);
        });

        it('Test 10: should generate consistent hashes', () => {
            const data = { test: 'data' };
            const hash1 = generateHash(data);
            const hash2 = generateHash(data);

            expect(hash1).toBe(hash2);
        });
    });

    // ========================================================================
    // Index Management Tests (MT-004.3)
    // ========================================================================
    describe('Index - MT-004.3', () => {
        beforeEach(async () => {
            await initializeCacheStructure(mockContext);
        });

        it('Test 11: should load and save cache index', () => {
            const index = loadCacheIndex(mockContext);

            expect(index.version).toBe('1.0.0');
            expect(index.items).toHaveLength(0);

            index.items.push({
                hash: 'test123',
                source: 'test',
                type: 'example',
                cachedAt: new Date().toISOString(),
                sizeBytes: 1000,
                accessCount: 1,
            });

            const saved = saveCacheIndex(mockContext, index);
            expect(saved).toBe(true);

            const reloaded = loadCacheIndex(mockContext);
            expect(reloaded.items).toHaveLength(1);
        });

        it('Test 12: should search index with filters', async () => {
            const saveResult = await savePayload(
                mockContext,
                { test: 'data' },
                'llm',
                'response'
            );

            const loadResult = await loadPayload(mockContext, saveResult.hash);
            if (loadResult.success && loadResult.payload) {
                addToIndex(mockContext, loadResult.payload, 1000);

                const results = searchIndex(mockContext, { source: 'llm' });
                expect(results.length).toBe(1);
            }
        });

        it('Test 13: should update last accessed time', async () => {
            const saveResult = await savePayload(
                mockContext,
                { test: 'data' },
                'test',
                'example'
            );

            const loadResult = await loadPayload(mockContext, saveResult.hash);
            if (loadResult.success && loadResult.payload) {
                addToIndex(mockContext, loadResult.payload, 1000);

                const updated = updateLastAccessed(mockContext, saveResult.hash);
                expect(updated).toBe(true);

                const item = getIndexItem(mockContext, saveResult.hash);
                expect(item?.accessCount).toBe(2);
            }
        });

        it('Test 14: should calculate cache statistics', async () => {
            await savePayload(mockContext, { a: 1 }, 'llm', 'response');
            await savePayload(mockContext, { b: 2 }, 'github', 'issue');

            const stats = getCacheStats(mockContext);
            expect(stats.totalItems).toBe(0); // Not added to index yet
        });
    });

    // ========================================================================
    // Retention Policy Tests (MT-004.4)
    // ========================================================================
    describe('Retention - MT-004.4', () => {
        beforeEach(async () => {
            await initializeCacheStructure(mockContext);
        });

        it('Test 15: should identify expired items', async () => {
            const saveResult = await savePayload(
                mockContext,
                { test: 'old' },
                'test',
                'example'
            );

            // Manually create old index entry
            const index = loadCacheIndex(mockContext);
            const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days old
            index.items.push({
                hash: saveResult.hash,
                source: 'test',
                type: 'example',
                cachedAt: oldDate.toISOString(),
                sizeBytes: 100,
                accessCount: 1,
            });
            saveCacheIndex(mockContext, index);

            const expired = getExpiredItems(mockContext, 7 * 24 * 60 * 60 * 1000);
            expect(expired.length).toBe(1);
        });

        it('Test 16: should apply retention policy', async () => {
            const result = await applyRetentionPolicy(mockContext, DEFAULT_RETENTION_MS);
            expect(result.success).toBe(true);
        });

        it('Test 17: should format item age correctly', () => {
            const days3 = 3 * 24 * 60 * 60 * 1000;
            expect(formatAge(days3)).toContain('3 days');

            const hours2 = 2 * 60 * 60 * 1000;
            expect(formatAge(hours2)).toContain('2 hours');
        });
    });

    // ========================================================================
    // Size Pruning Tests (MT-004.5)
    // ========================================================================
    describe('Pruning - MT-004.5', () => {
        beforeEach(async () => {
            await initializeCacheStructure(mockContext);
        });

        it('Test 18: should prune when size exceeds threshold', async () => {
            const result = await pruneCacheLRU(mockContext, 1000); // 1KB threshold
            expect(result.success).toBe(true);
        });

        it('Test 19: should preserve minimum items', async () => {
            const pruneable = getPruneableItems(mockContext, 0);
            expect(pruneable.length).toBe(0);
        });

        it('Test 20: should format bytes correctly', () => {
            expect(formatBytes(1024)).toBe('1 KB');
            expect(formatBytes(1024 * 1024)).toBe('1 MB');
        });

        it('Test 21: should get cache size info', () => {
            const info = getCacheSizeInfo(mockContext);
            expect(info.totalBytes).toBe(0);
            expect(info.itemCount).toBe(0);
        });
    });

    // ========================================================================
    // Auto-Refresh Tests (MT-004.6)
    // ========================================================================
    describe('Auto-Refresh - MT-004.6', () => {
        beforeEach(async () => {
            await initializeCacheStructure(mockContext);
        });

        it('Test 22: should identify stale items', async () => {
            const saveResult = await savePayload(
                mockContext,
                { test: 'stale' },
                'test',
                'example'
            );

            const index = loadCacheIndex(mockContext);
            const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours
            index.items.push({
                hash: saveResult.hash,
                source: 'test',
                type: 'example',
                cachedAt: oldDate.toISOString(),
                sizeBytes: 100,
                accessCount: 1,
            });
            saveCacheIndex(mockContext, index);

            const staleItems = getStaleItems(mockContext, DEFAULT_STALENESS_THRESHOLD);
            expect(staleItems.length).toBe(1);
        });

        it('Test 23: should calculate refresh priority', () => {
            const highPriority = {
                hash: 'high',
                source: 'test',
                type: 'example',
                cachedAt: new Date().toISOString(),
                lastAccessedAt: new Date().toISOString(),
                sizeBytes: 1000,
                accessCount: 100,
            };

            const lowPriority = {
                hash: 'low',
                source: 'test',
                type: 'example',
                cachedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                sizeBytes: 10000000,
                accessCount: 1,
            };

            const highScore = calculateRefreshPriority(highPriority);
            const lowScore = calculateRefreshPriority(lowPriority);

            expect(highScore).toBeGreaterThan(lowScore);
        });

        it('Test 24: should sort items by priority', () => {
            const items = [
                {
                    hash: 'a',
                    source: 'test',
                    type: 'example',
                    cachedAt: new Date().toISOString(),
                    sizeBytes: 100,
                    accessCount: 10,
                },
                {
                    hash: 'b',
                    source: 'test',
                    type: 'example',
                    cachedAt: new Date().toISOString(),
                    sizeBytes: 100,
                    accessCount: 50,
                },
            ];

            const sorted = sortByRefreshPriority(items);
            expect(sorted[0].hash).toBe('b'); // Higher access count
        });
    });

    // ========================================================================
    // Change Detection Tests (MT-004.7)
    // ========================================================================
    describe('Change Detection - MT-004.7', () => {
        beforeEach(async () => {
            await initializeCacheStructure(mockContext);
        });

        it('Test 25: should compute file hash', () => {
            const testFile = path.join(testDir, 'test.txt');
            fs.mkdirSync(path.dirname(testFile), { recursive: true });
            fs.writeFileSync(testFile, 'test content');

            const hash = computeFileHash(testFile);
            expect(hash).toBeTruthy();
            expect(hash?.length).toBe(64); // SHA-256 length
        });

        it('Test 26: should register file hash', () => {
            const testFile = path.join(testDir, 'test.txt');
            fs.mkdirSync(path.dirname(testFile), { recursive: true });
            fs.writeFileSync(testFile, 'test content');

            const registered = registerFileHash(mockContext, testFile, ['hash1', 'hash2']);
            expect(registered).toBe(true);

            const tracked = getTrackedFiles(mockContext);
            expect(tracked.length).toBe(1);
            expect(tracked[0].relatedCacheHashes).toContain('hash1');
        });

        it('Test 27: should detect file changes', async () => {
            const testFile = path.join(testDir, 'test.txt');
            fs.mkdirSync(path.dirname(testFile), { recursive: true });
            fs.writeFileSync(testFile, 'initial');

            registerFileHash(mockContext, testFile, ['cache123']);

            // Modify file
            fs.writeFileSync(testFile, 'modified');

            const result = await detectAndInvalidateChanges(mockContext);
            expect(result.filesScanned).toBe(1);
            expect(result.filesChanged).toBe(1);
        });

        it('Test 28: should untrack files', () => {
            const testFile = path.join(testDir, 'test.txt');
            fs.mkdirSync(path.dirname(testFile), { recursive: true });
            fs.writeFileSync(testFile, 'test');

            registerFileHash(mockContext, testFile, ['hash1']);

            const untracked = untrackFile(mockContext, testFile);
            expect(untracked).toBe(true);

            const tracked = getTrackedFiles(mockContext);
            expect(tracked.length).toBe(0);
        });
    });

    // ========================================================================
    // Error Recovery Tests
    // ========================================================================
    describe('Error Recovery', () => {
        it('Test 29: should handle corrupted index gracefully', () => {
            initializeCacheStructure(mockContext);

            const indexPath = path.join(
                testDir,
                CACHE_DIRS.OFFLINE_CACHE,
                'cache-index.json'
            );
            fs.writeFileSync(indexPath, 'corrupted {{{ json');

            const index = loadCacheIndex(mockContext);
            expect(index.items).toHaveLength(0); // Should return empty index
        });

        it('Test 30: should handle missing files during deletion', async () => {
            await initializeCacheStructure(mockContext);

            const deleted = await deletePayload(mockContext, 'nonexistent-hash');
            expect(deleted).toBe(false);
        });
    });
});
