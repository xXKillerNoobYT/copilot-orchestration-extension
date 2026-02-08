/**
 * Plan Export Service Tests
 *
 * Tests for multi-format plan export functionality.
 */

import {
    exportPlan,
    exportToJSON,
    exportToMarkdown,
    exportToYAML,
    getPlanExportService,
    resetPlanExportServiceForTests,
    ExportFormat,
    ExportOptions,
    ExportResult
} from '../../src/services/planExport';
import { CompletePlan, PriorityLevel } from '../../src/planning/types';

// ============================================================================
// Test Data Fixtures
// ============================================================================

function createTestPlan(overrides: Partial<CompletePlan> = {}): CompletePlan {
    return {
        metadata: {
            id: 'plan-001',
            name: 'Test Project',
            createdAt: new Date('2024-01-15T10:00:00Z'),
            updatedAt: new Date('2024-01-20T15:30:00Z'),
            version: 1,
            author: 'Test User'
        },
        overview: {
            name: 'Test Project',
            description: 'A test project for export testing',
            goals: ['Goal 1', 'Goal 2', 'Goal 3']
        },
        featureBlocks: [
            {
                id: 'feature-1',
                name: 'Feature One',
                description: 'First feature description',
                purpose: 'To test feature export',
                priority: 'high' as PriorityLevel,
                acceptanceCriteria: ['AC1', 'AC2'],
                technicalNotes: 'Some technical notes',
                order: 1
            },
            {
                id: 'feature-2',
                name: 'Feature Two',
                description: 'Second feature description',
                purpose: 'Another purpose',
                priority: 'medium' as PriorityLevel,
                acceptanceCriteria: ['AC3'],
                technicalNotes: '',
                order: 2
            }
        ],
        blockLinks: [
            {
                id: 'link-1',
                sourceBlockId: 'feature-1',
                targetBlockId: 'feature-2',
                dependencyType: 'blocks'
            }
        ],
        conditionalLogic: [
            {
                id: 'cond-1',
                sourceBlockId: 'feature-1',
                trigger: 'complete',
                action: 'starts',
                targetBlockId: 'feature-2'
            }
        ],
        userStories: [
            {
                id: 'story-1',
                userType: 'Developer',
                action: 'export my plan',
                benefit: 'I can share it with others',
                priority: 'high' as PriorityLevel,
                relatedBlockIds: ['feature-1'],
                acceptanceCriteria: ['Export works', 'Format is correct']
            }
        ],
        developerStories: [
            {
                id: 'dev-1',
                action: 'Implement export function',
                benefit: 'Users can export plans',
                estimatedHours: 4,
                technicalRequirements: ['TypeScript', 'JSON parsing'],
                apiNotes: 'Use standard JSON.stringify',
                databaseNotes: 'No database needed',
                relatedBlockIds: ['feature-1'],
                relatedTaskIds: []
            }
        ],
        successCriteria: [
            {
                id: 'sc-1',
                description: 'Export produces valid JSON',
                testable: true,
                priority: 'critical' as PriorityLevel,
                smartAttributes: {
                    specific: true,
                    measurable: true,
                    achievable: true,
                    relevant: true,
                    timeBound: false
                },
                relatedFeatureIds: ['feature-1'],
                relatedStoryIds: ['story-1']
            }
        ],
        ...overrides
    };
}

function createMinimalPlan(): Partial<CompletePlan> {
    return {
        overview: {
            name: 'Minimal Plan',
            description: '',
            goals: []
        },
        featureBlocks: [],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [],
        developerStories: [],
        successCriteria: []
    };
}

// ============================================================================
// JSON Export Tests
// ============================================================================

