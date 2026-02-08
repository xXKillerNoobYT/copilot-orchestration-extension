/**
 * Change Impact Analysis (MT-033.28)
 *
 * Analyzes the impact of changes to a plan by tracing dependencies across
 * feature blocks, developer stories, user stories, tasks, and agent teams.
 * Shows what else is affected when editing a plan element.
 *
 * **Simple explanation**: When you change one part of your plan, this module
 * tells you exactly what else will be affected — like ripples in a pond.
 *
 * @module ui/changeAnalysis
 */

import {
    CompletePlan,
    FeatureBlock,
    BlockLink,
    DeveloperStory,
    UserStory,
    SuccessCriterion
} from '../planning/types';

import {
    generateTaskBreakdown,
    MasterTicket,
    AtomicTask,
    AgentTeam
} from '../generators/taskBreakdown';

// ============================================================================
// Types
// ============================================================================

/** The kind of plan element being changed */
export type ChangedElementType = 'feature' | 'devStory' | 'userStory' | 'successCriterion' | 'blockLink';

/** What kind of change was made */
export type ChangeKind = 'added' | 'removed' | 'modified';

/** Risk level of the impact */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * A single change to a plan element.
 *
 * **Simple explanation**: One edit you made to the plan.
 */
export interface PlanChange {
    /** Which type of element changed */
    elementType: ChangedElementType;
    /** ID of the changed element */
    elementId: string;
    /** What kind of change */
    changeKind: ChangeKind;
    /** Human-readable description */
    description: string;
}

/**
 * An item affected by a change.
 *
 * **Simple explanation**: Something that will be impacted by your edit.
 */
export interface AffectedItem {
    /** Type of the affected item */
    type: 'feature' | 'devStory' | 'userStory' | 'successCriterion' | 'task' | 'masterTicket';
    /** ID */
    id: string;
    /** Display name */
    name: string;
    /** Why this item is affected */
    reason: string;
    /** How severe the impact is */
    severity: RiskLevel;
}

/**
 * Impact analysis configuration.
 *
 * **Simple explanation**: Settings for how deep the analysis goes.
 */
export interface ChangeAnalysisConfig {
    /** Whether to trace through task breakdown */
    includeTaskImpact: boolean;
    /** Whether to trace through agent team assignments */
    includeTeamImpact: boolean;
    /** Maximum depth of dependency traversal */
    maxTraversalDepth: number;
    /** Whether to include indirect (transitive) dependencies */
    includeTransitive: boolean;
}

/**
 * Full impact analysis result.
 *
 * **Simple explanation**: The complete report of everything affected by your changes.
 */
export interface ChangeAnalysisResult {
    /** The changes that were analyzed */
    changes: PlanChange[];
    /** All affected items */
    affectedItems: AffectedItem[];
    /** Overall risk level */
    overallRisk: RiskLevel;
    /** Summary stats */
    summary: ImpactSummary;
    /** Human-readable summary */
    summaryText: string;
    /** Warnings about potential problems */
    warnings: string[];
}

/**
 * Summary statistics for impact analysis.
 */
export interface ImpactSummary {
    /** Total affected items */
    totalAffected: number;
    /** Affected features count */
    affectedFeatures: number;
    /** Affected stories count */
    affectedStories: number;
    /** Affected tasks count */
    affectedTasks: number;
    /** Affected agent teams */
    affectedTeams: AgentTeam[];
    /** Estimated rework minutes */
    estimatedReworkMinutes: number;
}

/** Default configuration */
export const DEFAULT_CHANGE_ANALYSIS_CONFIG: ChangeAnalysisConfig = {
    includeTaskImpact: true,
    includeTeamImpact: true,
    maxTraversalDepth: 5,
    includeTransitive: true
};

// ============================================================================
// Change Detection
// ============================================================================

/**
 * Detect changes between two versions of a plan.
 *
 * **Simple explanation**: Compares old and new plan to figure out what changed.
 */
