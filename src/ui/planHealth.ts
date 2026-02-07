/**
 * Plan Health Scoring (MT-033.18)
 *
 * **Simple explanation**: Calculates a single "health score" for your plan
 * that tells you at a glance how ready it is for execution. Like a report
 * card for your project plan.
 *
 * @module ui/planHealth
 */

import { CompletePlan } from '../planning/types';
import { validatePlan, ValidationResult } from './planValidator';
import { generateAnalytics, PlanAnalytics } from './planAnalytics';
import { detectCycles } from './dependencyGraph';

// ============================================================================
// Types
// ============================================================================

export interface HealthScore {
    /** Overall health score (0-100) */
    score: number;
    /** Letter grade (A-F) */
    grade: HealthGrade;
    /** Category scores */
    categories: CategoryScores;
    /** Health factors that affected the score */
    factors: HealthFactor[];
    /** Generated timestamp */
    generatedAt: Date;
}

export type HealthGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F';

export interface CategoryScores {
    /** Structure and organization (0-100) */
    structure: number;
    /** Completeness of content (0-100) */
    completeness: number;
    /** Clarity of requirements (0-100) */
    clarity: number;
    /** Feasibility and planning (0-100) */
    feasibility: number;
    /** Quality and testability (0-100) */
    quality: number;
}

export interface HealthFactor {
    /** Factor ID */
    id: string;
    /** Factor name */
    name: string;
    /** Impact on score (positive or negative) */
    impact: number;
    /** Description */
    description: string;
    /** Category this factor belongs to */
    category: keyof CategoryScores;
    /** Whether this is positive or negative */
    type: 'positive' | 'negative';
}

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_WEIGHTS: Record<keyof CategoryScores, number> = {
    structure: 0.20,
    completeness: 0.25,
    clarity: 0.20,
    feasibility: 0.15,
    quality: 0.20,
};

// ============================================================================
// Health Calculation
// ============================================================================

/**
 * Calculate health score for a plan.
 *
 * **Simple explanation**: Analyzes your plan across 5 categories and
 * produces an overall health score with a letter grade.
 */
export function calculateHealthScore(plan: CompletePlan): HealthScore {
    const validation = validatePlan(plan);
    const analytics = generateAnalytics(plan);
    const factors: HealthFactor[] = [];

    // Calculate category scores
    const structure = calculateStructureScore(plan, factors);
    const completeness = calculateCompletenessScore(plan, analytics, factors);
    const clarity = calculateClarityScore(plan, validation, factors);
    const feasibility = calculateFeasibilityScore(plan, analytics, factors);
    const quality = calculateQualityScore(plan, validation, analytics, factors);

    const categories: CategoryScores = {
        structure,
        completeness,
        clarity,
        feasibility,
        quality,
    };

    // Calculate weighted overall score
    const overallScore = Math.round(
        categories.structure * CATEGORY_WEIGHTS.structure +
        categories.completeness * CATEGORY_WEIGHTS.completeness +
        categories.clarity * CATEGORY_WEIGHTS.clarity +
        categories.feasibility * CATEGORY_WEIGHTS.feasibility +
        categories.quality * CATEGORY_WEIGHTS.quality
    );

    // Determine grade
    const grade = scoreToGrade(overallScore);

    return {
        score: overallScore,
        grade,
        categories,
        factors: factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)),
        generatedAt: new Date(),
    };
}

/**
 * Calculate structure score.
 */