describe('JSON Export', () => {
    beforeEach(() => {
        resetPlanExportServiceForTests();
    });

    it('Test 1: should export complete plan as JSON', () => {
        const plan = createTestPlan();
        const result = exportToJSON(plan);

        expect(result.format).toBe('json');
        expect(result.mimeType).toBe('application/json');
        expect(result.filename).toBe('test-project.json');

        const parsed = JSON.parse(result.content);
        expect(parsed.metadata.id).toBe('plan-001');
        expect(parsed.overview.name).toBe('Test Project');
        expect(parsed.featureBlocks).toHaveLength(2);
    });

    it('Test 2: should respect prettyPrint option', () => {
        const plan = createTestPlan();

        const pretty = exportToJSON(plan, { prettyPrint: true });
        const compact = exportToJSON(plan, { prettyPrint: false });

        expect(pretty.content).toContain('\n');
        expect(compact.content).not.toContain('\n');
        // Both should be valid JSON
        expect(() => JSON.parse(pretty.content)).not.toThrow();
        expect(() => JSON.parse(compact.content)).not.toThrow();
    });

    it('Test 3: should exclude metadata when includeMetadata is false', () => {
        const plan = createTestPlan();
        const result = exportToJSON(plan, { includeMetadata: false });

        const parsed = JSON.parse(result.content);
        expect(parsed.metadata).toBeUndefined();
        expect(parsed.overview).toBeDefined();
    });

    it('Test 4: should exclude empty arrays by default', () => {
        const plan = createMinimalPlan();
        const result = exportToJSON(plan, { includeEmpty: false });

        const parsed = JSON.parse(result.content);
        expect(parsed.featureBlocks).toBeUndefined();
        expect(parsed.blockLinks).toBeUndefined();
    });

    it('Test 5: should include empty arrays when includeEmpty is true', () => {
        const plan = createMinimalPlan();
        const result = exportToJSON(plan, { includeEmpty: true });

        const parsed = JSON.parse(result.content);
        expect(parsed.featureBlocks).toEqual([]);
        expect(parsed.blockLinks).toEqual([]);
    });

    it('Test 6: should sanitize filename with special characters', () => {
        const plan = createTestPlan({
            overview: {
                name: 'My Super Project!!! @#$%',
                description: '',
                goals: []
            }
        });
        const result = exportToJSON(plan);

        expect(result.filename).toBe('my-super-project.json');
    });

    it('Test 7: should handle undefined overview name', () => {
        const plan: Partial<CompletePlan> = { featureBlocks: [] };
        const result = exportToJSON(plan);

        expect(result.filename).toBe('plan.json');
    });
});

// ============================================================================
// Markdown Export Tests
// ============================================================================

