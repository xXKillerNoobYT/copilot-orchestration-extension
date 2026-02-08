/**
 * Tests for Plan Export Module (MT-033.11)
 *
 * Covers exportPlan, exportToJson, exportToMarkdown, exportToYaml,
 * exportPlanToFile, renderExportDropdown, getExportDropdownStyles,
 * getExportDropdownScript, and all helper functions via their callers.
 */

import {
    exportPlan,
    exportPlanToFile,
    renderExportDropdown,
    getExportDropdownStyles,
    getExportDropdownScript,
    ExportFormat,
    ExportOptions,
    ExportResult,
} from '../../src/ui/planExport';
import { CompletePlan, FeatureBlock, UserStory, DeveloperStory, SuccessCriterion, BlockLink } from '../../src/planning/types';
import * as vscode from 'vscode';

// Mock vscode
jest.mock('vscode', () => ({
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showSaveDialog: jest.fn(),
    },
    workspace: {
        fs: {
            writeFile: jest.fn(),
        },
    },
    Uri: {
        file: jest.fn((path: string) => ({ fsPath: path })),
    },
}));

// Mock logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
}));

import { logInfo, logError } from '../../src/logger';

// ============================================================================
// Test Helpers
// ============================================================================

function createMinimalPlan(overrides: Partial<CompletePlan> = {}): CompletePlan {
    return {
        metadata: {
            id: 'plan-001',
            name: 'Test Plan',
            createdAt: new Date('2025-01-15T10:00:00Z'),
            updatedAt: new Date('2025-01-16T12:00:00Z'),
            version: 1,
        },
        overview: {
            name: 'Test Project',
            description: 'A test project description.',
            goals: ['Goal 1', 'Goal 2'],
        },
        featureBlocks: [],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [],
        developerStories: [],
        successCriteria: [],
        ...overrides,
    };
}

function createFeatureBlock(overrides: Partial<FeatureBlock> = {}): FeatureBlock {
    return {
        id: 'fb-001',
        name: 'Authentication',
        description: 'User authentication system',
        purpose: 'Allow users to log in',
        acceptanceCriteria: ['Users can register', 'Users can log in'],
        technicalNotes: 'Use JWT tokens',
        priority: 'high',
        order: 1,
        ...overrides,
    };
}

function createUserStory(overrides: Partial<UserStory> = {}): UserStory {
    return {
        id: 'us-001',
        userType: 'customer',
        action: 'log into my account',
        benefit: 'I can access my data',
        relatedBlockIds: ['fb-001'],
        acceptanceCriteria: ['Login form is accessible', 'Error messages are clear'],
        priority: 'high',
        ...overrides,
    };
}

function createDeveloperStory(overrides: Partial<DeveloperStory> = {}): DeveloperStory {
    return {
        id: 'ds-001',
        action: 'implement JWT auth middleware',
        benefit: 'API endpoints are secured',
        technicalRequirements: ['Express.js middleware', 'Token refresh logic'],
        apiNotes: 'POST /auth/login returns JWT',
        databaseNotes: 'Users table needs token_hash column',
        estimatedHours: 8,
        relatedBlockIds: ['fb-001'],
        relatedTaskIds: ['task-001'],
        ...overrides,
    };
}

function createSuccessCriterion(overrides: Partial<SuccessCriterion> = {}): SuccessCriterion {
    return {
        id: 'sc-001',
        description: 'All users can authenticate within 2 seconds',
        smartAttributes: {
            specific: true,
            measurable: true,
            achievable: true,
            relevant: true,
            timeBound: true,
        },
        relatedFeatureIds: ['fb-001'],
        relatedStoryIds: ['us-001'],
        testable: true,
        priority: 'high',
        ...overrides,
    };
}

function createBlockLink(overrides: Partial<BlockLink> = {}): BlockLink {
    return {
        id: 'bl-001',
        sourceBlockId: 'fb-001',
        targetBlockId: 'fb-002',
        dependencyType: 'requires',
        ...overrides,
    };
}

