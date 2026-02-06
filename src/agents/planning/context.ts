/**
 * Context Extraction for Planning Team
 * 
 * **Simple explanation**: This module gathers relevant context from the codebase
 * (existing patterns, tech stack, related files) to inform planning decisions -
 * like a researcher who does background reading before starting work.
 * 
 * @module agents/planning/context
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn, logError } from '../../logger';

/**
 * Extracted context for planning
 */
export interface PlanningContext {
    /** Related source files */
    relatedFiles: FileContext[];
    /** Design patterns detected in codebase */
    existingPatterns: string[];
    /** Technology stack */
    techStack: TechStackInfo;
    /** Relevant documentation */
    documentation: DocumentationContext[];
    /** Configuration hints */
    configHints: string[];
    /** Context extraction timestamp */
    timestamp: Date;
}

/**
 * File context information
 */
export interface FileContext {
    /** File path */
    path: string;
    /** Why this file is relevant */
    relevance: string;
    /** Key exports/interfaces */
    exports: string[];
    /** File size in lines */
    lineCount: number;
    /** Snippet of relevant code */
    snippet?: string;
}

/**
 * Technology stack information
 */
export interface TechStackInfo {
    /** Programming language */
    language: string;
    /** Framework (if any) */
    framework: string | null;
    /** Test framework */
    testFramework: string | null;
    /** Build tool */
    buildTool: string | null;
    /** Package manager */
    packageManager: string | null;
    /** Major dependencies */
    majorDependencies: string[];
}

/**
 * Documentation context
 */
export interface DocumentationContext {
    /** Document path */
    path: string;
    /** Document type */
    type: 'prd' | 'architecture' | 'api' | 'readme' | 'other';
    /** Relevant sections */
    sections: string[];
}

/**
 * Context extraction configuration
 */
export interface ContextExtractionConfig {
    /** Root directory to search */
    rootDir: string;
    /** Maximum files to analyze */
    maxFiles: number;
    /** Maximum snippet length */
    maxSnippetLength: number;
    /** File patterns to include */
    includePatterns: string[];
    /** File patterns to exclude */
    excludePatterns: string[];
}

const DEFAULT_CONFIG: ContextExtractionConfig = {
    rootDir: '.',
    maxFiles: 20,
    maxSnippetLength: 500,
    includePatterns: ['*.ts', '*.tsx', '*.js', '*.json', '*.md'],
    excludePatterns: ['node_modules', 'out', 'dist', 'coverage', '.git']
};

/**
 * ContextExtractor class for gathering planning context
 * 
 * **Simple explanation**: Like a librarian who finds all the relevant books
 * before you start researching a topic.
 */
export class ContextExtractor {
    private config: ContextExtractionConfig;