describe('Markdown Export', () => {
    beforeEach(() => {
        resetPlanExportServiceForTests();
    });

    it('Test 8: should export complete plan as Markdown', () => {
        const plan = createTestPlan();
        const result = exportToMarkdown(plan);

        expect(result.format).toBe('markdown');
        expect(result.mimeType).toBe('text/markdown');
        expect(result.filename).toBe('test-project.md');
    });

    it('Test 9: should include project title as H1', () => {
        const plan = createTestPlan();
        const result = exportToMarkdown(plan);

        expect(result.content).toContain('# Test Project');
    });

    it('Test 10: should include metadata section', () => {
        const plan = createTestPlan();
        const result = exportToMarkdown(plan);

        expect(result.content).toContain('## Metadata');
        expect(result.content).toContain('**Version**: 1');
        expect(result.content).toContain('**Author**: Test User');
    });

    it('Test 11: should exclude metadata when requested', () => {
        const plan = createTestPlan();
        const result = exportToMarkdown(plan, { includeMetadata: false });

        expect(result.content).not.toContain('## Metadata');
    });

    it('Test 12: should include goals list', () => {
        const plan = createTestPlan();
        const result = exportToMarkdown(plan);

        expect(result.content).toContain('- Goal 1');
        expect(result.content).toContain('- Goal 2');
        expect(result.content).toContain('- Goal 3');
    });

    it('Test 13: should render feature blocks with priority emoji', () => {
        const plan = createTestPlan();
        const result = exportToMarkdown(plan);

        expect(result.content).toContain('### 🟠 Feature One'); // high priority
        expect(result.content).toContain('### 🟡 Feature Two'); // medium priority
    });

    it('Test 14: should render acceptance criteria as checkboxes', () => {
        const plan = createTestPlan();
        const result = exportToMarkdown(plan);

        expect(result.content).toContain('- [ ] AC1');
        expect(result.content).toContain('- [ ] AC2');
    });

    it('Test 15: should render dependencies section', () => {
        const plan = createTestPlan();
        const result = exportToMarkdown(plan);

        expect(result.content).toContain('## Dependencies');
        expect(result.content).toContain('**Feature One** blocks **Feature Two**');
    });

    it('Test 16: should render conditional logic', () => {
        const plan = createTestPlan();
        const result = exportToMarkdown(plan);

        expect(result.content).toContain('## Conditional Logic');
        expect(result.content).toContain('When **Feature One** is complete → **Feature Two** starts');
    });

    it('Test 17: should render user stories in format', () => {
        const plan = createTestPlan();
        const result = exportToMarkdown(plan);

        expect(result.content).toContain('## User Stories');
        expect(result.content).toContain('As a **Developer**, I want to **export my plan** so that **I can share it with others**');
    });

    it('Test 18: should render developer stories', () => {
        const plan = createTestPlan();
        const result = exportToMarkdown(plan);

        expect(result.content).toContain('## Developer Stories');
        expect(result.content).toContain('### 👨‍💻 Implement export function');
        expect(result.content).toContain('**Estimated Hours**: 4');
    });

    it('Test 19: should render success criteria with SMART checks', () => {
        const plan = createTestPlan();
        const result = exportToMarkdown(plan);

        expect(result.content).toContain('## Success Criteria');
        expect(result.content).toContain('**SMART**:');
        expect(result.content).toContain('**Testable**: Yes ✅');
    });

    it('Test 20: should include summary section', () => {
        const plan = createTestPlan();
        const result = exportToMarkdown(plan);

        expect(result.content).toContain('## Summary');
        expect(result.content).toContain('**Features**: 2');
        expect(result.content).toContain('**User Stories**: 1');
    });

    it('Test 21: should handle feature name lookup for unknown IDs', () => {
        const plan = createTestPlan({
            blockLinks: [
                {
                    id: 'link-1',
                    sourceBlockId: 'unknown-1',
                    targetBlockId: 'unknown-2',
                    dependencyType: 'blocks'
                }
            ]
        });
        const result = exportToMarkdown(plan);

        // Should use IDs when names not found
        expect(result.content).toContain('**unknown-1** blocks **unknown-2**');
    });
});

// ============================================================================
// YAML Export Tests
// ============================================================================

