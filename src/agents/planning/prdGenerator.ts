/**
 * @file prdGenerator.ts
 * @module agents/planning/prdGenerator
 * @description Auto-generates PRD.json and PRD.md from CONSOLIDATED-MASTER-PLAN.md (MT-018)
 * 
 * Watches the master plan for changes and regenerates the PRD documents
 * when modifications are detected.
 * 
 * **Simple explanation**: Like a secretary who watches the boss's master plan
 * and automatically types up clean, formatted requirement documents whenever
 * the plan changes.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { logInfo, logWarn, logError } from '../../logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for PRD generation
 */
export interface PRDGeneratorConfig {
    /** Path to master plan document (relative to workspace) */
    masterPlanPath: string;
    /** Output path for PRD.json (relative to workspace) */
    outputJsonPath: string;
    /** Output path for PRD.md (relative to workspace) */
    outputMdPath: string;
    /** Debounce delay in ms */
    debounceMs: number;
    /** Whether to auto-watch for changes */
    autoWatch: boolean;
}

/**
 * Extracted feature from master plan
 */
export interface ExtractedFeature {
    id: string;
    name: string;
    description: string;
    priority: 'P0' | 'P1' | 'P2' | 'P3';
    status: 'planned' | 'in_progress' | 'complete';
    acceptanceCriteria: string[];
    dependencies: string[];
    estimatedTime?: string;
    stage?: string;
}

/**
 * Extracted milestone from master plan
 */
export interface ExtractedMilestone {
    id: string;
    name: string;
    stage: number;
    featureIds: string[];
    status: 'pending' | 'in_progress' | 'complete';
    progress: number;
}

/**
 * Complete generated PRD structure
 */
export interface GeneratedPRD {
    version: string;
    generatedAt: string;
    sourceFile: string;
    projectName: string;
    description: string;
    features: ExtractedFeature[];
    milestones: ExtractedMilestone[];
    statistics: {
        totalFeatures: number;
        completedFeatures: number;
        inProgressFeatures: number;
        plannedFeatures: number;
        overallProgress: number;
    };
}

/**
 * Result of PRD generation
 */
export interface GenerationResult {
    success: boolean;
    prd?: GeneratedPRD;
    jsonPath?: string;
    mdPath?: string;
    error?: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: PRDGeneratorConfig = {
    masterPlanPath: 'Docs/This Program\'s Plans/CONSOLIDATED-MASTER-PLAN.md',
    outputJsonPath: 'PRD.json',
    outputMdPath: 'PRD.md',
    debounceMs: 1000,
    autoWatch: true
};

// ============================================================================
// PRD Generator Class
// ============================================================================

/**
 * Generates PRD documents from the master plan.
 * 
 * **Simple explanation**: Reads the big master plan document and produces
 * clean, structured PRD files (one JSON for machines, one Markdown for humans).
 * Can watch the master plan and auto-update when it changes.
 * 
 * @emits 'prd-generated' - When PRD has been regenerated
 * @emits 'prd-error' - When generation fails
 * @emits 'watch-started' - When file watching begins
 * @emits 'watch-stopped' - When file watching ends
 */
export class PRDGenerator extends EventEmitter {
    private config: PRDGeneratorConfig;
    private watcher: vscode.FileSystemWatcher | null = null;
    private debounceTimer: NodeJS.Timeout | null = null;
    private workspaceRoot: string;

