/**
 * Planning Wizard Types & Interfaces
 *
 * **Simple explanation**: These are the building blocks that define what a plan looks like.
 * A plan has projects, features, stories, and success criteria. This file defines their shapes.
 *
 * @module planning/types
 */

// ============================================================================
// PROJECT OVERVIEW (Page 1)
// ============================================================================

export interface ProjectOverview {
  name: string;
  description: string;
  goals: string[];
}

// ============================================================================
// FEATURE BLOCKS (Page 2)
// ============================================================================

export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface FeatureBlock {
  id: string; // UUID
  name: string;
  description: string;
  purpose: string;
  acceptanceCriteria: string[];
  technicalNotes: string;
  priority: PriorityLevel;
  order: number;
}

// ============================================================================
// BLOCK LINKING (Page 3)
// ============================================================================

export type DependencyType = 'requires' | 'suggests' | 'blocks' | 'triggers';
export type ConditionalAction = 'starts' | 'pauses' | 'requires_review' | 'completes';
export type ConditionalTrigger = 'complete' | 'started' | 'blocked' | 'failed';

export interface BlockLink {
  id: string;
  sourceBlockId: string;
  targetBlockId: string;
  dependencyType: DependencyType;
}

export interface ConditionalLogic {
  id: string;
  sourceBlockId: string;
  trigger: ConditionalTrigger; // "when Block A is [complete/started/blocked]"
  action: ConditionalAction; // "then Block B [starts/pauses/requires review]"
  targetBlockId: string;
  description?: string;
}

// ============================================================================
// USER STORIES (Page 4)
// ============================================================================

export interface UserStory {
  id: string;
  userType: string; // "customer", "admin", "developer"
  action: string;
  benefit: string;
  relatedBlockIds: string[];
  acceptanceCriteria: string[];
  priority: PriorityLevel;
}

// ============================================================================
// DEVELOPER STORIES (Page 5)
// ============================================================================

export interface DeveloperStory {
  id: string;
  action: string;
  benefit: string;
  technicalRequirements: string[];
  apiNotes: string;
  databaseNotes: string;
  estimatedHours: number;
  relatedBlockIds: string[];
  relatedTaskIds: string[];
}

// ============================================================================
// SUCCESS CRITERIA (Page 6 - SMART)
// ============================================================================

export type SMARTAttribute = 'specific' | 'measurable' | 'achievable' | 'relevant' | 'timeBound';

export interface SuccessCriterion {
  id: string;
  description: string;
  smartAttributes: {
    specific: boolean;
    measurable: boolean;
    achievable: boolean;
    relevant: boolean;
    timeBound: boolean;
  };
  relatedFeatureIds: string[];
  relatedStoryIds: string[];
  testable: boolean;
  priority: PriorityLevel;
}

// ============================================================================
// COMPLETE PLAN
// ============================================================================

export interface PlanMetadata {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  author?: string;
}

export interface CompletePlan {
  metadata: PlanMetadata;
  overview: ProjectOverview;
  featureBlocks: FeatureBlock[];
  blockLinks: BlockLink[];
  conditionalLogic: ConditionalLogic[];
  userStories: UserStory[];
  developerStories: DeveloperStory[];
  successCriteria: SuccessCriterion[];
}

// ============================================================================
// WIZARD STATE & NAVIGATION
// ============================================================================

export type WizardPage = 'overview' | 'features' | 'linking' | 'userStories' | 'devStories' | 'criteria' | 'review';

export interface WizardState {
  currentPage: WizardPage;
  plan: Partial<CompletePlan>;
  isDirty: boolean;
  lastSaved?: Date;
  draftId?: string;
}

// ============================================================================
// VALIDATION RESULTS
// ============================================================================

export enum ValidationSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
}

export interface ValidationIssue {
  severity: ValidationSeverity;
  field: string;
  message: string;
  suggestion?: string;
  fixable: boolean;
}

// ============================================================================
// TEMPLATES
// ============================================================================

export type TemplateType = 'webApp' | 'restApi' | 'cliTool' | 'vscodeExt' | 'documentation';

export interface PlanTemplate {
  id: string;
  name: string;
  type: TemplateType;
  description: string;
  basePlan: Partial<CompletePlan>;
}
