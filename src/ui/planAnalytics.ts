/**
 * Plan Analytics Dashboard (MT-033.16)
 *
 * **Simple explanation**: Shows statistics and insights about your plan -
 * how complete it is, estimated time, risk areas, and progress over time.
 * Like a dashboard for your project health.
 *
 * @module ui/planAnalytics
 */

import { CompletePlan, FeatureBlock, UserStory, DeveloperStory, SuccessCriterion } from '../planning/types';
import { validatePlan, ValidationResult } from './planValidator';
import { calculateCriticalPath, buildGraphNodes, detectCycles } from './dependencyGraph';

// ============================================================================
// Types
// ============================================================================

export interface PlanAnalytics {
    /** Overview stats */
    overview: OverviewStats;
    /** Completeness metrics */
    completeness: CompletenessMetrics;
    /** Time estimates */
    timeEstimates: TimeEstimates;
    /** Risk assessment */
    risks: RiskAssessment;
    /** Quality metrics */
    quality: QualityMetrics;
    /** Progress tracking */
    progress: ProgressMetrics;
    /** Recommendations */
    recommendations: Recommendation[];
    /** Generated timestamp */
    generatedAt: Date;
}

export interface OverviewStats {
    totalFeatures: number;
    totalUserStories: number;
    totalDevStories: number;
    totalSuccessCriteria: number;
    totalDependencies: number;
    totalGoals: number;
}

export interface CompletenessMetrics {
    /** Overall completeness (0-100) */
    overallScore: number;
    /** Per-section scores */
    sections: {
        overview: number;
        features: number;
        dependencies: number;
        userStories: number;
        devStories: number;
        criteria: number;
    };
    /** Missing required items */
    missingItems: string[];
}

