/**
 * Change Impact Analysis Tests (MT-033.28)
 *
 * Tests for change detection, impact tracing, risk assessment,
 * team impact, task impact, and panel rendering.
 */

import {
    detectChanges,
    detectArrayChanges,
    analyzeImpact,
    analyzeChangeImpact,
    buildAdjacencyList,
    traceTaskImpact,
    computeAffectedTeams,
    computeOverallRisk,
    computeSummary,
    formatSummaryText,
    renderImpactPanel,
    getImpactPanelStyles,
    PlanChange,
    AffectedItem,
    DEFAULT_CHANGE_ANALYSIS_CONFIG
} from '../../src/ui/changeAnalysis';

import {
    CompletePlan,
    FeatureBlock,
    DeveloperStory,
    UserStory,
    SuccessCriterion,
    BlockLink
} from '../../src/planning/types';

// ============================================================================
// Test Helpers
// ============================================================================

function createFeature(overrides: Partial<FeatureBlock> = {}): FeatureBlock {
    return {
        id: 'feature-1',
        name: 'User Auth',
        description: 'Authentication system',
        purpose: 'Security',
        acceptanceCriteria: ['Login works'],
        technicalNotes: '',
        priority: 'high',
        order: 1,
        ...overrides
    };
}

function createDevStory(overrides: Partial<DeveloperStory> = {}): DeveloperStory {
    return {
        id: 'ds-1',
        action: 'Implement login',
        benefit: 'Users can log in',
        technicalRequirements: ['src/auth.ts'],
        apiNotes: '',
        databaseNotes: '',
        estimatedHours: 1,
        relatedBlockIds: ['feature-1'],
        relatedTaskIds: [],
        ...overrides
    };
}

function createUserStory(overrides: Partial<UserStory> = {}): UserStory {
    return {
        id: 'us-1',
        userType: 'developer',
        action: 'log in',
        benefit: 'access system',
        relatedBlockIds: ['feature-1'],
        acceptanceCriteria: ['Can log in'],
        priority: 'high',
        ...overrides
    };
}

function createCriterion(overrides: Partial<SuccessCriterion> = {}): SuccessCriterion {
    return {
        id: 'sc-1',
        description: 'Users can authenticate',
        smartAttributes: { specific: true, measurable: true, achievable: true, relevant: true, timeBound: true },
        relatedFeatureIds: ['feature-1'],
        relatedStoryIds: ['us-1'],
        testable: true,
        priority: 'high',
        ...overrides
    };
}

function createPlan(overrides: Partial<CompletePlan> = {}): CompletePlan {
    return {
        metadata: { id: 'plan-1', name: 'Test Plan', createdAt: new Date(), updatedAt: new Date(), version: 1 },
        overview: { name: 'Test Plan', description: 'Test', goals: ['Build'] },
        featureBlocks: [createFeature()],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [createUserStory()],
        developerStories: [createDevStory()],
        successCriteria: [createCriterion()],
        ...overrides
    };
}

// ============================================================================
// Change Detection Tests
// ============================================================================

