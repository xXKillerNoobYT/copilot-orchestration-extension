/**
 * Task Context Package Generator (MT-033.32)
 *
 * Gathers all context a coding agent needs to execute a task: relevant
 * code snippets, dependency trees, similar patterns, related documentation,
 * test examples, and error history. Uses smart filtering to keep packages
 * compact and relevant.
 *
 * **Simple explanation**: Before you start building, someone gathers all
 * the blueprints, reference photos, and notes you'll need and puts them
 * in a neat folder — so you don't waste time searching for information.
 *
 * @module services/contextPackager
 */

import {
    AtomicTask,
    MasterTicket,
    TaskBreakdownResult,
    AgentTeam
} from '../generators/taskBreakdown';

import {
    CompletePlan,
    FeatureBlock,
    DeveloperStory
} from '../planning/types';

import {
    HandoffPackage
} from './codingHandoff';

// ============================================================================
// Types
// ============================================================================

/** Category of context being gathered */
export type ContextCategory =
    | 'code_snippet'
    | 'dependency'
    | 'pattern'
    | 'documentation'
    | 'test_example'
    | 'error_history';

/** Relevance score tier */
export type RelevanceTier = 'high' | 'medium' | 'low';

/**
 * A single piece of context information.
 *
 * **Simple explanation**: One reference document from the folder — could be
 * a code snippet, a dependency diagram, or a past error report.
 */
export interface ContextItem {
    /** Unique identifier */
    id: string;
    /** Category of this context */
    category: ContextCategory;
    /** Human-readable title */
    title: string;
    /** Description of what this context contains */
    description: string;
    /** The actual content (code, text, etc.) */
    content: string;
    /** Source file or location */
    source: string;
    /** Relevance tier */
    relevance: RelevanceTier;
    /** Relevance score (0-100) */
    relevanceScore: number;
    /** Size in characters */
    sizeChars: number;
}

/**
 * A dependency relationship between files/modules.
 *
 * **Simple explanation**: "File A uses File B" — the dependency tree
 * shows what code connects to what.
 */
export interface DependencyInfo {
    /** The file being depended on */
    filePath: string;
    /** What it provides (exports) */
    provides: string[];
    /** What depends on this file */
    usedBy: string[];
    /** Direction of dependency */
    direction: 'upstream' | 'downstream';
}

/**
 * A pattern match found in the codebase.
 *
 * **Simple explanation**: "Here's how something similar was done before."
 */
export interface PatternMatch {
    /** File where the pattern was found */
    filePath: string;
    /** Name or description of the pattern */
    patternName: string;
    /** The code snippet */
    snippet: string;
    /** Similarity score (0-100) */
    similarity: number;
}

/**
 * An error that previously occurred in related code.
 *
 * **Simple explanation**: "Last time someone worked on this, here's what went wrong."
 */
export interface ErrorRecord {
    /** Error message */
    message: string;
    /** File where the error occurred */
    filePath: string;
    /** When the error was recorded */
    recordedAt: string;
    /** How it was resolved (if it was) */
    resolution: string;
    /** Whether this error is recurring */
    isRecurring: boolean;
}

/**
 * Configuration for context package generation.
 *
 * **Simple explanation**: Settings that control how much context to gather
 * and what to include or exclude.
 */
export interface ContextPackagerConfig {
    /** Maximum total package size in characters (default: 50000) */
    maxPackageSizeChars: number;
    /** Maximum items per category (default: 10) */
    maxItemsPerCategory: number;
    /** Minimum relevance score to include (default: 30) */
    minRelevanceScore: number;
    /** Include dependency tree (default: true) */
    includeDependencies: boolean;
    /** Include similar patterns (default: true) */
    includePatterns: boolean;
    /** Include test examples (default: true) */
    includeTestExamples: boolean;
    /** Include error history (default: true) */
    includeErrorHistory: boolean;
    /** Maximum snippet length in characters (default: 2000) */
    maxSnippetLength: number;
}

/**
 * Complete context package for a task.
 *
 * **Simple explanation**: The complete reference folder — everything
 * a coding agent needs to understand the task's context.
 */