export interface TimeEstimates {
    /** Total estimated hours */
    totalHours: number;
    /** Hours by priority */
    byPriority: {
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
    /** Estimated duration in days (8hr workday) */
    estimatedDays: number;
    /** Estimated duration in weeks */
    estimatedWeeks: number;
    /** Parallelizable work percentage */
    parallelizablePercent: number;
}

export interface RiskAssessment {
    /** Overall risk level */
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    /** Risk score (0-100) */
    riskScore: number;
    /** Identified risks */
    risks: Risk[];
}

export interface Risk {
    id: string;
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: 'dependency' | 'scope' | 'complexity' | 'resource' | 'quality';
    mitigation?: string;
}

export interface QualityMetrics {
    /** Validation score */
    validationScore: number;
    /** SMART criteria compliance */
    smartCompliance: number;
    /** Documentation coverage */
    documentationCoverage: number;
    /** Testability score */
    testabilityScore: number;
}

export interface ProgressMetrics {
    /** Features with acceptance criteria */
    featuresWithCriteria: number;
    /** Stories linked to features */
    linkedStories: number;
    /** Criteria marked testable */
    testableCriteria: number;
}

export interface Recommendation {
    id: string;
    priority: 'low' | 'medium' | 'high';
    category: string;
    message: string;
    action?: string;
}

// ============================================================================
// Analytics Generation
// ============================================================================

/**
 * Generate comprehensive analytics for a plan.
 *
 * **Simple explanation**: Analyzes your entire plan and produces a detailed
 * report of statistics, completion status, risks, and recommendations.
 */
export function generateAnalytics(plan: CompletePlan): PlanAnalytics {
    const validation = validatePlan(plan);

    return {
        overview: calculateOverviewStats(plan),
        completeness: calculateCompleteness(plan),
        timeEstimates: calculateTimeEstimates(plan),
        risks: assessRisks(plan, validation),
        quality: calculateQualityMetrics(plan, validation),
        progress: calculateProgressMetrics(plan),
        recommendations: generateRecommendations(plan, validation),
        generatedAt: new Date(),
    };
}

/**
 * Calculate basic overview statistics.
 */
function calculateOverviewStats(plan: CompletePlan): OverviewStats {
    return {
        totalFeatures: plan.featureBlocks.length,
        totalUserStories: plan.userStories.length,
        totalDevStories: plan.developerStories.length,
        totalSuccessCriteria: plan.successCriteria.length,
        totalDependencies: plan.blockLinks.length,
        totalGoals: plan.overview.goals.length,
    };
}

/**
 * Calculate completeness metrics.
 */
function calculateCompleteness(plan: CompletePlan): CompletenessMetrics {
    const missingItems: string[] = [];

    // Overview section (20 points max)
    let overviewScore = 0;
    if (plan.overview.name) overviewScore += 5;
    else missingItems.push('Project name');
    if (plan.overview.description && plan.overview.description.length > 20) overviewScore += 5;
    else missingItems.push('Project description');
    if (plan.overview.goals.length >= 1) overviewScore += 5;
    else missingItems.push('At least one goal');
    if (plan.overview.goals.length >= 3) overviewScore += 5;

    // Features section (25 points max)
    let featuresScore = 0;
    if (plan.featureBlocks.length >= 1) featuresScore += 10;
    else missingItems.push('At least one feature');
    if (plan.featureBlocks.length >= 3) featuresScore += 5;

    const featuresWithDesc = plan.featureBlocks.filter(f => f.description && f.description.length > 10).length;
    featuresScore += Math.min(10, (featuresWithDesc / Math.max(1, plan.featureBlocks.length)) * 10);

    // Dependencies section (15 points max)
    let dependenciesScore = 0;
    if (plan.blockLinks.length > 0) dependenciesScore += 10;
    else if (plan.featureBlocks.length > 1) missingItems.push('Dependencies between features');
    const cycles = detectCycles(plan);
    if (cycles.length === 0) dependenciesScore += 5;

    // User stories section (15 points max)
    let userStoriesScore = 0;
    if (plan.userStories.length >= 1) userStoriesScore += 10;
    else missingItems.push('At least one user story');
    const completeStories = plan.userStories.filter(s => s.userType && s.action && s.benefit).length;
    userStoriesScore += Math.min(5, (completeStories / Math.max(1, plan.userStories.length)) * 5);

    // Dev stories section (10 points max)
    let devStoriesScore = 0;
    if (plan.developerStories.length >= 1) devStoriesScore += 5;
    const estimatedStories = plan.developerStories.filter(s => s.estimatedHours > 0).length;
    devStoriesScore += Math.min(5, (estimatedStories / Math.max(1, plan.developerStories.length)) * 5);

    // Success criteria section (15 points max)
    let criteriaScore = 0;
    if (plan.successCriteria.length >= 1) criteriaScore += 10;
    else missingItems.push('At least one success criterion');
    const testableCriteria = plan.successCriteria.filter(c => c.testable).length;
    criteriaScore += Math.min(5, (testableCriteria / Math.max(1, plan.successCriteria.length)) * 5);

    const totalScore = Math.round(
        overviewScore + featuresScore + dependenciesScore +
        userStoriesScore + devStoriesScore + criteriaScore
    );

    return {
        overallScore: totalScore,
        sections: {
            overview: Math.round((overviewScore / 20) * 100),
            features: Math.round((featuresScore / 25) * 100),
            dependencies: Math.round((dependenciesScore / 15) * 100),
            userStories: Math.round((userStoriesScore / 15) * 100),
            devStories: Math.round((devStoriesScore / 10) * 100),
            criteria: Math.round((criteriaScore / 15) * 100),
        },
        missingItems,
    };
}

/**
 * Calculate time estimates.
 */
function calculateTimeEstimates(plan: CompletePlan): TimeEstimates {
    // Sum estimated hours from developer stories
    const totalHours = plan.developerStories.reduce((sum, s) => sum + (s.estimatedHours || 0), 0);

    // Calculate by priority (from linked features)
    const byPriority = { critical: 0, high: 0, medium: 0, low: 0 };

    plan.developerStories.forEach(story => {
        const feature = plan.featureBlocks.find(f => story.relatedBlockIds.includes(f.id));
        const priority = feature?.priority || 'medium';
        byPriority[priority] += story.estimatedHours || 0;
    });

    // Calculate critical path for parallelization estimate
    const nodes = buildGraphNodes(plan);
    const criticalPath = calculateCriticalPath(nodes);
    const criticalPathNodes = criticalPath.path.length;
    const totalNodes = nodes.size;

    // Rough parallelization estimate
    const parallelizablePercent = totalNodes > 0
        ? Math.round(((totalNodes - criticalPathNodes) / totalNodes) * 100)
        : 0;

    return {
        totalHours,
        byPriority,
        estimatedDays: Math.ceil(totalHours / 8),
        estimatedWeeks: Math.ceil(totalHours / 40),
        parallelizablePercent,
    };
}

/**
 * Assess project risks.
 */
function assessRisks(plan: CompletePlan, validation: ValidationResult): RiskAssessment {
    const risks: Risk[] = [];

    // Dependency cycle risk
    const cycles = detectCycles(plan);
    if (cycles.length > 0) {
        risks.push({
            id: 'RISK-001',
            title: 'Circular Dependencies',
            description: `${cycles.length} circular dependency chain(s) detected`,
            severity: 'critical',
            category: 'dependency',
            mitigation: 'Break dependency cycles by removing or restructuring links',
        });
    }

    // Scope creep risk (too many features)
    if (plan.featureBlocks.length > 10) {
        risks.push({
            id: 'RISK-002',
            title: 'Large Scope',
            description: `${plan.featureBlocks.length} features may be too many for one release`,
            severity: 'medium',
            category: 'scope',
            mitigation: 'Consider phasing features across multiple releases',
        });
    }

    // Critical path risk
    const nodes = buildGraphNodes(plan);
    const criticalPath = calculateCriticalPath(nodes);
    if (criticalPath.chainLength > 5) {
        risks.push({
            id: 'RISK-003',
            title: 'Long Dependency Chain',
            description: `Critical path has ${criticalPath.chainLength} sequential dependencies`,
            severity: 'medium',
            category: 'dependency',
            mitigation: 'Look for opportunities to parallelize work',
        });
    }

    // Missing estimates risk
    const storiesWithoutEstimates = plan.developerStories.filter(s => !s.estimatedHours || s.estimatedHours <= 0);
    if (storiesWithoutEstimates.length > plan.developerStories.length * 0.3) {
        risks.push({
            id: 'RISK-004',
            title: 'Incomplete Estimates',
            description: `${storiesWithoutEstimates.length} developer stories lack time estimates`,
            severity: 'medium',
            category: 'resource',
            mitigation: 'Add hour estimates to all developer stories',
        });
    }

    // Quality risk (many validation errors)
    if (validation.counts.errors > 5) {
        risks.push({
            id: 'RISK-005',
            title: 'Plan Quality Issues',
            description: `${validation.counts.errors} validation errors found`,
            severity: 'high',
            category: 'quality',
            mitigation: 'Address validation errors before proceeding',
        });
    }

    // Vague requirements risk
    const vagueFeatures = plan.featureBlocks.filter(f =>
        !f.description || f.description.length < 30 || f.acceptanceCriteria.length === 0
    );
    if (vagueFeatures.length > plan.featureBlocks.length * 0.5) {
        risks.push({
            id: 'RISK-006',
            title: 'Vague Requirements',
            description: `${vagueFeatures.length} features lack detailed descriptions or acceptance criteria`,
            severity: 'medium',
            category: 'complexity',
            mitigation: 'Add detailed descriptions and acceptance criteria',
        });
    }

    // Calculate overall risk score
    let riskScore = 0;
    risks.forEach(risk => {
        switch (risk.severity) {
            case 'critical': riskScore += 30; break;
            case 'high': riskScore += 20; break;
            case 'medium': riskScore += 10; break;
            case 'low': riskScore += 5; break;
        }
    });
    riskScore = Math.min(100, riskScore);

    let overallRisk: RiskAssessment['overallRisk'] = 'low';
    if (riskScore >= 70) overallRisk = 'critical';
    else if (riskScore >= 40) overallRisk = 'high';
    else if (riskScore >= 20) overallRisk = 'medium';

    return { overallRisk, riskScore, risks };
}

/**
 * Calculate quality metrics.
 */
function calculateQualityMetrics(plan: CompletePlan, validation: ValidationResult): QualityMetrics {
    // Validation score (inverted error count)
    const validationScore = Math.max(0, 100 - (validation.counts.errors * 10) - (validation.counts.warnings * 5));

    // SMART compliance
    let smartCompliant = 0;
    plan.successCriteria.forEach(criterion => {
        const attrs = criterion.smartAttributes;
        let score = 0;
        if (attrs.specific) score += 1;
        if (attrs.measurable) score += 1;
        if (attrs.achievable) score += 1;
        if (attrs.relevant) score += 1;
        if (attrs.timeBound) score += 1;
        if (score >= 4) smartCompliant++;
    });
    const smartCompliance = plan.successCriteria.length > 0
        ? Math.round((smartCompliant / plan.successCriteria.length) * 100)
        : 0;

    // Documentation coverage
    let documented = 0;
    plan.featureBlocks.forEach(f => {
        if (f.description && f.description.length > 30) documented++;
    });
    const documentationCoverage = plan.featureBlocks.length > 0
        ? Math.round((documented / plan.featureBlocks.length) * 100)
        : 0;

    // Testability score
    const testableCriteria = plan.successCriteria.filter(c => c.testable).length;
    const testabilityScore = plan.successCriteria.length > 0
        ? Math.round((testableCriteria / plan.successCriteria.length) * 100)
        : 0;

    return {
        validationScore,
        smartCompliance,
        documentationCoverage,
        testabilityScore,
    };
}

/**
 * Calculate progress metrics.
 */
function calculateProgressMetrics(plan: CompletePlan): ProgressMetrics {
    const featuresWithCriteria = plan.featureBlocks.filter(f => f.acceptanceCriteria.length > 0).length;

    // Count stories linked to features
    const linkedStoryBlockIds = new Set(plan.developerStories.flatMap(s => s.relatedBlockIds));
    const linkedStories = linkedStoryBlockIds.size;

    const testableCriteria = plan.successCriteria.filter(c => c.testable).length;

    return {
        featuresWithCriteria,
        linkedStories,
        testableCriteria,
    };
}

/**
 * Generate recommendations based on analysis.
 */
function generateRecommendations(plan: CompletePlan, validation: ValidationResult): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Based on validation errors
    if (validation.counts.errors > 0) {
        recommendations.push({
            id: 'REC-001',
            priority: 'high',
            category: 'Validation',
            message: `Fix ${validation.counts.errors} validation error(s) before proceeding`,
            action: 'Go to Review page to see all validation issues',
        });
    }

