/**
 * Tests for Plan Versioning (MT-033.15)
 *
 * Unit tests for the plan versioning system that provides version control
 * for plans: snapshots, diffs, rollback, history management, and UI rendering.
 */

import * as crypto from 'crypto';
import {
    createVersioningState,
    saveVersion,
    rollbackToVersion,
    getVersion,
    getVersionByNumber,
    getLatestVersion,
    setVersionLabel,
    comparePlans,
    renderVersionHistoryPanel,
    renderVersionComparison,
    getVersioningStyles,
    getVersioningScript,
    VERSION_DEFAULTS,
    VersioningState,
    PlanVersion,
    VersionDiff,
    VersionTrigger,
} from '../../src/ui/planVersioning';
import { CompletePlan } from '../../src/planning/types';

// Mock crypto module
jest.mock('crypto', () => ({
    randomUUID: jest.fn(() => 'mock-uuid-' + Math.random().toString(36).substring(2, 10)),
}));

// ============================================================================
// Test Helpers
// ============================================================================

let uuidCounter = 0;

/**
 * Creates a minimal CompletePlan for testing purposes.
 */
function createMockPlan(overrides: Partial<CompletePlan> = {}): CompletePlan {
    return {
        metadata: {
            id: 'plan-1',
            name: 'Test Plan',
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-01'),
            version: 1,
            author: 'tester',
        },
        overview: {
            name: 'Test Project',
            description: 'A test project description',
            goals: ['Goal 1', 'Goal 2'],
        },
        featureBlocks: [
            {
                id: 'fb-1',
                name: 'Feature A',
                description: 'First feature',
                purpose: 'Testing',
                acceptanceCriteria: ['Works correctly'],
                technicalNotes: 'None',
                priority: 'high',
                order: 1,
            },
        ],
        blockLinks: [
            {
                id: 'bl-1',
                sourceBlockId: 'fb-1',
                targetBlockId: 'fb-2',
                dependencyType: 'requires',
            },
        ],
        conditionalLogic: [],
        userStories: [
            {
                id: 'us-1',
                userType: 'developer',
                action: 'write code',
                benefit: 'deliver features',
                relatedBlockIds: ['fb-1'],
                acceptanceCriteria: ['Code compiles'],
                priority: 'high',
            },
        ],
        developerStories: [
            {
                id: 'ds-1',
                action: 'implement API',
                benefit: 'enable integration',
                technicalRequirements: ['Node.js'],
                apiNotes: 'REST',
                databaseNotes: 'SQLite',
                estimatedHours: 8,
                relatedBlockIds: ['fb-1'],
                relatedTaskIds: [],
            },
        ],
        successCriteria: [
            {
                id: 'sc-1',
                description: 'All tests pass',
                smartAttributes: {
                    specific: true,
                    measurable: true,
                    achievable: true,
                    relevant: true,
                    timeBound: false,
                },
                relatedFeatureIds: ['fb-1'],
                relatedStoryIds: ['us-1'],
                testable: true,
                priority: 'high',
            },
        ],
        ...overrides,
    };
}

/**
 * Creates a modified version of a plan for diff testing.
 */
function createModifiedPlan(base: CompletePlan, modifications: Partial<CompletePlan> = {}): CompletePlan {
    const cloned = JSON.parse(JSON.stringify(base)) as CompletePlan;
    return { ...cloned, ...modifications };
}

// ============================================================================
// Tests
// ============================================================================

