/**
 * Planning Service - Plan Storage & Retrieval
 *
 * **Simple explanation**: This manages saving and loading plans.
 * Think of it like a filing cabinet where you store completed project plans.
 *
 * @module services/planningService
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { logInfo, logError, logWarn } from '../logger';
import { CompletePlan, PlanMetadata } from '../planning/types';
import { validatePlan } from '../planning/schema';

// ============================================================================
// SINGLETON PATTERN
// ============================================================================

let instance: PlanningService | null = null;

/**
 * Initialize the planning service
 *
 * **Simple explanation**: Set up the filing cabinet. Create the storage folder if it doesn't exist.
 */
export async function initializePlanningService(
    context: vscode.ExtensionContext
): Promise<void> {
    if (instance !== null) {
        throw new Error('Planning service already initialized');
    }
    instance = new PlanningService(context);
    await instance.init();
}

/**
 * Get the planning service instance
 */
export function getPlanningServiceInstance(): PlanningService {
    if (!instance) {
        throw new Error('Planning service not initialized');
    }
    return instance;
}

/**
 * Reset service (for testing)
 */
export function resetPlanningServiceForTests(): void {
    instance = null;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

/**
 * Manages plan persistence and retrieval
 */
class PlanningService {
    private context: vscode.ExtensionContext;
    private plansFolder: string;
    private draftsFolder: string;
    private onPlanCreated = new vscode.EventEmitter<CompletePlan>();
    private onPlanUpdated = new vscode.EventEmitter<CompletePlan>();
    private onPlanDeleted = new vscode.EventEmitter<string>();

    public readonly onPlanCreatedEvent = this.onPlanCreated.event;
    public readonly onPlanUpdatedEvent = this.onPlanUpdated.event;
    public readonly onPlanDeletedEvent = this.onPlanDeleted.event;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        // Store plans in workspace .coe folder (project-specific) instead of globalStoragePath
        // This ensures all project data lives together and is version-controllable
        const workspaceFolders = vscode.workspace.workspaceFolders;
        let basePath: string;

        if (workspaceFolders && workspaceFolders.length > 0) {
            // Use workspace .coe/plans folder (preferred)
            basePath = path.join(workspaceFolders[0].uri.fsPath, '.coe');
        } else if (context.globalStoragePath) {
            // Fallback to globalStoragePath (no workspace open)
            basePath = context.globalStoragePath;
        } else {
            // Last resort fallback (shouldn't happen in normal VS Code)
            basePath = path.join(context.extensionPath, '.coe-data');
        }

        this.plansFolder = path.join(basePath, 'plans');
        this.draftsFolder = path.join(basePath, 'plans-drafts');
    }

    /**
     * Initialize the service - create folders if needed
     */
    async init(): Promise<void> {
        try {
            if (!fs.existsSync(this.plansFolder)) {
                fs.mkdirSync(this.plansFolder, { recursive: true });
                logInfo('[PlanningService] Created plans folder');
            }
            if (!fs.existsSync(this.draftsFolder)) {
                fs.mkdirSync(this.draftsFolder, { recursive: true });
                logInfo('[PlanningService] Created drafts folder');
            }
        } catch (error) {
            logError(`[PlanningService] Init failed: ${String(error)}`);
            throw error;
        }
    }

    /**
     * Create and save a new plan
     */
    async createPlan(plan: Partial<CompletePlan>): Promise<CompletePlan> {
        try {
            // Validate
            const validation = validatePlan(plan);
            if (!validation.isValid) {
                throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
            }

            // Complete the plan
            const completePlan: CompletePlan = {
                metadata: {
                    id: crypto.randomUUID(),
                    name: (plan.metadata?.name || 'New Plan'),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    version: 1,
                    author: plan.metadata?.author,
                },
                overview: plan.overview || { name: '', description: '', goals: [] },
                featureBlocks: plan.featureBlocks || [],
                blockLinks: plan.blockLinks || [],
                conditionalLogic: plan.conditionalLogic || [],
                userStories: plan.userStories || [],
                developerStories: plan.developerStories || [],
                successCriteria: plan.successCriteria || [],
            };

            // Save to file
            const planPath = this.getPlanPath(completePlan.metadata.id);
            fs.writeFileSync(planPath, JSON.stringify(completePlan, null, 2));

            // Clean up draft if it exists
            const draftPath = this.getDraftPath(completePlan.metadata.id);
            if (fs.existsSync(draftPath)) {
                fs.unlinkSync(draftPath);
            }

            logInfo(`[PlanningService] Plan created: ${completePlan.metadata.id}`);
            this.onPlanCreated.fire(completePlan);
            return completePlan;
        } catch (error) {
            logError(`[PlanningService] Create plan failed: ${String(error)}`);
            throw error;
        }
    }

    /**
     * Load a plan by ID
     */
    async loadPlan(planId: string): Promise<CompletePlan> {
        try {
            const planPath = this.getPlanPath(planId);
            if (!fs.existsSync(planPath)) {
                throw new Error(`Plan not found: ${planId}`);
            }

            const content = fs.readFileSync(planPath, 'utf-8');
            const plan = JSON.parse(content) as CompletePlan;

            // Convert date strings back to Date objects
            plan.metadata.createdAt = new Date(plan.metadata.createdAt);
            plan.metadata.updatedAt = new Date(plan.metadata.updatedAt);

            return plan;
        } catch (error) {
            logError(`[PlanningService] Load plan failed: ${String(error)}`);
            throw error;
        }
    }

    /**
     * Update an existing plan
     */
    async updatePlan(plan: CompletePlan): Promise<CompletePlan> {
        try {
            // Validate
            const validation = validatePlan(plan);
            if (!validation.isValid) {
                throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
            }

            // Update timestamp and version
            plan.metadata.updatedAt = new Date();
            plan.metadata.version++;

            // Save to file
            const planPath = this.getPlanPath(plan.metadata.id);
            fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));

            logInfo(`[PlanningService] Plan updated: ${plan.metadata.id}`);
            this.onPlanUpdated.fire(plan);
            return plan;
        } catch (error) {
            logError(`[PlanningService] Update plan failed: ${String(error)}`);
            throw error;
        }
    }

    /**
     * Delete a plan
     */
    async deletePlan(planId: string): Promise<void> {
        try {
            const planPath = this.getPlanPath(planId);
            if (fs.existsSync(planPath)) {
                fs.unlinkSync(planPath);
                logInfo(`[PlanningService] Plan deleted: ${planId}`);
            }

            // Also clean up draft
            const draftPath = this.getDraftPath(planId);
            if (fs.existsSync(draftPath)) {
                fs.unlinkSync(draftPath);
            }

            this.onPlanDeleted.fire(planId);
        } catch (error) {
            logError(`[PlanningService] Delete plan failed: ${String(error)}`);
            throw error;
        }
    }

    /**
     * List all saved plans
     */
    async listPlans(): Promise<PlanMetadata[]> {
        try {
            if (!fs.existsSync(this.plansFolder)) {
                return [];
            }

            const files = fs.readdirSync(this.plansFolder).filter((f) => f.endsWith('.json'));
            const plans: PlanMetadata[] = [];

            for (const file of files) {
                try {
                    const content = fs.readFileSync(path.join(this.plansFolder, file), 'utf-8');
                    const plan = JSON.parse(content) as CompletePlan;
                    // Convert date strings back to Date objects (JSON.parse doesn't do this)
                    plan.metadata.createdAt = new Date(plan.metadata.createdAt);
                    plan.metadata.updatedAt = new Date(plan.metadata.updatedAt);
                    plans.push(plan.metadata);
                } catch (error) {
                    logWarn(`[PlanningService] Failed to parse plan file: ${file}`);
                }
            }

            return plans.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        } catch (error) {
            logError(`[PlanningService] List plans failed: ${String(error)}`);
            return [];
        }
    }

    /**
     * Save draft (auto-save during editing)
     */
    async saveDraft(planId: string, draft: Partial<CompletePlan>): Promise<void> {
        try {
            const draftPath = this.getDraftPath(planId);
            fs.writeFileSync(draftPath, JSON.stringify(draft, null, 2));
            logInfo(`[PlanningService] Draft saved: ${planId}`);
        } catch (error) {
            logError(`[PlanningService] Save draft failed: ${String(error)}`);
        }
    }

    /**
     * Load draft
     */
    async loadDraft(planId: string): Promise<Partial<CompletePlan> | null> {
        try {
            const draftPath = this.getDraftPath(planId);
            if (!fs.existsSync(draftPath)) {
                return null;
            }

            const content = fs.readFileSync(draftPath, 'utf-8');
            return JSON.parse(content) as Partial<CompletePlan>;
        } catch (error) {
            logError(`[PlanningService] Load draft failed: ${String(error)}`);
            return null;
        }
    }

    /**
     * Get file path for a plan
     */
    private getPlanPath(planId: string): string {
        return path.join(this.plansFolder, `${planId}.json`);
    }

    /**
     * Get file path for a draft
     */
    private getDraftPath(planId: string): string {
        return path.join(this.draftsFolder, `${planId}.draft.json`);
    }

    /**
     * Export plan to different formats
     */
    async exportPlan(
        planId: string,
        format: 'json' | 'markdown' | 'yaml' | 'pdf'
    ): Promise<string> {
        try {
            const plan = await this.loadPlan(planId);

            switch (format) {
                case 'json':
                    return JSON.stringify(plan, null, 2);
                case 'markdown':
                    return this.exportAsMarkdown(plan);
                case 'yaml':
                    return this.exportAsYAML(plan);
                case 'pdf':
                    // TODO: Implement PDF export
                    throw new Error('PDF export not yet implemented');
                default:
                    throw new Error(`Unknown export format: ${format}`);
            }
        } catch (error) {
            logError(`[PlanningService] Export plan failed: ${String(error)}`);
            throw error;
        }
    }

    private exportAsMarkdown(plan: CompletePlan): string {
        const lines: string[] = [];

        // Header
        lines.push(`# ${plan.metadata.name}`);
        lines.push(`**Version**: ${plan.metadata.version}`);
        lines.push(`**Created**: ${plan.metadata.createdAt.toISOString()}`);
        lines.push(`**Updated**: ${plan.metadata.updatedAt.toISOString()}`);
        lines.push('');

        // Overview
        lines.push('## Overview');
        lines.push(plan.overview.description || '');
        if (plan.overview.goals.length > 0) {
            lines.push('\n### Goals');
            plan.overview.goals.forEach((goal) => {
                lines.push(`- ${goal}`);
            });
        }
        lines.push('');

        // Features
        if (plan.featureBlocks.length > 0) {
            lines.push('## Features');
            plan.featureBlocks.forEach((feature) => {
                lines.push(`### ${feature.name}`);
                lines.push(feature.description || '');
                lines.push(`**Priority**: ${feature.priority}`);
                if (feature.acceptanceCriteria.length > 0) {
                    lines.push('\n**Acceptance Criteria**:');
                    feature.acceptanceCriteria.forEach((criterion) => {
                        lines.push(`- ${criterion}`);
                    });
                }
                lines.push('');
            });
        }

        // User Stories
        if (plan.userStories.length > 0) {
            lines.push('## User Stories');
            plan.userStories.forEach((story) => {
                lines.push(
                    `### As a ${story.userType}, I want to ${story.action}, so that ${story.benefit}`
                );
                if (story.acceptanceCriteria.length > 0) {
                    lines.push('**Acceptance Criteria**:');
                    story.acceptanceCriteria.forEach((criterion) => {
                        lines.push(`- ${criterion}`);
                    });
                }
                lines.push('');
            });
        }

        // Success Criteria
        if (plan.successCriteria.length > 0) {
            lines.push('## Success Criteria');
            plan.successCriteria.forEach((criterion) => {
                lines.push(`- ${criterion.description}`);
            });
        }

        return lines.join('\n');
    }

    private exportAsYAML(plan: CompletePlan): string {
        // Simple YAML export (not full YAML spec)
        const lines: string[] = [];

        lines.push(`metadata:`);
        lines.push(`  id: ${plan.metadata.id}`);
        lines.push(`  name: "${plan.metadata.name}"`);
        lines.push(`  version: ${plan.metadata.version}`);
        lines.push('');

        lines.push(`overview:`);
        lines.push(`  description: "${plan.overview.description || ''}"`);
        if (plan.overview.goals.length > 0) {
            lines.push(`  goals:`);
            plan.overview.goals.forEach((goal) => {
                lines.push(`    - "${goal}"`);
            });
        }

        if (plan.featureBlocks.length > 0) {
            lines.push('');
            lines.push(`features:`);
            plan.featureBlocks.forEach((feature) => {
                lines.push(`  - name: "${feature.name}"`);
                lines.push(`    priority: ${feature.priority}`);
            });
        }

        return lines.join('\n');
    }
}