    // Based on completeness
    if (plan.featureBlocks.length > 0 && plan.userStories.length === 0) {
        recommendations.push({
            id: 'REC-002',
            priority: 'medium',
            category: 'Completeness',
            message: 'Add user stories to capture end-user requirements',
            action: 'Go to User Stories page',
        });
    }

    // Based on time estimates
    const totalHours = plan.developerStories.reduce((sum, s) => sum + (s.estimatedHours || 0), 0);
    if (plan.developerStories.length > 0 && totalHours === 0) {
        recommendations.push({
            id: 'REC-003',
            priority: 'medium',
            category: 'Planning',
            message: 'Add time estimates to developer stories for better planning',
            action: 'Go to Developer Stories page',
        });
    }

    // Based on dependencies
    if (plan.featureBlocks.length > 3 && plan.blockLinks.length === 0) {
        recommendations.push({
            id: 'REC-004',
            priority: 'low',
            category: 'Organization',
            message: 'Consider adding dependencies between features to show relationships',
            action: 'Go to Linking page',
        });
    }

    // Based on success criteria
    const untestableCriteria = plan.successCriteria.filter(c => !c.testable).length;
    if (untestableCriteria > 0) {
        recommendations.push({
            id: 'REC-005',
            priority: 'low',
            category: 'Quality',
            message: `${untestableCriteria} success criteria may not be testable`,
            action: 'Review and refine criteria to be objectively verifiable',
        });
    }