export function detectChanges(
    oldPlan: CompletePlan,
    newPlan: CompletePlan
): PlanChange[] {
    const changes: PlanChange[] = [];

    // Feature block changes
    changes.push(...detectArrayChanges<FeatureBlock>(
        oldPlan.featureBlocks, newPlan.featureBlocks, 'feature',
        f => f.id, f => f.name
    ));

    // Developer story changes
    changes.push(...detectArrayChanges<DeveloperStory>(
        oldPlan.developerStories, newPlan.developerStories, 'devStory',
        d => d.id, d => d.action
    ));

    // User story changes
    changes.push(...detectArrayChanges<UserStory>(
        oldPlan.userStories, newPlan.userStories, 'userStory',
        u => u.id, u => u.action
    ));

    // Success criteria changes
    changes.push(...detectArrayChanges<SuccessCriterion>(
        oldPlan.successCriteria, newPlan.successCriteria, 'successCriterion',
        s => s.id, s => s.description
    ));

    // Block link changes
    changes.push(...detectArrayChanges<BlockLink>(
        oldPlan.blockLinks, newPlan.blockLinks, 'blockLink',
        l => l.id, l => `${l.sourceBlockId} → ${l.targetBlockId}`
    ));

    return changes;
}

/**
 * Detect added, removed, and modified items in two arrays.
 *
 * **Simple explanation**: Compares two lists and finds what's new, gone, or different.
 */
export function detectArrayChanges<T>(
    oldItems: T[],
    newItems: T[],
    elementType: ChangedElementType,
    getId: (item: T) => string,
    getName: (item: T) => string
): PlanChange[] {
    const changes: PlanChange[] = [];
    const oldMap = new Map(oldItems.map(item => [getId(item), item]));
    const newMap = new Map(newItems.map(item => [getId(item), item]));

    // Added
    for (const [id, item] of newMap) {
        if (!oldMap.has(id)) {
            changes.push({
                elementType,
                elementId: id,
                changeKind: 'added',
                description: `Added ${elementType}: ${getName(item)}`
            });
        }
    }

    // Removed
    for (const [id, item] of oldMap) {
        if (!newMap.has(id)) {
            changes.push({
                elementType,
                elementId: id,
                changeKind: 'removed',
                description: `Removed ${elementType}: ${getName(item)}`
            });
        }
    }

    // Modified
    for (const [id, oldItem] of oldMap) {
        const newItem = newMap.get(id);
        if (newItem && JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
            changes.push({
                elementType,
                elementId: id,
                changeKind: 'modified',
                description: `Modified ${elementType}: ${getName(newItem)}`
            });
        }
    }

    return changes;
}

// ============================================================================
// Impact Analysis
// ============================================================================

/**
 * Analyze the impact of changes on the plan.
 *
 * **Simple explanation**: Takes a list of changes and traces through the plan
 * to find everything that's affected.
 */
export function analyzeImpact(
    plan: CompletePlan,
    changes: PlanChange[],
    config: Partial<ChangeAnalysisConfig> = {}
): ChangeAnalysisResult {
    const cfg = { ...DEFAULT_CHANGE_ANALYSIS_CONFIG, ...config };
    const affected: AffectedItem[] = [];
    const warnings: string[] = [];

    if (changes.length === 0) {
        return {
            changes,
            affectedItems: [],
            overallRisk: 'low',
            summary: emptySummary(),
            summaryText: 'No changes detected.',
            warnings: []
        };
    }

    // Build lookup maps
    const featureMap = new Map(plan.featureBlocks.map(f => [f.id, f]));
    const devStoryMap = new Map(plan.developerStories.map(d => [d.id, d]));
    const userStoryMap = new Map(plan.userStories.map(u => [u.id, u]));
    const criteriaMap = new Map(plan.successCriteria.map(s => [s.id, s]));

    // Build adjacency list from block links
    const adjacency = buildAdjacencyList(plan.blockLinks);

    // Track visited to avoid duplicates
    const visited = new Set<string>();

    for (const change of changes) {
        traceImpact(
            change, plan, cfg, affected, warnings, visited,
            featureMap, devStoryMap, userStoryMap, criteriaMap, adjacency, 0
        );
    }

    // Deduplicate affected items
    const deduped = deduplicateAffected(affected);

    // Task impact
    let taskAffected: AffectedItem[] = [];
    if (cfg.includeTaskImpact) {
        taskAffected = traceTaskImpact(plan, changes, deduped);
    }

    const allAffected = [...deduped, ...taskAffected];

    // Team impact
    const affectedTeams = cfg.includeTeamImpact
        ? computeAffectedTeams(plan, changes, allAffected)
        : [];

    // Calculate summary
    const summary = computeSummary(allAffected, affectedTeams, plan);
    const overallRisk = computeOverallRisk(changes, allAffected);
    const summaryText = formatSummaryText(changes, summary, overallRisk);

    return {
        changes,
        affectedItems: allAffected,
        overallRisk,
        summary,
        summaryText,
        warnings
    };
}

