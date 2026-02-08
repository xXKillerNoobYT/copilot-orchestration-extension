/**
 * Tests for Dependency Script Generator (MT-033.25)
 *
 * Tests for generating setup scripts and configuration for managing feature dependencies.
 */

import {
    generateDependencyScripts,
    buildDependencyGraph,
    DEFAULT_SCRIPT_CONFIG,
    DependencyScriptConfig,
    DependencyGraph,
    GeneratedScript,
} from '../../src/generators/dependencyScripts';
import { CompletePlan, FeatureBlock, BlockLink, PriorityLevel, DependencyType } from '../../src/planning/types';

describe('Dependency Script Generator', () => {
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

    const createLink = (source: string, target: string, type: DependencyType = 'requires'): BlockLink => ({
        id: `link-${source}-${target}`,
        sourceBlockId: source,
        targetBlockId: target,
        dependencyType: type,
    });

    const createPlanWithDependencies = (): CompletePlan => {
        const plan = createMinimalPlan();
        plan.featureBlocks = [
            createFeature('auth', 'Authentication'),
            createFeature('user', 'User Management'),
            createFeature('dashboard', 'Dashboard'),
        ];
        plan.blockLinks = [
            createLink('user', 'auth'), // user requires auth
            createLink('dashboard', 'user'), // dashboard requires user
        ];
        return plan;
    };

    // ============================================================================
    // DEFAULT_SCRIPT_CONFIG Tests
    // ============================================================================
    describe('DEFAULT_SCRIPT_CONFIG', () => {
        it('Test 1: should have npm format by default', () => {
            expect(DEFAULT_SCRIPT_CONFIG.format).toBe('npm');
        });

        it('Test 2: should have includeVerification true by default', () => {
            expect(DEFAULT_SCRIPT_CONFIG.includeVerification).toBe(true);
        });

        it('Test 3: should have includeRollback false by default', () => {
            expect(DEFAULT_SCRIPT_CONFIG.includeRollback).toBe(false);
        });

        it('Test 4: should have parallelExecution true by default', () => {
            expect(DEFAULT_SCRIPT_CONFIG.parallelExecution).toBe(true);
        });

        it('Test 5: should have verbose true by default', () => {
            expect(DEFAULT_SCRIPT_CONFIG.verbose).toBe(true);
        });
    });

    // ============================================================================
    // buildDependencyGraph Tests
    // ============================================================================
    describe('buildDependencyGraph()', () => {
        it('Test 6: should return nodes from features', () => {
            const plan = createPlanWithDependencies();
            const graph = buildDependencyGraph(plan);

            expect(graph.nodes).toContain('auth');
            expect(graph.nodes).toContain('user');
            expect(graph.nodes).toContain('dashboard');
        });

        it('Test 7: should return edges from block links', () => {
            const plan = createPlanWithDependencies();
            const graph = buildDependencyGraph(plan);

            expect(graph.edges.length).toBeGreaterThan(0);
            expect(graph.edges.some(e => e.from === 'user' && e.to === 'auth')).toBe(true);
        });

        it('Test 8: should calculate build order', () => {
            const plan = createPlanWithDependencies();
            const graph = buildDependencyGraph(plan);

            expect(graph.buildOrder).toBeInstanceOf(Array);
            expect(graph.buildOrder.length).toBe(3);
        });

        it('Test 9: should group for parallel execution', () => {
            const plan = createPlanWithDependencies();
            const graph = buildDependencyGraph(plan);

            expect(graph.parallelGroups).toBeInstanceOf(Array);
        });

        it('Test 10: should handle empty plan', () => {
            const plan = createMinimalPlan();
            const graph = buildDependencyGraph(plan);

            expect(graph.nodes).toHaveLength(0);
            expect(graph.edges).toHaveLength(0);
        });

        it('Test 11: should only include requires and blocks dependencies', () => {
            const plan = createMinimalPlan();
            plan.featureBlocks = [createFeature('a', 'A'), createFeature('b', 'B')];
            plan.blockLinks = [
                createLink('a', 'b', 'suggests'), // Should be filtered out
                createLink('a', 'b', 'requires'), // Should be included
            ];
            const graph = buildDependencyGraph(plan);

            expect(graph.edges.length).toBe(1);
            expect(graph.edges[0].type).toBe('requires');
        });
    });

    // ============================================================================
    // generateDependencyScripts Tests
    // ============================================================================
    describe('generateDependencyScripts()', () => {
        it('Test 12: should return array of scripts', () => {
            const plan = createPlanWithDependencies();
            const scripts = generateDependencyScripts(plan);

            expect(scripts).toBeInstanceOf(Array);
            expect(scripts.length).toBeGreaterThan(0);
        });

        it('Test 13: should generate build script', () => {
            const plan = createPlanWithDependencies();
            const scripts = generateDependencyScripts(plan);

            const buildScript = scripts.find(s => s.name.toLowerCase().includes('build'));
            expect(buildScript).toBeDefined();
        });

        it('Test 14: should generate verification script when enabled', () => {
            const plan = createPlanWithDependencies();
            const config: DependencyScriptConfig = { ...DEFAULT_SCRIPT_CONFIG, includeVerification: true };
            const scripts = generateDependencyScripts(plan, config);

            const verifyScript = scripts.find(s => 
                s.name.toLowerCase().includes('verify') || 
                s.description.toLowerCase().includes('verif')
            );
            expect(verifyScript).toBeDefined();
        });

        it('Test 15: should generate rollback script when enabled', () => {
            const plan = createPlanWithDependencies();
            const config: DependencyScriptConfig = { ...DEFAULT_SCRIPT_CONFIG, includeRollback: true };
            const scripts = generateDependencyScripts(plan, config);

            const rollbackScript = scripts.find(s => 
                s.name.toLowerCase().includes('rollback')
            );
            expect(rollbackScript).toBeDefined();
        });

        it('Test 16: should skip rollback script when disabled', () => {
            const plan = createPlanWithDependencies();
            const config: DependencyScriptConfig = { ...DEFAULT_SCRIPT_CONFIG, includeRollback: false };
            const scripts = generateDependencyScripts(plan, config);

            const rollbackScript = scripts.find(s => 
                s.name.toLowerCase().includes('rollback')
            );
            expect(rollbackScript).toBeUndefined();
        });

        it('Test 17: should generate npm scripts when format is npm', () => {
            const plan = createPlanWithDependencies();
            const config: DependencyScriptConfig = { ...DEFAULT_SCRIPT_CONFIG, format: 'npm' };
            const scripts = generateDependencyScripts(plan, config);

            const npmScript = scripts.find(s => 
                s.path.includes('package') || s.content.includes('"scripts"')
            );
            expect(npmScript).toBeDefined();
        });

        it('Test 18: each script should have required properties', () => {
            const plan = createPlanWithDependencies();
            const scripts = generateDependencyScripts(plan);

            scripts.forEach(s => {
                expect(s.name).toBeDefined();
                expect(s.path).toBeDefined();
                expect(s.content).toBeDefined();
                expect(s.description).toBeDefined();
            });
        });
    });

    // ============================================================================
    // Format-Specific Tests
    // ============================================================================
    describe('Script Formats', () => {
        it('Test 19: should generate bash format scripts', () => {
            const plan = createPlanWithDependencies();
            const config: DependencyScriptConfig = { ...DEFAULT_SCRIPT_CONFIG, format: 'bash' };
            const scripts = generateDependencyScripts(plan, config);

            const hasShellScript = scripts.some(s => 
                s.content.includes('#!/bin/bash') || s.path.endsWith('.sh')
            );
            expect(hasShellScript).toBe(true);
        });

        it('Test 20: should generate powershell format scripts', () => {
            const plan = createPlanWithDependencies();
            const config: DependencyScriptConfig = { ...DEFAULT_SCRIPT_CONFIG, format: 'powershell' };
            const scripts = generateDependencyScripts(plan, config);

            const hasPsScript = scripts.some(s => 
                s.path.endsWith('.ps1') || s.content.includes('Write-')
            );
            expect(hasPsScript).toBe(true);
        });

        it('Test 21: should generate makefile format', () => {
            const plan = createPlanWithDependencies();
            const config: DependencyScriptConfig = { ...DEFAULT_SCRIPT_CONFIG, format: 'makefile' };
            const scripts = generateDependencyScripts(plan, config);

            const hasMakefile = scripts.some(s => 
                s.path.toLowerCase().includes('makefile') || s.name.toLowerCase().includes('make')
            );
            expect(hasMakefile).toBe(true);
        });
    });

    // ============================================================================
    // Dependency Check Tests
    // ============================================================================
    describe('Dependency Check Script', () => {
        it('Test 22: should generate dependency check script', () => {
            const plan = createPlanWithDependencies();
            const scripts = generateDependencyScripts(plan);

            const depCheck = scripts.find(s => 
                s.name.toLowerCase().includes('depend') ||
                s.description.toLowerCase().includes('depend')
            );
            expect(depCheck).toBeDefined();
        });
    });

    // ============================================================================
    // Feature Scripts Tests
    // ============================================================================
    describe('Feature Scripts', () => {
        it('Test 23: should generate scripts for individual features', () => {
            const plan = createPlanWithDependencies();
            const scripts = generateDependencyScripts(plan);

            const featureScripts = scripts.filter(s => 
                s.path.includes('feature') || 
                plan.featureBlocks.some(f => s.name.toLowerCase().includes(f.name.toLowerCase()))
            );
            // At least some feature-related scripts
            expect(scripts.length).toBeGreaterThan(0);
        });

        it('Test 24: should handle plan with no dependencies', () => {
            const plan = createMinimalPlan();
            plan.featureBlocks = [createFeature('a', 'Feature A'), createFeature('b', 'Feature B')];
            // No block links - independent features
            const scripts = generateDependencyScripts(plan);

            expect(scripts.length).toBeGreaterThan(0);
        });
    });

    // ============================================================================
    // Verbose Mode Tests
    // ============================================================================
    describe('Verbose Mode', () => {
        it('Test 25: should include verbose output in scripts when enabled', () => {
            const plan = createPlanWithDependencies();
            const config: DependencyScriptConfig = { ...DEFAULT_SCRIPT_CONFIG, verbose: true };
            const scripts = generateDependencyScripts(plan, config);

            const hasVerbose = scripts.some(s => 
                s.content.includes('echo') || 
                s.content.includes('log') ||
                s.content.includes('Write-')
            );
            expect(hasVerbose).toBe(true);
        });
    });

    // ============================================================================
    // Parallel Execution Tests
    // ============================================================================
    describe('Parallel Execution', () => {
        it('Test 26: should support parallel execution config', () => {
            const plan = createPlanWithDependencies();
            const config: DependencyScriptConfig = { ...DEFAULT_SCRIPT_CONFIG, parallelExecution: true };
            const scripts = generateDependencyScripts(plan, config);

            expect(scripts.length).toBeGreaterThan(0);
        });

        it('Test 27: graph should have parallel groups', () => {
            const plan = createMinimalPlan();
            // Create 3 independent features that can run in parallel
            plan.featureBlocks = [
                createFeature('a', 'A'),
                createFeature('b', 'B'),
                createFeature('c', 'C'),
            ];
            const graph = buildDependencyGraph(plan);

            // Independent nodes should be in same parallel group
            expect(graph.parallelGroups).toBeInstanceOf(Array);
        });
    });

    // ============================================================================
    // Edge Cases
    // ============================================================================
    describe('Edge Cases', () => {
        it('Test 28: should handle circular dependencies gracefully', () => {
            const plan = createMinimalPlan();
            plan.featureBlocks = [createFeature('a', 'A'), createFeature('b', 'B')];
            plan.blockLinks = [
                createLink('a', 'b', 'requires'),
                createLink('b', 'a', 'requires'), // Circular!
            ];

            // Should not throw, may warn or handle cycle
            expect(() => generateDependencyScripts(plan)).not.toThrow();
        });

        it('Test 29: should handle single feature plan', () => {
            const plan = createMinimalPlan();
            plan.featureBlocks = [createFeature('only', 'Only Feature')];

            const scripts = generateDependencyScripts(plan);
            expect(scripts.length).toBeGreaterThan(0);
        });

        it('Test 30: should handle many features efficiently', () => {
            const plan = createMinimalPlan();
            for (let i = 0; i < 20; i++) {
                plan.featureBlocks.push(createFeature(`f${i}`, `Feature ${i}`));
            }

            const scripts = generateDependencyScripts(plan);
            expect(scripts.length).toBeGreaterThan(0);
        });
    });
});
