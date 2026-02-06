/**
 * PRD Parser for Planning Team
 * 
 * **Simple explanation**: This reads PRD.json (Product Requirements Document)
 * and extracts the features, requirements, and specifications from it.
 * 
 * @module agents/planning/prdParser
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn, logError } from '../../logger';

/**
 * A feature from the PRD
 */
export interface PRDFeature {
    /** Feature ID */
    id: string;
    /** Feature name */
    name: string;
    /** Detailed description */
    description: string;
    /** Priority (P0-P3) */
    priority: 'P0' | 'P1' | 'P2' | 'P3';
    /** Acceptance criteria */
    acceptanceCriteria: string[];
    /** Dependencies on other features */
    dependencies: string[];
    /** Status */
    status: 'planned' | 'in_progress' | 'complete';
}

/**
 * A milestone from the PRD
 */
export interface PRDMilestone {
    /** Milestone ID */
    id: string;
    /** Milestone name */
    name: string;
    /** Target date */
    targetDate?: string;
    /** Feature IDs included */
    features: string[];
    /** Status */
    status: 'upcoming' | 'current' | 'complete';
}

/**
 * Technical requirement from the PRD
 */
export interface TechnicalRequirement {
    /** Requirement category */
    category: 'performance' | 'security' | 'scalability' | 'compatibility' | 'accessibility';
    /** Requirement description */
    description: string;
    /** Specific metrics or criteria */
    criteria: string;
}

/**
 * Complete parsed PRD
 */
export interface ParsedPRD {
    /** Project name */
    projectName: string;
    /** Project description */
    description: string;
    /** Target audience */
    targetAudience: string[];
    /** Features */
    features: PRDFeature[];
    /** Milestones */
    milestones: PRDMilestone[];
    /** Technical requirements */
    technicalRequirements: TechnicalRequirement[];
    /** Success metrics */
    successMetrics: string[];
    /** Out of scope items */
    outOfScope: string[];
    /** PRD version */
    version: string;
    /** Last updated */
    lastUpdated: string;
    /** Parse errors (if any) */
    parseErrors: string[];
}

/**
 * PRD Schema for validation
 */
interface PRDSchema {
    projectName?: string;
    name?: string;
    title?: string;
    description?: string;
    overview?: string;
    targetAudience?: string | string[];
    users?: string | string[];
    features?: Array<{
        id?: string;
        name?: string;
        title?: string;
        description?: string;
        priority?: string;
        acceptanceCriteria?: string[];
        criteria?: string[];
        dependencies?: string[];
        status?: string;
    }>;
    milestones?: Array<{
        id?: string;
        name?: string;
        targetDate?: string;
        date?: string;
        features?: string[];
        status?: string;
    }>;
    technicalRequirements?: Array<{
        category?: string;
        type?: string;
        description?: string;
        criteria?: string;
        metric?: string;
    }>;
    technical?: {
        performance?: string;
        security?: string;
        scalability?: string;
        compatibility?: string;
        accessibility?: string;
    };
    successMetrics?: string[];
    metrics?: string[];
    outOfScope?: string[];
    nonGoals?: string[];
    version?: string;
    lastUpdated?: string;
    updated?: string;
}

/**
 * PRDParser class for reading and parsing PRD files
 * 
 * **Simple explanation**: Like a translator that reads your product spec
 * document and turns it into a structured format the planning system can use.
 */
export class PRDParser {
    private defaultPRDPath: string;

    constructor(basePath?: string) {
        this.defaultPRDPath = basePath || '.coe/PRD.json';
    }