/**
 * Full analysis: detect changes between plans and analyze impact.
 *
 * **Simple explanation**: The all-in-one function — give it old and new plan,
 * get back the full impact report.
 */
export function analyzeChangeImpact(
    oldPlan: CompletePlan,
    newPlan: CompletePlan,
    config: Partial<ChangeAnalysisConfig> = {}
): ChangeAnalysisResult {
    const changes = detectChanges(oldPlan, newPlan);
    return analyzeImpact(newPlan, changes, config);
}

// ============================================================================
// Impact Tracing Internals
// ============================================================================

/**
 * Build adjacency list from block links.
 *
 * **Simple explanation**: Creates a map of which features depend on which others.
 */
export function buildAdjacencyList(
    links: BlockLink[]
): Map<string, string[]> {
    const adj = new Map<string, string[]>();

    for (const link of links) {
        // Forward: source → target
        const fwd = adj.get(link.sourceBlockId) ?? [];
        fwd.push(link.targetBlockId);
        adj.set(link.sourceBlockId, fwd);

        // Reverse: target → source (for bidirectional impact)
        const rev = adj.get(link.targetBlockId) ?? [];
        rev.push(link.sourceBlockId);
        adj.set(link.targetBlockId, rev);
    }

    return adj;
}

/** Trace impact of a single change through the plan graph */
function traceImpact(
    change: PlanChange,
    plan: CompletePlan,
    config: ChangeAnalysisConfig,
    affected: AffectedItem[],
    warnings: string[],
    visited: Set<string>,
    featureMap: Map<string, FeatureBlock>,
    devStoryMap: Map<string, DeveloperStory>,
    userStoryMap: Map<string, UserStory>,
    criteriaMap: Map<string, SuccessCriterion>,
    adjacency: Map<string, string[]>,
    depth: number
): void {
    if (depth > config.maxTraversalDepth) {
        warnings.push(`Traversal depth exceeded for ${change.elementType} ${change.elementId}`);
        return;
    }

    const key = `${change.elementType}:${change.elementId}`;
    if (visited.has(key)) { return; }
    visited.add(key);

    switch (change.elementType) {
        case 'feature':
            traceFeatureImpact(
                change, plan, config, affected, warnings, visited,
                featureMap, devStoryMap, userStoryMap, criteriaMap, adjacency, depth
            );
            break;
        case 'devStory':
            traceDevStoryImpact(change, plan, affected, devStoryMap, featureMap);
            break;
        case 'userStory':
            traceUserStoryImpact(change, plan, affected, userStoryMap, featureMap);
            break;
        case 'successCriterion':
            traceCriterionImpact(change, plan, affected, criteriaMap, featureMap);
            break;
        case 'blockLink':
            traceLinkImpact(change, plan, affected, featureMap);
            break;
    }
}