    return recommendations;
}

// ============================================================================
// UI Components
// ============================================================================

/**
 * Renders the analytics dashboard.
 */
export function renderAnalyticsDashboard(analytics: PlanAnalytics): string {
    return `
    <div class="analytics-dashboard">
      <div class="dashboard-header">
        <h3>📊 Plan Analytics</h3>
        <span class="generated-time">Generated ${formatTime(analytics.generatedAt)}</span>
      </div>

      ${renderOverviewCards(analytics)}
      ${renderCompletenessSection(analytics.completeness)}
      ${renderTimeEstimatesSection(analytics.timeEstimates)}
      ${renderRiskSection(analytics.risks)}
      ${renderQualitySection(analytics.quality)}
      ${renderRecommendationsSection(analytics.recommendations)}
    </div>
  `;
}

function renderOverviewCards(analytics: PlanAnalytics): string {
    const { overview } = analytics;

    return `
    <div class="overview-cards">
      <div class="card">
        <div class="card-value">${overview.totalFeatures}</div>
        <div class="card-label">Features</div>
      </div>
      <div class="card">
        <div class="card-value">${overview.totalUserStories}</div>
        <div class="card-label">User Stories</div>
      </div>
      <div class="card">
        <div class="card-value">${overview.totalDevStories}</div>
        <div class="card-label">Dev Stories</div>
      </div>
      <div class="card">
        <div class="card-value">${overview.totalDependencies}</div>
        <div class="card-label">Dependencies</div>
      </div>
      <div class="card highlight">
        <div class="card-value">${analytics.completeness.overallScore}%</div>
        <div class="card-label">Complete</div>
      </div>
    </div>
  `;
}