function calculateStructureScore(plan: CompletePlan, factors: HealthFactor[]): number {
    let score = 50; // Start at baseline

    // Has features (+20)
    if (plan.featureBlocks.length >= 1) {
        score += 20;
        factors.push({
            id: 'struct-features',
            name: 'Features defined',
            impact: 20,
            description: `${plan.featureBlocks.length} feature(s) in plan`,
            category: 'structure',
            type: 'positive',
        });
    } else {
        score -= 30;
        factors.push({
            id: 'struct-no-features',
            name: 'No features',
            impact: -30,
            description: 'Plan has no feature blocks',
            category: 'structure',
            type: 'negative',
        });
    }

    // Has dependencies (appropriate for plan size)
    if (plan.featureBlocks.length > 1) {
        if (plan.blockLinks.length > 0) {
            score += 15;
            factors.push({
                id: 'struct-deps',
                name: 'Dependencies defined',
                impact: 15,
                description: 'Features have dependency relationships',
                category: 'structure',
                type: 'positive',
            });
        } else {
            score -= 10;
            factors.push({
                id: 'struct-no-deps',
                name: 'No dependencies',
                impact: -10,
                description: 'Multiple features but no dependencies',
                category: 'structure',
                type: 'negative',
            });
        }
    }

    // No circular dependencies (+15 or -20)
    const cycles = detectCycles(plan);
    if (cycles.length === 0) {
        score += 15;
        factors.push({
            id: 'struct-no-cycles',
            name: 'No circular dependencies',
            impact: 15,
            description: 'Dependency graph has no cycles',
            category: 'structure',
            type: 'positive',
        });
    } else {
        score -= 20;
        factors.push({
            id: 'struct-cycles',
            name: 'Circular dependencies',
            impact: -20,
            description: `${cycles.length} circular dependency chain(s) found`,
            category: 'structure',
            type: 'negative',
        });
    }

    return clamp(score, 0, 100);
}

/**
 * Calculate completeness score.
 */
function calculateCompletenessScore(
    plan: CompletePlan,
    analytics: PlanAnalytics,
    factors: HealthFactor[]
): number {
    let score = analytics.completeness.overallScore;

    // Bonus for all sections having content
    const sections = analytics.completeness.sections;
    const filledSections = Object.values(sections).filter(s => s >= 50).length;

    if (filledSections === 6) {
        score += 10;
        factors.push({
            id: 'complete-all-sections',
            name: 'All sections filled',
            impact: 10,
            description: 'Every section has meaningful content',
            category: 'completeness',
            type: 'positive',
        });
    }

    // User stories present
    if (plan.userStories.length >= 3) {
        factors.push({
            id: 'complete-stories',
            name: 'User stories defined',
            impact: 5,
            description: `${plan.userStories.length} user stories capture requirements`,
            category: 'completeness',
            type: 'positive',
        });
    } else if (plan.userStories.length === 0) {
        score -= 10;
        factors.push({
            id: 'complete-no-stories',
            name: 'No user stories',
            impact: -10,
            description: 'Missing user perspective on requirements',
            category: 'completeness',
            type: 'negative',
        });
    }

    // Success criteria present
    if (plan.successCriteria.length >= 1) {
        factors.push({
            id: 'complete-criteria',
            name: 'Success criteria defined',
            impact: 5,
            description: 'Project has measurable success criteria',
            category: 'completeness',
            type: 'positive',
        });
    }

    return clamp(score, 0, 100);
}

/**
 * Calculate clarity score.
 */
function calculateClarityScore(
    plan: CompletePlan,
    validation: ValidationResult,
    factors: HealthFactor[]
): number {
    let score = 70; // Start at baseline

    // Deduct for validation warnings related to clarity
    const clarityWarnings = validation.issues.filter(
        i => i.category === 'quality' || i.message.toLowerCase().includes('vague')
    );
    if (clarityWarnings.length > 0) {
        const deduction = Math.min(30, clarityWarnings.length * 5);
        score -= deduction;
        factors.push({
            id: 'clarity-warnings',
            name: 'Clarity issues',
            impact: -deduction,
            description: `${clarityWarnings.length} clarity/quality warning(s)`,
            category: 'clarity',
            type: 'negative',
        });
    }

    // Good descriptions (+15)
    const goodDescriptions = plan.featureBlocks.filter(
        f => f.description && f.description.length >= 50
    ).length;
    if (goodDescriptions === plan.featureBlocks.length && plan.featureBlocks.length > 0) {
        score += 15;
        factors.push({
            id: 'clarity-descriptions',
            name: 'Detailed descriptions',
            impact: 15,
            description: 'All features have detailed descriptions',
            category: 'clarity',
            type: 'positive',
        });
    }

    // Acceptance criteria on features (+15)
    const featuresWithCriteria = plan.featureBlocks.filter(
        f => f.acceptanceCriteria.length >= 1
    ).length;
    if (featuresWithCriteria === plan.featureBlocks.length && plan.featureBlocks.length > 0) {
        score += 15;
        factors.push({
            id: 'clarity-acceptance',
            name: 'Acceptance criteria defined',
            impact: 15,
            description: 'All features have acceptance criteria',
            category: 'clarity',
            type: 'positive',
        });
    }

    return clamp(score, 0, 100);
}

