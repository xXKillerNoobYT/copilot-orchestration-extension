/**
 * @file scanCodeBase.ts
 * @module mcpServer/tools/scanCodeBase
 * @description MCP tool for scanning codebase and comparing against requirements (MT-019/020)
 * 
 * Scans the codebase to identify which files align with or mismatch
 * from the documented requirements in PRD and plan files.
 * 
 * **Simple explanation**: Like a quality inspector that checks if the actual
 * code matches what was planned. Reports which files are aligned with requirements
 * and which ones are missing or don't match expectations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../logger';

// ============================================================================
// Types
// ============================================================================

/**
 * File alignment status with requirements
 */
export type AlignmentStatus = 'aligned' | 'mismatched' | 'missing' | 'extra' | 'unknown';

/**
 * Scanned file information
 */
export interface ScannedFile {
    /** Relative file path */
    path: string;
    /** Absolute file path */
    absolutePath: string;
    /** File type (extension) */
    type: string;
    /** Size in bytes */
    size: number;
    /** Last modified timestamp */
    lastModified: Date;
    /** Alignment with requirements */
    alignment: AlignmentStatus;
    /** Related requirement IDs */
    relatedRequirements: string[];
    /** Alignment notes */
    notes: string[];
}

/**
 * Expected file from requirements
 */
export interface ExpectedFile {
    /** Relative file path */
    path: string;
    /** Requirement ID that expects this file */
    requirementId: string;
    /** Description of what the file should contain */
    description: string;
    /** Whether file is required or optional */
    required: boolean;
}

/**
 * Scan configuration
 */
export interface ScanConfig {
    /** Root directory to scan */
    rootDir: string;
    /** Patterns to include (glob) */
    includePatterns: string[];
    /** Patterns to exclude (glob) */
    excludePatterns: string[];
    /** Path to PRD file for requirements */
    prdPath?: string;
    /** Whether to check file contents */
    checkContents: boolean;
    /** Maximum depth to scan */
    maxDepth: number;
}

/**
 * Scan result summary
 */
export interface ScanResult {
    /** Scan timestamp */
    timestamp: string;
    /** Root directory scanned */
    rootDir: string;
    /** Total files scanned */
    totalFiles: number;
    /** Files that align with requirements */
    alignedFiles: ScannedFile[];
    /** Files that mismatch requirements */
    mismatchedFiles: ScannedFile[];
    /** Expected files that are missing */
    missingFiles: ExpectedFile[];
    /** Files not mentioned in requirements (extra) */
    extraFiles: ScannedFile[];
    /** Summary statistics */
    statistics: {
        aligned: number;
        mismatched: number;
        missing: number;
        extra: number;
        alignmentScore: number; // 0-100
    };
    /** Recommendations */
    recommendations: string[];
}

/**
 * MCP tool parameter schema
 */
export interface ScanCodeBaseParams {
    /** Directory to scan (relative to workspace or absolute) */
    directory?: string;
    /** File patterns to include */
    include?: string[];
    /** File patterns to exclude */
    exclude?: string[];
    /** Whether to check file contents for alignment */
    checkContents?: boolean;
    /** Output format: 'json' | 'markdown' | 'summary' */
    format?: 'json' | 'markdown' | 'summary';
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ScanConfig = {
    rootDir: '.',
    includePatterns: ['**/*.ts', '**/*.js', '**/*.md', '**/*.json'],
    excludePatterns: [
        '**/node_modules/**',
        '**/out/**',
        '**/dist/**',
        '**/coverage/**',
        '**/.git/**',
        '**/*.d.ts'
    ],
    checkContents: false,
    maxDepth: 10
};

// ============================================================================
// CodebaseScanner Class
// ============================================================================

/**
 * Scans codebase and compares against documented requirements.
 * 
 * **Simple explanation**: Walks through all your code files and checks
 * if they match what the plan says should exist. Tells you what's good,
 * what's missing, and what's extra.
 */
export class CodebaseScanner {
    private config: ScanConfig;
    private expectedFiles: Map<string, ExpectedFile> = new Map();