describe('YAML Export', () => {
    beforeEach(() => {
        resetPlanExportServiceForTests();
    });

    it('Test 22: should export complete plan as YAML', () => {
        const plan = createTestPlan();
        const result = exportToYAML(plan);

        expect(result.format).toBe('yaml');
        expect(result.mimeType).toBe('text/yaml');
        expect(result.filename).toBe('test-project.yaml');
    });

    it('Test 23: should include header comment', () => {
        const plan = createTestPlan();
        const result = exportToYAML(plan);

        expect(result.content).toContain('# Project Plan');
        expect(result.content).toContain('# Generated:');
    });

    it('Test 24: should include metadata section', () => {
        const plan = createTestPlan();
        const result = exportToYAML(plan);

        expect(result.content).toContain('metadata:');
        expect(result.content).toContain('  id: "plan-001"');
        expect(result.content).toContain('  version: 1');
        expect(result.content).toContain('  author: "Test User"');
    });

    it('Test 25: should exclude metadata when requested', () => {
        const plan = createTestPlan();
        const result = exportToYAML(plan, { includeMetadata: false });

        expect(result.content).not.toContain('metadata:');
        expect(result.content).toContain('overview:');
    });

    it('Test 26: should render overview section', () => {
        const plan = createTestPlan();
        const result = exportToYAML(plan);

        expect(result.content).toContain('overview:');
        expect(result.content).toContain('  name: "Test Project"');
        expect(result.content).toContain('  goals:');
        expect(result.content).toContain('    - "Goal 1"');
    });

    it('Test 27: should render featureBlocks as array', () => {
        const plan = createTestPlan();
        const result = exportToYAML(plan);

        expect(result.content).toContain('featureBlocks:');
        expect(result.content).toContain('  - id: "feature-1"');
        expect(result.content).toContain('    name: "Feature One"');
        expect(result.content).toContain('    priority: high');
    });

    it('Test 28: should render blockLinks', () => {
        const plan = createTestPlan();
        const result = exportToYAML(plan);

        expect(result.content).toContain('blockLinks:');
        expect(result.content).toContain('    sourceBlockId: "feature-1"');
        expect(result.content).toContain('    targetBlockId: "feature-2"');
        expect(result.content).toContain('    dependencyType: blocks');
    });

    it('Test 29: should render conditionalLogic', () => {
        const plan = createTestPlan();
        const result = exportToYAML(plan);

        expect(result.content).toContain('conditionalLogic:');
        expect(result.content).toContain('    trigger: complete');
        expect(result.content).toContain('    action: starts');
    });

    it('Test 30: should render userStories with relatedBlockIds', () => {
        const plan = createTestPlan();
        const result = exportToYAML(plan);

        expect(result.content).toContain('userStories:');
        expect(result.content).toContain('    userType: "Developer"');
        expect(result.content).toContain('    relatedBlockIds:');
        expect(result.content).toContain('      - "feature-1"');
    });

    it('Test 31: should render developerStories with all fields', () => {
        const plan = createTestPlan();
        const result = exportToYAML(plan);

        expect(result.content).toContain('developerStories:');
        expect(result.content).toContain('    estimatedHours: 4');
        expect(result.content).toContain('    apiNotes: "Use standard JSON.stringify"');
        expect(result.content).toContain('    technicalRequirements:');
    });

    it('Test 32: should render successCriteria with SMART attributes', () => {
        const plan = createTestPlan();
        const result = exportToYAML(plan);

        expect(result.content).toContain('successCriteria:');
        expect(result.content).toContain('    testable: true');
        expect(result.content).toContain('    smartAttributes:');
        expect(result.content).toContain('      specific: true');
        expect(result.content).toContain('      timeBound: false');
    });

    it('Test 33: should escape special characters in strings', () => {
        const plan = createTestPlan({
            overview: {
                name: 'Project with "quotes" and\nnewlines',
                description: 'Description with\ttabs',
                goals: []
            }
        });
        const result = exportToYAML(plan);

        expect(result.content).toContain('\\"quotes\\"');
        expect(result.content).toContain('\\n');
        expect(result.content).toContain('\\t');
    });

    it('Test 34: should render empty arrays when includeEmpty is true', () => {
        const plan = createMinimalPlan();
        const result = exportToYAML(plan, { includeEmpty: true });

        expect(result.content).toContain('goals: []');
    });
});

// ============================================================================
// Main Export Function Tests
// ============================================================================

describe('exportPlan function', () => {
    beforeEach(() => {
        resetPlanExportServiceForTests();
    });

    it('Test 35: should route to JSON export', () => {
        const plan = createTestPlan();
        const result = exportPlan(plan, 'json');

        expect(result.format).toBe('json');
        expect(result.mimeType).toBe('application/json');
    });

    it('Test 36: should route to Markdown export', () => {
        const plan = createTestPlan();
        const result = exportPlan(plan, 'markdown');

        expect(result.format).toBe('markdown');
        expect(result.mimeType).toBe('text/markdown');
    });

    it('Test 37: should route to YAML export', () => {
        const plan = createTestPlan();
        const result = exportPlan(plan, 'yaml');

        expect(result.format).toBe('yaml');
        expect(result.mimeType).toBe('text/yaml');
    });

    it('Test 38: should throw for unsupported format', () => {
        const plan = createTestPlan();

        expect(() => exportPlan(plan, 'xml' as ExportFormat)).toThrow('Unsupported export format: xml');
    });

    it('Test 39: should pass options to format handler', () => {
        const plan = createTestPlan();
        const result = exportPlan(plan, 'json', { prettyPrint: false });

        expect(result.content).not.toContain('\n');
    });
});