export interface ContextPackage {
    /** Package ID (matches handoff package ID) */
    handoffId: string;
    /** Task ID this context is for */
    taskId: string;
    /** When this package was generated */
    generatedAt: string;
    /** All context items, sorted by relevance */
    items: ContextItem[];
    /** Dependency tree for affected files */
    dependencies: DependencyInfo[];
    /** Similar patterns found in codebase */
    patternMatches: PatternMatch[];
    /** Past errors in related code */
    errorHistory: ErrorRecord[];
    /** Total package size in characters */
    totalSizeChars: number;
    /** Items filtered out due to size/relevance limits */
    filteredCount: number;
    /** Summary of what's included */
    summary: string;
}

/**
 * Default context packager configuration.
 *
 * **Simple explanation**: Standard settings — gather up to 50K chars of context,
 * 10 items per category, minimum 30% relevance.
 */
export const DEFAULT_CONTEXT_PACKAGER_CONFIG: ContextPackagerConfig = {
    maxPackageSizeChars: 50000,
    maxItemsPerCategory: 10,
    minRelevanceScore: 30,
    includeDependencies: true,
    includePatterns: true,
    includeTestExamples: true,
    includeErrorHistory: true,
    maxSnippetLength: 2000
};

// ============================================================================
// Relevance Scoring
// ============================================================================

/**
 * Calculate relevance score for a file relative to a task.
 *
 * **Simple explanation**: How important is this file to the task?
 * Direct file references score highest, same-directory files score medium.
 */
export function calculateFileRelevance(
    filePath: string,
    task: AtomicTask,
    parentTicket: MasterTicket
): number {
    let score = 0;

    // Direct file references → highest relevance
    if (task.files.includes(filePath)) {
        score += 80;
    }

    // Same directory as a task file
    const taskDirs = task.files.map(f => f.split('/').slice(0, -1).join('/'));
    const fileDir = filePath.split('/').slice(0, -1).join('/');
    if (taskDirs.includes(fileDir)) {
        score += 30;
    }

    // Feature-related keywords in filename
    const fileName = filePath.split('/').pop()?.toLowerCase() ?? '';
    const keywords = extractKeywords(task.title + ' ' + parentTicket.title);
    for (const keyword of keywords) {
        if (fileName.includes(keyword)) {
            score += 15;
        }
    }

    // Cap at 100
    return Math.min(100, score);
}

/**
 * Get the relevance tier from a numeric score.
 *
 * **Simple explanation**: Converts a 0-100 score into high/medium/low.
 */
export function getRelevanceTier(score: number): RelevanceTier {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
}

/**
 * Extract meaningful keywords from text.
 *
 * **Simple explanation**: Pulls out the important words from a title
 * (skipping common words like "the", "and", "a").
 */
export function extractKeywords(text: string): string[] {
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'it', 'as', 'be', 'was', 'are',
        'this', 'that', 'has', 'have', 'had', 'do', 'does', 'did', 'will',
        'would', 'could', 'should', 'may', 'might', 'can', 'not', 'no'
    ]);

    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length >= 3 && !stopWords.has(word));
}

// ============================================================================
// Code Snippet Extraction
// ============================================================================

/**
 * Create a code snippet context item from a file.
 *
 * **Simple explanation**: Wraps a code snippet with metadata — where it came from,
 * how relevant it is, and what it's about.
 */
export function createCodeSnippet(
    filePath: string,
    content: string,
    relevanceScore: number,
    config: ContextPackagerConfig
): ContextItem {
    const truncated = content.length > config.maxSnippetLength
        ? content.substring(0, config.maxSnippetLength) + '\n// ... (truncated)'
        : content;

    return {
        id: `snippet-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}`,
        category: 'code_snippet',
        title: `Code from ${filePath}`,
        description: `Relevant code snippet from ${filePath}`,
        content: truncated,
        source: filePath,
        relevance: getRelevanceTier(relevanceScore),
        relevanceScore,
        sizeChars: truncated.length
    };
}