    constructor(config: Partial<ScanConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Perform a full codebase scan
     * 
     * @returns Scan result with aligned/mismatched/missing files
     */
    async scan(): Promise<ScanResult> {
        logInfo(`[ScanCodeBase] Starting scan of ${this.config.rootDir}`);

        // Load expected files from PRD if available
        if (this.config.prdPath) {
            await this.loadExpectedFiles();
        }

        // Scan actual files
        const scannedFiles = await this.scanDirectory(this.config.rootDir, 0);

        // Categorize files
        const aligned: ScannedFile[] = [];
        const mismatched: ScannedFile[] = [];
        const extra: ScannedFile[] = [];
        const foundPaths = new Set<string>();

        for (const file of scannedFiles) {
            foundPaths.add(file.path);
            const alignment = this.checkAlignment(file);
            file.alignment = alignment.status;
            file.relatedRequirements = alignment.requirements;
            file.notes = alignment.notes;

            switch (alignment.status) {
                case 'aligned':
                    aligned.push(file);
                    break;
                case 'mismatched':
                    mismatched.push(file);
                    break;
                case 'extra':
                    extra.push(file);
                    break;
                default:
                    extra.push(file);
            }
        }

        // Find missing files
        const missing: ExpectedFile[] = [];
        for (const [filePath, expected] of this.expectedFiles) {
            if (!foundPaths.has(filePath) && expected.required) {
                missing.push(expected);
            }
        }

        // Calculate alignment score
        const total = aligned.length + mismatched.length + missing.length;
        const alignmentScore = total > 0
            ? Math.round((aligned.length / total) * 100)
            : 100;

        // Generate recommendations
        const recommendations = this.generateRecommendations(
            aligned, mismatched, missing, extra
        );

        const result: ScanResult = {
            timestamp: new Date().toISOString(),
            rootDir: this.config.rootDir,
            totalFiles: scannedFiles.length,
            alignedFiles: aligned,
            mismatchedFiles: mismatched,
            missingFiles: missing,
            extraFiles: extra,
            statistics: {
                aligned: aligned.length,
                mismatched: mismatched.length,
                missing: missing.length,
                extra: extra.length,
                alignmentScore
            },
            recommendations
        };

        logInfo(`[ScanCodeBase] Scan complete: ${aligned.length} aligned, ${mismatched.length} mismatched, ${missing.length} missing`);

        return result;
    }

    /**
     * Recursively scan a directory
     */
    private async scanDirectory(dir: string, depth: number): Promise<ScannedFile[]> {
        if (depth > this.config.maxDepth) {
            return [];
        }

        const files: ScannedFile[] = [];
        const absoluteDir = path.isAbsolute(dir) ? dir : path.join(this.config.rootDir, dir);

        if (!fs.existsSync(absoluteDir)) {
            return files;
        }

        const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });

        for (const entry of entries) {
            const entryPath = path.join(dir, entry.name);
            const absolutePath = path.join(absoluteDir, entry.name);

            // Check exclusions
            if (this.isExcluded(entryPath)) {
                continue;
            }

            if (entry.isDirectory()) {
                const subFiles = await this.scanDirectory(absolutePath, depth + 1);
                files.push(...subFiles);
            } else if (entry.isFile()) {
                if (this.isIncluded(entryPath)) {
                    const stats = fs.statSync(absolutePath);
                    files.push({
                        path: entryPath,
                        absolutePath,
                        type: path.extname(entry.name),
                        size: stats.size,
                        lastModified: stats.mtime,
                        alignment: 'unknown',
                        relatedRequirements: [],
                        notes: []
                    });
                }
            }
        }

        return files;
    }

