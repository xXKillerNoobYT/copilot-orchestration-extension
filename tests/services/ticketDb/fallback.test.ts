/**
 * Tests for Fallback & Persistence (MT-008)
 *
 * Covers: MT-008.1 through MT-008.10
 * - Error classification and fallback (MT-008.1, MT-008.2, MT-008.3)
 * - Recovery persistence (MT-008.4, MT-008.5)
 * - Fallback mode indicator / status (MT-008.6)
 * - Graceful degradation (MT-008.7)
 * - Error notification tickets (MT-008.8)
 * - Restore from fallback (MT-008.9)
 * - Comprehensive scenarios (MT-008.10)
 *
 * @since MT-008
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('fs');

import * as fs from 'fs';

// ─── MT-008.1 / 008.2 / 008.3 / 008.7: Fallback Module ──────────────────

import {
    classifyError,
    withFallback,
    getDegradedFeatures,
    isFeatureDegraded,
    getStatusMessage,
    createFallbackTrigger,
    shouldAttemptRestore,
    DEGRADATION_RULES,
    FallbackTrigger,
} from '../../../src/services/ticketDb/fallback';

// ─── MT-008.6: Status Module ─────────────────────────────────────────────

import {
    DbStatusManager,
    getDbStatusManager,
    initializeDbStatus,
    resetDbStatusForTests,
} from '../../../src/services/ticketDb/status';

// ─── MT-008.4 / 008.5: Recovery Module ───────────────────────────────────

import {
    RecoveryManager,
    loadRecoveryTickets,
    hasUsableRecovery,
    resetRecoveryManagerForTests,
} from '../../../src/services/ticketDb/recovery';

// ─── MT-008.8: Error Tickets Module ──────────────────────────────────────

import {
    createErrorTicket,
    getErrorTitle,
    buildErrorDescription,
    getSuggestedActions,
    getErrorPriority,
    shouldCreateTicket,
    resetErrorTicketCounterForTests,
} from '../../../src/services/ticketDb/errorTickets';

// ─── MT-008.9: Restore Module ────────────────────────────────────────────

import {
    checkRestoreEligibility,
    prepareTicketsForMigration,
    executeRestore,
    RestoreMonitor,
} from '../../../src/services/ticketDb/restore';

const mockFs = fs as jest.Mocked<typeof fs>;

describe('Fallback & Persistence (MT-008)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetDbStatusForTests();
        resetRecoveryManagerForTests();
        resetErrorTicketCounterForTests();
    });

    // ═══════════════════════════════════════════════════════════════════════
    // MT-008.1: SQLITE_BUSY Detection and Retry
    // ═══════════════════════════════════════════════════════════════════════

    describe('SQLITE_BUSY Detection (MT-008.1)', () => {
        it('Test 1: should classify SQLITE_BUSY as retryable', () => {
            const result = classifyError(new Error('SQLITE_BUSY: database is locked'));
            expect(result.category).toBe('busy');
            expect(result.retryable).toBe(true);
            expect(result.triggersFallback).toBe(false);
        });

        it('Test 2: should classify "database is locked" as busy', () => {
            const result = classifyError(new Error('database is locked'));
            expect(result.category).toBe('busy');
            expect(result.retryable).toBe(true);
        });

        it('Test 3: should retry busy errors in withFallback', async () => {
            let callCount = 0;
            const operation = async () => {
                callCount++;
                if (callCount < 3) {
                    throw new Error('SQLITE_BUSY');
                }
                return 'success';
            };

            const result = await withFallback(operation, undefined, {
                maxRetries: 5,
                baseDelayMs: 1,
                maxDelayMs: 5,
                jitter: false,
            });

            expect(result.value).toBe('success');
            expect(result.usedFallback).toBe(false);
            expect(callCount).toBe(3);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // MT-008.2: SQLITE_FULL Detection and Fallback
    // ═══════════════════════════════════════════════════════════════════════

    describe('SQLITE_FULL Detection (MT-008.2)', () => {
        it('Test 4: should classify SQLITE_FULL as non-retryable, triggers fallback', () => {
            const result = classifyError(new Error('SQLITE_FULL: database or disk is full'));
            expect(result.category).toBe('full');
            expect(result.retryable).toBe(false);
            expect(result.triggersFallback).toBe(true);
        });

        it('Test 5: should classify "database or disk is full" as full', () => {
            const result = classifyError(new Error('database or disk is full'));
            expect(result.category).toBe('full');
            expect(result.triggersFallback).toBe(true);
        });

        it('Test 6: should use fallback operation on SQLITE_FULL', async () => {
            const operation = async () => {
                throw new Error('SQLITE_FULL');
            };
            const fallbackOp = async () => 'fallback-value';

            const result = await withFallback(operation, fallbackOp, {
                maxRetries: 0,
                baseDelayMs: 1,
            });

            expect(result.value).toBe('fallback-value');
            expect(result.usedFallback).toBe(true);
            expect(result.fallbackReason).toContain('disk is full');
        });

        it('Test 7: should handle fallback operation failure', async () => {
            const operation = async () => {
                throw new Error('SQLITE_FULL');
            };
            const fallbackOp = async (): Promise<string> => {
                throw new Error('Fallback also failed');
            };

            const result = await withFallback(operation, fallbackOp, {
                maxRetries: 0,
                baseDelayMs: 1,
            });

            expect(result.failed).toBe(true);
            expect(result.usedFallback).toBe(true);
            expect(result.errors).toContain('Fallback also failed');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // MT-008.3: EACCES Permission Error Handling
    // ═══════════════════════════════════════════════════════════════════════

    describe('EACCES Permission Handling (MT-008.3)', () => {
        it('Test 8: should classify EACCES as permission error', () => {
            const result = classifyError(new Error('EACCES: permission denied'));
            expect(result.category).toBe('permission');
            expect(result.retryable).toBe(false);
            expect(result.triggersFallback).toBe(true);
        });

        it('Test 9: should classify "access denied" as permission error', () => {
            const result = classifyError(new Error('access denied to file'));
            expect(result.category).toBe('permission');
        });

        it('Test 10: should classify corruption errors', () => {
            const result = classifyError(new Error('database disk image is malformed'));
            expect(result.category).toBe('corruption');
            expect(result.triggersFallback).toBe(true);
        });

        it('Test 11: should classify unknown errors', () => {
            const result = classifyError(new Error('something random went wrong'));
            expect(result.category).toBe('unknown');
            expect(result.retryable).toBe(false);
            expect(result.triggersFallback).toBe(false);
        });

        it('Test 12: should handle non-Error objects', () => {
            const result = classifyError('EACCES: permission denied');
            expect(result.category).toBe('permission');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // MT-008.4: Recovery.json Persistence
    // ═══════════════════════════════════════════════════════════════════════

    describe('Recovery Persistence (MT-008.4)', () => {
        it('Test 13: should create recovery manager with default config', () => {
            const manager = new RecoveryManager();
            expect(manager.isActive()).toBe(false);
            expect(manager.getStats().saveCount).toBe(0);
        });

        it('Test 14: should start and stop recovery manager', async () => {
            const manager = new RecoveryManager({ autoSaveEnabled: false });
            const ticketProvider = () => [{ id: 'TK-0001', title: 'Test' }];

            manager.start(ticketProvider);
            expect(manager.isActive()).toBe(true);

            await manager.stop();
            expect(manager.isActive()).toBe(false);
        });

        it('Test 15: should not start twice', () => {
            const manager = new RecoveryManager({ autoSaveEnabled: false });
            manager.start(() => []);
            manager.start(() => []); // Should log warning, not error
            expect(manager.isActive()).toBe(true);
            manager.stop();
        });

        it('Test 16: should perform manual save', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.writeFileSync.mockReturnValue(undefined);
            mockFs.renameSync.mockReturnValue(undefined);

            const manager = new RecoveryManager({
                autoSaveEnabled: false,
                recoveryPath: '/path/recovery.json',
            });
            const tickets = [{ id: 'TK-0001', title: 'Test' }];
            manager.start(() => tickets);

            const result = await manager.saveNow();
            expect(result).toBe(true);
            expect(manager.getStats().saveCount).toBe(1);

            await manager.stop();
        });

        it('Test 17: should load recovery tickets from file', () => {
            const data = {
                tickets: [
                    { id: 'TK-0001', title: 'Recovered ticket' },
                ],
                timestamp: '2026-02-05T10:00:00Z',
            };
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify(data));

            const tickets = loadRecoveryTickets('/path/recovery.json');
            expect(tickets).toHaveLength(1);
            expect(tickets[0].id).toBe('TK-0001');
        });

        it('Test 18: should return empty array when no recovery data', () => {
            mockFs.existsSync.mockReturnValue(false);

            const tickets = loadRecoveryTickets('/path/recovery.json');
            expect(tickets).toHaveLength(0);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // MT-008.5: Automatic Reload from Recovery
    // ═══════════════════════════════════════════════════════════════════════

    describe('Automatic Reload from Recovery (MT-008.5)', () => {
        it('Test 19: should detect usable recovery data', () => {
            const data = {
                tickets: [{ id: 'TK-0001' }],
                timestamp: new Date().toISOString(),
            };
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify(data));

            expect(hasUsableRecovery('/path/recovery.json')).toBe(true);
        });

        it('Test 20: should reject expired recovery data', () => {
            const data = {
                tickets: [{ id: 'TK-0001' }],
                timestamp: '2020-01-01T00:00:00Z', // Very old
            };
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify(data));

            expect(hasUsableRecovery('/path/recovery.json')).toBe(false);
        });

        it('Test 21: should reject empty recovery data', () => {
            const data = {
                tickets: [],
                timestamp: new Date().toISOString(),
            };
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify(data));

            expect(hasUsableRecovery('/path/recovery.json')).toBe(false);
        });

        it('Test 22: should handle missing recovery file', () => {
            mockFs.existsSync.mockReturnValue(false);
            expect(hasUsableRecovery('/path/recovery.json')).toBe(false);
        });

        it('Test 23: should load recovery data from manager', () => {
            const data = {
                tickets: [
                    { id: 'TK-0001', title: 'Test' },
                    { id: 'TK-0002', title: 'Test 2' },
                ],
                timestamp: '2026-02-05T10:00:00Z',
            };
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify(data));

            const manager = new RecoveryManager({ recoveryPath: '/path/recovery.json' });
            const snapshot = manager.loadRecovery();
            expect(snapshot).not.toBeNull();
            expect(snapshot!.ticketCount).toBe(2);
            expect(snapshot!.validated).toBe(true);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // MT-008.6: Fallback Mode Indicator (Status)
    // ═══════════════════════════════════════════════════════════════════════

    describe('Fallback Mode Indicator (MT-008.6)', () => {
        it('Test 24: should initialize with sqlite mode', () => {
            const manager = new DbStatusManager('sqlite', '/db.sqlite', 'Test');
            const status = manager.getStatus();
            expect(status.mode).toBe('sqlite');
            expect(status.health).toBe('healthy');
            expect(status.isFallback).toBe(false);
            expect(status.transitionCount).toBe(0);
        });

        it('Test 25: should transition to memory mode', () => {
            const manager = new DbStatusManager('sqlite', '/db.sqlite', 'Initial');
            manager.transitionTo('memory', 'SQLITE_FULL', null, 'disk full');

            const status = manager.getStatus();
            expect(status.mode).toBe('memory');
            expect(status.health).toBe('degraded');
            expect(status.isFallback).toBe(true);
            expect(status.transitionCount).toBe(1);
            expect(status.lastError).toBe('disk full');
            expect(status.reason).toBe('SQLITE_FULL');
        });

        it('Test 26: should transition to recovery mode', () => {
            const manager = new DbStatusManager('memory', null, 'Fallback');
            manager.transitionTo('recovery', 'Loading from backup');

            const status = manager.getStatus();
            expect(status.mode).toBe('recovery');
            expect(status.health).toBe('critical');
        });

        it('Test 27: should not count duplicate transitions', () => {
            const manager = new DbStatusManager('sqlite', '/db.sqlite', 'Test');
            manager.transitionTo('sqlite', 'Same mode', '/db.sqlite');

            expect(manager.getStatus().transitionCount).toBe(0);
        });

        it('Test 28: should notify listeners on transition', () => {
            const manager = new DbStatusManager('sqlite', '/db.sqlite', 'Test');
            const statuses: string[] = [];

            manager.onStatusChange(status => statuses.push(status.mode));
            manager.transitionTo('memory', 'Test fallback');

            expect(statuses).toEqual(['memory']);
        });

        it('Test 29: should unsubscribe listeners', () => {
            const manager = new DbStatusManager('sqlite', '/db.sqlite', 'Test');
            const statuses: string[] = [];

            const unsubscribe = manager.onStatusChange(status => statuses.push(status.mode));
            manager.transitionTo('memory', 'First');
            unsubscribe();
            manager.transitionTo('sqlite', 'Second', '/db.sqlite');

            expect(statuses).toEqual(['memory']); // Only first transition
        });

        it('Test 30: should report feature availability per mode', () => {
            const manager = new DbStatusManager('sqlite', '/db.sqlite', 'Test');
            expect(manager.isFeatureAvailable('search')).toBe(true);
            expect(manager.isFeatureAvailable('crud')).toBe(true);

            manager.transitionTo('memory', 'Fallback');
            expect(manager.isFeatureAvailable('search')).toBe(false);
            expect(manager.isFeatureAvailable('crud')).toBe(true);
            expect(manager.isFeatureAvailable('persistence')).toBe(false);
        });

        it('Test 31: should use singleton pattern', () => {
            const sm1 = initializeDbStatus('sqlite', '/db.sqlite', 'Test');
            const sm2 = getDbStatusManager();
            expect(sm1).toBe(sm2);
        });

        it('Test 32: should return status snapshot (not reference)', () => {
            const manager = new DbStatusManager('sqlite', '/db.sqlite', 'Test');
            const s1 = manager.getStatus();
            manager.transitionTo('memory', 'Change');
            const s2 = manager.getStatus();
            expect(s1.mode).toBe('sqlite');
            expect(s2.mode).toBe('memory');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // MT-008.7: Graceful Degradation
    // ═══════════════════════════════════════════════════════════════════════

    describe('Graceful Degradation (MT-008.7)', () => {
        it('Test 33: should return no degraded features in sqlite mode', () => {
            const degraded = getDegradedFeatures('sqlite');
            expect(degraded).toHaveLength(0);
        });

        it('Test 34: should return degraded features in memory mode', () => {
            const degraded = getDegradedFeatures('memory');
            expect(degraded.length).toBeGreaterThan(0);
            expect(degraded.some(d => d.feature === 'fullTextSearch')).toBe(true);
            expect(degraded.some(d => d.feature === 'dataPersistence')).toBe(true);
        });

        it('Test 35: should check specific feature degradation', () => {
            expect(isFeatureDegraded('fullTextSearch', 'sqlite')).toBe(false);
            expect(isFeatureDegraded('fullTextSearch', 'memory')).toBe(true);
            expect(isFeatureDegraded('connectionPooling', 'memory')).toBe(true);
        });

        it('Test 36: should have degradation rules for all key features', () => {
            expect(DEGRADATION_RULES.length).toBeGreaterThanOrEqual(4);
            const featureNames = DEGRADATION_RULES.map(r => r.feature);
            expect(featureNames).toContain('fullTextSearch');
            expect(featureNames).toContain('connectionPooling');
            expect(featureNames).toContain('dataPersistence');
        });

        it('Test 37: should provide user-friendly status messages', () => {
            expect(getStatusMessage('sqlite')).toContain('normally');
            expect(getStatusMessage('memory')).toContain('memory mode');
            expect(getStatusMessage('recovery')).toContain('recovery mode');
        });

        it('Test 38: should have messages for all degradation rules', () => {
            for (const rule of DEGRADATION_RULES) {
                expect(rule.message.length).toBeGreaterThan(10);
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // MT-008.8: Error Notification Tickets
    // ═══════════════════════════════════════════════════════════════════════

    describe('Error Notification Tickets (MT-008.8)', () => {
        it('Test 39: should create error ticket for SQLITE_FULL', () => {
            const ticket = createErrorTicket('SQLITE_FULL', 'full', 'During createTicket');
            expect(ticket.id).toBe('ERR-001');
            expect(ticket.status).toBe('open');
            expect(ticket.type).toBe('ai_to_human');
            expect(ticket.priority).toBe(1); // Critical
            expect(ticket.title).toContain('disk full');
        });

        it('Test 40: should create error ticket for permission error', () => {
            const ticket = createErrorTicket('EACCES', 'permission');
            expect(ticket.id).toBe('ERR-001');
            expect(ticket.priority).toBe(2);
            expect(ticket.title).toContain('permission');
        });

        it('Test 41: should increment error ticket IDs', () => {
            const t1 = createErrorTicket('Error 1', 'full');
            const t2 = createErrorTicket('Error 2', 'permission');
            expect(t1.id).toBe('ERR-001');
            expect(t2.id).toBe('ERR-002');
        });

        it('Test 42: should generate appropriate titles', () => {
            expect(getErrorTitle('busy')).toContain('lock');
            expect(getErrorTitle('full')).toContain('disk full');
            expect(getErrorTitle('permission')).toContain('permission');
            expect(getErrorTitle('corruption')).toContain('corruption');
            expect(getErrorTitle('unknown')).toContain('Unexpected');
        });

        it('Test 43: should build detailed descriptions', () => {
            const desc = buildErrorDescription('SQLITE_FULL', 'full', 'During save');
            expect(desc).toContain('SQLITE_FULL');
            expect(desc).toContain('Suggested Actions');
            expect(desc).toContain('During save');
            expect(desc).toContain('Free up disk space');
        });

        it('Test 44: should provide suggested actions for all categories', () => {
            const categories: Array<'busy' | 'full' | 'permission' | 'corruption' | 'unknown'> = [
                'busy', 'full', 'permission', 'corruption', 'unknown',
            ];
            for (const cat of categories) {
                const actions = getSuggestedActions(cat);
                expect(actions.length).toBeGreaterThan(0);
            }
        });

        it('Test 45: should determine correct priorities', () => {
            expect(getErrorPriority('corruption')).toBe(1);
            expect(getErrorPriority('full')).toBe(1);
            expect(getErrorPriority('permission')).toBe(2);
            expect(getErrorPriority('busy')).toBe(3);
            expect(getErrorPriority('unknown')).toBe(2);
        });

        it('Test 46: should determine when to create tickets', () => {
            // Full/permission/corruption always create tickets
            expect(shouldCreateTicket('full')).toBe(true);
            expect(shouldCreateTicket('permission')).toBe(true);
            expect(shouldCreateTicket('corruption')).toBe(true);
            expect(shouldCreateTicket('unknown')).toBe(true);

            // Busy only after 3+ retries
            expect(shouldCreateTicket('busy', 0)).toBe(false);
            expect(shouldCreateTicket('busy', 2)).toBe(false);
            expect(shouldCreateTicket('busy', 3)).toBe(true);
            expect(shouldCreateTicket('busy', 5)).toBe(true);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // MT-008.9: Restore from Fallback
    // ═══════════════════════════════════════════════════════════════════════

    describe('Restore from Fallback (MT-008.9)', () => {
        it('Test 47: should check restore eligibility - primary available', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.accessSync.mockReturnValue(undefined);

            const result = checkRestoreEligibility({ primaryPath: '/db.sqlite' });
            expect(result.canRestore).toBe(true);
            expect(result.targetPath).toBe('/db.sqlite');
        });

        it('Test 48: should check restore eligibility - no path available', () => {
            mockFs.existsSync.mockReturnValue(false);
            mockFs.mkdirSync.mockImplementation(() => {
                throw new Error('EACCES');
            });

            const result = checkRestoreEligibility({
                primaryPath: '/primary/db.sqlite',
                alternatePaths: [],
            });
            expect(result.canRestore).toBe(false);
            expect(result.targetPath).toBeNull();
        });

        it('Test 49: should check restore eligibility - alternate available', () => {
            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                const pathStr = String(p);
                if (pathStr.includes('primary')) return false;
                return true;
            });
            mockFs.mkdirSync.mockImplementation(((p: string) => {
                if (p.includes('primary')) throw new Error('EACCES');
                return undefined;
            }) as any);
            mockFs.accessSync.mockReturnValue(undefined);

            const result = checkRestoreEligibility({
                primaryPath: '/primary/db.sqlite',
                alternatePaths: ['/alt/db.sqlite'],
            });
            expect(result.canRestore).toBe(true);
            expect(result.targetPath).toBe('/alt/db.sqlite');
        });

        it('Test 50: should prepare tickets for migration', () => {
            const tickets = [
                { id: 'TK-0001', title: 'Test' },
                { id: 'TK-0002', title: 'Test 2', version: 3 },
            ];

            const prepared = prepareTicketsForMigration(tickets);
            expect(prepared).toHaveLength(2);
            expect(prepared[0].status).toBe('open'); // Default added
            expect(prepared[0].version).toBe(1); // Default added
            expect(prepared[0].createdAt).toBeDefined(); // Default added
            expect(prepared[1].version).toBe(3); // Preserved
        });

        it('Test 51: should execute restore successfully', async () => {
            const tickets = [
                { id: 'TK-0001', title: 'Test' },
                { id: 'TK-0002', title: 'Test 2' },
            ];
            const inserted: Record<string, unknown>[] = [];
            const inserter = async (ticket: Record<string, unknown>) => {
                inserted.push(ticket);
            };

            const result = await executeRestore(tickets, inserter);
            expect(result.success).toBe(true);
            expect(result.ticketsMigrated).toBe(2);
            expect(result.errors).toHaveLength(0);
            expect(inserted).toHaveLength(2);
        });

        it('Test 52: should handle partial restore failures', async () => {
            const tickets = [
                { id: 'TK-0001', title: 'Good' },
                { id: 'TK-0002', title: 'Bad' },
                { id: 'TK-0003', title: 'Good too' },
            ];
            const inserter = async (ticket: Record<string, unknown>) => {
                if (ticket.id === 'TK-0002') {
                    throw new Error('Duplicate ID');
                }
            };

            const result = await executeRestore(tickets, inserter);
            expect(result.success).toBe(false);
            expect(result.ticketsMigrated).toBe(2);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toContain('TK-0002');
        });

        it('Test 53: should create restore monitor', () => {
            const monitor = new RestoreMonitor({
                primaryPath: '/db.sqlite',
                checkIntervalMs: 1000,
            });
            expect(monitor.isActive()).toBe(false);
            expect(monitor.getLastCheck()).toBeNull();
        });

        it('Test 54: should perform immediate check', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.accessSync.mockReturnValue(undefined);

            const monitor = new RestoreMonitor({
                primaryPath: '/db.sqlite',
                checkIntervalMs: 60000,
            });

            const check = monitor.checkNow();
            expect(check.canRestore).toBe(true);
            expect(monitor.getLastCheck()).not.toBeNull();
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // MT-008.10: Comprehensive Fallback Tests
    // ═══════════════════════════════════════════════════════════════════════

    describe('Comprehensive Scenarios (MT-008.10)', () => {
        it('Test 55: should handle full fallback lifecycle', () => {
            // 1. Start healthy
            const statusMgr = new DbStatusManager('sqlite', '/db.sqlite', 'Startup');
            expect(statusMgr.isHealthy()).toBe(true);

            // 2. Error triggers fallback
            const trigger = createFallbackTrigger('SQLITE_FULL', 5, 'sqlite');
            expect(trigger.category).toBe('full');

            statusMgr.transitionTo('memory', 'SQLITE_FULL', null, 'disk full');
            expect(statusMgr.isFallback()).toBe(true);

            // 3. Features degraded
            const degraded = getDegradedFeatures('memory');
            expect(degraded.length).toBeGreaterThan(0);

            // 4. Error ticket created
            const ticket = createErrorTicket('SQLITE_FULL', 'full');
            expect(ticket.priority).toBe(1);
        });

        it('Test 56: should determine restore timing', () => {
            const recentTrigger: FallbackTrigger = {
                triggeredAt: new Date().toISOString(),
                error: 'SQLITE_FULL',
                category: 'full',
                ticketCount: 5,
                previousMode: 'sqlite',
            };

            // Too soon to restore
            expect(shouldAttemptRestore(recentTrigger)).toBe(false);

            // Old trigger - should attempt
            const oldTrigger: FallbackTrigger = {
                ...recentTrigger,
                triggeredAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
            };
            expect(shouldAttemptRestore(oldTrigger)).toBe(true);
        });

        it('Test 57: should not attempt restore for corruption', () => {
            const corruptTrigger: FallbackTrigger = {
                triggeredAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
                error: 'Database corrupted',
                category: 'corruption',
                ticketCount: 5,
                previousMode: 'sqlite',
            };

            expect(shouldAttemptRestore(corruptTrigger)).toBe(false);
        });

        it('Test 58: should handle non-fallback errors gracefully', async () => {
            const operation = async (): Promise<string> => {
                throw new Error('Some random error');
            };

            const result = await withFallback(operation, undefined, {
                maxRetries: 0,
                baseDelayMs: 1,
            });

            expect(result.failed).toBe(true);
            expect(result.usedFallback).toBe(false);
        });

        it('Test 59: should track multiple transitions', () => {
            const manager = new DbStatusManager('sqlite', '/db.sqlite', 'Start');

            manager.transitionTo('memory', 'SQLITE_FULL', null);
            manager.transitionTo('recovery', 'Loading backup');
            manager.transitionTo('memory', 'Backup loaded');
            manager.transitionTo('sqlite', 'Restored', '/db.sqlite');

            const status = manager.getStatus();
            expect(status.transitionCount).toBe(4);
            expect(status.mode).toBe('sqlite');
            expect(status.health).toBe('healthy');
        });

        it('Test 60: should handle listener errors gracefully', () => {
            const manager = new DbStatusManager('sqlite', '/db.sqlite', 'Test');

            manager.onStatusChange(() => {
                throw new Error('Listener error');
            });

            // Should not throw
            expect(() => manager.transitionTo('memory', 'Test')).not.toThrow();
        });

        it('Test 61: should report listener count', () => {
            const manager = new DbStatusManager('sqlite', '/db.sqlite', 'Test');
            expect(manager.getListenerCount()).toBe(0);

            const unsub1 = manager.onStatusChange(() => {});
            expect(manager.getListenerCount()).toBe(1);

            manager.onStatusChange(() => {});
            expect(manager.getListenerCount()).toBe(2);

            unsub1();
            expect(manager.getListenerCount()).toBe(1);
        });

        it('Test 62: should handle recovery manager cleanup', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({
                mtimeMs: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days old
            } as fs.Stats);
            mockFs.unlinkSync.mockReturnValue(undefined);

            const manager = new RecoveryManager({ recoveryPath: '/path/recovery.json' });
            const cleaned = manager.cleanup();
            expect(cleaned).toBe(1);
        });

        it('Test 63: should report recovery path', () => {
            const manager = new RecoveryManager({ recoveryPath: '/custom/path.json' });
            expect(manager.getRecoveryPath()).toBe('/custom/path.json');
        });

        it('Test 64: should handle restore monitor lifecycle', () => {
            const monitor = new RestoreMonitor({ checkIntervalMs: 60000 });
            const readyChecks: boolean[] = [];

            monitor.start(check => readyChecks.push(check.canRestore));
            expect(monitor.isActive()).toBe(true);

            monitor.stop();
            expect(monitor.isActive()).toBe(false);
        });

        it('Test 65: should not start restore monitor twice', () => {
            const monitor = new RestoreMonitor({ checkIntervalMs: 60000 });
            monitor.start(() => {});
            monitor.start(() => {}); // Should log warning

            expect(monitor.isActive()).toBe(true);
            monitor.stop();
        });
    });
});