// ============================================================================
// Dependency Analysis
// ============================================================================

/**
 * Analyze dependencies for the task's files.
 *
 * **Simple explanation**: Finds what code depends on the files being changed,
 * and what those files depend on — like a family tree of code connections.
 */
export function analyzeDependencies(
    task: AtomicTask,
    importMap: Map<string, string[]>
): DependencyInfo[] {
    const deps: DependencyInfo[] = [];

    for (const filePath of task.files) {
        // Upstream: what this file imports
        const imports = importMap.get(filePath) ?? [];
        for (const importedFile of imports) {
            deps.push({
                filePath: importedFile,
                provides: [importedFile.split('/').pop() ?? importedFile],
                usedBy: [filePath],
                direction: 'upstream'
            });
        }

        // Downstream: what imports this file
        for (const [otherFile, otherImports] of importMap.entries()) {
            if (otherFile !== filePath && otherImports.includes(filePath)) {
                deps.push({
                    filePath: otherFile,
                    provides: [],
                    usedBy: [filePath],
                    direction: 'downstream'
                });
            }
        }
    }

    // Deduplicate by filePath + direction
    const seen = new Set<string>();
    return deps.filter(d => {
        const key = `${d.filePath}:${d.direction}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Find similar patterns in the codebase for a task.
 *
 * **Simple explanation**: Looks for files that do something similar to
 * what this task needs — "here's how someone else solved a comparable problem."
 */
export function findSimilarPatterns(
    task: AtomicTask,
    existingFiles: Map<string, string>,
    config: ContextPackagerConfig
): PatternMatch[] {
    if (!config.includePatterns) return [];

    const keywords = extractKeywords(task.title + ' ' + task.description);
    const matches: PatternMatch[] = [];

    for (const [filePath, content] of existingFiles.entries()) {
        // Skip the task's own files
        if (task.files.includes(filePath)) continue;

        const similarity = calculateSimilarity(keywords, filePath, content);
        if (similarity >= config.minRelevanceScore) {
            matches.push({
                filePath,
                patternName: `Pattern from ${filePath.split('/').pop()}`,
                snippet: content.substring(0, config.maxSnippetLength),
                similarity
            });
        }
    }

    // Sort by similarity descending, limit to maxItemsPerCategory
    return matches
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, config.maxItemsPerCategory);
}

/**
 * Calculate keyword-based similarity between a task and a file.
 *
 * **Simple explanation**: Counts how many of the task's keywords appear
 * in the file's name or content.
 */
export function calculateSimilarity(
    keywords: string[],
    filePath: string,
    content: string
): number {
    if (keywords.length === 0) return 0;

    const lowerPath = filePath.toLowerCase();
    const lowerContent = content.toLowerCase();
    let matchCount = 0;

    for (const keyword of keywords) {
        if (lowerPath.includes(keyword)) {
            matchCount += 2; // Filename match worth double
        } else if (lowerContent.includes(keyword)) {
            matchCount += 1;
        }
    }

    // Normalize: max possible is keywords.length * 2 (all in filename)
    const maxPossible = keywords.length * 2;
    return Math.min(100, Math.round((matchCount / maxPossible) * 100));
}

// ============================================================================
// Test Example Gathering
// ============================================================================

/**
 * Gather test examples relevant to the task.
 *
 * **Simple explanation**: Finds existing tests that are similar to what
 * this task needs, so the agent can use them as templates.
 */
export function gatherTestExamples(
    task: AtomicTask,
    testFiles: Map<string, string>,
    config: ContextPackagerConfig
): ContextItem[] {
    if (!config.includeTestExamples) return [];

    const items: ContextItem[] = [];
    const keywords = extractKeywords(task.title);

    for (const [filePath, content] of testFiles.entries()) {
        const fileName = filePath.split('/').pop()?.toLowerCase() ?? '';
        let relevance = 0;

        // Same directory → medium relevance
        const taskDirs = task.files.map(f => f.replace(/^src\//, 'tests/').split('/').slice(0, -1).join('/'));
        const testDir = filePath.split('/').slice(0, -1).join('/');
        if (taskDirs.includes(testDir)) {
            relevance += 40;
        }

        // Keyword match in filename
        for (const kw of keywords) {
            if (fileName.includes(kw)) {
                relevance += 20;
            }
        }

        if (relevance >= config.minRelevanceScore) {
            items.push(createCodeSnippet(filePath, content, relevance, config));
        }
    }

    return items
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, config.maxItemsPerCategory);
}

// ============================================================================
// Error History
// ============================================================================

/**
 * Filter error history for errors relevant to this task.
 *
 * **Simple explanation**: Finds past errors that happened in files this task
 * is touching — so the agent can avoid the same mistakes.
 */
export function filterRelevantErrors(
    task: AtomicTask,
    allErrors: ErrorRecord[],
    config: ContextPackagerConfig
): ErrorRecord[] {
    if (!config.includeErrorHistory) return [];

    return allErrors
        .filter(error => {
            // Error in one of the task's files
            if (task.files.includes(error.filePath)) return true;

            // Error in same directory as task file
            const errorDir = error.filePath.split('/').slice(0, -1).join('/');
            const taskDirs = task.files.map(f => f.split('/').slice(0, -1).join('/'));
            return taskDirs.includes(errorDir);
        })
        .slice(0, config.maxItemsPerCategory);
}

// ============================================================================
// Size Management
// ============================================================================

/**
 * Calculate the total size of a list of context items.
 *
 * **Simple explanation**: Adds up how big all the items are to make sure
 * the package doesn't exceed the size limit.
 */
export function calculateTotalSize(items: ContextItem[]): number {
    return items.reduce((sum, item) => sum + item.sizeChars, 0);
}

/**
 * Trim context items to fit within the maximum package size.
 *
 * **Simple explanation**: If the package is too big, removes the least
 * relevant items first until it fits.
 */
export function trimToFit(
    items: ContextItem[],
    maxSizeChars: number
): { kept: ContextItem[]; filteredCount: number } {
    // Sort by relevance (highest first)
    const sorted = [...items].sort((a, b) => b.relevanceScore - a.relevanceScore);

    const kept: ContextItem[] = [];
    let currentSize = 0;
    let filteredCount = 0;

    for (const item of sorted) {
        if (currentSize + item.sizeChars <= maxSizeChars) {
            kept.push(item);
            currentSize += item.sizeChars;
        } else {
            filteredCount++;
        }
    }

    return { kept, filteredCount };
}

// ============================================================================
// Documentation Context
// ============================================================================

/**
 * Gather relevant documentation for a task.
 *
 * **Simple explanation**: Finds design docs, API specs, and other reference
 * material related to the task.
 */
export function gatherDocumentation(
    task: AtomicTask,
    parentTicket: MasterTicket,
    docsMap: Map<string, string>,
    config: ContextPackagerConfig
): ContextItem[] {
    const items: ContextItem[] = [];
    const keywords = extractKeywords(task.title + ' ' + parentTicket.title);

    for (const [docPath, content] of docsMap.entries()) {
        const lowerPath = docPath.toLowerCase();
        let relevance = 0;

        for (const kw of keywords) {
            if (lowerPath.includes(kw)) {
                relevance += 25;
            }
            if (content.toLowerCase().includes(kw)) {
                relevance += 10;
            }
        }

        if (relevance >= config.minRelevanceScore) {
            items.push({
                id: `doc-${docPath.replace(/[^a-zA-Z0-9]/g, '-')}`,
                category: 'documentation',
                title: `Documentation: ${docPath.split('/').pop()}`,
                description: `Related documentation from ${docPath}`,
                content: content.substring(0, config.maxSnippetLength),
                source: docPath,
                relevance: getRelevanceTier(relevance),
                relevanceScore: Math.min(100, relevance),
                sizeChars: Math.min(content.length, config.maxSnippetLength)
            });
        }
    }

    return items
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, config.maxItemsPerCategory);
}

// ============================================================================
// Context Package Summary
// ============================================================================

/**
 * Generate a human-readable summary of the context package.
 *
 * **Simple explanation**: A brief description of what's in the package,
 * like a table of contents.
 */
export function generateContextSummary(
    items: ContextItem[],
    dependencies: DependencyInfo[],
    patternMatches: PatternMatch[],
    errorHistory: ErrorRecord[]
): string {
    const categoryCounts = new Map<string, number>();
    for (const item of items) {
        categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
    }

    const parts: string[] = [];

    const snippetCount = categoryCounts.get('code_snippet') ?? 0;
    if (snippetCount > 0) parts.push(`${snippetCount} code snippet(s)`);

    if (dependencies.length > 0) parts.push(`${dependencies.length} dependency relationship(s)`);

    if (patternMatches.length > 0) parts.push(`${patternMatches.length} similar pattern(s)`);

    const docCount = categoryCounts.get('documentation') ?? 0;
    if (docCount > 0) parts.push(`${docCount} documentation reference(s)`);

    const testCount = categoryCounts.get('test_example') ?? 0;
    if (testCount > 0) parts.push(`${testCount} test example(s)`);

    if (errorHistory.length > 0) parts.push(`${errorHistory.length} error history record(s)`);

    if (parts.length === 0) return 'No context items gathered.';
    return `Context package contains: ${parts.join(', ')}.`;
}

// ============================================================================
// Package Creation
// ============================================================================

/**
 * Create a complete context package for a task.
 *
 * **Simple explanation**: Gathers all the reference material the coding agent
 * needs and packages it up — code snippets, dependencies, patterns, docs,
 * test examples, and error history.
 *
 * @param handoffPackage - The handoff package to create context for
 * @param codeFiles - Map of file paths to their content
 * @param testFiles - Map of test file paths to their content
 * @param docsMap - Map of documentation file paths to their content
 * @param importMap - Map of file paths to their imports
 * @param errorHistory - Past error records
 * @param config - Optional configuration overrides
 * @returns Complete ContextPackage
 */
export function createContextPackage(
    handoffPackage: HandoffPackage,
    codeFiles: Map<string, string>,
    testFiles: Map<string, string>,
    docsMap: Map<string, string>,
    importMap: Map<string, string[]>,
    errorHistory: ErrorRecord[],
    config?: Partial<ContextPackagerConfig>
): ContextPackage {
    const cfg: ContextPackagerConfig = { ...DEFAULT_CONTEXT_PACKAGER_CONFIG, ...config };

    const task = handoffPackage.task;
    const parentTicket = handoffPackage.parentTicket;

    // 1. Gather code snippets from affected files
    const codeItems: ContextItem[] = [];
    for (const [filePath, content] of codeFiles.entries()) {
        const relevance = calculateFileRelevance(filePath, task, parentTicket);
        if (relevance >= cfg.minRelevanceScore) {
            codeItems.push(createCodeSnippet(filePath, content, relevance, cfg));
        }
    }

    // 2. Analyze dependencies
    const dependencies = cfg.includeDependencies
        ? analyzeDependencies(task, importMap)
        : [];

    // 3. Find similar patterns
    const patternMatches = findSimilarPatterns(task, codeFiles, cfg);

    // 4. Gather documentation
    const docItems = gatherDocumentation(task, parentTicket, docsMap, cfg);

    // 5. Gather test examples
    const testItems = gatherTestExamples(task, testFiles, cfg);

    // 6. Filter error history
    const relevantErrors = filterRelevantErrors(task, errorHistory, cfg);

    // Combine all context items
    const allItems = [...codeItems, ...docItems, ...testItems];

    // Trim to fit size limit
    const { kept, filteredCount } = trimToFit(allItems, cfg.maxPackageSizeChars);

    // Generate summary
    const summary = generateContextSummary(kept, dependencies, patternMatches, relevantErrors);

    return {
        handoffId: handoffPackage.id,
        taskId: task.id,
        generatedAt: new Date().toISOString(),
        items: kept,
        dependencies,
        patternMatches,
        errorHistory: relevantErrors,
        totalSizeChars: calculateTotalSize(kept),
        filteredCount,
        summary
    };
}
