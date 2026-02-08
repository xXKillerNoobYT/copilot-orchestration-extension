/**
 * Tests for Plan Scaffold Generator (MT-033.23)
 *
 * Tests for project scaffolding generation based on plans.
 */

import {
    generateScaffold,
    DEFAULT_SCAFFOLD_CONFIG,
    ScaffoldConfig,
    GeneratedFile,
    ScaffoldResult,
} from '../../src/generators/planScaffold';
import { CompletePlan, FeatureBlock, PriorityLevel } from '../../src/planning/types';

describe('Plan Scaffold Generator', () => {
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

    const createPlanWithFeatures = (count: number): CompletePlan => {
        const plan = createMinimalPlan();
        for (let i = 0; i < count; i++) {
            plan.featureBlocks.push(createFeature(`feature-${i}`, `Feature ${i}`));
        }
        return plan;
    };

    // ============================================================================
    // DEFAULT_SCAFFOLD_CONFIG Tests
    // ============================================================================
    describe('DEFAULT_SCAFFOLD_CONFIG', () => {
        it('Test 1: should have web-app as default project type', () => {
            expect(DEFAULT_SCAFFOLD_CONFIG.projectType).toBe('web-app');
        });

        it('Test 2: should have includeTests true by default', () => {
            expect(DEFAULT_SCAFFOLD_CONFIG.includeTests).toBe(true);
        });

        it('Test 3: should have includeCi true by default', () => {
            expect(DEFAULT_SCAFFOLD_CONFIG.includeCi).toBe(true);
        });

        it('Test 4: should have MIT license by default', () => {
            expect(DEFAULT_SCAFFOLD_CONFIG.license).toBe('MIT');
        });

        it('Test 5: should have standard tsConfig by default', () => {
            expect(DEFAULT_SCAFFOLD_CONFIG.tsConfig).toBe('standard');
        });
    });

    // ============================================================================
    // generateScaffold Tests
    // ============================================================================
    describe('generateScaffold()', () => {
        it('Test 6: should return files array', () => {
            const plan = createMinimalPlan();
            const result = generateScaffold(plan);

            expect(result.files).toBeInstanceOf(Array);
            expect(result.files.length).toBeGreaterThan(0);
        });

        it('Test 7: should return summary string', () => {
            const plan = createMinimalPlan();
            const result = generateScaffold(plan);

            expect(typeof result.summary).toBe('string');
            expect(result.summary.length).toBeGreaterThan(0);
        });

        it('Test 8: should return nextSteps array', () => {
            const plan = createMinimalPlan();
            const result = generateScaffold(plan);

            expect(result.nextSteps).toBeInstanceOf(Array);
        });

        it('Test 9: should generate package.json', () => {
            const plan = createMinimalPlan();
            const result = generateScaffold(plan);

            const packageJson = result.files.find(f => f.path === 'package.json');
            expect(packageJson).toBeDefined();
            expect(packageJson?.content).toContain('"name"');
        });

        it('Test 10: should generate tsconfig.json', () => {
            const plan = createMinimalPlan();
            const result = generateScaffold(plan);

            const tsconfig = result.files.find(f => f.path === 'tsconfig.json');
            expect(tsconfig).toBeDefined();
            expect(tsconfig?.content).toContain('compilerOptions');
        });

        it('Test 11: should generate README.md', () => {
            const plan = createMinimalPlan();
            const result = generateScaffold(plan);

            const readme = result.files.find(f => f.path === 'README.md');
            expect(readme).toBeDefined();
            expect(readme?.content).toContain(plan.overview.name);
        });

        it('Test 12: should generate .gitignore', () => {
            const plan = createMinimalPlan();
            const result = generateScaffold(plan);

            const gitignore = result.files.find(f => f.path === '.gitignore');
            expect(gitignore).toBeDefined();
            expect(gitignore?.content).toContain('node_modules');
        });

        it('Test 13: should include test files when includeTests is true', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, includeTests: true };
            const result = generateScaffold(plan, config);

            const testFiles = result.files.filter(f => f.path.includes('tests/'));
            expect(testFiles.length).toBeGreaterThan(0);
        });

        it('Test 14: should exclude test files when includeTests is false', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, includeTests: false };
            const result = generateScaffold(plan, config);

            const jestConfig = result.files.find(f => f.path === 'jest.config.js');
            expect(jestConfig).toBeUndefined();
        });

        it('Test 15: should include CI files when includeCi is true', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, includeCi: true };
            const result = generateScaffold(plan, config);

            const ciFiles = result.files.filter(f => f.path.includes('.github/'));
            expect(ciFiles.length).toBeGreaterThan(0);
        });

        it('Test 16: should exclude CI files when includeCi is false', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, includeCi: false };
            const result = generateScaffold(plan, config);

            const ciFiles = result.files.filter(f => f.path.includes('.github/workflows'));
            expect(ciFiles.length).toBe(0);
        });

        it('Test 17: should use custom package name', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, packageName: 'my-custom-package' };
            const result = generateScaffold(plan, config);

            const packageJson = result.files.find(f => f.path === 'package.json');
            expect(packageJson?.content).toContain('my-custom-package');
        });

        it('Test 18: should generate feature files for features', () => {
            const plan = createPlanWithFeatures(2);
            const result = generateScaffold(plan);

            // Features may be in various locations depending on project type
            const featureRelatedFiles = result.files.filter(f => 
                f.path.includes('feature') || 
                f.description.toLowerCase().includes('feature') ||
                f.path.includes('src/')
            );
            expect(featureRelatedFiles.length).toBeGreaterThan(0);
        });
    });

    // ============================================================================
    // Project Type Tests
    // ============================================================================
    describe('Project Types', () => {
        it('Test 19: should generate web-app structure', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, projectType: 'web-app' };
            const result = generateScaffold(plan, config);

            expect(result.files.length).toBeGreaterThan(0);
        });

        it('Test 20: should generate rest-api structure', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, projectType: 'rest-api' };
            const result = generateScaffold(plan, config);

            expect(result.files.length).toBeGreaterThan(0);
        });

        it('Test 21: should generate cli-tool structure', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, projectType: 'cli-tool' };
            const result = generateScaffold(plan, config);

            expect(result.files.length).toBeGreaterThan(0);
        });

        it('Test 22: should generate vscode-extension structure', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, projectType: 'vscode-extension' };
            const result = generateScaffold(plan, config);

            expect(result.files.length).toBeGreaterThan(0);
        });

        it('Test 23: should generate docs-site structure', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, projectType: 'docs-site' };
            const result = generateScaffold(plan, config);

            expect(result.files.length).toBeGreaterThan(0);
        });

        it('Test 24: should generate library structure', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, projectType: 'library' };
            const result = generateScaffold(plan, config);

            expect(result.files.length).toBeGreaterThan(0);
        });
    });

    // ============================================================================
    // TypeScript Config Tests
    // ============================================================================
    describe('TypeScript Configuration', () => {
        it('Test 25: should generate strict tsconfig', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, tsConfig: 'strict' };
            const result = generateScaffold(plan, config);

            const tsconfig = result.files.find(f => f.path === 'tsconfig.json');
            expect(tsconfig?.content).toContain('strict');
        });

        it('Test 26: should generate standard tsconfig', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, tsConfig: 'standard' };
            const result = generateScaffold(plan, config);

            const tsconfig = result.files.find(f => f.path === 'tsconfig.json');
            expect(tsconfig).toBeDefined();
        });

        it('Test 27: should generate minimal tsconfig', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, tsConfig: 'minimal' };
            const result = generateScaffold(plan, config);

            const tsconfig = result.files.find(f => f.path === 'tsconfig.json');
            expect(tsconfig).toBeDefined();
        });
    });

    // ============================================================================
    // License Tests
    // ============================================================================
    describe('License Generation', () => {
        it('Test 28: should generate MIT license', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, license: 'MIT' };
            const result = generateScaffold(plan, config);

            const license = result.files.find(f => f.path === 'LICENSE');
            expect(license?.content).toContain('MIT');
        });

        it('Test 29: should generate Apache license', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, license: 'Apache-2.0' };
            const result = generateScaffold(plan, config);

            const license = result.files.find(f => f.path === 'LICENSE');
            expect(license?.content).toContain('Apache');
        });

        it('Test 30: should skip license when none specified', () => {
            const plan = createMinimalPlan();
            const config: ScaffoldConfig = { ...DEFAULT_SCAFFOLD_CONFIG, license: 'none' };
            const result = generateScaffold(plan, config);

            const license = result.files.find(f => f.path === 'LICENSE');
            // Either undefined or empty
            expect(!license || license.content === '').toBe(true);
        });
    });

    // ============================================================================
    // GeneratedFile Properties Tests
    // ============================================================================
    describe('Generated File Properties', () => {
        it('Test 31: should include path for all files', () => {
            const plan = createMinimalPlan();
            const result = generateScaffold(plan);

            result.files.forEach(f => {
                expect(f.path).toBeDefined();
                expect(typeof f.path).toBe('string');
            });
        });

        it('Test 32: should include content for all files', () => {
            const plan = createMinimalPlan();
            const result = generateScaffold(plan);

            result.files.forEach(f => {
                expect(f.content).toBeDefined();
                expect(typeof f.content).toBe('string');
            });
        });

        it('Test 33: should include description for all files', () => {
            const plan = createMinimalPlan();
            const result = generateScaffold(plan);

            result.files.forEach(f => {
                expect(f.description).toBeDefined();
                expect(typeof f.description).toBe('string');
            });
        });

        it('Test 34: should include overwrite flag for all files', () => {
            const plan = createMinimalPlan();
            const result = generateScaffold(plan);

            result.files.forEach(f => {
                expect(typeof f.overwrite).toBe('boolean');
            });
        });
    });

    // ============================================================================
    // Summary and Next Steps Tests
    // ============================================================================
    describe('Summary Generation', () => {
        it('Test 35: should include file count in summary', () => {
            const plan = createMinimalPlan();
            const result = generateScaffold(plan);

            expect(result.summary).toContain(result.files.length.toString());
        });

        it('Test 36: should mention project name in summary', () => {
            const plan = createMinimalPlan();
            plan.overview.name = 'My Special Project';
            const result = generateScaffold(plan);

            expect(result.summary.toLowerCase()).toContain('special');
        });
    });

    describe('Next Steps', () => {
        it('Test 37: should include npm install step', () => {
            const plan = createMinimalPlan();
            const result = generateScaffold(plan);

            const hasInstallStep = result.nextSteps.some(s => 
                s.toLowerCase().includes('npm') || s.toLowerCase().includes('install')
            );
            expect(hasInstallStep).toBe(true);
        });

        it('Test 38: should include at least 2 next steps', () => {
            const plan = createMinimalPlan();
            const result = generateScaffold(plan);

            expect(result.nextSteps.length).toBeGreaterThanOrEqual(2);
        });
    });

    // ============================================================================
    // Feature Integration Tests
    // ============================================================================
    describe('Feature Integration', () => {
        it('Test 39: should handle plan with many features', () => {
            const plan = createPlanWithFeatures(10);
            const result = generateScaffold(plan);

            expect(result.files.length).toBeGreaterThan(0);
        });

        it('Test 40: should include goals in documentation', () => {
            const plan = createMinimalPlan();
            plan.overview.goals = ['Goal 1', 'Goal 2'];
            const result = generateScaffold(plan);

            const readme = result.files.find(f => f.path === 'README.md');
            expect(readme?.content).toContain('Goal');
        });
    });
});