    constructor(config: Partial<ContextExtractionConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Extract context for a feature/requirement
     * 
     * @param requirement - Feature or requirement description
     * @param keywords - Additional keywords to search for
     * @returns Extracted planning context
     */
    async extractContext(requirement: string, keywords: string[] = []): Promise<PlanningContext> {
        logInfo('[ContextExtractor] Extracting context for planning');

        const allKeywords = this.extractKeywords(requirement, keywords);
        const relatedFiles = await this.findRelatedFiles(allKeywords);
        const existingPatterns = this.detectPatterns(relatedFiles);
        const techStack = await this.detectTechStack();
        const documentation = await this.findRelevantDocs(allKeywords);
        const configHints = this.extractConfigHints();

        const context: PlanningContext = {
            relatedFiles,
            existingPatterns,
            techStack,
            documentation,
            configHints,
            timestamp: new Date()
        };

        logInfo(`[ContextExtractor] Found ${relatedFiles.length} related files, ${documentation.length} docs`);
        return context;
    }

    /**
     * Extract keywords from requirement text
     */
    private extractKeywords(requirement: string, additional: string[]): string[] {
        // Extract meaningful words from requirement
        const words = requirement
            .toLowerCase()
            .split(/[\s,.\-_:;!?()[\]{}]+/)
            .filter(w => w.length > 2)
            .filter(w => !this.isStopWord(w));

        // Combine with additional keywords
        const combined = [...new Set([...words, ...additional.map(k => k.toLowerCase())])];
        return combined.slice(0, 20); // Limit keywords
    }

    /**
     * Check if word is a stop word
     */
    private isStopWord(word: string): boolean {
        const stopWords = new Set([
            'the', 'and', 'for', 'with', 'that', 'this', 'from', 'will', 'can',
            'should', 'would', 'could', 'have', 'has', 'had', 'are', 'were', 'was',
            'been', 'being', 'not', 'but', 'what', 'when', 'where', 'which', 'how'
        ]);
        return stopWords.has(word);
    }

    /**
     * Find files related to keywords
     */
    private async findRelatedFiles(keywords: string[]): Promise<FileContext[]> {
        const files: FileContext[] = [];
        
        try {
            const allFiles = await this.walkDirectory(this.config.rootDir);
            
            for (const filePath of allFiles) {
                if (files.length >= this.config.maxFiles) break;

                const relevance = this.checkFileRelevance(filePath, keywords);
                if (relevance.isRelevant) {
                    const fileContext = await this.extractFileContext(filePath, relevance.reason, keywords);
                    if (fileContext) {
                        files.push(fileContext);
                    }
                }
            }
        } catch (error: unknown) {
            logWarn(`[ContextExtractor] Error finding files: ${error instanceof Error ? error.message : String(error)}`);
        }

        return files;
    }

    /**
     * Walk directory recursively
     */
    private async walkDirectory(dir: string): Promise<string[]> {
        const files: string[] = [];
        
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                // Check exclude patterns
                if (this.config.excludePatterns.some(p => entry.name.includes(p))) {
                    continue;
                }

                if (entry.isDirectory()) {
                    const subFiles = await this.walkDirectory(fullPath);
                    files.push(...subFiles);
                } else if (entry.isFile()) {
                    // Check include patterns
                    if (this.matchesPattern(entry.name)) {
                        files.push(fullPath);
                    }
                }
            }
        } catch {
            // Ignore permission errors, etc.
        }