/** Trace impact when a feature block changes */
function traceFeatureImpact(
    change: PlanChange,
    plan: CompletePlan,
    config: ChangeAnalysisConfig,
    affected: AffectedItem[],
    warnings: string[],
    visited: Set<string>,
    featureMap: Map<string, FeatureBlock>,
    devStoryMap: Map<string, DeveloperStory>,
    userStoryMap: Map<string, UserStory>,
    criteriaMap: Map<string, SuccessCriterion>,
    adjacency: Map<string, string[]>,
    depth: number
): void {
    const featureId = change.elementId;

    // Find dev stories related to this feature
    for (const story of plan.developerStories) {
        if (story.relatedBlockIds.includes(featureId)) {
            affected.push({
                type: 'devStory',
                id: story.id,
                name: story.action,
                reason: `Developer story references changed feature`,
                severity: change.changeKind === 'removed' ? 'high' : 'medium'
            });
        }
    }

    // Find user stories related to this feature
    for (const story of plan.userStories) {
        if (story.relatedBlockIds.includes(featureId)) {
            affected.push({
                type: 'userStory',
                id: story.id,
                name: story.action,
                reason: `User story references changed feature`,
                severity: change.changeKind === 'removed' ? 'high' : 'medium'
            });
        }
    }

    // Find success criteria related to this feature
    for (const criterion of plan.successCriteria) {
        if (criterion.relatedFeatureIds.includes(featureId)) {
            affected.push({
                type: 'successCriterion',
                id: criterion.id,
                name: criterion.description,
                reason: `Success criterion references changed feature`,
                severity: change.changeKind === 'removed' ? 'high' : 'low'
            });
        }
    }

    // Trace through block links (transitive dependencies)
    if (config.includeTransitive) {
        const neighbors = adjacency.get(featureId) ?? [];
        for (const neighborId of neighbors) {
            const feature = featureMap.get(neighborId);
            if (feature) {
                affected.push({
                    type: 'feature',
                    id: neighborId,
                    name: feature.name,
                    reason: `Linked to changed feature via dependency`,
                    severity: 'medium'
                });

                // Recurse into neighbors
                traceImpact(
                    { elementType: 'feature', elementId: neighborId, changeKind: 'modified', description: `Transitive from ${featureId}` },
                    plan, config, affected, warnings, visited,
                    featureMap, devStoryMap, userStoryMap, criteriaMap, adjacency,
                    depth + 1
                );
            }
        }
    }
}

/** Trace impact when a developer story changes */
function traceDevStoryImpact(
    change: PlanChange,
    plan: CompletePlan,
    affected: AffectedItem[],
    devStoryMap: Map<string, DeveloperStory>,
    featureMap: Map<string, FeatureBlock>
): void {
    const story = devStoryMap.get(change.elementId);
    if (!story) { return; }

    // Affected features
    for (const blockId of story.relatedBlockIds) {
        const feature = featureMap.get(blockId);
        if (feature) {
            affected.push({
                type: 'feature',
                id: blockId,
                name: feature.name,
                reason: `Feature references changed developer story`,
                severity: 'low'
            });
        }
    }

    // Related tasks via relatedTaskIds
    for (const taskId of story.relatedTaskIds) {
        const otherStory = plan.developerStories.find(d => d.id === taskId);
        if (otherStory) {
            affected.push({
                type: 'devStory',
                id: otherStory.id,
                name: otherStory.action,
                reason: `Related to changed developer story`,
                severity: 'low'
            });
        }
    }
}

/** Trace impact when a user story changes */
function traceUserStoryImpact(
    change: PlanChange,
    plan: CompletePlan,
    affected: AffectedItem[],
    userStoryMap: Map<string, UserStory>,
    featureMap: Map<string, FeatureBlock>
): void {
    const story = userStoryMap.get(change.elementId);
    if (!story) { return; }

    for (const blockId of story.relatedBlockIds) {
        const feature = featureMap.get(blockId);
        if (feature) {
            affected.push({
                type: 'feature',
                id: blockId,
                name: feature.name,
                reason: `Feature references changed user story`,
                severity: 'low'
            });
        }
    }
}

/** Trace impact when a success criterion changes */
function traceCriterionImpact(
    change: PlanChange,
    plan: CompletePlan,
    affected: AffectedItem[],
    criteriaMap: Map<string, SuccessCriterion>,
    featureMap: Map<string, FeatureBlock>
): void {
    const criterion = criteriaMap.get(change.elementId);
    if (!criterion) { return; }

    for (const featureId of criterion.relatedFeatureIds) {
        const feature = featureMap.get(featureId);
        if (feature) {
            affected.push({
                type: 'feature',
                id: featureId,
                name: feature.name,
                reason: `Feature linked to changed success criterion`,
                severity: 'low'
            });
        }
    }
}

