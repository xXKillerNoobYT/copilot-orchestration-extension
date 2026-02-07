/**
 * Planning Wizard Zod Schemas
 *
 * **Simple explanation**: These schemas validate that plan data is correct before saving.
 * Think of them as quality checkers - they make sure names aren't empty, priorities are valid, etc.
 *
 * @module planning/schema
 */

import { z } from 'zod';

// ============================================================================
// CONSTRAINT DEFINITIONS
// ============================================================================

export const PLAN_CONSTRAINTS = {
  PROJECT_NAME_MIN: 3,
  PROJECT_NAME_MAX: 100,
  DESCRIPTION_MAX: 500,
  GOAL_MAX: 200,
  FEATURE_NAME_MAX: 100,
  FEATURE_DESC_MAX: 500,
  SUCCESS_CRITERIA_MAX: 1000,
  MIN_FEATURES: 1,
  MIN_USER_STORIES: 1,
  MIN_SUCCESS_CRITERIA: 1,
  MAX_GOALS: 10,
  MAX_FEATURES: 50,
  MAX_USER_STORIES: 100,
  MAX_DEV_STORIES: 100,
  MAX_SUCCESS_CRITERIA: 50,
} as const;

// ============================================================================
// BASE SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid();
const DateSchema = z.date().or(z.string().datetime());
const PrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

// ============================================================================
// PROJECT OVERVIEW (Page 1)
// ============================================================================

export const ProjectOverviewSchema = z.object({
  name: z
    .string()
    .min(PLAN_CONSTRAINTS.PROJECT_NAME_MIN, 'Project name must be at least 3 characters')
    .max(PLAN_CONSTRAINTS.PROJECT_NAME_MAX, 'Project name must be 100 characters or less'),
  description: z
    .string()
    .max(PLAN_CONSTRAINTS.DESCRIPTION_MAX, 'Description must be 500 characters or less')
    .optional()
    .default(''),
  goals: z
    .array(
      z
        .string()
        .min(1, 'Goal cannot be empty')
        .max(PLAN_CONSTRAINTS.GOAL_MAX, 'Each goal must be 200 characters or less')
    )
    .max(PLAN_CONSTRAINTS.MAX_GOALS, `Maximum ${PLAN_CONSTRAINTS.MAX_GOALS} goals allowed`)
    .default([]),
});

export type ProjectOverview = z.infer<typeof ProjectOverviewSchema>;

// ============================================================================
// FEATURE BLOCKS (Page 2)
// ============================================================================

export const FeatureBlockSchema = z.object({
  id: UUIDSchema,
  name: z
    .string()
    .min(1, 'Feature name cannot be empty')
    .max(PLAN_CONSTRAINTS.FEATURE_NAME_MAX, 'Feature name must be 100 characters or less'),
  description: z
    .string()
    .max(PLAN_CONSTRAINTS.FEATURE_DESC_MAX, 'Description must be 500 characters or less')
    .default(''),
  purpose: z.string().default(''),
  acceptanceCriteria: z
    .array(z.string().min(1, 'Acceptance criteria cannot be empty'))
    .default([]),
  technicalNotes: z.string().default(''),
  priority: PrioritySchema.default('medium'),
  order: z.number().int().nonnegative(),
});

export type FeatureBlock = z.infer<typeof FeatureBlockSchema>;

// ============================================================================
// BLOCK LINKING (Page 3)
// ============================================================================

export const BlockLinkSchema = z.object({
  id: UUIDSchema,
  sourceBlockId: UUIDSchema,
  targetBlockId: UUIDSchema.refine((id) => typeof id === 'string' && id.length > 0, 'Invalid target block'),
  dependencyType: z.enum(['requires', 'suggests', 'blocks', 'triggers']),
});

export const ConditionalLogicSchema = z.object({
  id: UUIDSchema,
  sourceBlockId: UUIDSchema,
  trigger: z.enum(['complete', 'started', 'blocked', 'failed']),
  action: z.enum(['starts', 'pauses', 'requires_review', 'completes']),
  targetBlockId: UUIDSchema,
  description: z.string().optional(),
});