/**
 * Calculate feasibility score.
 */
function calculateFeasibilityScore(
    plan: CompletePlan,
    analytics: PlanAnalytics,
    factors: HealthFactor[]
): number {
    let score = 60; // Start at baseline

    // Has time estimates (+20)
    const estimatedStories = plan.developerStories.filter(s => s.estimatedHours > 0).length;
    if (estimatedStories > 0) {
        const estimateRatio = estimatedStories / Math.max(1, plan.developerStories.length);
        if (estimateRatio >= 0.8) {
            score += 20;
            factors.push({
                id: 'feasible-estimates',
                name: 'Time estimates provided',
                impact: 20,
                description: `${Math.round(estimateRatio * 100)}% of stories have estimates`,
                category: 'feasibility',
                type: 'positive',
            });
        }
    } else if (plan.developerStories.length > 0) {
        score -= 15;
        factors.push({
            id: 'feasible-no-estimates',
            name: 'Missing time estimates',
            impact: -15,
            description: 'Developer stories lack time estimates',
            category: 'feasibility',
            type: 'negative',
        });
    }

    // Reasonable scope (not too large)
    if (analytics.timeEstimates.totalHours > 0 && analytics.timeEstimates.totalHours <= 200) {
        score += 15;
        factors.push({
            id: 'feasible-scope',
            name: 'Reasonable scope',
            impact: 15,
            description: 'Project scope is manageable',
            category: 'feasibility',
            type: 'positive',
        });
    } else if (analytics.timeEstimates.totalHours > 400) {
        score -= 10;
        factors.push({
            id: 'feasible-large-scope',
            name: 'Large scope',
            impact: -10,
            description: 'Project may be too large for one release',
            category: 'feasibility',
            type: 'negative',
        });
    }

    // Low risk assessment (+10)
    if (analytics.risks.overallRisk === 'low') {
        score += 10;
        factors.push({
            id: 'feasible-low-risk',
            name: 'Low risk profile',
            impact: 10,
            description: 'Few identified risks',
            category: 'feasibility',
            type: 'positive',
        });
    } else if (analytics.risks.overallRisk === 'critical') {
        score -= 15;
        factors.push({
            id: 'feasible-high-risk',
            name: 'High risk profile',
            impact: -15,
            description: 'Critical risks identified',
            category: 'feasibility',
            type: 'negative',
        });
    }

    return clamp(score, 0, 100);
}

/**
 * Calculate quality score.
 */
function calculateQualityScore(
    plan: CompletePlan,
    validation: ValidationResult,
    analytics: PlanAnalytics,
    factors: HealthFactor[]
): number {
    let score = 50; // Start at baseline

    // Validation passes (+25)
    if (validation.counts.errors === 0) {
        score += 25;
        factors.push({
            id: 'quality-passes',
            name: 'Validation passes',
            impact: 25,
            description: 'No validation errors',
            category: 'quality',
            type: 'positive',
        });
    } else {
        const deduction = Math.min(30, validation.counts.errors * 5);
        score -= deduction;
        factors.push({
            id: 'quality-errors',
            name: 'Validation errors',
            impact: -deduction,
            description: `${validation.counts.errors} validation error(s)`,
            category: 'quality',
            type: 'negative',
        });
    }

    // SMART criteria compliance (+15)
    if (analytics.quality.smartCompliance >= 80) {
        score += 15;
        factors.push({
            id: 'quality-smart',
            name: 'SMART compliance',
            impact: 15,
            description: 'Success criteria follow SMART framework',
            category: 'quality',
            type: 'positive',
        });
    }

    // Testable criteria (+10)
    if (analytics.quality.testabilityScore >= 80) {
        score += 10;
        factors.push({
            id: 'quality-testable',
            name: 'Testable criteria',
            impact: 10,
            description: 'Success criteria are testable',
            category: 'quality',
            type: 'positive',
        });
    }

    return clamp(score, 0, 100);
}