        return files;
    }

    /**
     * Check if filename matches include patterns
     */
    private matchesPattern(filename: string): boolean {
        return this.config.includePatterns.some(pattern => {
            const regex = new RegExp(pattern.replace('*', '.*'));
            return regex.test(filename);
        });
    }

    /**
     * Check if file is relevant to keywords
     */
    private checkFileRelevance(filePath: string, keywords: string[]): { isRelevant: boolean; reason: string } {
        const filename = path.basename(filePath).toLowerCase();
        const dirname = path.dirname(filePath).toLowerCase();

        for (const keyword of keywords) {
            if (filename.includes(keyword)) {
                return { isRelevant: true, reason: `Filename contains "${keyword}"` };
            }
            if (dirname.includes(keyword)) {
                return { isRelevant: true, reason: `Directory contains "${keyword}"` };
            }
        }

        return { isRelevant: false, reason: '' };
    }

    /**
     * Extract context from a file
     */
    private async extractFileContext(
        filePath: string,
        relevance: string,
        keywords: string[]
    ): Promise<FileContext | null> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            const exports = this.extractExports(content);
            const snippet = this.extractRelevantSnippet(content, keywords);

            return {
                path: filePath,
                relevance,
                exports,
                lineCount: lines.length,
                snippet
            };
        } catch {
            return null;
        }
    }

    /**
     * Extract exports from TypeScript/JavaScript file
     */
    private extractExports(content: string): string[] {
        const exports: string[] = [];
        
        // Match export statements
        const patterns = [
            /export\s+(interface|type|class|function|const|let|var)\s+(\w+)/g,
            /export\s+\{\s*([^}]+)\s*\}/g,
            /export\s+default\s+(\w+)/g
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                if (match[2]) {
                    exports.push(match[2]);
                } else if (match[1]) {
                    // Handle grouped exports
                    const items = match[1].split(',').map(s => s.trim().split(' ')[0]);
                    exports.push(...items);
                }
            }
        }

        return [...new Set(exports)].slice(0, 10);
    }

    /**
     * Extract relevant code snippet
     */
    private extractRelevantSnippet(content: string, keywords: string[]): string | undefined {
        const lines = content.split('\n');
        
        // Find line with most keyword matches
        let bestLineIndex = -1;
        let bestScore = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase();
            const score = keywords.filter(k => line.includes(k)).length;
            if (score > bestScore) {
                bestScore = score;
                bestLineIndex = i;
            }
        }

        if (bestLineIndex === -1 || bestScore === 0) {
            return undefined;
        }

        // Get context around best line
        const start = Math.max(0, bestLineIndex - 5);
        const end = Math.min(lines.length, bestLineIndex + 10);
        const snippet = lines.slice(start, end).join('\n');

        return snippet.slice(0, this.config.maxSnippetLength);
    }

    /**
     * Detect patterns in related files
     */
    private detectPatterns(files: FileContext[]): string[] {
        const patterns: string[] = [];
        const allExports = files.flatMap(f => f.exports);

        // Detect common patterns
        if (allExports.some(e => /Service$/i.test(e))) {
            patterns.push('Service layer pattern');
        }
        if (allExports.some(e => /Provider$/i.test(e))) {
            patterns.push('Provider pattern');
        }
        if (allExports.some(e => /Factory$/i.test(e))) {
            patterns.push('Factory pattern');
        }
        if (allExports.some(e => /initialize|getInstance/i.test(e))) {
            patterns.push('Singleton pattern');
        }
        if (allExports.some(e => /Event|emit|subscribe/i.test(e))) {
            patterns.push('Observer/Event pattern');
        }

        return patterns;
    }

    /**
     * Detect technology stack
     */
    private async detectTechStack(): Promise<TechStackInfo> {
        const techStack: TechStackInfo = {
            language: 'TypeScript',
            framework: null,
            testFramework: null,
            buildTool: null,
            packageManager: null,
            majorDependencies: []
        };

        try {
            const packageJsonPath = path.join(this.config.rootDir, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

                // Detect framework
                if (deps['react']) techStack.framework = 'React';
                else if (deps['vue']) techStack.framework = 'Vue';
                else if (deps['@angular/core']) techStack.framework = 'Angular';
                else if (deps['express']) techStack.framework = 'Express';
                else if (deps['vscode']) techStack.framework = 'VS Code Extension';

                // Detect test framework
                if (deps['jest']) techStack.testFramework = 'Jest';
                else if (deps['mocha']) techStack.testFramework = 'Mocha';
                else if (deps['vitest']) techStack.testFramework = 'Vitest';

                // Detect build tool
                if (deps['webpack']) techStack.buildTool = 'Webpack';
                else if (deps['vite']) techStack.buildTool = 'Vite';
                else if (deps['esbuild']) techStack.buildTool = 'esbuild';
                else if (deps['typescript']) techStack.buildTool = 'tsc';

                // Package manager
                if (fs.existsSync(path.join(this.config.rootDir, 'pnpm-lock.yaml'))) {
                    techStack.packageManager = 'pnpm';
                } else if (fs.existsSync(path.join(this.config.rootDir, 'yarn.lock'))) {
                    techStack.packageManager = 'yarn';
                } else {
                    techStack.packageManager = 'npm';
                }

                // Major dependencies
                techStack.majorDependencies = Object.keys(deps).slice(0, 10);
            }
        } catch {
            // Defaults are already set
        }

        return techStack;
    }

    /**
     * Find relevant documentation
     */
    private async findRelevantDocs(keywords: string[]): Promise<DocumentationContext[]> {
        const docs: DocumentationContext[] = [];
        const docPatterns = ['README.md', 'PRD.md', 'ARCHITECTURE.md', 'API.md', 'CONTRIBUTING.md'];

        try {
            const allFiles = await this.walkDirectory(this.config.rootDir);
            
            for (const filePath of allFiles) {
                const filename = path.basename(filePath);
                
                if (filename.endsWith('.md')) {
                    const type = this.getDocType(filename);
                    const isRelevant = docPatterns.some(p => filename.toLowerCase().includes(p.toLowerCase())) ||
                        keywords.some(k => filename.toLowerCase().includes(k));

                    if (isRelevant) {
                        docs.push({
                            path: filePath,
                            type,
                            sections: await this.extractDocSections(filePath, keywords)
                        });
                    }
                }
            }
        } catch {
            // Ignore errors
        }

        return docs.slice(0, 5);
    }

    /**
     * Get documentation type
     */
    private getDocType(filename: string): DocumentationContext['type'] {
        const name = filename.toLowerCase();
        if (name.includes('prd')) return 'prd';
        if (name.includes('architecture') || name.includes('design')) return 'architecture';
        if (name.includes('api')) return 'api';
        if (name.includes('readme')) return 'readme';
        return 'other';
    }

    /**
     * Extract relevant sections from a document
     */
    private async extractDocSections(filePath: string, keywords: string[]): Promise<string[]> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const sections: string[] = [];

            // Extract headings
            const headingPattern = /^#+\s+(.+)$/gm;
            let match;

            while ((match = headingPattern.exec(content)) !== null) {
                const heading = match[1];
                if (keywords.some(k => heading.toLowerCase().includes(k))) {
                    sections.push(heading);
                }
            }

            return sections.slice(0, 5);
        } catch {
            return [];
        }
    }

    /**
     * Extract configuration hints
     */
    private extractConfigHints(): string[] {
        const hints: string[] = [];

        // Check for common config files
        const configFiles = [
            { file: 'tsconfig.json', hint: 'TypeScript configured, use strict typing' },
            { file: '.eslintrc.json', hint: 'ESLint configured, follow linting rules' },
            { file: 'jest.config.js', hint: 'Jest configured, write test files in tests/ or *.test.ts' },
            { file: '.coe/config.json', hint: 'COE config exists, check for project-specific settings' }
        ];

        for (const { file, hint } of configFiles) {
            if (fs.existsSync(path.join(this.config.rootDir, file))) {
                hints.push(hint);
            }
        }

        return hints;
    }

    /**
     * Format context as string for LLM
     */
    formatForLLM(context: PlanningContext): string {
        const lines: string[] = [];

        lines.push('## Existing Context');
        lines.push('');

        // Tech stack
        lines.push(`**Tech Stack**: ${context.techStack.language}${context.techStack.framework ? ` + ${context.techStack.framework}` : ''}`);
        if (context.techStack.testFramework) {
            lines.push(`**Testing**: ${context.techStack.testFramework}`);
        }
        lines.push('');

        // Patterns
        if (context.existingPatterns.length > 0) {
            lines.push('**Existing Patterns**:');
            for (const pattern of context.existingPatterns) {
                lines.push(`- ${pattern}`);
            }
            lines.push('');
        }

        // Related files
        if (context.relatedFiles.length > 0) {
            lines.push('**Related Files**:');
            for (const file of context.relatedFiles.slice(0, 5)) {
                lines.push(`- ${file.path} (${file.relevance})`);
            }
            lines.push('');
        }

        // Config hints
        if (context.configHints.length > 0) {
            lines.push('**Configuration Notes**:');
            for (const hint of context.configHints) {
                lines.push(`- ${hint}`);
            }
        }

        return lines.join('\n');
    }
}

// Singleton instance
let instance: ContextExtractor | null = null;

/**
 * Get the singleton ContextExtractor
 */
export function getContextExtractor(): ContextExtractor {
    if (!instance) {
        instance = new ContextExtractor();
    }
    return instance;
}

/**
 * Reset the singleton for testing
 */
export function resetContextExtractorForTests(): void {
    instance = null;
}