    /**
     * Check if a file path matches include patterns
     */
    private isIncluded(filePath: string): boolean {
        // Simple pattern matching (could use minimatch for full glob support)
        for (const pattern of this.config.includePatterns) {
            if (this.matchPattern(filePath, pattern)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if a file path matches exclude patterns
     */
    private isExcluded(filePath: string): boolean {
        for (const pattern of this.config.excludePatterns) {
            if (this.matchPattern(filePath, pattern)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Simple glob pattern matching
     */
    private matchPattern(filePath: string, pattern: string): boolean {
        // Convert glob to regex (simplified)
        const regexPattern = pattern
            .replace(/\*\*/g, '<<<DOUBLESTAR>>>')
            .replace(/\*/g, '[^/]*')
            .replace(/<<<DOUBLESTAR>>>/g, '.*')
            .replace(/\?/g, '.');

        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(filePath) || regex.test(filePath.replace(/\\/g, '/'));
    }

    /**
     * Load expected files from PRD
     */
    private async loadExpectedFiles(): Promise<void> {
        if (!this.config.prdPath || !fs.existsSync(this.config.prdPath)) {
            return;
        }

        try {
            const content = fs.readFileSync(this.config.prdPath, 'utf-8');

            // Try parsing as JSON first
            if (this.config.prdPath.endsWith('.json')) {
                const prd = JSON.parse(content);
                this.extractExpectedFilesFromJSON(prd);
            } else {
                // Parse markdown
                this.extractExpectedFilesFromMarkdown(content);
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logWarn(`[ScanCodeBase] Failed to load PRD: ${msg}`);
        }
    }

    /**
     * Extract expected files from PRD JSON
     */
    private extractExpectedFilesFromJSON(prd: { features?: Array<{ id: string; description: string }> }): void {
        if (!prd.features) return;

        for (const feature of prd.features) {
            // Extract file paths from descriptions
            const fileMatches = feature.description.match(/`([^`]+\.(ts|js|md|json))`/g);
            if (fileMatches) {
                for (const match of fileMatches) {
                    const filePath = match.replace(/`/g, '');
                    this.expectedFiles.set(filePath, {
                        path: filePath,
                        requirementId: feature.id,
                        description: `Required by ${feature.id}`,
                        required: true
                    });
                }
            }
        }
    }

    /**
     * Extract expected files from markdown PRD
     */
    private extractExpectedFilesFromMarkdown(content: string): void {
        // Match patterns like "Create `src/file.ts`" or "**Files**: `src/file.ts`"
        const filePattern = /(?:Create|Files?|Update|Modify|Edit).*?`([^`]+\.(ts|js|md|json))`/gi;
        let match;

        while ((match = filePattern.exec(content)) !== null) {
            const filePath = match[1];
            if (!this.expectedFiles.has(filePath)) {
                this.expectedFiles.set(filePath, {
                    path: filePath,
                    requirementId: 'UNKNOWN',
                    description: 'Referenced in documentation',
                    required: true
                });
            }
        }
    }

    /**
     * Check alignment of a scanned file
     */
    private checkAlignment(file: ScannedFile): {
        status: AlignmentStatus;
        requirements: string[];
        notes: string[];
    } {
        const expected = this.expectedFiles.get(file.path);

        if (!expected) {
            // File exists but not in requirements
            return {
                status: 'extra',
                requirements: [],
                notes: ['File not mentioned in requirements']
            };
        }

        // File exists and is expected
        const notes: string[] = [];

        if (this.config.checkContents) {
            // Could add content analysis here
            notes.push('Content check skipped');
        }

        return {
            status: 'aligned',
            requirements: [expected.requirementId],
            notes
        };
    }

    /**
     * Generate recommendations based on scan results
     */
    private generateRecommendations(
        aligned: ScannedFile[],
        mismatched: ScannedFile[],
        missing: ExpectedFile[],
        extra: ScannedFile[]
    ): string[] {
        const recommendations: string[] = [];

        if (missing.length > 0) {
            recommendations.push(
                `Create ${missing.length} missing file(s): ${missing.slice(0, 3).map(f => f.path).join(', ')}${missing.length > 3 ? '...' : ''}`
            );
        }

        if (mismatched.length > 0) {
            recommendations.push(
                `Review ${mismatched.length} mismatched file(s) for requirement compliance`
            );
        }

        if (extra.length > 10) {
            recommendations.push(
                `Consider documenting ${extra.length} undocumented files or removing unused ones`
            );
        }

        if (aligned.length > 0 && missing.length === 0 && mismatched.length === 0) {
            recommendations.push('All documented requirements have corresponding code ✓');
        }

        return recommendations;
    }
}

// ============================================================================
// MCP Tool Handler
// ============================================================================

/**
 * Handle scanCodeBase MCP tool invocation
 * 
 * @param params - Tool parameters
 * @param workspaceRoot - Workspace root path
 * @returns Formatted scan results
 */
export async function handleScanCodeBase(
    params: ScanCodeBaseParams,
    workspaceRoot: string
): Promise<string> {
    const config: Partial<ScanConfig> = {
        rootDir: params.directory
            ? path.isAbsolute(params.directory)
                ? params.directory
                : path.join(workspaceRoot, params.directory)
            : workspaceRoot,
        checkContents: params.checkContents ?? false,
        prdPath: path.join(workspaceRoot, 'PRD.json')
    };

    if (params.include) {
        config.includePatterns = params.include;
    }

    if (params.exclude) {
        config.excludePatterns = [...DEFAULT_CONFIG.excludePatterns, ...params.exclude];
    }

    const scanner = new CodebaseScanner(config);
    const result = await scanner.scan();

    switch (params.format) {
        case 'json':
            return JSON.stringify(result, null, 2);
        case 'markdown':
            return formatAsMarkdown(result);
        case 'summary':
        default:
            return formatAsSummary(result);
    }
}

/**
 * Format scan result as markdown
 */
function formatAsMarkdown(result: ScanResult): string {
    const lines: string[] = [
        '# Codebase Scan Report',
        '',
        `**Scanned**: ${result.rootDir}`,
        `**Timestamp**: ${result.timestamp}`,
        '',
        '## Summary',
        '',
        `| Metric | Count |`,
        `|--------|-------|`,
        `| Total Files | ${result.totalFiles} |`,
        `| ✅ Aligned | ${result.statistics.aligned} |`,
        `| ⚠️ Mismatched | ${result.statistics.mismatched} |`,
        `| ❌ Missing | ${result.statistics.missing} |`,
        `| ➕ Extra | ${result.statistics.extra} |`,
        `| **Alignment Score** | ${result.statistics.alignmentScore}% |`,
        ''
    ];

    if (result.missingFiles.length > 0) {
        lines.push('## Missing Files', '');
        for (const file of result.missingFiles) {
            lines.push(`- \`${file.path}\` (${file.requirementId})`);
        }
        lines.push('');
    }

    if (result.mismatchedFiles.length > 0) {
        lines.push('## Mismatched Files', '');
        for (const file of result.mismatchedFiles) {
            lines.push(`- \`${file.path}\`: ${file.notes.join(', ')}`);
        }
        lines.push('');
    }

    if (result.recommendations.length > 0) {
        lines.push('## Recommendations', '');
        for (const rec of result.recommendations) {
            lines.push(`- ${rec}`);
        }
    }

    return lines.join('\n');
}

