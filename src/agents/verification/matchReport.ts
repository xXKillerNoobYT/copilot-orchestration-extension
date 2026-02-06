/**
 * Matches and Remaining Reporter
 * 
 * **Simple explanation**: Shows which acceptance criteria have been satisfied
 * and which still need work. Like a checklist that updates as you complete items.
 * 
 * @module agents/verification/matchReport
 */

import { logInfo, logWarn, logError } from '../../logger';

/**
 * Match status for a criterion
 */
export interface CriterionMatch {
    /** Original criterion text */
    criterion: string;
    /** Whether it matched */
    matched: boolean;
    /** Match confidence (0-1) */
    confidence: number;
    /** Evidence of match */
    evidence?: string;
    /** What code/test satisfies this */
    satisfiedBy?: string;
    /** When it was matched (timestamp) */
    matchedAt?: number;
}

/**
 * Partial match progress
 */
export interface PartialMatch {
    /** Criterion text */
    criterion: string;
    /** Progress percentage (0-100) */
    progress: number;
    /** What's done */
    completed: string[];
    /** What remains */
    remaining: string[];
}

/**
 * Match report for a task
 */
export interface MatchReport {
    /** Task ID */
    taskId: string;
    /** All criteria for the task */
    allCriteria: string[];
    /** Matched criteria */
    matched: CriterionMatch[];
    /** Remaining (unmatched) criteria */
    remaining: string[];
    /** Partial matches */
    partial: PartialMatch[];
    /** Overall progress percentage */
    progressPercent: number;
    /** Timestamp */
    timestamp: number;
}

/**
 * Match Report Generator
 * 
 * **Simple explanation**: Compares implemented code against acceptance
 * criteria and generates a report showing what's done and what's left.
 */
export class MatchReportGenerator {
    private reports: Map<string, MatchReport> = new Map();

    /**
     * Generate a match report
     */
    public generateReport(
        taskId: string,
        allCriteria: string[],
        matches: CriterionMatch[]
    ): MatchReport {
        // Find matched criteria
        const matched = matches.filter(m => m.matched);
        const matchedTexts = new Set(matched.map(m => m.criterion));

        // Find remaining (unmatched) criteria
        const remaining = allCriteria.filter(c => !matchedTexts.has(c));

        // Find partial matches
        const partial = matches
            .filter(m => !m.matched && m.confidence > 0.3)
            .map(m => this.analyzePartialMatch(m));

        // Calculate progress
        const progressPercent = allCriteria.length > 0
            ? Math.round((matched.length / allCriteria.length) * 100)
            : 0;

        const report: MatchReport = {
            taskId,
            allCriteria,
            matched,
            remaining,
            partial,
            progressPercent,
            timestamp: Date.now()
        };

        this.reports.set(taskId, report);
        logInfo(`[MatchReport] Task ${taskId}: ${matched.length}/${allCriteria.length} criteria matched (${progressPercent}%)`);

        return report;
    }

    /**
     * Analyze a partial match to determine what's done and what remains
     */
    private analyzePartialMatch(match: CriterionMatch): PartialMatch {
        // Split criterion into components (simple approach)
        const components = match.criterion
            .split(/[,;]|and|or/i)
            .map(c => c.trim())
            .filter(c => c.length > 5);

        const completed: string[] = [];
        const remaining: string[] = [];

        // Use evidence to determine what's complete
        const evidenceLower = (match.evidence || '').toLowerCase();

        for (const component of components) {
            const componentLower = component.toLowerCase();
            // Simple heuristic: if component keywords appear in evidence, it's done
            const keywords = componentLower.split(' ').filter(w => w.length > 3);
            const matchedKeywords = keywords.filter(k => evidenceLower.includes(k));

            if (matchedKeywords.length >= keywords.length * 0.5) {
                completed.push(component);
            } else {
                remaining.push(component);
            }
        }

        return {
            criterion: match.criterion,
            progress: components.length > 0
                ? Math.round((completed.length / components.length) * 100)
                : Math.round(match.confidence * 100),
            completed,
            remaining
        };
    }