// ============================================================================
// Singleton Service Tests
// ============================================================================

describe('PlanExportService singleton', () => {
    beforeEach(() => {
        resetPlanExportServiceForTests();
    });

    it('Test 40: should return same instance on multiple calls', () => {
        const instance1 = getPlanExportService();
        const instance2 = getPlanExportService();

        expect(instance1).toBe(instance2);
    });

    it('Test 41: should reset instance for tests', () => {
        const instance1 = getPlanExportService();
        resetPlanExportServiceForTests();
        const instance2 = getPlanExportService();

        expect(instance1).not.toBe(instance2);
    });

    it('Test 42: service.export should work like exportPlan', () => {
        const service = getPlanExportService();
        const plan = createTestPlan();

        const result = service.export(plan, 'json');

        expect(result.format).toBe('json');
        expect(result.content).toBeTruthy();
    });

    it('Test 43: service.exportToJSON should work', () => {
        const service = getPlanExportService();
        const plan = createTestPlan();

        const result = service.exportToJSON(plan);

        expect(result.format).toBe('json');
    });

    it('Test 44: service.exportToMarkdown should work', () => {
        const service = getPlanExportService();
        const plan = createTestPlan();

        const result = service.exportToMarkdown(plan);

        expect(result.format).toBe('markdown');
    });

    it('Test 45: service.exportToYAML should work', () => {
        const service = getPlanExportService();
        const plan = createTestPlan();

        const result = service.exportToYAML(plan);

        expect(result.format).toBe('yaml');
    });
});

// ============================================================================
// Edge Cases and Round-Trip Tests
// ============================================================================