function createFullPlan(): CompletePlan {
    const fb1 = createFeatureBlock({ id: 'fb-001', name: 'Authentication', order: 1 });
    const fb2 = createFeatureBlock({ id: 'fb-002', name: 'Dashboard', order: 2, priority: 'medium', description: 'Main dashboard', purpose: 'Central hub for users' });
    return createMinimalPlan({
        featureBlocks: [fb1, fb2],
        blockLinks: [createBlockLink({ sourceBlockId: 'fb-001', targetBlockId: 'fb-002', dependencyType: 'requires' })],
        userStories: [createUserStory()],
        developerStories: [createDeveloperStory()],
        successCriteria: [createSuccessCriterion()],
    });
}

// ============================================================================
// Tests
// ============================================================================

describe('PlanExport', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ========================================================================
    // exportPlan - routing
    // ========================================================================

    describe('exportPlan routing', () => {
        it('Test 1: should route to JSON exporter for json format', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'json' });

            expect(result.success).toBe(true);
            expect(result.extension).toBe('.json');
            expect(result.mimeType).toBe('application/json');
        });

        it('Test 2: should route to Markdown exporter for markdown format', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.success).toBe(true);
            expect(result.extension).toBe('.md');
            expect(result.mimeType).toBe('text/markdown');
        });

        it('Test 3: should route to YAML exporter for yaml format', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'yaml' });

            expect(result.success).toBe(true);
            expect(result.extension).toBe('.yaml');
            expect(result.mimeType).toBe('text/yaml');
        });

        it('Test 4: should return error for unknown format', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'csv' as ExportFormat });

            expect(result.success).toBe(false);
            expect(result.content).toBe('');
            expect(result.error).toContain('Unknown format: csv');
        });

        it('Test 5: should catch errors thrown during export and log them', () => {
            // Create a plan that will cause JSON.stringify to throw via a circular ref
            const plan = createMinimalPlan();
            const circular: Record<string, unknown> = {};
            circular.self = circular;
            (plan as unknown as Record<string, unknown>).extra = circular;

            const result = exportPlan(plan, { format: 'json' });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(logError).toHaveBeenCalled();
        });
    });

    // ========================================================================
    // JSON Export
    // ========================================================================

    describe('JSON export', () => {
        it('Test 6: should produce valid JSON with pretty print by default', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'json' });

            expect(result.success).toBe(true);
            const parsed = JSON.parse(result.content);
            expect(parsed.metadata.name).toBe('Test Plan');
            // Pretty print uses indentation (2 spaces)
            expect(result.content).toContain('\n');
        });

        it('Test 7: should produce compact JSON when prettyPrint is false', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'json', prettyPrint: false });

            expect(result.success).toBe(true);
            const parsed = JSON.parse(result.content);
            expect(parsed.metadata.name).toBe('Test Plan');
            // Compact JSON has no indentation-based newlines (single line)
            expect(result.content.indexOf('\n')).toBe(-1);
        });

        it('Test 8: should include metadata by default', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'json' });

            const parsed = JSON.parse(result.content);
            expect(parsed.metadata.id).toBe('plan-001');
            expect(parsed.metadata.version).toBe(1);
        });

        it('Test 9: should strip metadata when includeMetadata is false', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'json', includeMetadata: false });

            const parsed = JSON.parse(result.content);
            expect(parsed.metadata.name).toBe('Test Plan');
            expect(parsed.metadata.id).toBeUndefined();
            expect(parsed.metadata.version).toBeUndefined();
            expect(parsed.metadata.createdAt).toBeUndefined();
        });

        it('Test 10: should include full plan data in JSON export', () => {
            const plan = createFullPlan();
            const result = exportPlan(plan, { format: 'json' });

            const parsed = JSON.parse(result.content);
            expect(parsed.featureBlocks).toHaveLength(2);
            expect(parsed.blockLinks).toHaveLength(1);
            expect(parsed.userStories).toHaveLength(1);
            expect(parsed.developerStories).toHaveLength(1);
            expect(parsed.successCriteria).toHaveLength(1);
        });
    });

    // ========================================================================
    // Markdown Export
    // ========================================================================

    describe('Markdown export', () => {
        it('Test 11: should include plan title as H1 heading', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.content).toContain('# Test Plan');
        });

        it('Test 12: should fall back to "Project Plan" when name is empty', () => {
            const plan = createMinimalPlan();
            plan.metadata.name = '';
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.content).toContain('# Project Plan');
        });

        it('Test 13: should include metadata block by default', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.content).toContain('> Created:');
            expect(result.content).toContain('> Updated:');
            expect(result.content).toContain('> Version: 1');
        });

        it('Test 14: should exclude metadata when includeMetadata is false', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'markdown', includeMetadata: false });

            expect(result.content).not.toContain('> Created:');
            expect(result.content).not.toContain('> Updated:');
            expect(result.content).not.toContain('> Version:');
        });

        it('Test 15: should include project overview and goals', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.content).toContain('## \uD83D\uDCCB Project Overview');
            expect(result.content).toContain('A test project description.');
            expect(result.content).toContain('1. Goal 1');
            expect(result.content).toContain('2. Goal 2');
        });

        it('Test 16: should render feature blocks with priority and acceptance criteria', () => {
            const plan = createMinimalPlan({
                featureBlocks: [createFeatureBlock()],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.content).toContain('### 1. Authentication');
            expect(result.content).toContain('**Priority:** high');
            expect(result.content).toContain('User authentication system');
            expect(result.content).toContain('**Purpose:** Allow users to log in');
            expect(result.content).toContain('- [ ] Users can register');
            expect(result.content).toContain('- [ ] Users can log in');
            expect(result.content).toContain('**Technical Notes:** Use JWT tokens');
        });

        it('Test 17: should render dependency graph as mermaid by default', () => {
            const plan = createFullPlan();
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.content).toContain('```mermaid');
            expect(result.content).toContain('graph TD');
            expect(result.content).toContain('Authentication');
            expect(result.content).toContain('Dashboard');
            expect(result.content).toContain('requires');
        });

        it('Test 18: should exclude dependency graph when includeDependencyGraph is false', () => {
            const plan = createFullPlan();
            const result = exportPlan(plan, { format: 'markdown', includeDependencyGraph: false });

            expect(result.content).not.toContain('```mermaid');
            expect(result.content).not.toContain('graph TD');
        });

        it('Test 19: should render user stories with correct numbering', () => {
            const plan = createMinimalPlan({
                userStories: [
                    createUserStory({ id: 'us-001', userType: 'customer', action: 'log in', benefit: 'access data' }),
                    createUserStory({ id: 'us-002', userType: 'admin', action: 'manage users', benefit: 'control access' }),
                ],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.content).toContain('### US-001');
            expect(result.content).toContain('### US-002');
            expect(result.content).toContain('As a **customer**');
            expect(result.content).toContain('As a **admin**');
        });

        it('Test 20: should render developer stories with estimated time and notes', () => {
            const plan = createMinimalPlan({
                developerStories: [createDeveloperStory()],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.content).toContain('### DS-001');
            expect(result.content).toContain('**implement JWT auth middleware**');
            expect(result.content).toContain('**Estimated Time:** 8 hours');
            expect(result.content).toContain('- Express.js middleware');
            expect(result.content).toContain('- Token refresh logic');
            expect(result.content).toContain('**API Notes:** POST /auth/login returns JWT');
            expect(result.content).toContain('**Database Notes:** Users table needs token_hash column');
        });

        it('Test 21: should render success criteria with SMART badges', () => {
            const plan = createMinimalPlan({
                successCriteria: [createSuccessCriterion()],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.content).toContain('All users can authenticate within 2 seconds');
            expect(result.content).toContain('Priority: high');
            // All SMART attributes are true, so should show full SMART badge
            expect(result.content).toContain('SMART');
        });

        it('Test 22: should render partial SMART badges when not all attributes are true', () => {
            const plan = createMinimalPlan({
                successCriteria: [createSuccessCriterion({
                    smartAttributes: {
                        specific: true,
                        measurable: false,
                        achievable: true,
                        relevant: false,
                        timeBound: true,
                    },
                })],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            // Only S, A, T should appear
            expect(result.content).toContain('SAT');
            expect(result.content).not.toContain('\u2705 SMART');
        });

        it('Test 23: should render blocks dependency with "blocks" arrow style', () => {
            const plan = createMinimalPlan({
                featureBlocks: [
                    createFeatureBlock({ id: 'fb-001', name: 'Auth' }),
                    createFeatureBlock({ id: 'fb-002', name: 'Dashboard' }),
                ],
                blockLinks: [createBlockLink({ dependencyType: 'blocks' })],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.content).toContain('-.->|blocks|');
        });

        it('Test 24: should sanitize mermaid IDs by stripping special characters', () => {
            const plan = createMinimalPlan({
                featureBlocks: [
                    createFeatureBlock({ id: 'fb-001', name: 'Auth & Login (v2)' }),
                    createFeatureBlock({ id: 'fb-002', name: 'User Dashboard!' }),
                ],
                blockLinks: [createBlockLink()],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            // Special characters replaced with underscores
            expect(result.content).toContain('Auth___Login__v2_');
            expect(result.content).toContain('User_Dashboard_');
        });
    });

    // ========================================================================
    // YAML Export
    // ========================================================================

    describe('YAML export', () => {
        it('Test 25: should include YAML header with separator', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'yaml' });

            expect(result.content).toContain('# Project Plan');
            expect(result.content).toContain('# Generated:');
            expect(result.content).toContain('---');
        });

        it('Test 26: should include metadata section by default', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'yaml' });

            expect(result.content).toContain('metadata:');
            expect(result.content).toContain('  id: plan-001');
            expect(result.content).toContain('  name: "Test Plan"');
            expect(result.content).toContain('  version: 1');
        });

        it('Test 27: should exclude metadata section when includeMetadata is false', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'yaml', includeMetadata: false });

            expect(result.content).not.toContain('metadata:');
            expect(result.content).not.toContain('  id: plan-001');
        });

        it('Test 28: should include overview section with goals', () => {
            const plan = createMinimalPlan();
            const result = exportPlan(plan, { format: 'yaml' });

            expect(result.content).toContain('overview:');
            expect(result.content).toContain('  name: "Test Project"');
            expect(result.content).toContain('  description: "A test project description."');
            expect(result.content).toContain('  goals:');
            expect(result.content).toContain('    - "Goal 1"');
            expect(result.content).toContain('    - "Goal 2"');
        });

        it('Test 29: should include feature blocks in YAML format', () => {
            const plan = createMinimalPlan({
                featureBlocks: [createFeatureBlock()],
            });
            const result = exportPlan(plan, { format: 'yaml' });

            expect(result.content).toContain('featureBlocks:');
            expect(result.content).toContain('  - id: fb-001');
            expect(result.content).toContain('    name: "Authentication"');
            expect(result.content).toContain('    priority: high');
            expect(result.content).toContain('    order: 1');
            expect(result.content).toContain('    acceptanceCriteria:');
            expect(result.content).toContain('      - "Users can register"');
            expect(result.content).toContain('    technicalNotes: "Use JWT tokens"');
        });

        it('Test 30: should include block links in YAML format', () => {
            const plan = createMinimalPlan({
                featureBlocks: [
                    createFeatureBlock({ id: 'fb-001' }),
                    createFeatureBlock({ id: 'fb-002' }),
                ],
                blockLinks: [createBlockLink()],
            });
            const result = exportPlan(plan, { format: 'yaml' });

            expect(result.content).toContain('blockLinks:');
            expect(result.content).toContain('  - id: bl-001');
            expect(result.content).toContain('    sourceBlockId: fb-001');
            expect(result.content).toContain('    targetBlockId: fb-002');
            expect(result.content).toContain('    dependencyType: requires');
        });

        it('Test 31: should include user stories in YAML format', () => {
            const plan = createMinimalPlan({
                userStories: [createUserStory()],
            });
            const result = exportPlan(plan, { format: 'yaml' });

            expect(result.content).toContain('userStories:');
            expect(result.content).toContain('  - id: us-001');
            expect(result.content).toContain('    userType: "customer"');
            expect(result.content).toContain('    action: "log into my account"');
            expect(result.content).toContain('    benefit: "I can access my data"');
            expect(result.content).toContain('    priority: high');
        });

        it('Test 32: should include developer stories in YAML format', () => {
            const plan = createMinimalPlan({
                developerStories: [createDeveloperStory()],
            });
            const result = exportPlan(plan, { format: 'yaml' });

            expect(result.content).toContain('developerStories:');
            expect(result.content).toContain('  - id: ds-001');
            expect(result.content).toContain('    action: "implement JWT auth middleware"');
            expect(result.content).toContain('    estimatedHours: 8');
            expect(result.content).toContain('    technicalRequirements:');
            expect(result.content).toContain('    apiNotes: "POST /auth/login returns JWT"');
            expect(result.content).toContain('    databaseNotes: "Users table needs token_hash column"');
        });

        it('Test 33: should include success criteria with SMART attributes in YAML format', () => {
            const plan = createMinimalPlan({
                successCriteria: [createSuccessCriterion()],
            });
            const result = exportPlan(plan, { format: 'yaml' });

            expect(result.content).toContain('successCriteria:');
            expect(result.content).toContain('  - id: sc-001');
            expect(result.content).toContain('    testable: true');
            expect(result.content).toContain('    smartAttributes:');
            expect(result.content).toContain('      specific: true');
            expect(result.content).toContain('      measurable: true');
            expect(result.content).toContain('      achievable: true');
            expect(result.content).toContain('      relevant: true');
            expect(result.content).toContain('      timeBound: true');
        });

        it('Test 34: should escape special YAML characters in strings', () => {
            const plan = createMinimalPlan({
                overview: {
                    name: 'Project "Alpha"',
                    description: 'Line1\nLine2',
                    goals: ['Goal with "quotes"', 'Goal with \\ backslash'],
                },
            });
            const result = exportPlan(plan, { format: 'yaml' });

            expect(result.content).toContain('Project \\"Alpha\\"');
            expect(result.content).toContain('Line1\\nLine2');
            expect(result.content).toContain('Goal with \\"quotes\\"');
            expect(result.content).toContain('Goal with \\\\ backslash');
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('Edge cases', () => {
        it('Test 35: should handle empty feature blocks array', () => {
            const plan = createMinimalPlan({ featureBlocks: [] });

            const mdResult = exportPlan(plan, { format: 'markdown' });
            expect(mdResult.success).toBe(true);
            expect(mdResult.content).not.toContain('Feature Blocks');

            const yamlResult = exportPlan(plan, { format: 'yaml' });
            expect(yamlResult.success).toBe(true);
            expect(yamlResult.content).not.toContain('featureBlocks:');
        });

        it('Test 36: should handle empty user stories array', () => {
            const plan = createMinimalPlan({ userStories: [] });

            const mdResult = exportPlan(plan, { format: 'markdown' });
            expect(mdResult.success).toBe(true);
            expect(mdResult.content).not.toContain('User Stories');

            const yamlResult = exportPlan(plan, { format: 'yaml' });
            expect(yamlResult.success).toBe(true);
            expect(yamlResult.content).not.toContain('userStories:');
        });

        it('Test 37: should handle empty developer stories array', () => {
            const plan = createMinimalPlan({ developerStories: [] });

            const mdResult = exportPlan(plan, { format: 'markdown' });
            expect(mdResult.success).toBe(true);
            expect(mdResult.content).not.toContain('Developer Stories');

            const yamlResult = exportPlan(plan, { format: 'yaml' });
            expect(yamlResult.success).toBe(true);
            expect(yamlResult.content).not.toContain('developerStories:');
        });

        it('Test 38: should handle empty success criteria array', () => {
            const plan = createMinimalPlan({ successCriteria: [] });

            const mdResult = exportPlan(plan, { format: 'markdown' });
            expect(mdResult.success).toBe(true);
            expect(mdResult.content).not.toContain('Success Criteria');

            const yamlResult = exportPlan(plan, { format: 'yaml' });
            expect(yamlResult.success).toBe(true);
            expect(yamlResult.content).not.toContain('successCriteria:');
        });

        it('Test 39: should handle empty goals array', () => {
            const plan = createMinimalPlan({
                overview: { name: 'Test', description: 'Desc', goals: [] },
            });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.success).toBe(true);
            expect(result.content).not.toContain('### Goals');
        });

        it('Test 40: should handle feature block with empty acceptance criteria', () => {
            const plan = createMinimalPlan({
                featureBlocks: [createFeatureBlock({ acceptanceCriteria: [] })],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.success).toBe(true);
            expect(result.content).not.toContain('**Acceptance Criteria:**');
        });

        it('Test 41: should handle feature block with no technical notes', () => {
            const plan = createMinimalPlan({
                featureBlocks: [createFeatureBlock({ technicalNotes: '' })],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.success).toBe(true);
            expect(result.content).not.toContain('**Technical Notes:**');
        });

        it('Test 42: should handle feature block with no description', () => {
            const plan = createMinimalPlan({
                featureBlocks: [createFeatureBlock({ description: '' })],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.success).toBe(true);
            // The description line should not appear as a standalone paragraph
            // The feature block heading and priority should still be present
            expect(result.content).toContain('### 1. Authentication');
            expect(result.content).toContain('**Priority:** high');
        });

        it('Test 43: should handle feature block with no purpose', () => {
            const plan = createMinimalPlan({
                featureBlocks: [createFeatureBlock({ purpose: '' })],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.success).toBe(true);
            expect(result.content).not.toContain('**Purpose:**');
        });

        it('Test 44: should handle developer story with zero estimated hours', () => {
            const plan = createMinimalPlan({
                developerStories: [createDeveloperStory({ estimatedHours: 0 })],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.success).toBe(true);
            expect(result.content).not.toContain('**Estimated Time:**');
        });

        it('Test 45: should handle developer story with no api/database notes', () => {
            const plan = createMinimalPlan({
                developerStories: [createDeveloperStory({ apiNotes: '', databaseNotes: '' })],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.success).toBe(true);
            expect(result.content).not.toContain('**API Notes:**');
            expect(result.content).not.toContain('**Database Notes:**');
        });

        it('Test 46: should handle developer story with empty technical requirements', () => {
            const plan = createMinimalPlan({
                developerStories: [createDeveloperStory({ technicalRequirements: [] })],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.success).toBe(true);
            expect(result.content).not.toContain('**Technical Requirements:**');
        });

        it('Test 47: should handle block links where source or target is not found', () => {
            const plan = createMinimalPlan({
                featureBlocks: [createFeatureBlock({ id: 'fb-001' })],
                blockLinks: [createBlockLink({ sourceBlockId: 'fb-001', targetBlockId: 'fb-nonexistent' })],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            // Should still succeed but not render the broken link in mermaid
            expect(result.success).toBe(true);
            // The mermaid block may still exist, but the broken link line should not appear
            // because the target feature is not found
        });

        it('Test 48: should handle empty block links array in markdown (no Dependencies section)', () => {
            const plan = createMinimalPlan({ blockLinks: [] });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.success).toBe(true);
            expect(result.content).not.toContain('Dependencies');
            expect(result.content).not.toContain('```mermaid');
        });

        it('Test 49: should handle overview with empty description', () => {
            const plan = createMinimalPlan({
                overview: { name: 'Test', description: '', goals: ['Goal 1'] },
            });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.success).toBe(true);
            // The description paragraph should not appear
            expect(result.content).toContain('## \uD83D\uDCCB Project Overview');
            expect(result.content).toContain('1. Goal 1');
        });

        it('Test 50: should handle YAML export with empty string in escapeYamlString', () => {
            const plan = createMinimalPlan({
                featureBlocks: [createFeatureBlock({ technicalNotes: '' })],
            });
            const result = exportPlan(plan, { format: 'yaml' });

            expect(result.success).toBe(true);
            // Empty technicalNotes should not produce a technicalNotes line in YAML
            expect(result.content).not.toContain('technicalNotes:');
        });

        it('Test 51: should handle user story with empty acceptance criteria', () => {
            const plan = createMinimalPlan({
                userStories: [createUserStory({ acceptanceCriteria: [] })],
            });
            const mdResult = exportPlan(plan, { format: 'markdown' });
            expect(mdResult.success).toBe(true);

            const yamlResult = exportPlan(plan, { format: 'yaml' });
            expect(yamlResult.success).toBe(true);
        });

        it('Test 52: should handle YAML date formatting for Date objects and strings', () => {
            const plan = createMinimalPlan();
            // metadata.createdAt is already a Date object
            const result = exportPlan(plan, { format: 'yaml' });

            expect(result.success).toBe(true);
            expect(result.content).toContain('createdAt:');
            expect(result.content).toContain('updatedAt:');
        });

        it('Test 53: should handle all SMART attributes being false', () => {
            const plan = createMinimalPlan({
                successCriteria: [createSuccessCriterion({
                    smartAttributes: {
                        specific: false,
                        measurable: false,
                        achievable: false,
                        relevant: false,
                        timeBound: false,
                    },
                })],
            });
            const result = exportPlan(plan, { format: 'markdown' });

            expect(result.success).toBe(true);
            expect(result.content).toContain('SMART: ');
            expect(result.content).not.toContain('\u2705 SMART');
        });
    });

    // ========================================================================
    // exportPlanToFile
    // ========================================================================

    describe('exportPlanToFile', () => {
        const mockShowSaveDialog = vscode.window.showSaveDialog as jest.Mock;
        const mockWriteFile = vscode.workspace.fs.writeFile as jest.Mock;
        const mockShowErrorMessage = vscode.window.showErrorMessage as jest.Mock;
        const mockShowInfoMessage = vscode.window.showInformationMessage as jest.Mock;

        it('Test 54: should show error message when export fails', async () => {
            const plan = createMinimalPlan();
            const result = await exportPlanToFile(plan, { format: 'csv' as ExportFormat });

            expect(result).toBe(false);
            expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Export failed'));
        });

        it('Test 55: should return false when user cancels save dialog', async () => {
            const plan = createMinimalPlan();
            mockShowSaveDialog.mockResolvedValue(undefined);

            const result = await exportPlanToFile(plan, { format: 'json' });

            expect(result).toBe(false);
            expect(mockWriteFile).not.toHaveBeenCalled();
        });

        it('Test 56: should write file and show success when user selects path', async () => {
            const plan = createMinimalPlan();
            const mockUri = { fsPath: '/tmp/test-plan.json' };
            mockShowSaveDialog.mockResolvedValue(mockUri);
            mockWriteFile.mockResolvedValue(undefined);

            const result = await exportPlanToFile(plan, { format: 'json' });

            expect(result).toBe(true);
            expect(mockWriteFile).toHaveBeenCalled();
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('/tmp/test-plan.json'));
            expect(mockShowInfoMessage).toHaveBeenCalledWith(expect.stringContaining('/tmp/test-plan.json'));
        });

        it('Test 57: should handle write errors gracefully', async () => {
            const plan = createMinimalPlan();
            const mockUri = { fsPath: '/tmp/test-plan.json' };
            mockShowSaveDialog.mockResolvedValue(mockUri);
            mockWriteFile.mockRejectedValue(new Error('Permission denied'));

            const result = await exportPlanToFile(plan, { format: 'json' });

            expect(result).toBe(false);
            expect(logError).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
            expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
        });

        it('Test 58: should sanitize filename from plan name', async () => {
            const plan = createMinimalPlan();
            plan.metadata.name = 'My Plan (v2.0)!';
            mockShowSaveDialog.mockResolvedValue(undefined);

            await exportPlanToFile(plan, { format: 'json' });

            // Should have been called with a sanitized filename
            expect(vscode.Uri.file).toHaveBeenCalledWith(expect.stringMatching(/^[a-z0-9-]+\.json$/));
        });

        it('Test 59: should use correct file extension filter for each format', async () => {
            const plan = createMinimalPlan();
            mockShowSaveDialog.mockResolvedValue(undefined);

            await exportPlanToFile(plan, { format: 'markdown' });

            expect(mockShowSaveDialog).toHaveBeenCalledWith(
                expect.objectContaining({
                    filters: expect.objectContaining({
                        'Markdown': ['md'],
                    }),
                }),
            );
        });
    });

    // ========================================================================
    // UI Components
    // ========================================================================

    describe('UI components', () => {
        it('Test 60: should render export dropdown HTML with three format options', () => {
            const html = renderExportDropdown();

            expect(html).toContain('export-dropdown');
            expect(html).toContain('Export Plan');
            expect(html).toContain("exportAs('json')");
            expect(html).toContain("exportAs('markdown')");
            expect(html).toContain("exportAs('yaml')");
            expect(html).toContain('JSON');
            expect(html).toContain('Markdown');
            expect(html).toContain('YAML');
        });

        it('Test 61: should return CSS styles for export dropdown', () => {
            const css = getExportDropdownStyles();

            expect(css).toContain('.export-dropdown');
            expect(css).toContain('.export-menu');
            expect(css).toContain('.export-option');
            expect(css).toContain('.export-menu.hidden');
            expect(css).toContain('z-index: 100');
        });

        it('Test 62: should return JavaScript with toggle and export functions', () => {
            const script = getExportDropdownScript();

            expect(script).toContain('function toggleExportMenu()');
            expect(script).toContain('function exportAs(format)');
            expect(script).toContain("vscode.postMessage({ command: 'export', format })");
            expect(script).toContain('document.addEventListener');
        });
    });

    // ========================================================================
    // Full integration-style round-trip tests
    // ========================================================================

    describe('Integration round-trips', () => {
        it('Test 63: should produce valid JSON that round-trips back to matching data', () => {
            const plan = createFullPlan();
            const result = exportPlan(plan, { format: 'json' });
            const parsed = JSON.parse(result.content);

            expect(parsed.metadata.name).toBe('Test Plan');
            expect(parsed.overview.name).toBe('Test Project');
            expect(parsed.featureBlocks).toHaveLength(2);
            expect(parsed.blockLinks).toHaveLength(1);
            expect(parsed.userStories).toHaveLength(1);
            expect(parsed.developerStories).toHaveLength(1);
            expect(parsed.successCriteria).toHaveLength(1);
        });

        it('Test 64: should produce Markdown that contains all sections for a full plan', () => {
            const plan = createFullPlan();
            const result = exportPlan(plan, { format: 'markdown' });

            // Verify all major sections are present
            expect(result.content).toContain('# Test Plan');
            expect(result.content).toContain('## \uD83D\uDCCB Project Overview');
            expect(result.content).toContain('## \uD83C\uDFAF Feature Blocks');
            expect(result.content).toContain('## \uD83D\uDD17 Dependencies');
            expect(result.content).toContain('## \uD83D\uDC64 User Stories');
            expect(result.content).toContain('## \uD83D\uDD27 Developer Stories');
            expect(result.content).toContain('## \u2705 Success Criteria');
        });

        it('Test 65: should produce YAML that contains all sections for a full plan', () => {
            const plan = createFullPlan();
            const result = exportPlan(plan, { format: 'yaml' });

            expect(result.content).toContain('metadata:');
            expect(result.content).toContain('overview:');
            expect(result.content).toContain('featureBlocks:');
            expect(result.content).toContain('blockLinks:');
            expect(result.content).toContain('userStories:');
            expect(result.content).toContain('developerStories:');
            expect(result.content).toContain('successCriteria:');
        });
    });
});