describe('ChangeAnalysis - Change Detection', () => {
    it('Test 1: should detect no changes when plans are identical', () => {
        const plan = createPlan();
        const changes = detectChanges(plan, plan);
        expect(changes).toHaveLength(0);
    });

    it('Test 2: should detect added feature', () => {
        const oldPlan = createPlan({ featureBlocks: [] });
        const newPlan = createPlan();
        const changes = detectChanges(oldPlan, newPlan);

        const featureAdded = changes.find(c => c.elementType === 'feature' && c.changeKind === 'added');
        expect(featureAdded).toBeDefined();
        expect(featureAdded!.description).toContain('User Auth');
    });

    it('Test 3: should detect removed feature', () => {
        const oldPlan = createPlan();
        const newPlan = createPlan({ featureBlocks: [] });
        const changes = detectChanges(oldPlan, newPlan);

        const removed = changes.find(c => c.elementType === 'feature' && c.changeKind === 'removed');
        expect(removed).toBeDefined();
    });

    it('Test 4: should detect modified feature', () => {
        const oldPlan = createPlan();
        const newPlan = createPlan({
            featureBlocks: [createFeature({ name: 'Updated Auth' })]
        });
        const changes = detectChanges(oldPlan, newPlan);

        const modified = changes.find(c => c.elementType === 'feature' && c.changeKind === 'modified');
        expect(modified).toBeDefined();
    });

    it('Test 5: should detect developer story changes', () => {
        const oldPlan = createPlan();
        const newPlan = createPlan({ developerStories: [] });
        const changes = detectChanges(oldPlan, newPlan);

        const removed = changes.find(c => c.elementType === 'devStory');
        expect(removed).toBeDefined();
    });

    it('Test 6: should detect user story changes', () => {
        const oldPlan = createPlan();
        const newPlan = createPlan({ userStories: [] });
        const changes = detectChanges(oldPlan, newPlan);

        expect(changes.some(c => c.elementType === 'userStory')).toBe(true);
    });

    it('Test 7: should detect block link changes', () => {
        const link: BlockLink = { id: 'link-1', sourceBlockId: 'f-1', targetBlockId: 'f-2', dependencyType: 'requires' };
        const oldPlan = createPlan({ blockLinks: [link] });
        const newPlan = createPlan({ blockLinks: [] });
        const changes = detectChanges(oldPlan, newPlan);

        expect(changes.some(c => c.elementType === 'blockLink')).toBe(true);
    });
});

// ============================================================================
// Array Change Detection Tests
// ============================================================================

describe('ChangeAnalysis - Array Detection', () => {
    it('Test 8: should detect all three change types', () => {
        const oldItems = [
            { id: '1', name: 'A' },
            { id: '2', name: 'B' }
        ];
        const newItems = [
            { id: '2', name: 'B-modified' },
            { id: '3', name: 'C' }
        ];

        const changes = detectArrayChanges(
            oldItems, newItems, 'feature',
            i => i.id, i => i.name
        );

        expect(changes.find(c => c.changeKind === 'added')).toBeDefined();
        expect(changes.find(c => c.changeKind === 'removed')).toBeDefined();
        expect(changes.find(c => c.changeKind === 'modified')).toBeDefined();
    });

    it('Test 9: should handle empty arrays', () => {
        const changes = detectArrayChanges([], [], 'feature', () => '', () => '');
        expect(changes).toHaveLength(0);
    });
});

// ============================================================================
// Impact Analysis Tests
// ============================================================================