    constructor(workspaceRoot: string, config: Partial<PRDGeneratorConfig> = {}) {
        super();
        this.workspaceRoot = workspaceRoot;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Generate PRD from the master plan
     * 
     * @returns Generation result with paths to created files
     */
    async generate(): Promise<GenerationResult> {
        const masterPlanPath = path.join(this.workspaceRoot, this.config.masterPlanPath);
        
        try {
            // Read master plan
            if (!fs.existsSync(masterPlanPath)) {
                return {
                    success: false,
                    error: `Master plan not found: ${masterPlanPath}`
                };
            }

            const masterPlanContent = fs.readFileSync(masterPlanPath, 'utf-8');
            
            // Extract structured data
            const prd = this.extractPRD(masterPlanContent);
            
            // Generate outputs
            const jsonPath = path.join(this.workspaceRoot, this.config.outputJsonPath);
            const mdPath = path.join(this.workspaceRoot, this.config.outputMdPath);

            // Write JSON
            fs.writeFileSync(jsonPath, JSON.stringify(prd, null, 2), 'utf-8');
            
            // Write Markdown
            const markdown = this.generateMarkdown(prd);
            fs.writeFileSync(mdPath, markdown, 'utf-8');

            logInfo(`[PRDGenerator] Generated PRD: ${prd.features.length} features, ${prd.milestones.length} milestones`);
            
            this.emit('prd-generated', { prd, jsonPath, mdPath });

            return {
                success: true,
                prd,
                jsonPath,
                mdPath
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[PRDGenerator] Failed to generate PRD: ${msg}`);
            this.emit('prd-error', error);
            return {
                success: false,
                error: msg
            };
        }
    }

    /**
     * Extract PRD structure from master plan content
     */
    private extractPRD(content: string): GeneratedPRD {
        const features = this.extractFeatures(content);
        const milestones = this.extractMilestones(content, features);
        const projectInfo = this.extractProjectInfo(content);
        
        const completedCount = features.filter(f => f.status === 'complete').length;
        const inProgressCount = features.filter(f => f.status === 'in_progress').length;
        const plannedCount = features.filter(f => f.status === 'planned').length;

        return {
            version: '1.0.0',
            generatedAt: new Date().toISOString(),
            sourceFile: this.config.masterPlanPath,
            projectName: projectInfo.name,
            description: projectInfo.description,
            features,
            milestones,
            statistics: {
                totalFeatures: features.length,
                completedFeatures: completedCount,
                inProgressFeatures: inProgressCount,
                plannedFeatures: plannedCount,
                overallProgress: features.length > 0 
                    ? Math.round((completedCount / features.length) * 100) 
                    : 0
            }
        };
    }

    /**
     * Extract features from master plan
     */
    private extractFeatures(content: string): ExtractedFeature[] {
        const features: ExtractedFeature[] = [];
        
        // Match MT-XXX task patterns
        const taskPattern = /(?:^|\n)-\s*\[([x\s])\]\s*\*\*([A-Z]+-\d+(?:\.\d+)?)\*\*:\s*([^\n]+)/gm;
        let match;
        
        while ((match = taskPattern.exec(content)) !== null) {
            const isComplete = match[1].toLowerCase() === 'x';
            const id = match[2];
            const description = match[3].trim();
            
            // Extract priority from description
            const priorityMatch = description.match(/\[Priority:\s*(P[0-3])\]/i);
            const priority = (priorityMatch ? priorityMatch[1] : 'P2') as 'P0' | 'P1' | 'P2' | 'P3';
            
            // Extract time estimate
            const timeMatch = description.match(/\((\d+)\s*min\)/);
            const estimatedTime = timeMatch ? `${timeMatch[1]} min` : undefined;
            
            // Extract dependencies
            const depsMatch = description.match(/\[depends:\s*([^\]]+)\]/i);
            let dependencies: string[] = [];
            if (depsMatch) {
                const depsText = depsMatch[1].trim();
                // Handle "None" as no dependencies
                if (depsText.toLowerCase() !== 'none') {
                    dependencies = depsText.split(',').map(d => d.trim()).filter(d => d.length > 0);
                }
            }
            
            // Clean description
            const cleanDesc = description
                .replace(/\[Priority:\s*P[0-3]\]/gi, '')
                .replace(/\[depends:[^\]]+\]/gi, '')
                .replace(/\[actual:[^\]]+\]/gi, '')
                .replace(/\(\d+\s*min\)/g, '')
                .replace(/[✅🔒]/g, '')
                .trim();

            features.push({
                id,
                name: cleanDesc.split(' ').slice(0, 5).join(' '),
                description: cleanDesc,
                priority,
                status: isComplete ? 'complete' : 'planned',
                acceptanceCriteria: this.extractAcceptanceCriteria(content, id),
                dependencies,
                estimatedTime
            });
        }

        return features;
    }

    /**
     * Extract acceptance criteria for a specific feature
     */
    private extractAcceptanceCriteria(content: string, featureId: string): string[] {
        const criteria: string[] = [];
        
        // Look for criteria section after the feature
        const featurePattern = new RegExp(
            `\\*\\*${featureId.replace('.', '\\.')}\\*\\*[^]*?(?=\\*\\*[A-Z]+-\\d+|$)`,
            'i'
        );
        const featureSection = content.match(featurePattern);
        
        if (featureSection) {
            // Extract bullet points as criteria
            const bulletPattern = /^\s*-\s*\*\*([^*]+)\*\*:\s*(.+)$/gm;
            let bulletMatch;
            while ((bulletMatch = bulletPattern.exec(featureSection[0])) !== null) {
                const label = bulletMatch[1].toLowerCase();
                if (['tests', 'behavior', 'verification', 'quality'].includes(label)) {
                    criteria.push(bulletMatch[2].trim());
                }
            }
        }

        return criteria;
    }

    /**
     * Extract milestones (stages) from master plan
     */
    private extractMilestones(content: string, features: ExtractedFeature[]): ExtractedMilestone[] {
        const milestones: ExtractedMilestone[] = [];
        
        // Match stage headers
        const stagePattern = /##\s*STAGE\s*(\d+):\s*([^\n-]+)/gi;
        let match;
        
        while ((match = stagePattern.exec(content)) !== null) {
            const stageNum = parseInt(match[1], 10);
            const stageName = match[2].trim();
            
            // Find features belonging to this stage by looking at MT-0XX patterns
            const stageFeatures = features.filter(f => {
                const mtNum = parseInt(f.id.replace(/[A-Z]+-0?/, '').split('.')[0], 10);
                return Math.floor(mtNum / 5) + 1 === stageNum || 
                       (stageNum === 1 && mtNum <= 5) ||
                       (stageNum === 2 && mtNum >= 6 && mtNum <= 10);
            });

            const completedInStage = stageFeatures.filter(f => f.status === 'complete').length;
            
            milestones.push({
                id: `stage-${stageNum}`,
                name: stageName,
                stage: stageNum,
                featureIds: stageFeatures.map(f => f.id),
                status: completedInStage === stageFeatures.length ? 'complete' :
                        completedInStage > 0 ? 'in_progress' : 'pending',
                progress: stageFeatures.length > 0 
                    ? Math.round((completedInStage / stageFeatures.length) * 100)
                    : 0
            });
        }

        return milestones;
    }

    /**
     * Extract project info from master plan
     */
    private extractProjectInfo(content: string): { name: string; description: string } {
        // Look for title
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const name = titleMatch ? titleMatch[1].trim() : 'COE Project';
        
        // Look for description (first paragraph after title)
        const descMatch = content.match(/^#[^\n]+\n+([^#\n][^\n]+)/m);
        const description = descMatch ? descMatch[1].trim() : 'No description available';

        return { name, description };
    }

    /**
     * Generate human-readable Markdown from PRD
     */
    private generateMarkdown(prd: GeneratedPRD): string {
        const lines: string[] = [
            `# ${prd.projectName} - Product Requirements Document`,
            '',
            `> **Auto-generated on ${new Date(prd.generatedAt).toLocaleString()}**`,
            `> Source: \`${prd.sourceFile}\``,
            '',
            '---',
            '',
            '## Overview',
            '',
            prd.description,
            '',
            '## Progress Summary',
            '',
            `| Metric | Value |`,
            `|--------|-------|`,
            `| Total Features | ${prd.statistics.totalFeatures} |`,
            `| Completed | ${prd.statistics.completedFeatures} |`,
            `| In Progress | ${prd.statistics.inProgressFeatures} |`,
            `| Planned | ${prd.statistics.plannedFeatures} |`,
            `| Overall Progress | ${prd.statistics.overallProgress}% |`,
            '',
            '---',
            '',
            '## Milestones',
            ''
        ];

        for (const milestone of prd.milestones) {
            const statusIcon = milestone.status === 'complete' ? '✅' :
                              milestone.status === 'in_progress' ? '🔄' : '⏳';
            lines.push(`### ${statusIcon} Stage ${milestone.stage}: ${milestone.name}`);
            lines.push(`Progress: ${milestone.progress}% (${milestone.featureIds.length} features)`);
            lines.push('');
        }

        lines.push('---', '', '## Features by Priority', '');

        // Group by priority
        for (const priority of ['P0', 'P1', 'P2', 'P3'] as const) {
            const priorityFeatures = prd.features.filter(f => f.priority === priority);
            if (priorityFeatures.length > 0) {
                lines.push(`### ${priority} - ${this.getPriorityLabel(priority)}`, '');
                
                for (const feature of priorityFeatures) {
                    const statusIcon = feature.status === 'complete' ? '✅' :
                                      feature.status === 'in_progress' ? '🔄' : '⬜';
                    lines.push(`- ${statusIcon} **${feature.id}**: ${feature.description}`);
                    if (feature.dependencies.length > 0) {
                        lines.push(`  - Dependencies: ${feature.dependencies.join(', ')}`);
                    }
                }
                lines.push('');
            }
        }

        lines.push('---', '', `*Generated by COE PRD Generator v${prd.version}*`);

        return lines.join('\n');
    }

    /**
     * Get human-readable priority label
     */
    private getPriorityLabel(priority: 'P0' | 'P1' | 'P2' | 'P3'): string {
        switch (priority) {
            case 'P0': return 'Critical';
            case 'P1': return 'High Priority';
            case 'P2': return 'Normal';
            case 'P3': return 'Low Priority';
        }
    }

    /**
     * Start watching the master plan for changes
     */
    startWatching(): void {
        if (this.watcher) {
            logWarn('[PRDGenerator] Already watching');
            return;
        }

        const watchPattern = new vscode.RelativePattern(
            this.workspaceRoot,
            this.config.masterPlanPath
        );

        this.watcher = vscode.workspace.createFileSystemWatcher(watchPattern);

        this.watcher.onDidChange(() => this.handleFileChange());
        this.watcher.onDidCreate(() => this.handleFileChange());

        logInfo(`[PRDGenerator] Started watching: ${this.config.masterPlanPath}`);
        this.emit('watch-started');
    }

    /**
     * Stop watching for changes
     */
    stopWatching(): void {
        if (this.watcher) {
            this.watcher.dispose();
            this.watcher = null;
            logInfo('[PRDGenerator] Stopped watching');
            this.emit('watch-stopped');
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }

    /**
     * Handle file change with debounce
     */
    private handleFileChange(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(async () => {
            logInfo('[PRDGenerator] Master plan changed, regenerating PRD...');
            await this.generate();
        }, this.config.debounceMs);
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.stopWatching();
        this.removeAllListeners();
    }
}

// ============================================================================
// Singleton Management
// ============================================================================

let instance: PRDGenerator | null = null;

/**
 * Initialize the PRD generator singleton
 */
export function initializePRDGenerator(
    workspaceRoot: string,
    config?: Partial<PRDGeneratorConfig>
): PRDGenerator {
    if (instance) {
        throw new Error('PRD Generator already initialized');
    }
    instance = new PRDGenerator(workspaceRoot, config);
    return instance;
}

/**
 * Get the PRD generator instance
 */
export function getPRDGeneratorInstance(): PRDGenerator {
    if (!instance) {
        throw new Error('PRD Generator not initialized');
    }
    return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetPRDGeneratorForTests(): void {
    if (instance) {
        instance.dispose();
        instance = null;
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Quick generate PRD without initializing singleton
 * 
 * @param workspaceRoot - Workspace root path
 * @param config - Optional configuration
 * @returns Generation result
 */
export async function generatePRD(
    workspaceRoot: string,
    config?: Partial<PRDGeneratorConfig>
): Promise<GenerationResult> {
    const generator = new PRDGenerator(workspaceRoot, config);
    return generator.generate();
}