    /**
     * Format report as text
     */
    public formatAsText(report: MatchReport): string {
        const lines: string[] = [
            `═══════════════════════════════════════════`,
            `MATCH REPORT: ${report.taskId}`,
            `Progress: ${report.progressPercent}%`,
            `═══════════════════════════════════════════`,
            ``
        ];

        if (report.matched.length > 0) {
            lines.push(`✅ MATCHED (${report.matched.length})`);
            lines.push(`───────────────────────────────────────────`);
            for (const m of report.matched) {
                lines.push(`  ✓ ${m.criterion}`);
                if (m.satisfiedBy) {
                    lines.push(`    └ Satisfied by: ${m.satisfiedBy}`);
                }
            }
            lines.push(``);
        }

        if (report.remaining.length > 0) {
            lines.push(`❌ REMAINING (${report.remaining.length})`);
            lines.push(`───────────────────────────────────────────`);
            for (const r of report.remaining) {
                lines.push(`  ○ ${r}`);
            }
            lines.push(``);
        }

        if (report.partial.length > 0) {
            lines.push(`🔄 PARTIAL MATCHES`);
            lines.push(`───────────────────────────────────────────`);
            for (const p of report.partial) {
                lines.push(`  ◐ ${p.criterion.substring(0, 60)}... (${p.progress}%)`);
                if (p.completed.length > 0) {
                    lines.push(`    ✓ Done: ${p.completed.join(', ')}`);
                }
                if (p.remaining.length > 0) {
                    lines.push(`    ○ Todo: ${p.remaining.join(', ')}`);
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * Format report as Markdown
     */
    public formatAsMarkdown(report: MatchReport): string {
        const lines: string[] = [
            `# Match Report: ${report.taskId}`,
            ``,
            `**Progress**: ${report.progressPercent}% (${report.matched.length}/${report.allCriteria.length} criteria)`,
            ``
        ];

        if (report.matched.length > 0) {
            lines.push(`## ✅ Matched Criteria`, ``);
            for (const m of report.matched) {
                lines.push(`- [x] ${m.criterion}`);
                if (m.satisfiedBy) {
                    lines.push(`  - *Satisfied by: ${m.satisfiedBy}*`);
                }
            }
            lines.push(``);
        }

        if (report.remaining.length > 0) {
            lines.push(`## ❌ Remaining Criteria`, ``);
            for (const r of report.remaining) {
                lines.push(`- [ ] ${r}`);
            }
            lines.push(``);
        }

        if (report.partial.length > 0) {
            lines.push(`## 🔄 Partial Matches`, ``);
            for (const p of report.partial) {
                lines.push(`### ${p.criterion.substring(0, 60)}... (${p.progress}%)`);
                if (p.completed.length > 0) {
                    lines.push(`**Done:**`);
                    for (const c of p.completed) {
                        lines.push(`- [x] ${c}`);
                    }
                }
                if (p.remaining.length > 0) {
                    lines.push(`**Todo:**`);
                    for (const r of p.remaining) {
                        lines.push(`- [ ] ${r}`);
                    }
                }
                lines.push(``);
            }
        }

        return lines.join('\n');
    }

    /**
     * Get actionable items (what to work on next)
     */
    public getActionableItems(report: MatchReport): string[] {
        const items: string[] = [];

        // Add remaining criteria
        for (const r of report.remaining) {
            items.push(`Implement: ${r}`);
        }

        // Add remaining parts of partial matches
        for (const p of report.partial) {
            for (const r of p.remaining) {
                items.push(`Complete: ${r}`);
            }
        }

        return items;
    }

    /**
     * Get report by task ID
     */
    public getReport(taskId: string): MatchReport | undefined {
        return this.reports.get(taskId);
    }

    /**
     * Update an existing report
     */
    public updateReport(taskId: string, newMatches: CriterionMatch[]): MatchReport | undefined {
        const existing = this.reports.get(taskId);
        if (!existing) {
            return undefined;
        }

        // Merge new matches
        const matchMap = new Map<string, CriterionMatch>();
        for (const m of existing.matched) {
            matchMap.set(m.criterion, m);
        }
        for (const m of newMatches) {
            if (m.matched) {
                matchMap.set(m.criterion, m);
            }
        }

        return this.generateReport(taskId, existing.allCriteria, Array.from(matchMap.values()));
    }

    /**
     * Clear all reports
     */
    public clear(): void {
        this.reports.clear();
    }
}

// Singleton instance
let generatorInstance: MatchReportGenerator | null = null;

/**
 * Get the singleton MatchReportGenerator instance
 */
export function getMatchReportGenerator(): MatchReportGenerator {
    if (!generatorInstance) {
        generatorInstance = new MatchReportGenerator();
    }
    return generatorInstance;
}

/**
 * Reset for testing
 */
export function resetMatchReportGeneratorForTests(): void {
    generatorInstance = null;
}
