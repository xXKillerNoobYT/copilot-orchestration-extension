/**
 * Tests for Full-Stack Project Generator (MT-033.25)
 *
 * Tests for monorepo structure, scripts, and dependencies.
 */

import {
    generateProject,
    generateRootPackageJson,
    generateRootTsConfig,
    generateGitignore,
    generateReadme,
    generateArchitectureMd,
    generateContributingMd,
    generateEnvExample,
    generateDocs,
    generateTestSetup,
    generateDockerFiles,
    generateDockerCompose,
    generateNginxConfig,
    generateGithubActions,
    generateCiWorkflow,
    generateDeployWorkflow,
    generateSeeders,
    generateHuskyConfig,
    generatePrettierConfig,
    generateEslintConfig,
    generateStructureDescription,
    generateProjectSummary,
    DEFAULT_PROJECT_CONFIG,
    ProjectConfig,
} from '../../src/generators/projectGenerator';
import { CompletePlan, PriorityLevel } from '../../src/planning/types';

describe('Full-Stack Project Generator', () => {
    // ============================================================================
    // Helper Functions
    // ============================================================================

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
            description: 'A test full-stack application',
            goals: ['Build app', 'Deploy to production'],
        },
        featureBlocks: [{
            id: 'fb-1',
            name: 'User Management',
            description: 'User CRUD operations',
            purpose: 'Manage users',
            acceptanceCriteria: ['Can create user'],
            technicalNotes: '',
            priority: 'high' as PriorityLevel,
            order: 1,
        }],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [{
            id: 'us-1',
            userType: 'user',
            action: 'Log in to the application',
            benefit: 'Access features',
            relatedBlockIds: ['fb-1'],
            acceptanceCriteria: ['Can enter credentials'],
            priority: 'high' as PriorityLevel,
        }],
        developerStories: [{
            id: 'ds-1',
            action: 'Create user endpoint',
            benefit: 'Store users',
            technicalRequirements: ['TypeScript', 'Express'],
            apiNotes: 'POST /api/users',
            databaseNotes: 'Store in users table',
            estimatedHours: 4,
            relatedBlockIds: ['fb-1'],
            relatedTaskIds: [],
        }],
        successCriteria: [{
            id: 'sc-1',
            description: 'Users can register',
            smartAttributes: {
                specific: true,
                measurable: true,
                achievable: true,
                relevant: true,
                timeBound: true,
            },
            relatedFeatureIds: ['fb-1'],
            relatedStoryIds: ['us-1'],
            testable: true,
            priority: 'high' as PriorityLevel,
        }],
    });

    // ============================================================================
    // DEFAULT_PROJECT_CONFIG Tests
    // ============================================================================
    describe('DEFAULT_PROJECT_CONFIG', () => {
        it('Test 1: should have default project name', () => {
            expect(DEFAULT_PROJECT_CONFIG.projectName).toBe('my-fullstack-app');
        });

        it('Test 2: should use npm-workspaces by default', () => {
            expect(DEFAULT_PROJECT_CONFIG.monorepoTool).toBe('npm-workspaces');
        });

        it('Test 3: should include Docker by default', () => {
            expect(DEFAULT_PROJECT_CONFIG.includeDocker).toBe(true);
        });

        it('Test 4: should include GitHub Actions by default', () => {
            expect(DEFAULT_PROJECT_CONFIG.includeGithubActions).toBe(true);
        });

        it('Test 5: should include Husky by default', () => {
            expect(DEFAULT_PROJECT_CONFIG.includeHusky).toBe(true);
        });
    });

    // ============================================================================
    // generateProject Tests
    // ============================================================================
    describe('generateProject()', () => {
        it('Test 6: should return files array', () => {
            const plan = createMinimalPlan();
            const result = generateProject(plan);
            expect(Array.isArray(result.files)).toBe(true);
            expect(result.files.length).toBeGreaterThan(0);
        });

        it('Test 7: should return structure description', () => {
            const plan = createMinimalPlan();
            const result = generateProject(plan);
            expect(typeof result.structure).toBe('string');
            expect(result.structure.length).toBeGreaterThan(0);
        });

        it('Test 8: should return summary', () => {
            const plan = createMinimalPlan();
            const result = generateProject(plan);
            expect(typeof result.summary).toBe('string');
            expect(result.summary).toContain('Frontend');
            expect(result.summary).toContain('Backend');
        });

        it('Test 9: should include frontend files', () => {
            const plan = createMinimalPlan();
            const result = generateProject(plan);
            expect(result.files.some(f => f.path.startsWith('frontend/'))).toBe(true);
        });

        it('Test 10: should include backend files', () => {
            const plan = createMinimalPlan();
            const result = generateProject(plan);
            expect(result.files.some(f => f.path.startsWith('backend/'))).toBe(true);
        });

        it('Test 11: should include root package.json', () => {
            const plan = createMinimalPlan();
            const result = generateProject(plan);
            expect(result.files.some(f => f.path === 'package.json')).toBe(true);
        });

        it('Test 12: should include README.md', () => {
            const plan = createMinimalPlan();
            const result = generateProject(plan);
            expect(result.files.some(f => f.path === 'README.md')).toBe(true);
        });

        it('Test 13: should include .gitignore', () => {
            const plan = createMinimalPlan();
            const result = generateProject(plan);
            expect(result.files.some(f => f.path === '.gitignore')).toBe(true);
        });

        it('Test 14: should include Docker files when enabled', () => {
            const plan = createMinimalPlan();
            const config: ProjectConfig = { ...DEFAULT_PROJECT_CONFIG, includeDocker: true };
            const result = generateProject(plan, config);
            expect(result.files.some(f => f.path.includes('docker-compose'))).toBe(true);
        });

        it('Test 15: should skip Docker files when disabled', () => {
            const plan = createMinimalPlan();
            const config: ProjectConfig = { ...DEFAULT_PROJECT_CONFIG, includeDocker: false };
            const result = generateProject(plan, config);
            expect(result.files.some(f => f.path === 'docker-compose.yml')).toBe(false);
        });

        it('Test 16: should include GitHub Actions when enabled', () => {
            const plan = createMinimalPlan();
            const config: ProjectConfig = { ...DEFAULT_PROJECT_CONFIG, includeGithubActions: true };
            const result = generateProject(plan, config);
            expect(result.files.some(f => f.path.includes('.github/workflows'))).toBe(true);
        });

        it('Test 17: should include seeders when enabled', () => {
            const plan = createMinimalPlan();
            const config: ProjectConfig = { ...DEFAULT_PROJECT_CONFIG, includeSeeders: true };
            const result = generateProject(plan, config);
            expect(result.files.some(f => f.path.includes('seeds'))).toBe(true);
        });

        it('Test 18: should aggregate warnings from frontend and backend', () => {
            const plan = createMinimalPlan();
            plan.developerStories = [];
            plan.featureBlocks = [];
            const result = generateProject(plan);
            expect(result.warnings.length).toBeGreaterThan(0);
        });
    });

    // ============================================================================
    // Root Configuration Files Tests
    // ============================================================================
    describe('generateRootPackageJson()', () => {
        it('Test 19: should set project name', () => {
            const config = { ...DEFAULT_PROJECT_CONFIG, projectName: 'my-app' };
            const file = generateRootPackageJson(config);
            const pkg = JSON.parse(file.content);
            expect(pkg.name).toBe('my-app');
        });

        it('Test 20: should include workspaces', () => {
            const file = generateRootPackageJson(DEFAULT_PROJECT_CONFIG);
            const pkg = JSON.parse(file.content);
            expect(pkg.workspaces).toEqual(['frontend', 'backend']);
        });

        it('Test 21: should include dev script', () => {
            const file = generateRootPackageJson(DEFAULT_PROJECT_CONFIG);
            const pkg = JSON.parse(file.content);
            expect(pkg.scripts.dev).toBeDefined();
            expect(pkg.scripts.dev).toContain('concurrently');
        });

        it('Test 22: should include build script', () => {
            const file = generateRootPackageJson(DEFAULT_PROJECT_CONFIG);
            const pkg = JSON.parse(file.content);
            expect(pkg.scripts.build).toBeDefined();
        });

        it('Test 23: should include test script', () => {
            const file = generateRootPackageJson(DEFAULT_PROJECT_CONFIG);
            const pkg = JSON.parse(file.content);
            expect(pkg.scripts.test).toBeDefined();
        });

        it('Test 24: should include docker scripts', () => {
            const file = generateRootPackageJson(DEFAULT_PROJECT_CONFIG);
            const pkg = JSON.parse(file.content);
            expect(pkg.scripts['docker:up']).toBeDefined();
            expect(pkg.scripts['docker:down']).toBeDefined();
        });

        it('Test 25: should include concurrently dependency', () => {
            const file = generateRootPackageJson(DEFAULT_PROJECT_CONFIG);
            const pkg = JSON.parse(file.content);
            expect(pkg.devDependencies.concurrently).toBeDefined();
        });

        it('Test 26: should include husky when enabled', () => {
            const config = { ...DEFAULT_PROJECT_CONFIG, includeHusky: true };
            const file = generateRootPackageJson(config);
            const pkg = JSON.parse(file.content);
            expect(pkg.devDependencies.husky).toBeDefined();
        });

        it('Test 27: should include lint-staged config when husky enabled', () => {
            const config = { ...DEFAULT_PROJECT_CONFIG, includeHusky: true };
            const file = generateRootPackageJson(config);
            const pkg = JSON.parse(file.content);
            expect(pkg['lint-staged']).toBeDefined();
        });
    });

    describe('generateRootTsConfig()', () => {
        it('Test 28: should include references to subprojects', () => {
            const file = generateRootTsConfig(DEFAULT_PROJECT_CONFIG);
            const config = JSON.parse(file.content);
            expect(config.references).toContainEqual({ path: './frontend' });
            expect(config.references).toContainEqual({ path: './backend' });
        });

        it('Test 29: should enable strict mode', () => {
            const file = generateRootTsConfig(DEFAULT_PROJECT_CONFIG);
            const config = JSON.parse(file.content);
            expect(config.compilerOptions.strict).toBe(true);
        });
    });

    describe('generateGitignore()', () => {
        it('Test 30: should ignore node_modules', () => {
            const file = generateGitignore(DEFAULT_PROJECT_CONFIG);
            expect(file.content).toContain('node_modules');
        });

        it('Test 31: should ignore dist folder', () => {
            const file = generateGitignore(DEFAULT_PROJECT_CONFIG);
            expect(file.content).toContain('dist/');
        });

        it('Test 32: should ignore .env files', () => {
            const file = generateGitignore(DEFAULT_PROJECT_CONFIG);
            expect(file.content).toContain('.env');
        });

        it('Test 33: should ignore coverage folder', () => {
            const file = generateGitignore(DEFAULT_PROJECT_CONFIG);
            expect(file.content).toContain('coverage/');
        });
    });

    // ============================================================================
    // Documentation Generation Tests
    // ============================================================================
    describe('generateReadme()', () => {
        it('Test 34: should include project name', () => {
            const plan = createMinimalPlan();
            const file = generateReadme(plan, DEFAULT_PROJECT_CONFIG, { files: [], components: [], summary: '', warnings: [] }, { files: [], routes: [], summary: '', warnings: [] });
            expect(file.content).toContain('Test Project');
        });

        it('Test 35: should include quick start section', () => {
            const plan = createMinimalPlan();
            const file = generateReadme(plan, DEFAULT_PROJECT_CONFIG, { files: [], components: [], summary: '', warnings: [] }, { files: [], routes: [], summary: '', warnings: [] });
            expect(file.content).toContain('Quick Start');
        });

        it('Test 36: should include installation instructions', () => {
            const plan = createMinimalPlan();
            const file = generateReadme(plan, DEFAULT_PROJECT_CONFIG, { files: [], components: [], summary: '', warnings: [] }, { files: [], routes: [], summary: '', warnings: [] });
            expect(file.content).toContain('npm install');
        });
    });

    describe('generateArchitectureMd()', () => {
        it('Test 37: should include system overview', () => {
            const plan = createMinimalPlan();
            const file = generateArchitectureMd(plan, DEFAULT_PROJECT_CONFIG);
            expect(file.content).toContain('System Overview');
        });

        it('Test 38: should include feature blocks', () => {
            const plan = createMinimalPlan();
            const file = generateArchitectureMd(plan, DEFAULT_PROJECT_CONFIG);
            expect(file.content).toContain('User Management');
        });
    });

    describe('generateContributingMd()', () => {
        it('Test 39: should include getting started section', () => {
            const file = generateContributingMd(DEFAULT_PROJECT_CONFIG);
            expect(file.content).toContain('Getting Started');
        });

        it('Test 40: should include commit message guidelines', () => {
            const file = generateContributingMd(DEFAULT_PROJECT_CONFIG);
            expect(file.content).toContain('Commit Messages');
        });
    });

    describe('generateEnvExample()', () => {
        it('Test 41: should include NODE_ENV', () => {
            const file = generateEnvExample(DEFAULT_PROJECT_CONFIG);
            expect(file.content).toContain('NODE_ENV');
        });

        it('Test 42: should include DATABASE_URL', () => {
            const file = generateEnvExample(DEFAULT_PROJECT_CONFIG);
            expect(file.content).toContain('DATABASE_URL');
        });

        it('Test 43: should include JWT_SECRET', () => {
            const file = generateEnvExample(DEFAULT_PROJECT_CONFIG);
            expect(file.content).toContain('JWT_SECRET');
        });
    });

    describe('generateDocs()', () => {
        it('Test 44: should generate API documentation', () => {
            const plan = createMinimalPlan();
            const docs = generateDocs(plan, DEFAULT_PROJECT_CONFIG);
            expect(docs.some(d => d.path.includes('API.md'))).toBe(true);
        });

        it('Test 45: should generate user guide when user stories exist', () => {
            const plan = createMinimalPlan();
            const docs = generateDocs(plan, DEFAULT_PROJECT_CONFIG);
            expect(docs.some(d => d.path.includes('USER_GUIDE.md'))).toBe(true);
        });

        it('Test 46: should generate success criteria doc', () => {
            const plan = createMinimalPlan();
            const docs = generateDocs(plan, DEFAULT_PROJECT_CONFIG);
            expect(docs.some(d => d.path.includes('SUCCESS_CRITERIA.md'))).toBe(true);
        });
    });

    // ============================================================================
    // Docker Generation Tests
    // ============================================================================
    describe('generateDockerFiles()', () => {
        it('Test 47: should generate docker-compose.yml', () => {
            const files = generateDockerFiles(DEFAULT_PROJECT_CONFIG);
            expect(files.some(f => f.path === 'docker-compose.yml')).toBe(true);
        });

        it('Test 48: should generate nginx config', () => {
            const files = generateDockerFiles(DEFAULT_PROJECT_CONFIG);
            expect(files.some(f => f.path.includes('nginx.conf'))).toBe(true);
        });
    });

    describe('generateDockerCompose()', () => {
        it('Test 49: should include frontend service', () => {
            const content = generateDockerCompose(DEFAULT_PROJECT_CONFIG);
            expect(content).toContain('frontend:');
        });

        it('Test 50: should include backend service', () => {
            const content = generateDockerCompose(DEFAULT_PROJECT_CONFIG);
            expect(content).toContain('backend:');
        });

        it('Test 51: should include database service', () => {
            const content = generateDockerCompose(DEFAULT_PROJECT_CONFIG);
            expect(content).toContain('db:');
        });

        it('Test 52: should use postgres for postgresql config', () => {
            const content = generateDockerCompose(DEFAULT_PROJECT_CONFIG);
            expect(content).toContain('postgres');
        });

        it('Test 53: should use mongo for mongodb config', () => {
            const config: ProjectConfig = {
                ...DEFAULT_PROJECT_CONFIG,
                backendConfig: { ...DEFAULT_PROJECT_CONFIG.backendConfig, database: 'mongodb' }
            };
            const content = generateDockerCompose(config);
            expect(content).toContain('mongo');
        });
    });

    describe('generateNginxConfig()', () => {
        it('Test 54: should include API proxy', () => {
            const content = generateNginxConfig(DEFAULT_PROJECT_CONFIG);
            expect(content).toContain('location /api');
            expect(content).toContain('proxy_pass');
        });

        it('Test 55: should include SPA fallback', () => {
            const content = generateNginxConfig(DEFAULT_PROJECT_CONFIG);
            expect(content).toContain('try_files');
            expect(content).toContain('index.html');
        });
    });

    // ============================================================================
    // GitHub Actions Tests
    // ============================================================================
    describe('generateGithubActions()', () => {
        it('Test 56: should generate CI workflow', () => {
            const files = generateGithubActions(DEFAULT_PROJECT_CONFIG);
            expect(files.some(f => f.path.includes('ci.yml'))).toBe(true);
        });

        it('Test 57: should generate deploy workflow', () => {
            const files = generateGithubActions(DEFAULT_PROJECT_CONFIG);
            expect(files.some(f => f.path.includes('deploy.yml'))).toBe(true);
        });
    });

    describe('generateCiWorkflow()', () => {
        it('Test 58: should run on push and PR', () => {
            const content = generateCiWorkflow(DEFAULT_PROJECT_CONFIG);
            expect(content).toContain('push:');
            expect(content).toContain('pull_request:');
        });

        it('Test 59: should include test job', () => {
            const content = generateCiWorkflow(DEFAULT_PROJECT_CONFIG);
            expect(content).toContain('test:');
        });

        it('Test 60: should include build job', () => {
            const content = generateCiWorkflow(DEFAULT_PROJECT_CONFIG);
            expect(content).toContain('build:');
        });

        it('Test 61: should setup Node.js', () => {
            const content = generateCiWorkflow(DEFAULT_PROJECT_CONFIG);
            expect(content).toContain('actions/setup-node');
        });

        it('Test 62: should run lint', () => {
            const content = generateCiWorkflow(DEFAULT_PROJECT_CONFIG);
            expect(content).toContain('npm run lint');
        });

        it('Test 63: should include postgres service', () => {
            const content = generateCiWorkflow(DEFAULT_PROJECT_CONFIG);
            expect(content).toContain('postgres:');
        });
    });

    describe('generateDeployWorkflow()', () => {
        it('Test 64: should only run on main branch', () => {
            const content = generateDeployWorkflow(DEFAULT_PROJECT_CONFIG);
            expect(content).toContain('branches: [main]');
        });

        it('Test 65: should have deploy job', () => {
            const content = generateDeployWorkflow(DEFAULT_PROJECT_CONFIG);
            expect(content).toContain('deploy:');
        });
    });

    // ============================================================================
    // Database Seeders Tests
    // ============================================================================
    describe('generateSeeders()', () => {
        it('Test 66: should generate main seeder', () => {
            const plan = createMinimalPlan();
            const files = generateSeeders(plan, DEFAULT_PROJECT_CONFIG);
            expect(files.some(f => f.path.includes('seeds/index.ts'))).toBe(true);
        });

        it('Test 67: should generate user seeder', () => {
            const plan = createMinimalPlan();
            const files = generateSeeders(plan, DEFAULT_PROJECT_CONFIG);
            expect(files.some(f => f.path.includes('seeds/users.ts'))).toBe(true);
        });
    });

    // ============================================================================
    // Configuration Files Tests
    // ============================================================================
    describe('generateHuskyConfig()', () => {
        it('Test 68: should generate pre-commit hook', () => {
            const file = generateHuskyConfig(DEFAULT_PROJECT_CONFIG);
            expect(file.path).toContain('.husky/pre-commit');
        });

        it('Test 69: should run lint-staged', () => {
            const file = generateHuskyConfig(DEFAULT_PROJECT_CONFIG);
            expect(file.content).toContain('lint-staged');
        });
    });

    describe('generatePrettierConfig()', () => {
        it('Test 70: should generate .prettierrc', () => {
            const file = generatePrettierConfig(DEFAULT_PROJECT_CONFIG);
            expect(file.path).toBe('.prettierrc');
        });

        it('Test 71: should set single quotes', () => {
            const file = generatePrettierConfig(DEFAULT_PROJECT_CONFIG);
            const config = JSON.parse(file.content);
            expect(config.singleQuote).toBe(true);
        });
    });

    describe('generateEslintConfig()', () => {
        it('Test 72: should generate .eslintrc.js', () => {
            const file = generateEslintConfig(DEFAULT_PROJECT_CONFIG);
            expect(file.path).toBe('.eslintrc.js');
        });

        it('Test 73: should use TypeScript parser', () => {
            const file = generateEslintConfig(DEFAULT_PROJECT_CONFIG);
            expect(file.content).toContain('@typescript-eslint/parser');
        });
    });

    // ============================================================================
    // Test Setup Tests
    // ============================================================================
    describe('generateTestSetup()', () => {
        it('Test 74: should generate jest.config.js', () => {
            const plan = createMinimalPlan();
            const files = generateTestSetup(plan, DEFAULT_PROJECT_CONFIG);
            expect(files.some(f => f.path === 'jest.config.js')).toBe(true);
        });

        it('Test 75: should configure projects for monorepo', () => {
            const plan = createMinimalPlan();
            const files = generateTestSetup(plan, DEFAULT_PROJECT_CONFIG);
            const jestConfig = files.find(f => f.path === 'jest.config.js');
            expect(jestConfig?.content).toContain('projects');
        });
    });

    // ============================================================================
    // Utility Functions Tests
    // ============================================================================
    describe('generateStructureDescription()', () => {
        it('Test 76: should include project name', () => {
            const files = [{ path: 'package.json', content: '' }];
            const structure = generateStructureDescription(files, DEFAULT_PROJECT_CONFIG);
            expect(structure).toContain(DEFAULT_PROJECT_CONFIG.projectName);
        });

        it('Test 77: should list directories', () => {
            const files = [
                { path: 'frontend/package.json', content: '' },
                { path: 'backend/package.json', content: '' },
            ];
            const structure = generateStructureDescription(files, DEFAULT_PROJECT_CONFIG);
            expect(structure).toContain('frontend/');
            expect(structure).toContain('backend/');
        });
    });

    describe('generateProjectSummary()', () => {
        it('Test 78: should include project name', () => {
            const summary = generateProjectSummary(
                { files: [], components: [], summary: '', warnings: [] },
                { files: [], routes: [], summary: '', warnings: [] },
                DEFAULT_PROJECT_CONFIG,
                []
            );
            expect(summary).toContain(DEFAULT_PROJECT_CONFIG.projectName);
        });

        it('Test 79: should include feature status', () => {
            const summary = generateProjectSummary(
                { files: [], components: [], summary: '', warnings: [] },
                { files: [], routes: [], summary: '', warnings: [] },
                DEFAULT_PROJECT_CONFIG,
                []
            );
            expect(summary).toContain('Docker');
            expect(summary).toContain('GitHub Actions');
        });

        it('Test 80: should include warnings if present', () => {
            const summary = generateProjectSummary(
                { files: [], components: [], summary: '', warnings: [] },
                { files: [], routes: [], summary: '', warnings: [] },
                DEFAULT_PROJECT_CONFIG,
                ['Test warning']
            );
            expect(summary).toContain('Warnings');
            expect(summary).toContain('Test warning');
        });
    });

    // ============================================================================
    // Integration Tests
    // ============================================================================
    describe('Integration Tests', () => {
        it('Test 81: should generate complete project for typical plan', () => {
            const plan = createMinimalPlan();
            const result = generateProject(plan);

            // Core files
            expect(result.files.some(f => f.path === 'package.json')).toBe(true);
            expect(result.files.some(f => f.path === 'README.md')).toBe(true);
            expect(result.files.some(f => f.path === '.gitignore')).toBe(true);

            // Frontend and backend
            expect(result.files.filter(f => f.path.startsWith('frontend/')).length).toBeGreaterThan(0);
            expect(result.files.filter(f => f.path.startsWith('backend/')).length).toBeGreaterThan(0);

            // Results
            expect(result.frontendResult).toBeDefined();
            expect(result.backendResult).toBeDefined();
        });

        it('Test 82: should generate minimal project when all optional features disabled', () => {
            const plan = createMinimalPlan();
            const config: ProjectConfig = {
                ...DEFAULT_PROJECT_CONFIG,
                includeDocker: false,
                includeGithubActions: false,
                includeSeeders: false,
                includeHusky: false,
                includePrettier: false,
                includeEslint: false,
            };
            const result = generateProject(plan, config);

            // Root docker-compose.yml should not exist
            expect(result.files.some(f => f.path === 'docker-compose.yml')).toBe(false);
            expect(result.files.some(f => f.path.startsWith('.github/'))).toBe(false);
            expect(result.files.some(f => f.path.startsWith('.husky/'))).toBe(false);
            expect(result.files.some(f => f.path === '.prettierrc')).toBe(false);
            expect(result.files.some(f => f.path === '.eslintrc.js')).toBe(false);
        });

        it('Test 83: should respect custom project name', () => {
            const plan = createMinimalPlan();
            const config: ProjectConfig = {
                ...DEFAULT_PROJECT_CONFIG,
                projectName: 'my-custom-app',
            };
            const result = generateProject(plan, config);

            const pkgFile = result.files.find(f => f.path === 'package.json');
            expect(pkgFile).toBeDefined();
            const pkg = JSON.parse(pkgFile!.content);
            expect(pkg.name).toBe('my-custom-app');
        });
    });
});