/** Trace impact when a block link changes */
function traceLinkImpact(
    change: PlanChange,
    plan: CompletePlan,
    affected: AffectedItem[],
    featureMap: Map<string, FeatureBlock>
): void {
    // Find the link by looking for it in both old and new plan
    const link = plan.blockLinks.find(l => l.id === change.elementId);
    if (!link) { return; }

    const source = featureMap.get(link.sourceBlockId);
    const target = featureMap.get(link.targetBlockId);

    if (source) {
        affected.push({
            type: 'feature',
            id: source.id,
            name: source.name,
            reason: `Source of changed dependency link`,
            severity: 'medium'
        });
    }

    if (target) {
        affected.push({
            type: 'feature',
            id: target.id,
            name: target.name,
            reason: `Target of changed dependency link`,
            severity: 'medium'
        });
    }
}

// ============================================================================
// Task & Team Impact
// ============================================================================

/**
 * Trace impact through the task breakdown.
 *
 * **Simple explanation**: Figures out which tasks will need to be redone
 * because of the plan changes.
 */
export function traceTaskImpact(
    plan: CompletePlan,
    changes: PlanChange[],
    affectedPlanItems: AffectedItem[]
): AffectedItem[] {
    const taskAffected: AffectedItem[] = [];

    try {
        const breakdown = generateTaskBreakdown(plan, { generateTestTasks: false });

        // Collect all affected feature IDs
        const affectedFeatureIds = new Set<string>();
        for (const change of changes) {
            if (change.elementType === 'feature') {
                affectedFeatureIds.add(change.elementId);
            }
        }
        for (const item of affectedPlanItems) {
            if (item.type === 'feature') {
                affectedFeatureIds.add(item.id);
            }
        }

        // Find master tickets for affected features
        for (const mt of breakdown.masterTickets) {
            if (affectedFeatureIds.has(mt.featureId)) {
                taskAffected.push({
                    type: 'masterTicket',
                    id: mt.id,
                    name: mt.title,
                    reason: `Master ticket for affected feature`,
                    severity: 'medium'
                });
            }
        }

        // Find tasks for affected features
        for (const task of breakdown.tasks) {
            if (affectedFeatureIds.has(task.featureId)) {
                taskAffected.push({
                    type: 'task',
                    id: task.id,
                    name: task.title,
                    reason: `Task under affected feature`,
                    severity: 'medium'
                });
            }
        }
    } catch {
        // If breakdown fails (e.g., empty plan), skip task impact
    }

    return taskAffected;
}

/**
 * Compute which agent teams are affected.
 *
 * **Simple explanation**: Figures out which AI teams need to adjust their work.
 */
export function computeAffectedTeams(
    plan: CompletePlan,
    changes: PlanChange[],
    affectedItems: AffectedItem[]
): AgentTeam[] {
    const teams = new Set<AgentTeam>();

    try {
        const breakdown = generateTaskBreakdown(plan, { generateTestTasks: false });

        // Collect affected features
        const affectedFeatureIds = new Set<string>();
        for (const item of affectedItems) {
            if (item.type === 'feature') { affectedFeatureIds.add(item.id); }
        }
        for (const change of changes) {
            if (change.elementType === 'feature') { affectedFeatureIds.add(change.elementId); }
        }

        // Find teams of affected tasks
        for (const task of breakdown.tasks) {
            if (affectedFeatureIds.has(task.featureId)) {
                teams.add(task.assignedTeam);
            }
        }
    } catch {
        // If breakdown fails, return empty
    }

    return Array.from(teams);
}

// ============================================================================
// Risk & Summary Calculation
// ============================================================================

/**
 * Compute overall risk level from changes and affected items.
 *
 * **Simple explanation**: Decides if the change is low risk, medium, high, or critical.
 */
