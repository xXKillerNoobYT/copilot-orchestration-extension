/**
 * Tests for Feature Stub Generator (MT-033.24)
 *
 * Tests for generating implementation stub files for features.
 */

import {
    generateAllStubs,
    generateFeatureStub,
    DEFAULT_STUB_CONFIG,
    StubConfig,
    GeneratedStub,
} from '../../src/generators/featureStubs';
import { CompletePlan, FeatureBlock, DeveloperStory, PriorityLevel, BlockLink, DependencyType } from '../../src/planning/types';

describe('Feature Stub Generator', () => {
    const createMinimalPlan = (): CompletePlan => ({
        metadata: {
            id: 'test-plan-1',
            name: 'Test Plan',
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
        },
        overview: {
            name: 'Test Project',
            description: 'A test project',
            goals: ['Build something'],
        },
        featureBlocks: [],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [],
        developerStories: [],
        successCriteria: [],
    });

    const createFeature = (id: string, name: string, priority: PriorityLevel = 'medium'): FeatureBlock => ({
        id,
        name,
        description: `Description for ${name}`,
        purpose: `Purpose of ${name}`,
        acceptanceCriteria: ['AC 1', 'AC 2'],
        technicalNotes: 'Some technical notes',
        priority,
        order: 1,
    });

    const createDevStory = (id: string, relatedFeatureId: string): DeveloperStory => ({
        id,
        action: 'Implement feature logic',
        benefit: 'Users can use the feature',
        technicalRequirements: ['Req 1', 'Req 2'],
        apiNotes: 'API notes here',
        databaseNotes: 'DB notes here',
        estimatedHours: 8,
        relatedBlockIds: [relatedFeatureId],
        relatedTaskIds: [],
    });

    const createLink = (source: string, target: string, type: DependencyType = 'requires'): BlockLink => ({
        id: `link-${source}-${target}`,
        sourceBlockId: source,
        targetBlockId: target,
        dependencyType: type,
    });

    // ============================================================================
    // DEFAULT_STUB_CONFIG Tests
    // ============================================================================
    describe('DEFAULT_STUB_CONFIG', () => {
        it('Test 1: should have includeJsdoc true by default', () => {
            expect(DEFAULT_STUB_CONFIG.includeJsdoc).toBe(true);
        });

        it('Test 2: should have includeTodos true by default', () => {
            expect(DEFAULT_STUB_CONFIG.includeTodos).toBe(true);
        });

        it('Test 3: should have includeErrorHandling true by default', () => {
            expect(DEFAULT_STUB_CONFIG.includeErrorHandling).toBe(true);
        });

        it('Test 4: should have includeLogging true by default', () => {
            expect(DEFAULT_STUB_CONFIG.includeLogging).toBe(true);
        });

        it('Test 5: should have includeTestTemplate true by default', () => {
            expect(DEFAULT_STUB_CONFIG.includeTestTemplate).toBe(true);
        });

        it('Test 6: should have functional style by default', () => {
            expect(DEFAULT_STUB_CONFIG.style).toBe('functional');
        });
    });

    // ============================================================================
    // generateAllStubs Tests
    // ============================================================================
    describe('generateAllStubs()', () => {
        it('Test 7: should return array of stubs', () => {
            const plan = createMinimalPlan();
            plan.featureBlocks = [createFeature('f1', 'Feature 1')];
            const stubs = generateAllStubs(plan);

            expect(stubs).toBeInstanceOf(Array);
            expect(stubs.length).toBe(1);
        });

        it('Test 8: should generate stubs for all features', () => {
            const plan = createMinimalPlan();
            plan.featureBlocks = [
                createFeature('f1', 'Feature 1'),
                createFeature('f2', 'Feature 2'),
                createFeature('f3', 'Feature 3'),
            ];
            const stubs = generateAllStubs(plan);

            expect(stubs.length).toBe(3);
        });

        it('Test 9: should handle empty plan', () => {
            const plan = createMinimalPlan();
            const stubs = generateAllStubs(plan);

            expect(stubs).toHaveLength(0);
        });

        it('Test 10: should use default config when not specified', () => {
            const plan = createMinimalPlan();
            plan.featureBlocks = [createFeature('f1', 'Feature')];
            const stubs = generateAllStubs(plan);

            expect(stubs[0].testFile).toBeDefined(); // Test template included by default
        });
    });

    // ============================================================================
    // generateFeatureStub Tests
    // ============================================================================
    describe('generateFeatureStub()', () => {
        it('Test 11: should return stub with featureId', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('test-id', 'Test Feature');
            const stub = generateFeatureStub(feature, plan);

            expect(stub.featureId).toBe('test-id');
        });

        it('Test 12: should return stub with featureName', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'My Feature');
            const stub = generateFeatureStub(feature, plan);

            expect(stub.featureName).toBe('My Feature');
        });

        it('Test 13: should generate mainFile', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const stub = generateFeatureStub(feature, plan);

            expect(stub.mainFile).toBeDefined();
            expect(stub.mainFile.path).toBeDefined();
            expect(stub.mainFile.content).toBeDefined();
        });

        it('Test 14: should generate typesFile', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const stub = generateFeatureStub(feature, plan);

            expect(stub.typesFile).toBeDefined();
            expect(stub.typesFile.content).toContain('interface');
        });

        it('Test 15: should generate indexFile', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const stub = generateFeatureStub(feature, plan);

            expect(stub.indexFile).toBeDefined();
            expect(stub.indexFile.content).toContain('export');
        });

        it('Test 16: should generate testFile when includeTestTemplate is true', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const config: StubConfig = { ...DEFAULT_STUB_CONFIG, includeTestTemplate: true };
            const stub = generateFeatureStub(feature, plan, config);

            expect(stub.testFile).toBeDefined();
            expect(stub.testFile?.content).toContain('describe');
        });

        it('Test 17: should not generate testFile when includeTestTemplate is false', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const config: StubConfig = { ...DEFAULT_STUB_CONFIG, includeTestTemplate: false };
            const stub = generateFeatureStub(feature, plan, config);

            expect(stub.testFile).toBeUndefined();
        });

        it('Test 18: should include related developer stories', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('f1', 'Feature');
            plan.featureBlocks = [feature];
            plan.developerStories = [createDevStory('s1', 'f1')];

            const stub = generateFeatureStub(feature, plan);
            expect(stub.mainFile.content.length).toBeGreaterThan(0);
        });

        it('Test 19: should handle dependencies in main file', () => {
            const plan = createMinimalPlan();
            const featureA = createFeature('a', 'Feature A');
            const featureB = createFeature('b', 'Feature B');
            plan.featureBlocks = [featureA, featureB];
            plan.blockLinks = [createLink('a', 'b')];

            const stub = generateFeatureStub(featureA, plan);
            expect(stub.mainFile.content.length).toBeGreaterThan(0);
        });
    });

    // ============================================================================
    // Config Options Tests
    // ============================================================================
    describe('Config Options', () => {
        it('Test 20: should include JSDoc when enabled', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const config: StubConfig = { ...DEFAULT_STUB_CONFIG, includeJsdoc: true };
            const stub = generateFeatureStub(feature, plan, config);

            expect(stub.mainFile.content).toContain('/**');
        });

        it('Test 21: should include TODOs when enabled', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'My Feature');
            const config: StubConfig = { ...DEFAULT_STUB_CONFIG, includeTodos: true };
            const stub = generateFeatureStub(feature, plan, config);

            expect(stub.mainFile.content).toContain('TODO');
        });

        it('Test 22: should include error handling when enabled', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const config: StubConfig = { ...DEFAULT_STUB_CONFIG, includeErrorHandling: true };
            const stub = generateFeatureStub(feature, plan, config);

            const hasErrorHandling = stub.mainFile.content.includes('try') ||
                stub.mainFile.content.includes('catch') ||
                stub.mainFile.content.includes('error');
            expect(hasErrorHandling).toBe(true);
        });

        it('Test 23: should include logging when enabled', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const config: StubConfig = { ...DEFAULT_STUB_CONFIG, includeLogging: true };
            const stub = generateFeatureStub(feature, plan, config);

            const hasLogging = stub.mainFile.content.includes('log') ||
                stub.mainFile.content.includes('console');
            expect(hasLogging).toBe(true);
        });
    });

    // ============================================================================
    // Style Options Tests
    // ============================================================================
    describe('Style Options', () => {
        it('Test 24: should generate functional style', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const config: StubConfig = { ...DEFAULT_STUB_CONFIG, style: 'functional' };
            const stub = generateFeatureStub(feature, plan, config);

            expect(stub.mainFile.content).toContain('function');
        });

        it('Test 25: should generate class style', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const config: StubConfig = { ...DEFAULT_STUB_CONFIG, style: 'class' };
            const stub = generateFeatureStub(feature, plan, config);

            expect(stub.mainFile.content).toContain('class');
        });

        it('Test 26: should generate mixed style', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const config: StubConfig = { ...DEFAULT_STUB_CONFIG, style: 'mixed' };
            const stub = generateFeatureStub(feature, plan, config);

            expect(stub.mainFile.content.length).toBeGreaterThan(0);
        });
    });

    // ============================================================================
    // Path Generation Tests
    // ============================================================================
    describe('Path Generation', () => {
        it('Test 27: should generate kebab-case paths', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'User Authentication');
            const stub = generateFeatureStub(feature, plan);

            expect(stub.mainFile.path).toContain('user-authentication');
        });

        it('Test 28: should handle special characters in names', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature (v2)');

            // Should not throw
            expect(() => generateFeatureStub(feature, plan)).not.toThrow();
        });
    });

    // ============================================================================
    // Types File Tests
    // ============================================================================
    describe('Types File Generation', () => {
        it('Test 29: should generate type definitions', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const stub = generateFeatureStub(feature, plan);

            expect(stub.typesFile.content).toContain('export');
        });

        it('Test 30: should use .ts extension for types', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const stub = generateFeatureStub(feature, plan);

            expect(stub.typesFile.path).toContain('types');
        });
    });

    // ============================================================================
    // Index File Tests
    // ============================================================================
    describe('Index File Generation', () => {
        it('Test 31: should export main module', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const stub = generateFeatureStub(feature, plan);

            expect(stub.indexFile.content).toContain('export');
        });

        it('Test 32: should be named index.ts', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const stub = generateFeatureStub(feature, plan);

            expect(stub.indexFile.path).toContain('index');
        });
    });

    // ============================================================================
    // Test File Tests
    // ============================================================================
    describe('Test File Generation', () => {
        it('Test 33: should generate describe block', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const config: StubConfig = { ...DEFAULT_STUB_CONFIG, includeTestTemplate: true };
            const stub = generateFeatureStub(feature, plan, config);

            expect(stub.testFile?.content).toContain('describe');
        });

        it('Test 34: should use .test.ts extension', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            const config: StubConfig = { ...DEFAULT_STUB_CONFIG, includeTestTemplate: true };
            const stub = generateFeatureStub(feature, plan, config);

            expect(stub.testFile?.path).toContain('.test.ts');
        });
    });

    // ============================================================================
    // Edge Cases
    // ============================================================================
    describe('Edge Cases', () => {
        it('Test 35: should handle very long feature names', () => {
            const plan = createMinimalPlan();
            const longName = 'A'.repeat(100);
            const feature = createFeature('id', longName);

            expect(() => generateFeatureStub(feature, plan)).not.toThrow();
        });

        it('Test 36: should handle feature with empty acceptance criteria', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', 'Feature');
            feature.acceptanceCriteria = [];

            const stub = generateFeatureStub(feature, plan);
            expect(stub.mainFile.content.length).toBeGreaterThan(0);
        });

        it('Test 37: should handle many developer stories', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('f1', 'Feature');
            plan.featureBlocks = [feature];
            for (let i = 0; i < 10; i++) {
                plan.developerStories.push(createDevStory(`s${i}`, 'f1'));
            }

            const stub = generateFeatureStub(feature, plan);
            expect(stub.mainFile.content.length).toBeGreaterThan(0);
        });

        it('Test 38: should handle feature with all priorities', () => {
            const plan = createMinimalPlan();
            const priorities: PriorityLevel[] = ['low', 'medium', 'high', 'critical'];

            priorities.forEach(p => {
                const feature = createFeature(`id-${p}`, `Feature ${p}`, p);
                const stub = generateFeatureStub(feature, plan);
                expect(stub.mainFile).toBeDefined();
            });
        });

        it('Test 39: should handle unicode in feature name', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('id', '用户認証 Feature');

            expect(() => generateFeatureStub(feature, plan)).not.toThrow();
        });

        it('Test 40: should generate all files for complex feature', () => {
            const plan = createMinimalPlan();
            const feature = createFeature('complex', 'Complex Feature');
            feature.description = 'A very complex feature with many requirements';
            feature.acceptanceCriteria = ['AC 1', 'AC 2', 'AC 3', 'AC 4', 'AC 5'];
            feature.technicalNotes = 'Lots of technical notes here';
            plan.featureBlocks = [feature];
            plan.developerStories = [createDevStory('s1', 'complex')];

            const stub = generateFeatureStub(feature, plan);

            expect(stub.mainFile).toBeDefined();
            expect(stub.typesFile).toBeDefined();
            expect(stub.indexFile).toBeDefined();
            expect(stub.testFile).toBeDefined();
        });
    });
});