describe('ChangeAnalysis - Impact Analysis', () => {
    it('Test 10: should return empty result for no changes', () => {
        const plan = createPlan();
        const result = analyzeImpact(plan, []);
        expect(result.affectedItems).toHaveLength(0);
        expect(result.overallRisk).toBe('low');
        expect(result.summaryText).toContain('No changes');
    });

    it('Test 11: should find affected dev stories when feature changes', () => {
        const plan = createPlan();
        const changes: PlanChange[] = [{
            elementType: 'feature',
            elementId: 'feature-1',
            changeKind: 'modified',
            description: 'Modified User Auth'
        }];

        const result = analyzeImpact(plan, changes);
        const affectedDevStory = result.affectedItems.find(a => a.type === 'devStory');
        expect(affectedDevStory).toBeDefined();
    });

    it('Test 12: should find affected user stories when feature changes', () => {
        const plan = createPlan();
        const changes: PlanChange[] = [{
            elementType: 'feature',
            elementId: 'feature-1',
            changeKind: 'modified',
            description: 'Modified User Auth'
        }];

        const result = analyzeImpact(plan, changes);
        const affectedUserStory = result.affectedItems.find(a => a.type === 'userStory');
        expect(affectedUserStory).toBeDefined();
    });

    it('Test 13: should find affected success criteria when feature changes', () => {
        const plan = createPlan();
        const changes: PlanChange[] = [{
            elementType: 'feature',
            elementId: 'feature-1',
            changeKind: 'modified',
            description: 'Modified User Auth'
        }];

        const result = analyzeImpact(plan, changes);
        const affectedCriterion = result.affectedItems.find(a => a.type === 'successCriterion');
        expect(affectedCriterion).toBeDefined();
    });

    it('Test 14: should increase severity for removed features', () => {
        const plan = createPlan();
        const changes: PlanChange[] = [{
            elementType: 'feature',
            elementId: 'feature-1',
            changeKind: 'removed',
            description: 'Removed User Auth'
        }];

        const result = analyzeImpact(plan, changes);
        const highSeverity = result.affectedItems.filter(a => a.severity === 'high');
        expect(highSeverity.length).toBeGreaterThan(0);
    });

    it('Test 15: should trace through block links', () => {
        const feature2 = createFeature({ id: 'feature-2', name: 'Dashboard', order: 2 });
        const link: BlockLink = { id: 'link-1', sourceBlockId: 'feature-1', targetBlockId: 'feature-2', dependencyType: 'requires' };
        const plan = createPlan({
            featureBlocks: [createFeature(), feature2],
            blockLinks: [link]
        });

        const changes: PlanChange[] = [{
            elementType: 'feature',
            elementId: 'feature-1',
            changeKind: 'modified',
            description: 'Modified User Auth'
        }];

        const result = analyzeImpact(plan, changes);
        const affectedDashboard = result.affectedItems.find(a => a.id === 'feature-2');
        expect(affectedDashboard).toBeDefined();
    });

    it('Test 16: should respect maxTraversalDepth', () => {
        const plan = createPlan();
        const changes: PlanChange[] = [{
            elementType: 'feature',
            elementId: 'feature-1',
            changeKind: 'modified',
            description: 'Modified'
        }];

        const result = analyzeImpact(plan, changes, { maxTraversalDepth: 0 });
        expect(result.warnings.length).toBe(0); // depth 0 still processes current level
    });
});

// ============================================================================
// Adjacency List Tests
// ============================================================================