export function computeOverallRisk(
    changes: PlanChange[],
    affectedItems: AffectedItem[]
): RiskLevel {
    const hasRemovals = changes.some(c => c.changeKind === 'removed');
    const criticalCount = affectedItems.filter(a => a.severity === 'critical').length;
    const highCount = affectedItems.filter(a => a.severity === 'high').length;
    const totalAffected = affectedItems.length;

    if (criticalCount > 0 || (hasRemovals && totalAffected > 10)) { return 'critical'; }
    if (highCount > 2 || totalAffected > 15) { return 'high'; }
    if (totalAffected > 5 || hasRemovals) { return 'medium'; }
    return 'low';
}

/**
 * Compute summary statistics.
 */
export function computeSummary(
    affectedItems: AffectedItem[],
    affectedTeams: AgentTeam[],
    plan: CompletePlan
): ImpactSummary {
    const affectedFeatures = affectedItems.filter(a => a.type === 'feature').length;
    const affectedStories = affectedItems.filter(a => a.type === 'devStory' || a.type === 'userStory').length;
    const affectedTasks = affectedItems.filter(a => a.type === 'task' || a.type === 'masterTicket').length;

    // Estimate rework: ~30 min per task, ~15 min per story, ~60 min per feature
    const estimatedReworkMinutes =
        affectedFeatures * 60 +
        affectedStories * 15 +
        affectedTasks * 30;

    return {
        totalAffected: affectedItems.length,
        affectedFeatures,
        affectedStories,
        affectedTasks,
        affectedTeams,
        estimatedReworkMinutes
    };
}

/**
 * Format a human-readable summary.
 */
export function formatSummaryText(
    changes: PlanChange[],
    summary: ImpactSummary,
    risk: RiskLevel
): string {
    const parts: string[] = [];

    parts.push(`${changes.length} change(s) detected.`);
    parts.push(`Impact: ${summary.totalAffected} affected items`);

    if (summary.affectedFeatures > 0) {
        parts.push(`${summary.affectedFeatures} feature(s)`);
    }
    if (summary.affectedStories > 0) {
        parts.push(`${summary.affectedStories} story/stories`);
    }
    if (summary.affectedTasks > 0) {
        parts.push(`${summary.affectedTasks} task(s)`);
    }
    if (summary.affectedTeams.length > 0) {
        parts.push(`${summary.affectedTeams.length} team(s) affected`);
    }

    parts.push(`Risk: ${risk.toUpperCase()}`);
    parts.push(`Estimated rework: ~${summary.estimatedReworkMinutes} min`);

    return parts.join(' | ');
}

// ============================================================================
// Helpers
// ============================================================================

/** Remove duplicate affected items (keep highest severity) */
function deduplicateAffected(items: AffectedItem[]): AffectedItem[] {
    const map = new Map<string, AffectedItem>();
    const severityOrder: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

    for (const item of items) {
        const key = `${item.type}:${item.id}`;
        const existing = map.get(key);
        if (!existing || severityOrder[item.severity] > severityOrder[existing.severity]) {
            map.set(key, item);
        }
    }

    return Array.from(map.values());
}

/** Create empty summary */
function emptySummary(): ImpactSummary {
    return {
        totalAffected: 0,
        affectedFeatures: 0,
        affectedStories: 0,
        affectedTasks: 0,
        affectedTeams: [],
        estimatedReworkMinutes: 0
    };
}

// ============================================================================
// HTML Rendering
// ============================================================================

/**
 * Render the change impact analysis panel.
 *
 * **Simple explanation**: Creates the visual report showing what's affected.
 */