/**
 * Format scan result as brief summary
 */
function formatAsSummary(result: ScanResult): string {
    const lines: string[] = [
        `📊 Codebase Scan: ${result.statistics.alignmentScore}% aligned`,
        `✅ ${result.statistics.aligned} aligned | ⚠️ ${result.statistics.mismatched} mismatched | ❌ ${result.statistics.missing} missing | ➕ ${result.statistics.extra} extra`,
        ''
    ];

    if (result.recommendations.length > 0) {
        lines.push('Recommendations:');
        for (const rec of result.recommendations.slice(0, 3)) {
            lines.push(`• ${rec}`);
        }
    }

    return lines.join('\n');
}

// ============================================================================
// Tool Definition for MCP
// ============================================================================

/**
 * MCP tool definition for scanCodeBase
 */
export const scanCodeBaseTool = {
    name: 'scanCodeBase',
    description: 'Scans the codebase and compares files against documented requirements in PRD. Reports aligned, mismatched, and missing files.',
    inputSchema: {
        type: 'object',
        properties: {
            directory: {
                type: 'string',
                description: 'Directory to scan (relative to workspace). Defaults to workspace root.'
            },
            include: {
                type: 'array',
                items: { type: 'string' },
                description: 'File patterns to include (glob). Defaults to *.ts, *.js, *.md, *.json'
            },
            exclude: {
                type: 'array',
                items: { type: 'string' },
                description: 'Additional file patterns to exclude (glob)'
            },
            checkContents: {
                type: 'boolean',
                description: 'Whether to check file contents for alignment (slower)',
                default: false
            },
            format: {
                type: 'string',
                enum: ['json', 'markdown', 'summary'],
                description: 'Output format',
                default: 'summary'
            }
        },
        required: []
    }
};