function renderCompletenessSection(completeness: CompletenessMetrics): string {
    return `
    <div class="analytics-section">
      <h4>📝 Completeness</h4>
      <div class="progress-bar-container">
        <div class="progress-bar" style="width: ${completeness.overallScore}%"></div>
        <span class="progress-label">${completeness.overallScore}%</span>
      </div>
      
      <div class="section-scores">
        ${Object.entries(completeness.sections).map(([section, score]) => `
          <div class="section-score">
            <span class="section-name">${capitalize(section)}</span>
            <div class="mini-progress" style="--progress: ${score}%"></div>
            <span class="score-value">${score}%</span>
          </div>
        `).join('')}
      </div>

      ${completeness.missingItems.length > 0 ? `
        <div class="missing-items">
          <strong>Missing:</strong>
          <ul>
            ${completeness.missingItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}

function renderTimeEstimatesSection(timeEstimates: TimeEstimates): string {
    return `
    <div class="analytics-section">
      <h4>⏱️ Time Estimates</h4>
      
      <div class="time-stats">
        <div class="time-stat">
          <span class="stat-value">${timeEstimates.totalHours}h</span>
          <span class="stat-label">Total Hours</span>
        </div>
        <div class="time-stat">
          <span class="stat-value">${timeEstimates.estimatedDays}d</span>
          <span class="stat-label">Work Days</span>
        </div>
        <div class="time-stat">
          <span class="stat-value">${timeEstimates.estimatedWeeks}w</span>
          <span class="stat-label">Weeks</span>
        </div>
        <div class="time-stat">
          <span class="stat-value">${timeEstimates.parallelizablePercent}%</span>
          <span class="stat-label">Parallelizable</span>
        </div>
      </div>

      <div class="priority-breakdown">
        <h5>By Priority</h5>
        <div class="priority-bars">
          ${['critical', 'high', 'medium', 'low'].map(priority => {
        const hours = timeEstimates.byPriority[priority as keyof typeof timeEstimates.byPriority];
        const percent = timeEstimates.totalHours > 0 ? Math.round((hours / timeEstimates.totalHours) * 100) : 0;
        return `
              <div class="priority-bar ${priority}">
                <span class="priority-name">${capitalize(priority)}</span>
                <div class="bar" style="width: ${percent}%"></div>
                <span class="hours">${hours}h</span>
              </div>
            `;
    }).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderRiskSection(risks: RiskAssessment): string {
    const riskColors: Record<string, string> = {
        low: '#28a745',
        medium: '#ffc107',
        high: '#fd7e14',
        critical: '#dc3545',
    };

    return `
    <div class="analytics-section">
      <h4>⚠️ Risk Assessment</h4>
      
      <div class="risk-summary">
        <div class="risk-meter">
          <div class="risk-indicator ${risks.overallRisk}" style="color: ${riskColors[risks.overallRisk]}">
            ${risks.overallRisk.toUpperCase()}
          </div>
          <div class="risk-score">Score: ${risks.riskScore}/100</div>
        </div>
      </div>

      ${risks.risks.length > 0 ? `
        <div class="risk-list">
          ${risks.risks.map(risk => `
            <div class="risk-item ${risk.severity}">
              <div class="risk-header">
                <span class="risk-title">${escapeHtml(risk.title)}</span>
                <span class="risk-severity ${risk.severity}">${risk.severity}</span>
              </div>
              <div class="risk-description">${escapeHtml(risk.description)}</div>
              ${risk.mitigation ? `<div class="risk-mitigation">💡 ${escapeHtml(risk.mitigation)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      ` : '<div class="no-risks">✅ No significant risks identified</div>'}
    </div>
  `;
}

function renderQualitySection(quality: QualityMetrics): string {
    return `
    <div class="analytics-section">
      <h4>✨ Quality Metrics</h4>
      
      <div class="quality-metrics">
        <div class="metric">
          <div class="metric-label">Validation Score</div>
          <div class="metric-gauge">
            <div class="gauge-fill" style="width: ${quality.validationScore}%"></div>
          </div>
          <div class="metric-value">${quality.validationScore}%</div>
        </div>
        <div class="metric">
          <div class="metric-label">SMART Compliance</div>
          <div class="metric-gauge">
            <div class="gauge-fill" style="width: ${quality.smartCompliance}%"></div>
          </div>
          <div class="metric-value">${quality.smartCompliance}%</div>
        </div>
        <div class="metric">
          <div class="metric-label">Documentation</div>
          <div class="metric-gauge">
            <div class="gauge-fill" style="width: ${quality.documentationCoverage}%"></div>
          </div>
          <div class="metric-value">${quality.documentationCoverage}%</div>
        </div>
        <div class="metric">
          <div class="metric-label">Testability</div>
          <div class="metric-gauge">
            <div class="gauge-fill" style="width: ${quality.testabilityScore}%"></div>
          </div>
          <div class="metric-value">${quality.testabilityScore}%</div>
        </div>
      </div>
    </div>
  `;
}

function renderRecommendationsSection(recommendations: Recommendation[]): string {
    if (recommendations.length === 0) {
        return `
      <div class="analytics-section">
        <h4>💡 Recommendations</h4>
        <div class="no-recommendations">✅ No recommendations - your plan looks good!</div>
      </div>
    `;
    }

    return `
    <div class="analytics-section">
      <h4>💡 Recommendations</h4>
      <div class="recommendations-list">
        ${recommendations.map(rec => `
          <div class="recommendation ${rec.priority}">
            <div class="rec-priority ${rec.priority}">${rec.priority}</div>
            <div class="rec-content">
              <div class="rec-message">${escapeHtml(rec.message)}</div>
              ${rec.action ? `<div class="rec-action">${escapeHtml(rec.action)}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Get CSS styles for analytics dashboard.
 */
export function getAnalyticsStyles(): string {
    return `
    .analytics-dashboard {
      background: var(--vscode-editor-background);
      padding: 16px;
    }

    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .dashboard-header h3 {
      margin: 0;
    }

    .generated-time {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .overview-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }

    .card {
      background: var(--vscode-input-background);
      padding: 16px;
      border-radius: 8px;
      text-align: center;
    }

    .card.highlight {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .card-value {
      font-size: 28px;
      font-weight: 600;
    }

    .card-label {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .card.highlight .card-label {
      color: var(--vscode-button-foreground);
      opacity: 0.9;
    }

    .analytics-section {
      background: var(--vscode-input-background);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .analytics-section h4 {
      margin: 0 0 12px;
      font-size: 14px;
    }

    .progress-bar-container {
      position: relative;
      height: 24px;
      background: var(--vscode-progressBar-background);
      border-radius: 12px;
      overflow: hidden;
    }

    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, var(--vscode-button-background), var(--vscode-button-hoverBackground));
      border-radius: 12px;
      transition: width 0.5s ease;
    }

    .progress-label {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      font-weight: 600;
      font-size: 12px;
    }

    .section-scores {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 8px;
      margin-top: 12px;
    }

    .section-score {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }

    .section-name {
      min-width: 80px;
    }

    .mini-progress {
      flex: 1;
      height: 6px;
      background: var(--vscode-progressBar-background);
      border-radius: 3px;
      position: relative;
    }

    .mini-progress::after {
      content: '';
      position: absolute;
      height: 100%;
      width: var(--progress, 0%);
      background: var(--vscode-button-background);
      border-radius: 3px;
    }

    .score-value {
      min-width: 35px;
      text-align: right;
    }

    .time-stats {
      display: flex;
      gap: 24px;
      margin-bottom: 16px;
    }

    .time-stat {
      text-align: center;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 600;
    }

    .stat-label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .priority-bars {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .priority-bar {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .priority-name {
      min-width: 60px;
      font-size: 12px;
    }

    .priority-bar .bar {
      height: 8px;
      border-radius: 4px;
      min-width: 4px;
    }

    .priority-bar.critical .bar { background: #dc3545; }
    .priority-bar.high .bar { background: #fd7e14; }
    .priority-bar.medium .bar { background: #0d6efd; }
    .priority-bar.low .bar { background: #6c757d; }

    .hours {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .risk-summary {
      text-align: center;
      margin-bottom: 16px;
    }

    .risk-indicator {
      font-size: 24px;
      font-weight: 700;
    }

    .risk-score {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .risk-item {
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 8px;
      border-left: 4px solid;
    }

    .risk-item.critical { border-color: #dc3545; background: rgba(220, 53, 69, 0.1); }
    .risk-item.high { border-color: #fd7e14; background: rgba(253, 126, 20, 0.1); }
    .risk-item.medium { border-color: #ffc107; background: rgba(255, 193, 7, 0.1); }
    .risk-item.low { border-color: #6c757d; background: rgba(108, 117, 125, 0.1); }

    .risk-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .risk-title {
      font-weight: 600;
      font-size: 13px;
    }

    .risk-severity {
      font-size: 10px;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .risk-description {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .risk-mitigation {
      margin-top: 8px;
      font-size: 12px;
      padding: 6px 8px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
    }

    .quality-metrics {
      display: grid;
      gap: 12px;
    }

    .metric {
      display: grid;
      grid-template-columns: 120px 1fr 50px;
      align-items: center;
      gap: 8px;
    }

    .metric-label {
      font-size: 12px;
    }

    .metric-gauge {
      height: 8px;
      background: var(--vscode-progressBar-background);
      border-radius: 4px;
      overflow: hidden;
    }

    .gauge-fill {
      height: 100%;
      background: var(--vscode-button-background);
      border-radius: 4px;
    }

    .metric-value {
      text-align: right;
      font-weight: 600;
      font-size: 12px;
    }

    .recommendations-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .recommendation {
      display: flex;
      gap: 12px;
      padding: 10px;
      background: var(--vscode-editor-background);
      border-radius: 6px;
    }

    .rec-priority {
      font-size: 10px;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      align-self: flex-start;
    }

    .rec-priority.high { background: rgba(220, 53, 69, 0.2); color: var(--vscode-errorForeground); }
    .rec-priority.medium { background: rgba(255, 193, 7, 0.2); color: var(--vscode-editorWarning-foreground); }
    .rec-priority.low { background: rgba(13, 110, 253, 0.2); color: var(--vscode-editorInfo-foreground); }

    .rec-message {
      font-size: 13px;
      margin-bottom: 4px;
    }

    .rec-action {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .no-risks, .no-recommendations {
      text-align: center;
      padding: 16px;
      color: var(--vscode-testing-iconPassed);
    }

    .missing-items {
      margin-top: 12px;
      padding: 10px;
      background: rgba(220, 53, 69, 0.1);
      border-radius: 6px;
      font-size: 12px;
    }

    .missing-items ul {
      margin: 4px 0 0 20px;
      padding: 0;
    }
  `;
}

// ============================================================================
// Helper Functions
// ============================================================================

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

function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