describe('Edge cases', () => {
    beforeEach(() => {
        resetPlanExportServiceForTests();
    });

    it('Test 46: should handle completely empty plan', () => {
        const plan: Partial<CompletePlan> = {};

        expect(() => exportToJSON(plan)).not.toThrow();
        expect(() => exportToMarkdown(plan)).not.toThrow();
        expect(() => exportToYAML(plan)).not.toThrow();
    });

    it('Test 47: should handle plan with only overview', () => {
        const plan: Partial<CompletePlan> = {
            overview: {
                name: 'Simple Plan',
                description: 'Basic description',
                goals: ['One goal']
            }
        };

        const jsonResult = exportToJSON(plan);
        const parsed = JSON.parse(jsonResult.content);

        expect(parsed.overview.name).toBe('Simple Plan');
    });

    it('Test 48: should truncate very long filenames', () => {
        const plan = createTestPlan({
            overview: {
                name: 'This is an extremely long project name that should be truncated to fifty characters maximum',
                description: '',
                goals: []
            }
        });
        const result = exportToJSON(plan);

        // Filename should be ≤ 50 chars + extension
        const nameWithoutExt = result.filename.replace('.json', '');
        expect(nameWithoutExt.length).toBeLessThanOrEqual(50);
    });

    it('Test 49: JSON export should be re-importable', () => {
        const originalPlan = createTestPlan();
        const exported = exportToJSON(originalPlan);
        const reimported = JSON.parse(exported.content);

        // Core structure should match
        expect(reimported.metadata.id).toBe(originalPlan.metadata.id);
        expect(reimported.overview.name).toBe(originalPlan.overview.name);
        expect(reimported.featureBlocks.length).toBe(originalPlan.featureBlocks.length);
        expect(reimported.featureBlocks[0].id).toBe(originalPlan.featureBlocks[0].id);
    });

    it('Test 50: should handle Date objects in metadata', () => {
        const plan = createTestPlan();

        const yamlResult = exportToYAML(plan);
        expect(yamlResult.content).toContain('createdAt:');
        expect(yamlResult.content).toContain('2024-01-15');

        const mdResult = exportToMarkdown(plan);
        expect(mdResult.content).toContain('January 15, 2024');
    });

    it('Test 51: should handle low priority with blue emoji', () => {
        const plan = createTestPlan({
            featureBlocks: [
                {
                    id: 'f1',
                    name: 'Low Priority Feature',
                    description: '',
                    purpose: '',
                    priority: 'low' as PriorityLevel,
                    acceptanceCriteria: [],
                    technicalNotes: '',
                    order: 1
                }
            ]
        });
        const result = exportToMarkdown(plan);

        expect(result.content).toContain('🔵 Low Priority Feature');
    });

    it('Test 52: should handle critical priority with red emoji', () => {
        const plan = createTestPlan({
            featureBlocks: [
                {
                    id: 'f1',
                    name: 'Critical Feature',
                    description: '',
                    purpose: '',
                    priority: 'critical' as PriorityLevel,
                    acceptanceCriteria: [],
                    technicalNotes: '',
                    order: 1
                }
            ]
        });
        const result = exportToMarkdown(plan);

        expect(result.content).toContain('🔴 Critical Feature');
    });

    it('Test 53: should handle technical notes in blockquote', () => {
        const plan = createTestPlan();
        const result = exportToMarkdown(plan);

        expect(result.content).toContain('> **Technical Notes**: Some technical notes');
    });

    it('Test 54: should handle developer story without optional fields', () => {
        const plan = createTestPlan({
            developerStories: [
                {
                    id: 'dev-1',
                    action: 'Simple action',
                    benefit: 'Simple benefit',
                    estimatedHours: 2,
                    technicalRequirements: [],
                    apiNotes: '',
                    databaseNotes: '',
                    relatedBlockIds: [],
                    relatedTaskIds: []
                }
            ]
        });

        const mdResult = exportToMarkdown(plan);
        expect(mdResult.content).toContain('Simple action');

        const yamlResult = exportToYAML(plan);
        // Empty strings are still output in YAML
        expect(yamlResult.content).toContain('developerStories:');
    });

    it('Test 55: should handle user story without acceptance criteria', () => {
        const plan = createTestPlan({
            userStories: [
                {
                    id: 'us-1',
                    userType: 'Admin',
                    action: 'do something',
                    benefit: 'get value',
                    priority: 'medium' as PriorityLevel,
                    relatedBlockIds: [],
                    acceptanceCriteria: []
                }
            ]
        });

        const result = exportToMarkdown(plan);
        expect(result.content).toContain('As a **Admin**');
    });
});

// ============================================================================
// Format-Specific Validation Tests
// ============================================================================

describe('Format validation', () => {
    it('Test 56: JSON output should be valid JSON', () => {
        const plan = createTestPlan();
        const result = exportToJSON(plan);

        expect(() => JSON.parse(result.content)).not.toThrow();
    });

    it('Test 57: Markdown output should have proper structure', () => {
        const plan = createTestPlan();
        const result = exportToMarkdown(plan);

        // Should start with H1
        expect(result.content.startsWith('# ')).toBe(true);

        // Should have multiple sections with H2
        const h2Count = (result.content.match(/^## /gm) || []).length;
        expect(h2Count).toBeGreaterThan(3);
    });

    it('Test 58: YAML output should have proper indentation', () => {
        const plan = createTestPlan();
        const result = exportToYAML(plan);

        // Check for proper 2-space indentation patterns
        expect(result.content).toMatch(/^  \w+:/m); // 2-space indent
        expect(result.content).toMatch(/^    \w+:/m); // 4-space indent
    });

    it('Test 59: All formats should generate correct MIME types', () => {
        const plan = createTestPlan();

        expect(exportToJSON(plan).mimeType).toBe('application/json');
        expect(exportToMarkdown(plan).mimeType).toBe('text/markdown');
        expect(exportToYAML(plan).mimeType).toBe('text/yaml');
    });

    it('Test 60: All formats should generate correct file extensions', () => {
        const plan = createTestPlan();

        expect(exportToJSON(plan).filename).toMatch(/\.json$/);
        expect(exportToMarkdown(plan).filename).toMatch(/\.md$/);
        expect(exportToYAML(plan).filename).toMatch(/\.yaml$/);
    });
});