/**
 * Convert numeric score to letter grade.
 */
function scoreToGrade(score: number): HealthGrade {
    if (score >= 97) return 'A+';
    if (score >= 93) return 'A';
    if (score >= 90) return 'A-';
    if (score >= 87) return 'B+';
    if (score >= 83) return 'B';
    if (score >= 80) return 'B-';
    if (score >= 77) return 'C+';
    if (score >= 73) return 'C';
    if (score >= 70) return 'C-';
    if (score >= 60) return 'D';
    return 'F';
}

// ============================================================================
// UI Components
// ============================================================================

/**
 * Renders the health score badge.
 */
export function renderHealthBadge(health: HealthScore): string {
    const gradeColors: Record<string, string> = {
        'A+': '#28a745', 'A': '#28a745', 'A-': '#28a745',
        'B+': '#5cb85c', 'B': '#5cb85c', 'B-': '#5cb85c',
        'C+': '#f0ad4e', 'C': '#f0ad4e', 'C-': '#f0ad4e',
        'D': '#fd7e14',
        'F': '#dc3545',
    };

    return `
    <div class="health-badge" style="--grade-color: ${gradeColors[health.grade]}">
      <div class="health-grade">${health.grade}</div>
      <div class="health-score">${health.score}/100</div>
    </div>
  `;
}

/**
 * Renders the full health score panel.
 */
export function renderHealthPanel(health: HealthScore): string {
    return `
    <div class="health-panel">
      <div class="health-header">
        <h4>🏥 Plan Health</h4>
        ${renderHealthBadge(health)}
      </div>

      <div class="health-categories">
        ${Object.entries(health.categories).map(([category, score]) => `
          <div class="category-row">
            <span class="category-name">${capitalize(category)}</span>
            <div class="category-bar">
              <div class="bar-fill" style="width: ${score}%; background: ${getScoreColor(score)}"></div>
            </div>
            <span class="category-score">${score}</span>
          </div>
        `).join('')}
      </div>

      <div class="health-factors">
        <h5>Key Factors</h5>
        <div class="factors-list">
          ${health.factors.slice(0, 8).map(factor => `
            <div class="factor ${factor.type}">
              <span class="factor-icon">${factor.type === 'positive' ? '✅' : '⚠️'}</span>
              <span class="factor-name">${escapeHtml(factor.name)}</span>
              <span class="factor-impact ${factor.type}">${factor.impact > 0 ? '+' : ''}${factor.impact}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

/**
 * Get CSS styles for health components.
 */
export function getHealthStyles(): string {
    return `
    .health-badge {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px 20px;
      background: var(--grade-color);
      border-radius: 8px;
      color: white;
    }

    .health-grade {
      font-size: 32px;
      font-weight: 700;
      line-height: 1;
    }

    .health-score {
      font-size: 12px;
      opacity: 0.9;
    }

    .health-panel {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      padding: 16px;
    }

    .health-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }

    .health-header h4 {
      margin: 0;
    }

    .health-categories {
      margin-bottom: 20px;
    }

    .category-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }

    .category-name {
      min-width: 100px;
      font-size: 12px;
    }

    .category-bar {
      flex: 1;
      height: 8px;
      background: var(--vscode-progressBar-background);
      border-radius: 4px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .category-score {
      min-width: 30px;
      text-align: right;
      font-size: 12px;
      font-weight: 600;
    }

    .health-factors h5 {
      margin: 0 0 10px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .factors-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .factor {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      border-radius: 4px;
    }

    .factor-icon {
      font-size: 14px;
    }

    .factor-name {
      flex: 1;
    }

    .factor-impact {
      font-weight: 600;
    }

    .factor-impact.positive {
      color: var(--vscode-testing-iconPassed);
    }

    .factor-impact.negative {
      color: var(--vscode-errorForeground);
    }
  `;
}

// ============================================================================
// Helper Functions
// ============================================================================

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getScoreColor(score: number): string {
    if (score >= 80) return '#28a745';
    if (score >= 60) return '#5cb85c';
    if (score >= 40) return '#f0ad4e';
    if (score >= 20) return '#fd7e14';
    return '#dc3545';
}
