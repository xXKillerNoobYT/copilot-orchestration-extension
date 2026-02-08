/**
 * PlanningService Tests
 *
 * Tests for the plan storage and retrieval service.
 * Tests singleton pattern, CRUD operations, drafts, exports, and events.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Mock modules before imports
jest.mock('vscode', () => {
    const mockEventEmitter = {
        fire: jest.fn(),
        event: jest.fn(),
        dispose: jest.fn(),
    };
    return {
        EventEmitter: jest.fn(() => mockEventEmitter),
        workspace: {
            workspaceFolders: undefined as vscode.WorkspaceFolder[] | undefined,
        },
        Uri: {
            file: (path: string) => ({
                scheme: 'file',
                authority: '',
                path,
                query: '',
                fragment: '',
                fsPath: path,
                with: jest.fn(),
                toJSON: jest.fn(),
            }),
        },
    };
});

jest.mock('fs');
jest.mock('crypto');
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn(),
}));

jest.mock('../../src/planning/schema', () => ({
    validatePlan: jest.fn(),
}));

import {
    initializePlanningService,
    getPlanningServiceInstance,
    resetPlanningServiceForTests,
} from '../../src/services/planningService';
import { logInfo, logError, logWarn } from '../../src/logger';
import { validatePlan } from '../../src/planning/schema';
import type { CompletePlan, PlanMetadata } from '../../src/planning/types';

describe('PlanningService', () => {
    const mockFs = fs as jest.Mocked<typeof fs>;
    const mockCrypto = crypto as jest.Mocked<typeof crypto>;
    const mockValidatePlan = validatePlan as jest.MockedFunction<typeof validatePlan>;
    const mockVscode = vscode as jest.Mocked<typeof vscode>;

    // Mock extension context
    const mockContext: vscode.ExtensionContext = {
        globalStoragePath: '/mock/global/storage',
        extensionPath: '/mock/extension/path',
        subscriptions: [],
    } as unknown as vscode.ExtensionContext;

    // Sample plan data
    const samplePlan: CompletePlan = {
        metadata: {
            id: 'test-plan-id-123',
            name: 'Test Plan',
            createdAt: new Date('2024-01-01T00:00:00Z'),
            updatedAt: new Date('2024-01-02T00:00:00Z'),
            version: 1,
            author: 'test-author',
        },
        overview: {
            name: 'Test Overview',
            description: 'A test description',
            goals: ['Goal 1', 'Goal 2'],
        },
        featureBlocks: [
            {
                id: 'feature-1',
                name: 'Feature One',
                description: 'First feature',
                purpose: 'Testing',
                acceptanceCriteria: ['Criterion 1'],
                technicalNotes: 'Notes',
                priority: 'high',
                order: 0,
            },
        ],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [
            {
                id: 'story-1',
                userType: 'developer',
                action: 'test the app',
                benefit: 'verify it works',
                relatedBlockIds: ['feature-1'],
                acceptanceCriteria: ['AC 1'],
                priority: 'high',
            },
        ],
        developerStories: [],
        successCriteria: [
            {
                id: 'criteria-1',
                description: 'All tests pass',
                smartAttributes: {
                    specific: true,
                    measurable: true,
                    achievable: true,
                    relevant: true,
                    timeBound: true,
                },
                relatedFeatureIds: [],
                relatedStoryIds: [],
                testable: true,
                priority: 'high',
            },
        ],
    };

    beforeEach(() => {
        jest.clearAllMocks();
        resetPlanningServiceForTests();

        // Default mock implementations
        mockFs.existsSync.mockReturnValue(false);
        mockFs.mkdirSync.mockReturnValue(undefined);
        mockFs.writeFileSync.mockReturnValue(undefined);
        mockFs.readFileSync.mockReturnValue(JSON.stringify(samplePlan));
        mockFs.readdirSync.mockReturnValue([]);
        mockFs.unlinkSync.mockReturnValue(undefined);

        mockCrypto.randomUUID.mockReturnValue('generated-uuid-12345' as ReturnType<typeof crypto.randomUUID>);
        mockValidatePlan.mockReturnValue({ isValid: true, errors: [] });

        // Default: no workspace
        (mockVscode.workspace as { workspaceFolders: typeof mockVscode.workspace.workspaceFolders }).workspaceFolders = undefined;
    });

    // ==========================================================================
    // SINGLETON PATTERN TESTS
    // ==========================================================================

    describe('Singleton Pattern', () => {
        it('Test 1: should initialize successfully', async () => {
            await initializePlanningService(mockContext);
            const instance = getPlanningServiceInstance();
            expect(instance).toBeDefined();
        });

        it('Test 2: should throw when getting instance before initialization', () => {
            expect(() => getPlanningServiceInstance()).toThrow('Planning service not initialized');
        });

        it('Test 3: should throw when initializing twice', async () => {
            await initializePlanningService(mockContext);
            await expect(initializePlanningService(mockContext)).rejects.toThrow(
                'Planning service already initialized'
            );
        });

        it('Test 4: should allow re-initialization after reset', async () => {
            await initializePlanningService(mockContext);
            resetPlanningServiceForTests();
            await initializePlanningService(mockContext);
            expect(getPlanningServiceInstance()).toBeDefined();
        });
    });

    // ==========================================================================
    // INITIALIZATION TESTS
    // ==========================================================================

    describe('Initialization', () => {
        it('Test 5: should create plans folder if it does not exist', async () => {
            mockFs.existsSync.mockReturnValue(false);
            await initializePlanningService(mockContext);

            expect(mockFs.mkdirSync).toHaveBeenCalledWith(
                expect.stringContaining('plans'),
                { recursive: true }
            );
            expect(logInfo).toHaveBeenCalledWith('[PlanningService] Created plans folder');
        });

        it('Test 6: should create drafts folder if it does not exist', async () => {
            mockFs.existsSync.mockReturnValue(false);
            await initializePlanningService(mockContext);

            expect(mockFs.mkdirSync).toHaveBeenCalledWith(
                expect.stringContaining('drafts'),
                { recursive: true }
            );
            expect(logInfo).toHaveBeenCalledWith('[PlanningService] Created drafts folder');
        });

        it('Test 7: should not create folders if they exist', async () => {
            mockFs.existsSync.mockReturnValue(true);
            await initializePlanningService(mockContext);

            expect(mockFs.mkdirSync).not.toHaveBeenCalled();
        });

        it('Test 8: should use workspace folder when available', async () => {
            const workspacePath = path.join('/mock', 'workspace');
            (mockVscode.workspace as { workspaceFolders: typeof mockVscode.workspace.workspaceFolders }).workspaceFolders = [
                { uri: { fsPath: workspacePath } } as unknown as vscode.WorkspaceFolder,
            ];
            mockFs.existsSync.mockReturnValue(false);

            await initializePlanningService(mockContext);

            expect(mockFs.mkdirSync).toHaveBeenCalledWith(
                expect.stringContaining(workspacePath),
                { recursive: true }
            );
        });

        it('Test 9: should use globalStoragePath when no workspace', async () => {
            mockFs.existsSync.mockReturnValue(false);
            await initializePlanningService(mockContext);

            // Use path.sep-agnostic check: globalStoragePath may use / or \
            const mkdirCalls = mockFs.mkdirSync.mock.calls.map(c => String(c[0]));
            const globalStoragePart = 'global' + path.sep + 'storage';
            expect(mkdirCalls.some(p => p.includes('global') && p.includes('storage'))).toBe(true);
        });

        it('Test 10: should use extensionPath fallback when no globalStoragePath', async () => {
            const contextWithoutStorage = {
                ...mockContext,
                globalStoragePath: undefined,
            } as unknown as vscode.ExtensionContext;

            mockFs.existsSync.mockReturnValue(false);
            await initializePlanningService(contextWithoutStorage);

            expect(mockFs.mkdirSync).toHaveBeenCalledWith(
                expect.stringContaining('.coe-data'),
                { recursive: true }
            );
        });

        it('Test 11: should throw and log error when folder creation fails', async () => {
            mockFs.existsSync.mockReturnValue(false);
            mockFs.mkdirSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });

            await expect(initializePlanningService(mockContext)).rejects.toThrow('Permission denied');
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('[PlanningService] Init failed')
            );
        });
    });

    // ==========================================================================
    // CREATE PLAN TESTS
    // ==========================================================================

    describe('createPlan', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReturnValue(true);
            await initializePlanningService(mockContext);
        });

        it('Test 12: should create a plan with generated UUID', async () => {
            const service = getPlanningServiceInstance();
            const partialPlan = { metadata: { name: 'New Plan' }, overview: samplePlan.overview } as unknown as Partial<CompletePlan>;

            const result = await service.createPlan(partialPlan);

            expect(result.metadata.id).toBe('generated-uuid-12345');
            expect(result.metadata.name).toBe('New Plan');
        });

        it('Test 13: should validate plan before creating', async () => {
            const service = getPlanningServiceInstance();

            await service.createPlan({ metadata: { name: 'Test' } } as unknown as Partial<CompletePlan>);

            expect(mockValidatePlan).toHaveBeenCalled();
        });

        it('Test 14: should throw when validation fails', async () => {
            mockValidatePlan.mockReturnValue({ isValid: false, errors: ['Name too short'] });
            const service = getPlanningServiceInstance();

            await expect(service.createPlan({ metadata: { name: 'X' } } as unknown as Partial<CompletePlan>)).rejects.toThrow(
                'Validation failed: Name too short'
            );
        });

        it('Test 15: should save plan to file', async () => {
            const service = getPlanningServiceInstance();

            await service.createPlan({ metadata: { name: 'Test' } } as unknown as Partial<CompletePlan>);

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('generated-uuid-12345.json'),
                expect.any(String)
            );
        });

        it('Test 16: should delete existing draft when creating plan', async () => {
            mockFs.existsSync.mockReturnValue(true);
            const service = getPlanningServiceInstance();

            await service.createPlan({ metadata: { name: 'Test' } } as unknown as Partial<CompletePlan>);

            expect(mockFs.unlinkSync).toHaveBeenCalledWith(
                expect.stringContaining('.draft.json')
            );
        });

        it('Test 17: should fire onPlanCreated event', async () => {
            const service = getPlanningServiceInstance();

            await service.createPlan({ metadata: { name: 'Test' } } as unknown as Partial<CompletePlan>);

            // Event emitter is created per service, check logInfo as proxy
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('[PlanningService] Plan created')
            );
        });

        it('Test 18: should use default name when not provided', async () => {
            const service = getPlanningServiceInstance();

            const result = await service.createPlan({});

            expect(result.metadata.name).toBe('New Plan');
        });

        it('Test 19: should default empty arrays for optional fields', async () => {
            const service = getPlanningServiceInstance();

            const result = await service.createPlan({ metadata: { name: 'Test' } } as unknown as Partial<CompletePlan>);

            expect(result.featureBlocks).toEqual([]);
            expect(result.blockLinks).toEqual([]);
            expect(result.userStories).toEqual([]);
        });

        it('Test 20: should log error on failure', async () => {
            mockFs.writeFileSync.mockImplementation(() => {
                throw new Error('Disk full');
            });
            const service = getPlanningServiceInstance();

            await expect(service.createPlan({ metadata: { name: 'Test' } } as unknown as Partial<CompletePlan>)).rejects.toThrow('Disk full');
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('[PlanningService] Create plan failed')
            );
        });
    });

    // ==========================================================================
    // LOAD PLAN TESTS
    // ==========================================================================

    describe('loadPlan', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReturnValue(true);
            await initializePlanningService(mockContext);
        });

        it('Test 21: should load plan from file', async () => {
            mockFs.readFileSync.mockReturnValue(JSON.stringify(samplePlan));
            const service = getPlanningServiceInstance();

            const result = await service.loadPlan('test-plan-id-123');

            expect(result.metadata.id).toBe('test-plan-id-123');
            expect(result.metadata.name).toBe('Test Plan');
        });

        it('Test 22: should convert date strings to Date objects', async () => {
            const planWithStringDates = {
                ...samplePlan,
                metadata: {
                    ...samplePlan.metadata,
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-02T00:00:00Z',
                },
            };
            mockFs.readFileSync.mockReturnValue(JSON.stringify(planWithStringDates));
            const service = getPlanningServiceInstance();

            const result = await service.loadPlan('test-id');

            expect(result.metadata.createdAt).toBeInstanceOf(Date);
            expect(result.metadata.updatedAt).toBeInstanceOf(Date);
        });

        it('Test 23: should throw when plan not found', async () => {
            mockFs.existsSync.mockImplementation((p: fs.PathLike) =>
                // Plans folder exists, but specific plan file doesn't
                !String(p).includes('nonexistent')
            );
            const service = getPlanningServiceInstance();

            await expect(service.loadPlan('nonexistent')).rejects.toThrow('Plan not found: nonexistent');
        });

        it('Test 24: should log error on failure', async () => {
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('File corrupted');
            });
            const service = getPlanningServiceInstance();

            await expect(service.loadPlan('test-id')).rejects.toThrow('File corrupted');
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('[PlanningService] Load plan failed')
            );
        });
    });

    // ==========================================================================
    // UPDATE PLAN TESTS
    // ==========================================================================

    describe('updatePlan', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReturnValue(true);
            await initializePlanningService(mockContext);
        });

        it('Test 25: should update plan and save to file', async () => {
            const service = getPlanningServiceInstance();
            const updatedPlan = {
                ...samplePlan,
                metadata: { ...samplePlan.metadata },
                overview: { ...samplePlan.overview, name: 'Updated' },
            };

            const result = await service.updatePlan(updatedPlan);

            expect(mockFs.writeFileSync).toHaveBeenCalled();
            expect(result.overview.name).toBe('Updated');
        });

        it('Test 26: should increment version number', async () => {
            const service = getPlanningServiceInstance();
            const planV1 = { ...samplePlan, metadata: { ...samplePlan.metadata, version: 1 } };

            const result = await service.updatePlan(planV1);

            expect(result.metadata.version).toBe(2);
        });

        it('Test 27: should update timestamp', async () => {
            const service = getPlanningServiceInstance();
            const oldDate = new Date('2000-01-01');
            const planWithOldDate = { ...samplePlan, metadata: { ...samplePlan.metadata, updatedAt: oldDate } };

            const result = await service.updatePlan(planWithOldDate);

            expect(result.metadata.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
        });

        it('Test 28: should validate plan before updating', async () => {
            const service = getPlanningServiceInstance();

            await service.updatePlan({ ...samplePlan, metadata: { ...samplePlan.metadata } });

            expect(mockValidatePlan).toHaveBeenCalled();
        });

        it('Test 29: should throw when validation fails', async () => {
            mockValidatePlan.mockReturnValue({ isValid: false, errors: ['Invalid data'] });
            const service = getPlanningServiceInstance();

            await expect(service.updatePlan({ ...samplePlan, metadata: { ...samplePlan.metadata } })).rejects.toThrow('Validation failed: Invalid data');
        });

        it('Test 30: should fire onPlanUpdated event', async () => {
            const service = getPlanningServiceInstance();

            await service.updatePlan({ ...samplePlan, metadata: { ...samplePlan.metadata } });

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('[PlanningService] Plan updated')
            );
        });

        it('Test 31: should log error on failure', async () => {
            mockFs.writeFileSync.mockImplementation(() => {
                throw new Error('Write failed');
            });
            const service = getPlanningServiceInstance();

            await expect(service.updatePlan({ ...samplePlan, metadata: { ...samplePlan.metadata } })).rejects.toThrow('Write failed');
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('[PlanningService] Update plan failed')
            );
        });
    });

    // ==========================================================================
    // DELETE PLAN TESTS
    // ==========================================================================

    describe('deletePlan', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReturnValue(true);
            await initializePlanningService(mockContext);
        });

        it('Test 32: should delete plan file', async () => {
            const service = getPlanningServiceInstance();

            await service.deletePlan('test-id');

            expect(mockFs.unlinkSync).toHaveBeenCalledWith(
                expect.stringContaining('test-id.json')
            );
        });

        it('Test 33: should also delete draft file', async () => {
            const service = getPlanningServiceInstance();

            await service.deletePlan('test-id');

            expect(mockFs.unlinkSync).toHaveBeenCalledWith(
                expect.stringContaining('test-id.draft.json')
            );
        });

        it('Test 34: should fire onPlanDeleted event', async () => {
            const service = getPlanningServiceInstance();

            await service.deletePlan('test-id');

            expect(logInfo).toHaveBeenCalledWith('[PlanningService] Plan deleted: test-id');
        });

        it('Test 35: should handle when plan does not exist', async () => {
            mockFs.existsSync.mockReturnValue(false);
            const service = getPlanningServiceInstance();

            // Should not throw
            await service.deletePlan('nonexistent');

            // unlinkSync should not be called for nonexistent files
            expect(mockFs.unlinkSync).not.toHaveBeenCalled();
        });

        it('Test 36: should log error on failure', async () => {
            mockFs.unlinkSync.mockImplementation(() => {
                throw new Error('Cannot delete');
            });
            const service = getPlanningServiceInstance();

            await expect(service.deletePlan('test-id')).rejects.toThrow('Cannot delete');
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('[PlanningService] Delete plan failed')
            );
        });
    });

    // ==========================================================================
    // LIST PLANS TESTS
    // ==========================================================================

    describe('listPlans', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReturnValue(true);
            await initializePlanningService(mockContext);
        });

        it('Test 37: should list all plans', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (mockFs.readdirSync as jest.Mock).mockReturnValue(['plan1.json', 'plan2.json']);
            mockFs.readFileSync.mockReturnValue(JSON.stringify(samplePlan));
            const service = getPlanningServiceInstance();

            const result = await service.listPlans();

            expect(result.length).toBe(2);
        });

        it('Test 38: should return empty array when folder does not exist', async () => {
            mockFs.existsSync.mockReturnValue(false);
            const service = getPlanningServiceInstance();

            const result = await service.listPlans();

            expect(result).toEqual([]);
        });

        it('Test 39: should filter only .json files', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (mockFs.readdirSync as jest.Mock).mockReturnValue(['plan.json', 'readme.txt', 'other.md']);
            mockFs.readFileSync.mockReturnValue(JSON.stringify(samplePlan));
            const service = getPlanningServiceInstance();

            const result = await service.listPlans();

            expect(result.length).toBe(1);
        });

        it('Test 40: should sort by updatedAt descending', async () => {
            const oldPlan = {
                ...samplePlan,
                metadata: { ...samplePlan.metadata, updatedAt: new Date('2020-01-01') },
            };
            const newPlan = {
                ...samplePlan,
                metadata: { ...samplePlan.metadata, updatedAt: new Date('2024-01-01') },
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (mockFs.readdirSync as jest.Mock).mockReturnValue(['old.json', 'new.json']);
            mockFs.readFileSync
                .mockReturnValueOnce(JSON.stringify(oldPlan))
                .mockReturnValueOnce(JSON.stringify(newPlan));
            const service = getPlanningServiceInstance();

            const result = await service.listPlans();

            // Newer plan should be first
            expect(result[0].updatedAt.getTime()).toBeGreaterThan(result[1].updatedAt.getTime());
        });

        it('Test 41: should skip invalid plan files and log warning', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (mockFs.readdirSync as jest.Mock).mockReturnValue(['valid.json', 'invalid.json']);
            mockFs.readFileSync
                .mockReturnValueOnce(JSON.stringify(samplePlan))
                .mockReturnValueOnce('not valid json');
            const service = getPlanningServiceInstance();

            const result = await service.listPlans();

            expect(result.length).toBe(1);
            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to parse plan file')
            );
        });

        it('Test 42: should return empty on read error and log error', async () => {
            mockFs.readdirSync.mockImplementation(() => {
                throw new Error('Read error');
            });
            const service = getPlanningServiceInstance();

            const result = await service.listPlans();

            expect(result).toEqual([]);
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('[PlanningService] List plans failed')
            );
        });
    });

    // ==========================================================================
    // DRAFT TESTS
    // ==========================================================================

    describe('Drafts', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReturnValue(true);
            await initializePlanningService(mockContext);
        });

        describe('saveDraft', () => {
            it('Test 43: should save draft to file', async () => {
                const service = getPlanningServiceInstance();
                const draft = { metadata: { name: 'Draft Plan' } } as unknown as Partial<CompletePlan>;

                await service.saveDraft('draft-id', draft);

                expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                    expect.stringContaining('draft-id.draft.json'),
                    JSON.stringify(draft, null, 2)
                );
            });

            it('Test 44: should log info on successful save', async () => {
                const service = getPlanningServiceInstance();

                await service.saveDraft('draft-id', {});

                expect(logInfo).toHaveBeenCalledWith('[PlanningService] Draft saved: draft-id');
            });

            it('Test 45: should log error on failure but not throw', async () => {
                mockFs.writeFileSync.mockImplementation(() => {
                    throw new Error('Save failed');
                });
                const service = getPlanningServiceInstance();

                // Should not throw
                await service.saveDraft('draft-id', {});

                expect(logError).toHaveBeenCalledWith(
                    expect.stringContaining('[PlanningService] Save draft failed')
                );
            });
        });

        describe('loadDraft', () => {
            it('Test 46: should load draft from file', async () => {
                const draft = { metadata: { name: 'Draft' } };
                mockFs.readFileSync.mockReturnValue(JSON.stringify(draft));
                const service = getPlanningServiceInstance();

                const result = await service.loadDraft('draft-id');

                expect(result).toEqual(draft);
            });

            it('Test 47: should return null when draft does not exist', async () => {
                mockFs.existsSync.mockReturnValue(false);
                const service = getPlanningServiceInstance();

                const result = await service.loadDraft('nonexistent');

                expect(result).toBeNull();
            });

            it('Test 48: should return null and log error on failure', async () => {
                mockFs.readFileSync.mockImplementation(() => {
                    throw new Error('Read failed');
                });
                const service = getPlanningServiceInstance();

                const result = await service.loadDraft('draft-id');

                expect(result).toBeNull();
                expect(logError).toHaveBeenCalledWith(
                    expect.stringContaining('[PlanningService] Load draft failed')
                );
            });
        });
    });

    // ==========================================================================
    // EXPORT TESTS
    // ==========================================================================

    describe('exportPlan', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify(samplePlan));
            await initializePlanningService(mockContext);
        });

        it('Test 49: should export as JSON', async () => {
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'json');

            expect(JSON.parse(result)).toHaveProperty('metadata');
            expect(JSON.parse(result)).toHaveProperty('overview');
        });

        it('Test 50: should export as markdown', async () => {
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'markdown');

            expect(result).toContain('# Test Plan');
            expect(result).toContain('## Overview');
        });

        it('Test 51: should include version in markdown export', async () => {
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'markdown');

            expect(result).toContain('**Version**: 1');
        });

        it('Test 52: should include goals in markdown export', async () => {
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'markdown');

            expect(result).toContain('### Goals');
            expect(result).toContain('- Goal 1');
            expect(result).toContain('- Goal 2');
        });

        it('Test 53: should include features in markdown export', async () => {
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'markdown');

            expect(result).toContain('## Features');
            expect(result).toContain('### Feature One');
        });

        it('Test 54: should include user stories in markdown export', async () => {
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'markdown');

            expect(result).toContain('## User Stories');
            expect(result).toContain('As a developer');
        });

        it('Test 55: should include success criteria in markdown export', async () => {
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'markdown');

            expect(result).toContain('## Success Criteria');
            expect(result).toContain('- All tests pass');
        });

        it('Test 56: should export as YAML', async () => {
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'yaml');

            expect(result).toContain('metadata:');
            expect(result).toContain('  id: test-plan-id-123');
            expect(result).toContain('  name: "Test Plan"');
        });

        it('Test 57: should include features in YAML export', async () => {
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'yaml');

            expect(result).toContain('features:');
            expect(result).toContain('  - name: "Feature One"');
        });

        it('Test 58: should throw for PDF export (not implemented)', async () => {
            const service = getPlanningServiceInstance();

            await expect(service.exportPlan('test-id', 'pdf')).rejects.toThrow(
                'PDF export not yet implemented'
            );
        });

        it('Test 59: should throw for unknown format', async () => {
            const service = getPlanningServiceInstance();

            await expect(service.exportPlan('test-id', 'unknown' as 'json')).rejects.toThrow(
                'Unknown export format: unknown'
            );
        });

        it('Test 60: should log error on export failure', async () => {
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('Load failed');
            });
            const service = getPlanningServiceInstance();

            await expect(service.exportPlan('test-id', 'json')).rejects.toThrow('Load failed');
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('[PlanningService] Export plan failed')
            );
        });
    });

    // ==========================================================================
    // EVENT EMITTER TESTS
    // ==========================================================================

    describe('Event Emitters', () => {
        it('Test 61: should expose onPlanCreatedEvent', async () => {
            mockFs.existsSync.mockReturnValue(true);
            await initializePlanningService(mockContext);
            const service = getPlanningServiceInstance();

            expect(service.onPlanCreatedEvent).toBeDefined();
        });

        it('Test 62: should expose onPlanUpdatedEvent', async () => {
            mockFs.existsSync.mockReturnValue(true);
            await initializePlanningService(mockContext);
            const service = getPlanningServiceInstance();

            expect(service.onPlanUpdatedEvent).toBeDefined();
        });

        it('Test 63: should expose onPlanDeletedEvent', async () => {
            mockFs.existsSync.mockReturnValue(true);
            await initializePlanningService(mockContext);
            const service = getPlanningServiceInstance();

            expect(service.onPlanDeletedEvent).toBeDefined();
        });
    });

    // ==========================================================================
    // MARKDOWN EDGE CASES
    // ==========================================================================

    describe('Markdown Export Edge Cases', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReturnValue(true);
            await initializePlanningService(mockContext);
        });

        it('Test 64: should handle empty goals array', async () => {
            const planWithNoGoals = {
                ...samplePlan,
                overview: { ...samplePlan.overview, goals: [] },
            };
            mockFs.readFileSync.mockReturnValue(JSON.stringify(planWithNoGoals));
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'markdown');

            expect(result).not.toContain('### Goals');
        });

        it('Test 65: should handle empty features array', async () => {
            const planWithNoFeatures = { ...samplePlan, featureBlocks: [] };
            mockFs.readFileSync.mockReturnValue(JSON.stringify(planWithNoFeatures));
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'markdown');

            expect(result).not.toContain('## Features');
        });

        it('Test 66: should handle empty user stories array', async () => {
            const planWithNoStories = { ...samplePlan, userStories: [] };
            mockFs.readFileSync.mockReturnValue(JSON.stringify(planWithNoStories));
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'markdown');

            expect(result).not.toContain('## User Stories');
        });

        it('Test 67: should handle empty success criteria array', async () => {
            const planWithNoCriteria = { ...samplePlan, successCriteria: [] };
            mockFs.readFileSync.mockReturnValue(JSON.stringify(planWithNoCriteria));
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'markdown');

            expect(result).not.toContain('## Success Criteria');
        });

        it('Test 68: should handle feature without acceptance criteria', async () => {
            const planWithBareFeat = {
                ...samplePlan,
                featureBlocks: [
                    { ...samplePlan.featureBlocks[0], acceptanceCriteria: [] },
                ],
                // Also remove user stories with acceptance criteria to isolate the feature test
                userStories: [
                    { ...samplePlan.userStories[0], acceptanceCriteria: [] },
                ],
            };
            mockFs.readFileSync.mockReturnValue(JSON.stringify(planWithBareFeat));
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'markdown');

            expect(result).toContain('### Feature One');
            expect(result).not.toContain('**Acceptance Criteria**:');
        });

        it('Test 69: should handle user story with acceptance criteria', async () => {
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'markdown');

            expect(result).toContain('**Acceptance Criteria**:');
            expect(result).toContain('- AC 1');
        });
    });

    // ==========================================================================
    // YAML EDGE CASES
    // ==========================================================================

    describe('YAML Export Edge Cases', () => {
        beforeEach(async () => {
            mockFs.existsSync.mockReturnValue(true);
            await initializePlanningService(mockContext);
        });

        it('Test 70: should handle empty goals array in YAML', async () => {
            const planWithNoGoals = {
                ...samplePlan,
                overview: { ...samplePlan.overview, goals: [] },
            };
            mockFs.readFileSync.mockReturnValue(JSON.stringify(planWithNoGoals));
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'yaml');

            expect(result).toContain('overview:');
            expect(result).not.toContain('goals:');
        });

        it('Test 71: should handle empty features array in YAML', async () => {
            const planWithNoFeatures = { ...samplePlan, featureBlocks: [] };
            mockFs.readFileSync.mockReturnValue(JSON.stringify(planWithNoFeatures));
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'yaml');

            expect(result).not.toContain('features:');
        });

        it('Test 72: should include feature priorities in YAML', async () => {
            const service = getPlanningServiceInstance();

            const result = await service.exportPlan('test-id', 'yaml');

            expect(result).toContain('priority: high');
        });
    });
});