describe('ChangeAnalysis - Adjacency List', () => {
    it('Test 17: should build bidirectional adjacency', () => {
        const links: BlockLink[] = [
            { id: 'l-1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }
        ];
        const adj = buildAdjacencyList(links);

        expect(adj.get('a')).toContain('b');
        expect(adj.get('b')).toContain('a');
    });

    it('Test 18: should handle empty links', () => {
        const adj = buildAdjacencyList([]);
        expect(adj.size).toBe(0);
    });

    it('Test 19: should handle multiple links', () => {
        const links: BlockLink[] = [
            { id: 'l-1', sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' },
            { id: 'l-2', sourceBlockId: 'a', targetBlockId: 'c', dependencyType: 'triggers' }
        ];
        const adj = buildAdjacencyList(links);
        expect(adj.get('a')).toHaveLength(2);
    });
});

// ============================================================================
// Full Analysis Tests (analyzeChangeImpact)
// ============================================================================

describe('ChangeAnalysis - Full Analysis', () => {
    it('Test 20: should detect and analyze changes in one call', () => {
        const oldPlan = createPlan();
        const newPlan = createPlan({
            featureBlocks: [createFeature({ name: 'Updated Auth' })]
        });

        const result = analyzeChangeImpact(oldPlan, newPlan);
        expect(result.changes.length).toBeGreaterThan(0);
        expect(result.affectedItems.length).toBeGreaterThan(0);
    });

    it('Test 21: should work when no changes detected', () => {
        const plan = createPlan();
        const result = analyzeChangeImpact(plan, plan);
        expect(result.changes).toHaveLength(0);
        expect(result.summaryText).toContain('No changes');
    });
});

// ============================================================================
// Task Impact Tests
// ============================================================================

describe('ChangeAnalysis - Task Impact', () => {
    it('Test 22: should find affected tasks', () => {
        const plan = createPlan();
        const changes: PlanChange[] = [{
            elementType: 'feature',
            elementId: 'feature-1',
            changeKind: 'modified',
            description: 'Modified'
        }];

        const taskAffected = traceTaskImpact(plan, changes, []);
        expect(taskAffected.length).toBeGreaterThan(0);
    });

    it('Test 23: should find affected master tickets', () => {
        const plan = createPlan();
        const changes: PlanChange[] = [{
            elementType: 'feature',
            elementId: 'feature-1',
            changeKind: 'modified',
            description: 'Modified'
        }];

        const taskAffected = traceTaskImpact(plan, changes, []);
        const mt = taskAffected.find(a => a.type === 'masterTicket');
        expect(mt).toBeDefined();
    });

    it('Test 24: should handle empty plan gracefully', () => {
        const plan = createPlan({ featureBlocks: [], developerStories: [] });
        const changes: PlanChange[] = [{
            elementType: 'feature',
            elementId: 'missing',
            changeKind: 'removed',
            description: 'Removed'
        }];

        const taskAffected = traceTaskImpact(plan, changes, []);
        expect(taskAffected).toHaveLength(0);
    });
});

// ============================================================================
// Team Impact Tests
// ============================================================================

describe('ChangeAnalysis - Team Impact', () => {
    it('Test 25: should find affected teams', () => {
        const plan = createPlan();
        const changes: PlanChange[] = [{
            elementType: 'feature',
            elementId: 'feature-1',
            changeKind: 'modified',
            description: 'Modified'
        }];

        const teams = computeAffectedTeams(plan, changes, [
            { type: 'feature', id: 'feature-1', name: 'Auth', reason: 'Changed', severity: 'medium' }
        ]);

        expect(teams.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// Risk Calculation Tests
// ============================================================================

describe('ChangeAnalysis - Risk', () => {
    it('Test 26: should be low risk for few items', () => {
        const changes: PlanChange[] = [{ elementType: 'feature', elementId: '1', changeKind: 'modified', description: '' }];
        const affected: AffectedItem[] = [
            { type: 'devStory', id: '1', name: 'A', reason: 'R', severity: 'low' }
        ];
        expect(computeOverallRisk(changes, affected)).toBe('low');
    });

    it('Test 27: should be medium risk for removals', () => {
        const changes: PlanChange[] = [{ elementType: 'feature', elementId: '1', changeKind: 'removed', description: '' }];
        const affected: AffectedItem[] = [
            { type: 'devStory', id: '1', name: 'A', reason: 'R', severity: 'low' }
        ];
        expect(computeOverallRisk(changes, affected)).toBe('medium');
    });

    it('Test 28: should be high risk for many affected items', () => {
        const changes: PlanChange[] = [{ elementType: 'feature', elementId: '1', changeKind: 'modified', description: '' }];
        const affected: AffectedItem[] = Array.from({ length: 16 }, (_, i) => ({
            type: 'task' as const, id: `${i}`, name: `T${i}`, reason: 'R', severity: 'low' as const
        }));
        expect(computeOverallRisk(changes, affected)).toBe('high');
    });

    it('Test 29: should be critical for critical severity items', () => {
        const changes: PlanChange[] = [{ elementType: 'feature', elementId: '1', changeKind: 'modified', description: '' }];
        const affected: AffectedItem[] = [
            { type: 'feature', id: '1', name: 'A', reason: 'R', severity: 'critical' }
        ];
        expect(computeOverallRisk(changes, affected)).toBe('critical');
    });
});

// ============================================================================
// Summary Tests
// ============================================================================

describe('ChangeAnalysis - Summary', () => {
    it('Test 30: should compute correct counts', () => {
        const items: AffectedItem[] = [
            { type: 'feature', id: '1', name: 'F', reason: '', severity: 'low' },
            { type: 'devStory', id: '2', name: 'D', reason: '', severity: 'low' },
            { type: 'userStory', id: '3', name: 'U', reason: '', severity: 'low' },
            { type: 'task', id: '4', name: 'T', reason: '', severity: 'low' },
            { type: 'masterTicket', id: '5', name: 'M', reason: '', severity: 'low' }
        ];

        const summary = computeSummary(items, ['coding'], createPlan());
        expect(summary.totalAffected).toBe(5);
        expect(summary.affectedFeatures).toBe(1);
        expect(summary.affectedStories).toBe(2);
        expect(summary.affectedTasks).toBe(2);
        expect(summary.affectedTeams).toEqual(['coding']);
    });

    it('Test 31: should estimate rework time', () => {
        const items: AffectedItem[] = [
            { type: 'feature', id: '1', name: 'F', reason: '', severity: 'low' }, // 60 min
            { type: 'devStory', id: '2', name: 'D', reason: '', severity: 'low' } // 15 min
        ];
        const summary = computeSummary(items, [], createPlan());
        expect(summary.estimatedReworkMinutes).toBe(75);
    });

    it('Test 32: should format summary text', () => {
        const changes: PlanChange[] = [{ elementType: 'feature', elementId: '1', changeKind: 'modified', description: '' }];
        const summary = computeSummary(
            [{ type: 'feature', id: '1', name: 'F', reason: '', severity: 'low' }],
            ['coding'], createPlan()
        );
        const text = formatSummaryText(changes, summary, 'low');
        expect(text).toContain('1 change(s)');
        expect(text).toContain('1 feature(s)');
        expect(text).toContain('LOW');
    });
});

// ============================================================================
// Rendering Tests
// ============================================================================

describe('ChangeAnalysis - Rendering', () => {
    it('Test 33: should render impact panel', () => {
        const result = analyzeChangeImpact(
            createPlan(),
            createPlan({ featureBlocks: [createFeature({ name: 'Updated' })] })
        );
        const html = renderImpactPanel(result);
        expect(html).toContain('impact-panel');
        expect(html).toContain('Change Impact Analysis');
    });

    it('Test 34: should show risk badge', () => {
        const result = analyzeChangeImpact(createPlan(), createPlan());
        const html = renderImpactPanel(result);
        expect(html).toContain('risk-badge');
    });

    it('Test 35: should show changes made section', () => {
        const result = analyzeChangeImpact(
            createPlan(),
            createPlan({ featureBlocks: [] })
        );
        const html = renderImpactPanel(result);
        expect(html).toContain('Changes Made');
        expect(html).toContain('REMOVED');
    });

    it('Test 36: should show affected items', () => {
        const result = analyzeChangeImpact(
            createPlan(),
            createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] })
        );
        const html = renderImpactPanel(result);
        expect(html).toContain('Affected Items');
    });

    it('Test 37: should show warnings when present', () => {
        const result: ReturnType<typeof analyzeChangeImpact> = {
            changes: [],
            affectedItems: [],
            overallRisk: 'low',
            summary: { totalAffected: 0, affectedFeatures: 0, affectedStories: 0, affectedTasks: 0, affectedTeams: [], estimatedReworkMinutes: 0 },
            summaryText: '',
            warnings: ['Test warning']
        };
        const html = renderImpactPanel(result);
        expect(html).toContain('Test warning');
    });

    it('Test 38: should return impact panel styles', () => {
        const styles = getImpactPanelStyles();
        expect(styles).toContain('.impact-panel');
        expect(styles).toContain('.risk-badge');
        expect(styles).toContain('.severity-low');
        expect(styles).toContain('.severity-critical');
    });
});

// ============================================================================
// Config Tests
// ============================================================================

describe('ChangeAnalysis - Config', () => {
    it('Test 39: should have sensible defaults', () => {
        expect(DEFAULT_CHANGE_ANALYSIS_CONFIG.includeTaskImpact).toBe(true);
        expect(DEFAULT_CHANGE_ANALYSIS_CONFIG.includeTeamImpact).toBe(true);
        expect(DEFAULT_CHANGE_ANALYSIS_CONFIG.maxTraversalDepth).toBe(5);
        expect(DEFAULT_CHANGE_ANALYSIS_CONFIG.includeTransitive).toBe(true);
    });

    it('Test 40: should skip task impact when disabled', () => {
        const oldPlan = createPlan();
        const newPlan = createPlan({ featureBlocks: [createFeature({ name: 'Changed' })] });
        const result = analyzeChangeImpact(oldPlan, newPlan, { includeTaskImpact: false });

        const taskItems = result.affectedItems.filter(a => a.type === 'task' || a.type === 'masterTicket');
        expect(taskItems).toHaveLength(0);
    });
});