export type BlockLink = z.infer<typeof BlockLinkSchema>;
export type ConditionalLogic = z.infer<typeof ConditionalLogicSchema>;

// ============================================================================
// USER STORIES (Page 4)
// ============================================================================

export const UserStorySchema = z.object({
  id: UUIDSchema,
  userType: z.string().min(1, 'User type cannot be empty'),
  action: z.string().min(1, 'Action cannot be empty'),
  benefit: z.string().min(1, 'Benefit cannot be empty'),
  relatedBlockIds: z.array(UUIDSchema).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
  priority: PrioritySchema.default('medium'),
});

export type UserStory = z.infer<typeof UserStorySchema>;

// ============================================================================
// DEVELOPER STORIES (Page 5)
// ============================================================================

export const DeveloperStorySchema = z.object({
  id: UUIDSchema,
  action: z.string().min(1, 'Action cannot be empty'),
  benefit: z.string().min(1, 'Benefit cannot be empty'),
  technicalRequirements: z.array(z.string()).default([]),
  apiNotes: z.string().default(''),
  databaseNotes: z.string().default(''),
  estimatedHours: z.number().nonnegative(),
  relatedBlockIds: z.array(UUIDSchema).default([]),
  relatedTaskIds: z.array(z.string()).default([]),
});

export type DeveloperStory = z.infer<typeof DeveloperStorySchema>;

// ============================================================================
// SUCCESS CRITERIA (Page 6)
// ============================================================================

export const SuccessCriterionSchema = z.object({
  id: UUIDSchema,
  description: z.string().min(1, 'Criteria description cannot be empty'),
  smartAttributes: z.object({
    specific: z.boolean(),
    measurable: z.boolean(),
    achievable: z.boolean(),
    relevant: z.boolean(),
    timeBound: z.boolean(),
  }),
  relatedFeatureIds: z.array(UUIDSchema).default([]),
  relatedStoryIds: z.array(UUIDSchema).default([]),
  testable: z.boolean(),
  priority: PrioritySchema.default('medium'),
});

export type SuccessCriterion = z.infer<typeof SuccessCriterionSchema>;

// ============================================================================
// PLAN METADATA
// ============================================================================

export const PlanMetadataSchema = z.object({
  id: UUIDSchema,
  name: z
    .string()
    .min(PLAN_CONSTRAINTS.PROJECT_NAME_MIN, 'Plan name must be at least 3 characters')
    .max(PLAN_CONSTRAINTS.PROJECT_NAME_MAX, 'Plan name must be 100 characters or less'),
  createdAt: DateSchema.transform((d) => (typeof d === 'string' ? new Date(d) : d)),
  updatedAt: DateSchema.transform((d) => (typeof d === 'string' ? new Date(d) : d)),
  version: z.number().int().nonnegative(),
  author: z.string().optional(),
});

export type PlanMetadata = z.infer<typeof PlanMetadataSchema>;

// ============================================================================
// COMPLETE PLAN
// ============================================================================

export const CompletePlanSchema = z.object({
  metadata: PlanMetadataSchema,
  overview: ProjectOverviewSchema,
  featureBlocks: z.array(FeatureBlockSchema).default([]),
  blockLinks: z.array(BlockLinkSchema).default([]),
  conditionalLogic: z.array(ConditionalLogicSchema).default([]),
  userStories: z.array(UserStorySchema).default([]),
  developerStories: z.array(DeveloperStorySchema).default([]),
  successCriteria: z.array(SuccessCriterionSchema).default([]),
});

export type CompletePlan = z.infer<typeof CompletePlanSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validates a complete plan against all rules
 */
export function validatePlan(plan: unknown): { isValid: boolean; errors: string[] } {
  const result = CompletePlanSchema.safeParse(plan);
  return {
    isValid: result.success,
    errors: result.success
      ? []
      : result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Validates partial plan (for in-progress work)
 */
export function validatePartialPlan(
  plan: Partial<unknown>
): { isValid: boolean; errors: string[] } {
  const partialSchema = CompletePlanSchema.partial();
  const result = partialSchema.safeParse(plan);
  return {
    isValid: result.success,
    errors: result.success
      ? []
      : result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}