export function renderImpactPanel(result: ChangeAnalysisResult): string {
    const riskColors: Record<RiskLevel, string> = {
        low: '#28a745',
        medium: '#ffc107',
        high: '#fd7e14',
        critical: '#dc3545'
    };

    return `<div class="impact-panel">
  <div class="impact-header">
    <h2>Change Impact Analysis</h2>
    <span class="risk-badge" style="background: ${riskColors[result.overallRisk]}">
      ${result.overallRisk.toUpperCase()} RISK
    </span>
  </div>

  <div class="impact-summary">
    <div class="summary-stat">
      <span class="stat-value">${result.changes.length}</span>
      <span class="stat-label">Changes</span>
    </div>
    <div class="summary-stat">
      <span class="stat-value">${result.summary.totalAffected}</span>
      <span class="stat-label">Affected Items</span>
    </div>
    <div class="summary-stat">
      <span class="stat-value">${result.summary.affectedTeams.length}</span>
      <span class="stat-label">Teams</span>
    </div>
    <div class="summary-stat">
      <span class="stat-value">~${result.summary.estimatedReworkMinutes}m</span>
      <span class="stat-label">Rework Est.</span>
    </div>
  </div>

  <div class="impact-changes">
    <h3>Changes Made</h3>
    ${result.changes.map(c => `
    <div class="change-row change-${c.changeKind}">
      <span class="change-badge">${c.changeKind.toUpperCase()}</span>
      <span class="change-desc">${c.description}</span>
    </div>`).join('\n')}
  </div>

  <div class="impact-affected">
    <h3>Affected Items (${result.affectedItems.length})</h3>
    ${result.affectedItems.map(a => `
    <div class="affected-row severity-${a.severity}">
      <span class="affected-type">${a.type}</span>
      <span class="affected-name">${a.name}</span>
      <span class="affected-reason">${a.reason}</span>
      <span class="severity-badge severity-${a.severity}">${a.severity.toUpperCase()}</span>
    </div>`).join('\n')}
  </div>

  ${result.summary.affectedTeams.length > 0 ? `
  <div class="impact-teams">
    <h3>Affected Agent Teams</h3>
    ${result.summary.affectedTeams.map(t => `
    <span class="team-badge">${t}</span>`).join('')}
  </div>` : ''}

  ${result.warnings.length > 0 ? `
  <div class="impact-warnings">
    <h3>⚠ Warnings</h3>
    ${result.warnings.map(w => `<div class="warning-row">${w}</div>`).join('\n')}
  </div>` : ''}
</div>`;
}

/**
 * Get impact panel styles.
 *
 * **Simple explanation**: Returns CSS for styling the impact analysis panel.
 */
export function getImpactPanelStyles(): string {
    return `.impact-panel {
  font-family: var(--vscode-font-family);
  padding: 16px;
}
.impact-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.risk-badge { padding: 4px 12px; border-radius: 12px; color: white; font-size: 11px; font-weight: bold; }
.impact-summary { display: flex; gap: 16px; margin-bottom: 16px; }
.summary-stat { text-align: center; padding: 8px 16px; background: var(--vscode-editor-background); border-radius: 8px; border: 1px solid var(--vscode-panel-border); }
.stat-value { display: block; font-size: 20px; font-weight: bold; color: var(--vscode-foreground); }
.stat-label { font-size: 11px; color: var(--vscode-descriptionForeground); }
.impact-changes { margin-bottom: 16px; }
.change-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.change-badge { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; color: white; }
.change-added .change-badge { background: #28a745; }
.change-removed .change-badge { background: #dc3545; }
.change-modified .change-badge { background: #ffc107; color: #333; }
.change-desc { font-size: 13px; }
.impact-affected { margin-bottom: 16px; }
.affected-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border); }
.affected-type { font-size: 11px; color: var(--vscode-descriptionForeground); min-width: 80px; }
.affected-name { flex: 1; font-size: 13px; }
.affected-reason { font-size: 11px; color: var(--vscode-descriptionForeground); max-width: 200px; }
.severity-badge { padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; color: white; }
.severity-low { background: #28a745; }
.severity-medium { background: #ffc107; color: #333; }
.severity-high { background: #fd7e14; }
.severity-critical { background: #dc3545; }
.impact-teams { margin-bottom: 16px; }
.team-badge { display: inline-block; padding: 4px 10px; margin: 2px; border-radius: 12px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 12px; text-transform: capitalize; }
.impact-warnings { margin-bottom: 16px; }
.warning-row { padding: 4px 0; font-size: 13px; color: var(--vscode-editorWarning-foreground); }
`;
}