    /**
     * Parse a PRD file
     * 
     * @param filePath - Path to PRD.json (uses default if not provided)
     * @returns Parsed PRD
     */
    async parse(filePath?: string): Promise<ParsedPRD> {
        const prdPath = filePath || this.defaultPRDPath;
        logInfo(`[PRDParser] Parsing PRD from: ${prdPath}`);

        const parseErrors: string[] = [];

        try {
            // Check if file exists
            if (!fs.existsSync(prdPath)) {
                logWarn(`[PRDParser] PRD file not found: ${prdPath}`);
                return this.createEmptyPRD([`PRD file not found: ${prdPath}`]);
            }

            // Read and parse JSON
            const content = fs.readFileSync(prdPath, 'utf-8');
            let rawPRD: PRDSchema;

            try {
                rawPRD = JSON.parse(content);
            } catch (jsonError) {
                logError(`[PRDParser] Invalid JSON in PRD: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
                return this.createEmptyPRD([`Invalid JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`]);
            }

            // Parse with validation
            return this.parseRawPRD(rawPRD, parseErrors);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[PRDParser] Failed to parse PRD: ${msg}`);
            return this.createEmptyPRD([msg]);
        }
    }

    /**
     * Parse raw PRD object into structured format
     */
    private parseRawPRD(raw: PRDSchema, errors: string[]): ParsedPRD {
        // Extract project name (support multiple field names)
        const projectName = raw.projectName || raw.name || raw.title || 'Unnamed Project';
        if (!raw.projectName && !raw.name && !raw.title) {
            errors.push('Missing project name (expected: projectName, name, or title)');
        }

        // Extract description
        const description = raw.description || raw.overview || '';
        if (!description) {
            errors.push('Missing project description');
        }

        // Extract target audience
        let targetAudience: string[] = [];
        if (Array.isArray(raw.targetAudience)) {
            targetAudience = raw.targetAudience;
        } else if (typeof raw.targetAudience === 'string') {
            targetAudience = [raw.targetAudience];
        } else if (Array.isArray(raw.users)) {
            targetAudience = raw.users;
        } else if (typeof raw.users === 'string') {
            targetAudience = [raw.users];
        }

        // Parse features
        const features = this.parseFeatures(raw.features || [], errors);
        if (features.length === 0) {
            errors.push('No features defined in PRD');
        }

        // Parse milestones
        const milestones = this.parseMilestones(raw.milestones || [], errors);

        // Parse technical requirements
        const technicalRequirements = this.parseTechnicalRequirements(
            raw.technicalRequirements || [],
            raw.technical,
            errors
        );

        // Parse success metrics
        const successMetrics = raw.successMetrics || raw.metrics || [];

        // Parse out of scope
        const outOfScope = raw.outOfScope || raw.nonGoals || [];

        // Version and date
        const version = raw.version || '1.0.0';
        const lastUpdated = raw.lastUpdated || raw.updated || new Date().toISOString();

        return {
            projectName,
            description,
            targetAudience,
            features,
            milestones,
            technicalRequirements,
            successMetrics,
            outOfScope,
            version,
            lastUpdated,
            parseErrors: errors
        };
    }

    /**
     * Parse features array
     */
    private parseFeatures(rawFeatures: PRDSchema['features'], errors: string[]): PRDFeature[] {
        if (!Array.isArray(rawFeatures)) return [];

        return rawFeatures.map((raw, index) => {
            if (!raw.name && !raw.title) {
                errors.push(`Feature ${index + 1}: missing name`);
            }

            const id = raw.id || `F${String(index + 1).padStart(3, '0')}`;
            const name = raw.name || raw.title || `Feature ${index + 1}`;
            const description = raw.description || '';

            // Normalize priority
            let priority: PRDFeature['priority'] = 'P1';
            if (raw.priority) {
                const p = raw.priority.toUpperCase();
                if (['P0', 'P1', 'P2', 'P3'].includes(p)) {
                    priority = p as PRDFeature['priority'];
                }
            }

            // Acceptance criteria
            const acceptanceCriteria = raw.acceptanceCriteria || raw.criteria || [];
            if (acceptanceCriteria.length === 0) {
                errors.push(`Feature ${id}: missing acceptance criteria`);
            }

            // Dependencies
            const dependencies = raw.dependencies || [];

            // Status
            let status: PRDFeature['status'] = 'planned';
            if (raw.status) {
                const s = raw.status.toLowerCase();
                if (s === 'complete' || s === 'completed' || s === 'done') {
                    status = 'complete';
                } else if (s === 'in_progress' || s === 'in-progress' || s === 'started') {
                    status = 'in_progress';
                }
            }

            return {
                id,
                name,
                description,
                priority,
                acceptanceCriteria,
                dependencies,
                status
            };
        });
    }

    /**
     * Parse milestones array
     */
    private parseMilestones(rawMilestones: PRDSchema['milestones'], errors: string[]): PRDMilestone[] {
        if (!Array.isArray(rawMilestones)) return [];

        return rawMilestones.map((raw, index) => {
            const id = raw.id || `M${String(index + 1).padStart(2, '0')}`;
            const name = raw.name || `Milestone ${index + 1}`;
            const targetDate = raw.targetDate || raw.date;
            const features = raw.features || [];

            // Status
            let status: PRDMilestone['status'] = 'upcoming';
            if (raw.status) {
                const s = raw.status.toLowerCase();
                if (s === 'complete' || s === 'completed' || s === 'done') {
                    status = 'complete';
                } else if (s === 'current' || s === 'in_progress' || s === 'active') {
                    status = 'current';
                }
            }

            return {
                id,
                name,
                targetDate,
                features,
                status
            };
        });
    }

    /**
     * Parse technical requirements
     */
    private parseTechnicalRequirements(
        rawReqs: NonNullable<PRDSchema['technicalRequirements']>,
        technicalObj: PRDSchema['technical'],
        errors: string[]
    ): TechnicalRequirement[] {
        const requirements: TechnicalRequirement[] = [];

        // From array format
        if (Array.isArray(rawReqs)) {
            for (const raw of rawReqs) {
                const category = (raw.category || raw.type || 'performance').toLowerCase();
                const validCategories = ['performance', 'security', 'scalability', 'compatibility', 'accessibility'];

                requirements.push({
                    category: validCategories.includes(category)
                        ? category as TechnicalRequirement['category']
                        : 'performance',
                    description: raw.description || '',
                    criteria: raw.criteria || raw.metric || ''
                });
            }
        }

        // From object format
        if (technicalObj) {
            if (technicalObj.performance) {
                requirements.push({
                    category: 'performance',
                    description: technicalObj.performance,
                    criteria: ''
                });
            }
            if (technicalObj.security) {
                requirements.push({
                    category: 'security',
                    description: technicalObj.security,
                    criteria: ''
                });
            }
            if (technicalObj.scalability) {
                requirements.push({
                    category: 'scalability',
                    description: technicalObj.scalability,
                    criteria: ''
                });
            }
            if (technicalObj.compatibility) {
                requirements.push({
                    category: 'compatibility',
                    description: technicalObj.compatibility,
                    criteria: ''
                });
            }
            if (technicalObj.accessibility) {
                requirements.push({
                    category: 'accessibility',
                    description: technicalObj.accessibility,
                    criteria: ''
                });
            }
        }

        return requirements;
    }

    /**
     * Create empty PRD with errors
     */
    private createEmptyPRD(errors: string[]): ParsedPRD {
        return {
            projectName: 'Unknown',
            description: '',
            targetAudience: [],
            features: [],
            milestones: [],
            technicalRequirements: [],
            successMetrics: [],
            outOfScope: [],
            version: '0.0.0',
            lastUpdated: new Date().toISOString(),
            parseErrors: errors
        };
    }

    /**
     * Validate a PRD against the schema
     * 
     * @param prd - Parsed PRD to validate
     * @returns Validation errors (empty if valid)
     */
    validate(prd: ParsedPRD): string[] {
        const errors: string[] = [];

        if (!prd.projectName || prd.projectName === 'Unknown') {
            errors.push('Project name is required');
        }

        if (!prd.description) {
            errors.push('Project description is required');
        }

        if (prd.features.length === 0) {
            errors.push('At least one feature is required');
        }

        for (const feature of prd.features) {
            if (!feature.name) {
                errors.push(`Feature ${feature.id}: name is required`);
            }
            if (feature.acceptanceCriteria.length === 0) {
                errors.push(`Feature ${feature.id}: at least one acceptance criterion is required`);
            }
        }

        return errors;
    }

    /**
     * Extract features that need planning
     * 
     * @param prd - Parsed PRD
     * @returns Features not yet complete
     */
    getFeaturesForPlanning(prd: ParsedPRD): PRDFeature[] {
        return prd.features.filter(f => f.status !== 'complete');
    }

    /**
     * Get current milestone
     */
    getCurrentMilestone(prd: ParsedPRD): PRDMilestone | undefined {
        return prd.milestones.find(m => m.status === 'current');
    }
}

// Singleton instance
let parserInstance: PRDParser | null = null;

/**
 * Get the PRDParser singleton instance
 */
export function getPRDParser(): PRDParser {
    if (!parserInstance) {
        parserInstance = new PRDParser();
    }
    return parserInstance;
}

/**
 * Reset parser for testing
 */
export function resetPRDParserForTests(): void {
    parserInstance = null;
}