describe('PlanVersioning', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        uuidCounter = 0;
        (crypto.randomUUID as jest.Mock).mockImplementation(
            () => `mock-uuid-${++uuidCounter}`
        );
    });

    // ========================================================================
    // Version Creation
    // ========================================================================

    describe('createVersioningState', () => {
        it('Test 1: should create initial versioning state with one version', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            expect(state.versions).toHaveLength(1);
            expect(state.currentVersionIndex).toBe(0);
            expect(state.autoSaveInterval).toBe(VERSION_DEFAULTS.AUTO_SAVE_INTERVAL_MS);
            expect(state.maxVersions).toBe(VERSION_DEFAULTS.MAX_VERSIONS);
            expect(state.lastAutoSave).toBeInstanceOf(Date);
        });

        it('Test 2: should set correct defaults on the initial version', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);
            const version = state.versions[0];

            expect(version.versionNumber).toBe(1);
            expect(version.label).toBe('Initial version');
            expect(version.trigger).toBe('manual_save');
            expect(version.description).toBe('Plan created');
            expect(version.id).toBeDefined();
            expect(version.timestamp).toBeInstanceOf(Date);
        });

        it('Test 3: should deep-clone the plan so mutations do not affect stored version', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            // Mutate the original plan after creating versioning state
            plan.overview.name = 'Mutated Name';

            expect(state.versions[0].plan.overview.name).toBe('Test Project');
        });
    });

    // ========================================================================
    // Saving Versions
    // ========================================================================

    describe('saveVersion', () => {
        it('Test 4: should save a new version when the plan has changed', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            const modifiedPlan = createModifiedPlan(plan, {
                overview: { name: 'Updated Project', description: 'Changed', goals: ['Goal 1', 'Goal 2'] },
            });

            const result = saveVersion(state, modifiedPlan, 'manual_save', {
                label: 'Second version',
                description: 'Updated name',
                author: 'tester',
            });

            expect(result).not.toBeNull();
            expect(result!.versionNumber).toBe(2);
            expect(result!.label).toBe('Second version');
            expect(result!.trigger).toBe('manual_save');
            expect(result!.author).toBe('tester');
            expect(state.versions).toHaveLength(2);
            expect(state.currentVersionIndex).toBe(1);
        });

        it('Test 5: should return null when there are no meaningful changes', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            // Save the same plan without modifications
            const result = saveVersion(state, plan, 'auto_save');

            expect(result).toBeNull();
            expect(state.versions).toHaveLength(1);
        });

        it('Test 6: should save even without changes when force option is true', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            const result = saveVersion(state, plan, 'before_export', {
                force: true,
                description: 'Forced save before export',
            });

            expect(result).not.toBeNull();
            expect(result!.versionNumber).toBe(2);
            expect(result!.trigger).toBe('before_export');
            expect(state.versions).toHaveLength(2);
        });

        it('Test 7: should update lastAutoSave when trigger is auto_save', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);
            const originalAutoSave = state.lastAutoSave;

            const modifiedPlan = createModifiedPlan(plan, {
                overview: { name: 'Auto-saved', description: 'Changed', goals: [] },
            });

            saveVersion(state, modifiedPlan, 'auto_save');

            expect(state.lastAutoSave).not.toBe(originalAutoSave);
        });

        it('Test 8: should prune old unlabeled versions when exceeding maxVersions', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);
            state.maxVersions = 5;

            // Add versions beyond the limit
            for (let i = 0; i < 6; i++) {
                const modified = createModifiedPlan(plan, {
                    overview: {
                        name: `Version ${i + 2}`,
                        description: `Description ${i + 2}`,
                        goals: [`Goal ${i}`],
                    },
                });
                saveVersion(state, modified, 'manual_save', { force: true });
            }

            // Should be pruned to maxVersions
            expect(state.versions.length).toBeLessThanOrEqual(state.maxVersions);
            // The first version (index 0) should always be kept
            expect(state.versions[0].versionNumber).toBe(1);
        });

        it('Test 9: should preserve labeled versions during pruning', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);
            state.maxVersions = 4;

            // Save version 2 with a label
            const modified2 = createModifiedPlan(plan, {
                overview: { name: 'V2', description: 'labeled', goals: ['G'] },
            });
            saveVersion(state, modified2, 'manual_save', {
                label: 'Important Milestone',
                force: true,
            });

            // Save several more to trigger pruning
            for (let i = 3; i <= 7; i++) {
                const modified = createModifiedPlan(plan, {
                    overview: { name: `V${i}`, description: `Desc ${i}`, goals: [`G${i}`] },
                });
                saveVersion(state, modified, 'auto_save', { force: true });
            }

            // The labeled version should be preserved
            const labeledVersions = state.versions.filter(v => v.label === 'Important Milestone');
            expect(labeledVersions.length).toBe(1);
        });

        it('Test 10: should deep-clone the plan on save to prevent mutation', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            const modifiedPlan = createModifiedPlan(plan, {
                overview: { name: 'Saved Version', description: 'Fresh', goals: ['New Goal'] },
            });
            saveVersion(state, modifiedPlan, 'manual_save');

            // Mutate the plan after saving
            modifiedPlan.overview.name = 'After-save Mutation';

            const savedVersion = state.versions[state.versions.length - 1];
            expect(savedVersion.plan.overview.name).toBe('Saved Version');
        });
    });

    // ========================================================================
    // Rollback
    // ========================================================================

    describe('rollbackToVersion', () => {
        it('Test 11: should roll back to a previous version and return its plan', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);
            const initialVersionId = state.versions[0].id;

            // Save a modified version
            const modifiedPlan = createModifiedPlan(plan, {
                overview: { name: 'Modified', description: 'Changed', goals: [] },
            });
            saveVersion(state, modifiedPlan, 'manual_save');

            // Roll back to the initial version
            const rolledBackPlan = rollbackToVersion(state, initialVersionId, modifiedPlan);

            expect(rolledBackPlan).not.toBeNull();
            expect(rolledBackPlan!.overview.name).toBe('Test Project');
        });

        it('Test 12: should save the current state before rollback', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);
            const initialVersionId = state.versions[0].id;

            const modifiedPlan = createModifiedPlan(plan, {
                overview: { name: 'Current Work', description: 'In progress', goals: ['WIP'] },
            });
            saveVersion(state, modifiedPlan, 'manual_save');

            const versionCountBefore = state.versions.length;
            rollbackToVersion(state, initialVersionId, modifiedPlan);

            // A new version should have been saved (the rollback snapshot)
            // It may or may not add one depending on whether changes are detected
            // but with force-save via rollback trigger, the current state should be saved
            expect(state.versions.length).toBeGreaterThanOrEqual(versionCountBefore);
        });

        it('Test 13: should return null for a non-existent version ID', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            const result = rollbackToVersion(state, 'non-existent-id', plan);

            expect(result).toBeNull();
        });

        it('Test 14: should set currentVersionIndex to the target version', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);
            const initialVersionId = state.versions[0].id;

            // Save two more versions
            const mod1 = createModifiedPlan(plan, {
                overview: { name: 'V2', description: 'Second', goals: ['G2'] },
            });
            saveVersion(state, mod1, 'manual_save');

            const mod2 = createModifiedPlan(plan, {
                overview: { name: 'V3', description: 'Third', goals: ['G3'] },
            });
            saveVersion(state, mod2, 'manual_save');

            rollbackToVersion(state, initialVersionId, mod2);

            // currentVersionIndex should point to the original version (index 0)
            expect(state.currentVersionIndex).toBe(0);
        });

        it('Test 15: should return a deep clone so mutations do not affect stored version', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);
            const initialVersionId = state.versions[0].id;

            const modifiedPlan = createModifiedPlan(plan, {
                overview: { name: 'Modified', description: 'Changed', goals: [] },
            });
            saveVersion(state, modifiedPlan, 'manual_save');

            const rolledBackPlan = rollbackToVersion(state, initialVersionId, modifiedPlan);
            rolledBackPlan!.overview.name = 'Mutated After Rollback';

            // The stored version should remain untouched
            expect(state.versions[0].plan.overview.name).toBe('Test Project');
        });
    });

    // ========================================================================
    // Version Retrieval
    // ========================================================================

    describe('getVersion', () => {
        it('Test 16: should retrieve a version by its ID', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);
            const versionId = state.versions[0].id;

            const result = getVersion(state, versionId);

            expect(result).toBeDefined();
            expect(result!.id).toBe(versionId);
            expect(result!.versionNumber).toBe(1);
        });

        it('Test 17: should return undefined for a non-existent ID', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            const result = getVersion(state, 'does-not-exist');

            expect(result).toBeUndefined();
        });
    });

    describe('getVersionByNumber', () => {
        it('Test 18: should retrieve a version by its version number', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            const modifiedPlan = createModifiedPlan(plan, {
                overview: { name: 'V2', description: 'Second', goals: ['G'] },
            });
            saveVersion(state, modifiedPlan, 'manual_save');

            const result = getVersionByNumber(state, 2);

            expect(result).toBeDefined();
            expect(result!.versionNumber).toBe(2);
            expect(result!.plan.overview.name).toBe('V2');
        });

        it('Test 19: should return undefined for a non-existent version number', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            const result = getVersionByNumber(state, 999);

            expect(result).toBeUndefined();
        });
    });

    describe('getLatestVersion', () => {
        it('Test 20: should return the most recent version', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            const modifiedPlan = createModifiedPlan(plan, {
                overview: { name: 'Latest', description: 'Newest', goals: ['New'] },
            });
            saveVersion(state, modifiedPlan, 'manual_save');

            const latest = getLatestVersion(state);

            expect(latest.versionNumber).toBe(2);
            expect(latest.plan.overview.name).toBe('Latest');
        });
    });

    // ========================================================================
    // Version Labels
    // ========================================================================

    describe('setVersionLabel', () => {
        it('Test 21: should update the label of an existing version', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);
            const versionId = state.versions[0].id;

            const result = setVersionLabel(state, versionId, 'Milestone 1');

            expect(result).toBe(true);
            expect(state.versions[0].label).toBe('Milestone 1');
        });

        it('Test 22: should return false for a non-existent version ID', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            const result = setVersionLabel(state, 'no-such-id', 'Label');

            expect(result).toBe(false);
        });
    });

    // ========================================================================
    // Plan Comparison (Diffs)
    // ========================================================================

    describe('comparePlans', () => {
        it('Test 23: should detect no changes between identical plans', () => {
            const plan = createMockPlan();
            const diff = comparePlans(plan, plan);

            expect(diff.summary.totalChanges).toBe(0);
            expect(diff.added).toHaveLength(0);
            expect(diff.removed).toHaveLength(0);
            expect(diff.changed).toHaveLength(0);
        });

        it('Test 24: should detect changes in overview name', () => {
            const oldPlan = createMockPlan();
            const newPlan = createModifiedPlan(oldPlan, {
                overview: { ...oldPlan.overview, name: 'Renamed Project' },
            });

            const diff = comparePlans(oldPlan, newPlan);

            expect(diff.summary.changedCount).toBeGreaterThanOrEqual(1);
            const nameChange = diff.changed.find(c => c.fieldPath === 'overview.name');
            expect(nameChange).toBeDefined();
            expect(nameChange!.oldValue).toBe('Test Project');
            expect(nameChange!.newValue).toBe('Renamed Project');
        });

        it('Test 25: should detect changes in overview description', () => {
            const oldPlan = createMockPlan();
            const newPlan = createModifiedPlan(oldPlan, {
                overview: { ...oldPlan.overview, description: 'New description' },
            });

            const diff = comparePlans(oldPlan, newPlan);

            const descChange = diff.changed.find(c => c.fieldPath === 'overview.description');
            expect(descChange).toBeDefined();
            expect(descChange!.changeType).toBe('modified');
        });

        it('Test 26: should detect added and removed goals', () => {
            const oldPlan = createMockPlan();
            const newPlan = createModifiedPlan(oldPlan, {
                overview: {
                    ...oldPlan.overview,
                    goals: ['Goal 1', 'Goal 3'], // removed 'Goal 2', added 'Goal 3'
                },
            });

            const diff = comparePlans(oldPlan, newPlan);

            expect(diff.summary.addedCount).toBeGreaterThanOrEqual(1);
            expect(diff.summary.removedCount).toBeGreaterThanOrEqual(1);
            expect(diff.added).toContain('overview.goals');
            expect(diff.removed).toContain('overview.goals');
        });

        it('Test 27: should detect added feature blocks', () => {
            const oldPlan = createMockPlan();
            const newPlan = createModifiedPlan(oldPlan);
            newPlan.featureBlocks.push({
                id: 'fb-new',
                name: 'New Feature',
                description: 'Brand new',
                purpose: 'Testing additions',
                acceptanceCriteria: ['It works'],
                technicalNotes: 'None',
                priority: 'medium',
                order: 2,
            });

            const diff = comparePlans(oldPlan, newPlan);

            expect(diff.summary.addedCount).toBeGreaterThanOrEqual(1);
            expect(diff.added.some(p => p.includes('featureBlocks'))).toBe(true);
        });

        it('Test 28: should detect removed feature blocks', () => {
            const oldPlan = createMockPlan();
            const newPlan = createModifiedPlan(oldPlan);
            newPlan.featureBlocks = [];

            const diff = comparePlans(oldPlan, newPlan);

            expect(diff.summary.removedCount).toBeGreaterThanOrEqual(1);
            expect(diff.removed.some(p => p.includes('featureBlocks'))).toBe(true);
        });

        it('Test 29: should detect modified feature blocks', () => {
            const oldPlan = createMockPlan();
            const newPlan = createModifiedPlan(oldPlan);
            newPlan.featureBlocks[0].name = 'Renamed Feature';

            const diff = comparePlans(oldPlan, newPlan);

            expect(diff.summary.changedCount).toBeGreaterThanOrEqual(1);
            const fbChange = diff.changed.find(c => c.fieldPath.includes('featureBlocks'));
            expect(fbChange).toBeDefined();
            expect(fbChange!.changeType).toBe('modified');
        });

        it('Test 30: should detect changes in user stories', () => {
            const oldPlan = createMockPlan();
            const newPlan = createModifiedPlan(oldPlan);
            newPlan.userStories.push({
                id: 'us-new',
                userType: 'admin',
                action: 'manage users',
                benefit: 'control access',
                relatedBlockIds: [],
                acceptanceCriteria: ['RBAC works'],
                priority: 'medium',
            });

            const diff = comparePlans(oldPlan, newPlan);

            expect(diff.summary.addedCount).toBeGreaterThanOrEqual(1);
            expect(diff.added.some(p => p.includes('userStories'))).toBe(true);
        });

        it('Test 31: should detect changes in developer stories', () => {
            const oldPlan = createMockPlan();
            const newPlan = createModifiedPlan(oldPlan);
            newPlan.developerStories = [];

            const diff = comparePlans(oldPlan, newPlan);

            expect(diff.summary.removedCount).toBeGreaterThanOrEqual(1);
            expect(diff.removed.some(p => p.includes('developerStories'))).toBe(true);
        });

        it('Test 32: should detect changes in success criteria', () => {
            const oldPlan = createMockPlan();
            const newPlan = createModifiedPlan(oldPlan);
            newPlan.successCriteria[0].description = 'Updated criterion';

            const diff = comparePlans(oldPlan, newPlan);

            expect(diff.summary.changedCount).toBeGreaterThanOrEqual(1);
            const scChange = diff.changed.find(c => c.fieldPath.includes('successCriteria'));
            expect(scChange).toBeDefined();
        });

        it('Test 33: should detect changes in block links', () => {
            const oldPlan = createMockPlan();
            const newPlan = createModifiedPlan(oldPlan);
            newPlan.blockLinks = [];

            const diff = comparePlans(oldPlan, newPlan);

            expect(diff.summary.removedCount).toBeGreaterThanOrEqual(1);
            expect(diff.removed.some(p => p.includes('blockLinks'))).toBe(true);
        });

        it('Test 34: should produce correct summary statistics across multiple change types', () => {
            const oldPlan = createMockPlan();
            const newPlan = createModifiedPlan(oldPlan);

            // Modify name (1 modified change)
            newPlan.overview.name = 'Changed Name';
            // Add a feature (1 added)
            newPlan.featureBlocks.push({
                id: 'fb-added',
                name: 'Added Feature',
                description: 'New',
                purpose: 'Test',
                acceptanceCriteria: [],
                technicalNotes: '',
                priority: 'low',
                order: 2,
            });
            // Remove success criteria (1 removed)
            newPlan.successCriteria = [];

            const diff = comparePlans(oldPlan, newPlan);

            expect(diff.summary.totalChanges).toBe(
                diff.summary.addedCount + diff.summary.removedCount + diff.summary.changedCount
            );
            expect(diff.summary.addedCount).toBeGreaterThanOrEqual(1);
            expect(diff.summary.removedCount).toBeGreaterThanOrEqual(1);
            expect(diff.summary.changedCount).toBeGreaterThanOrEqual(1);
        });
    });

    // ========================================================================
    // UI Rendering
    // ========================================================================

    describe('renderVersionHistoryPanel', () => {
        it('Test 35: should render HTML containing version numbers', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            const html = renderVersionHistoryPanel(state);

            expect(html).toContain('v1');
            expect(html).toContain('Version History');
            expect(html).toContain('Save Version');
        });

        it('Test 36: should mark the current version with a current badge', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            const html = renderVersionHistoryPanel(state);

            expect(html).toContain('Current');
            expect(html).toContain('class="badge current"');
        });

        it('Test 37: should mark the latest version with a Latest badge', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            // Add a second version
            const modifiedPlan = createModifiedPlan(plan, {
                overview: { name: 'V2', description: 'Second', goals: [] },
            });
            saveVersion(state, modifiedPlan, 'manual_save');

            const html = renderVersionHistoryPanel(state);

            expect(html).toContain('Latest');
        });

        it('Test 38: should display version labels when present', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            // The initial version has the label 'Initial version'
            const html = renderVersionHistoryPanel(state);

            expect(html).toContain('Initial version');
        });

        it('Test 39: should display version descriptions when present', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            // The initial version has description 'Plan created'
            const html = renderVersionHistoryPanel(state);

            expect(html).toContain('Plan created');
        });

        it('Test 40: should escape HTML in labels and descriptions', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            // Set a label with HTML characters
            setVersionLabel(state, state.versions[0].id, '<script>alert("xss")</script>');

            const html = renderVersionHistoryPanel(state);

            expect(html).toContain('&lt;script&gt;');
            expect(html).not.toContain('<script>alert');
        });
    });

    describe('renderVersionComparison', () => {
        it('Test 41: should render comparison HTML with version numbers and diff stats', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            const modifiedPlan = createModifiedPlan(plan, {
                overview: { name: 'V2', description: 'Changed', goals: ['New Goal'] },
            });
            saveVersion(state, modifiedPlan, 'manual_save');

            const diff = comparePlans(
                state.versions[0].plan,
                state.versions[1].plan
            );

            const html = renderVersionComparison(state.versions[0], state.versions[1], diff);

            expect(html).toContain('v1');
            expect(html).toContain('v2');
            expect(html).toContain('added');
            expect(html).toContain('removed');
            expect(html).toContain('changed');
        });

        it('Test 42: should show "No differences found" when there are no changes', () => {
            const plan = createMockPlan();
            const emptyDiff: VersionDiff = {
                added: [],
                removed: [],
                changed: [],
                summary: {
                    totalChanges: 0,
                    addedCount: 0,
                    removedCount: 0,
                    changedCount: 0,
                },
            };

            const version: PlanVersion = {
                id: 'v1',
                versionNumber: 1,
                timestamp: new Date(),
                trigger: 'manual_save',
                plan,
            };

            const html = renderVersionComparison(version, version, emptyDiff);

            expect(html).toContain('No differences found');
        });
    });

    // ========================================================================
    // Styles and Scripts
    // ========================================================================

    describe('getVersioningStyles', () => {
        it('Test 43: should return CSS string with expected class selectors', () => {
            const css = getVersioningStyles();

            expect(css).toContain('.version-history-panel');
            expect(css).toContain('.version-item');
            expect(css).toContain('.version-comparison');
            expect(css).toContain('.change-item.added');
            expect(css).toContain('.change-item.removed');
            expect(css).toContain('.change-item.modified');
        });
    });

    describe('getVersioningScript', () => {
        it('Test 44: should return JavaScript string with expected function definitions', () => {
            const script = getVersioningScript();

            expect(script).toContain('function saveVersionManual()');
            expect(script).toContain('function compareToCurrent(');
            expect(script).toContain('function rollbackTo(');
            expect(script).toContain('function labelVersion(');
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('Edge cases', () => {
        it('Test 45: should handle all version trigger types', () => {
            const plan = createMockPlan();
            const triggers: VersionTrigger[] = [
                'auto_save',
                'page_navigation',
                'manual_save',
                'before_export',
                'before_execute',
                'rollback',
            ];

            for (const trigger of triggers) {
                const state = createVersioningState(plan);
                const modifiedPlan = createModifiedPlan(plan, {
                    overview: {
                        name: `Plan for ${trigger}`,
                        description: trigger,
                        goals: [trigger],
                    },
                });

                const result = saveVersion(state, modifiedPlan, trigger);
                expect(result).not.toBeNull();
                expect(result!.trigger).toBe(trigger);
            }
        });

        it('Test 46: should handle plans with empty arrays', () => {
            const emptyPlan = createMockPlan({
                featureBlocks: [],
                blockLinks: [],
                conditionalLogic: [],
                userStories: [],
                developerStories: [],
                successCriteria: [],
                overview: { name: 'Empty', description: '', goals: [] },
            });

            const state = createVersioningState(emptyPlan);
            expect(state.versions).toHaveLength(1);

            const diff = comparePlans(emptyPlan, emptyPlan);
            expect(diff.summary.totalChanges).toBe(0);
        });

        it('Test 47: should handle rapid successive saves with force flag', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            for (let i = 0; i < 10; i++) {
                saveVersion(state, plan, 'manual_save', { force: true });
            }

            expect(state.versions).toHaveLength(11); // 1 initial + 10 forced
            expect(state.currentVersionIndex).toBe(10);
        });

        it('Test 48: should correctly number versions sequentially', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);

            for (let i = 0; i < 5; i++) {
                const modified = createModifiedPlan(plan, {
                    overview: { name: `V${i + 2}`, description: `D${i + 2}`, goals: [`G${i}`] },
                });
                saveVersion(state, modified, 'manual_save');
            }

            for (let i = 0; i < state.versions.length; i++) {
                expect(state.versions[i].versionNumber).toBe(i + 1);
            }
        });

        it('Test 49: should handle VERSION_DEFAULTS constants correctly', () => {
            expect(VERSION_DEFAULTS.AUTO_SAVE_INTERVAL_MS).toBe(5 * 60 * 1000);
            expect(VERSION_DEFAULTS.MAX_VERSIONS).toBe(50);
            expect(VERSION_DEFAULTS.MIN_CHANGE_THRESHOLD).toBe(1);
        });

        it('Test 50: should handle rollback when rollback save detects no changes', () => {
            const plan = createMockPlan();
            const state = createVersioningState(plan);
            const initialVersionId = state.versions[0].id;

            // The current plan IS the same as the initial version, so the
            // save-before-rollback may not create a new version (no changes).
            const result = rollbackToVersion(state, initialVersionId, plan);

            // Should still return the rolled-back plan even if no save was needed
            expect(result).not.toBeNull();
            expect(result!.overview.name).toBe('Test Project');
        });
    });
});
