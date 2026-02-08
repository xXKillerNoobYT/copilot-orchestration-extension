/**
 * Tests for Backend Scaffolding Generator (MT-033.24)
 *
 * Tests for API route generation, database schemas, and backend boilerplate.
 */

import {
    generateBackend,
    extractRoutes,
    storyToRoute,
    featureToRoutes,
    generateCrudRoutes,
    inferHttpMethod,
    inferResource,
    inferQueryParams,
    groupRoutesByResource,
    inferMigrations,
    createMigration,
    generateUpMigration,
    generateRouteFile,
    generateRouteHandler,
    generateErrorHandler,
    generateCorsMiddleware,
    generateAuthMiddleware,
    generateLoggingMiddleware,
    generateDatabaseConfig,
    generateSqlConfig,
    generateMongoConfig,
    generateMigrationFile,
    generateMainIndex,
    generateConfigFile,
    generateEnvFile,
    generatePackageJson,
    generateTsConfig,
    generateDockerfile,
    generateDockerCompose,
    toPascalCase,
    generateSummary,
    DEFAULT_BACKEND_CONFIG,
    BackendConfig,
    APIRoute,
    HttpMethod,
    METHOD_VERBS,
    SQL_TYPES,
} from '../../src/generators/backendGenerator';
import { CompletePlan, DeveloperStory, FeatureBlock, PriorityLevel } from '../../src/planning/types';

describe('Backend Scaffolding Generator', () => {
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
            name: 'Test Backend',
            description: 'A test backend API',
            goals: ['Build API'],
        },
        featureBlocks: [],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [],
        developerStories: [],
        successCriteria: [],
    });

    const createDeveloperStory = (
        id: string,
        action: string,
        apiNotes: string = '',
        databaseNotes: string = ''
    ): DeveloperStory => ({
        id,
        action,
        benefit: 'Provide value',
        technicalRequirements: ['TypeScript'],
        apiNotes,
        databaseNotes,
        estimatedHours: 2,
        relatedBlockIds: [],
        relatedTaskIds: [],
    });

    const createFeature = (
        id: string,
        name: string,
        technicalNotes: string = ''
    ): FeatureBlock => ({
        id,
        name,
        description: `Description of ${name}`,
        purpose: `Purpose of ${name}`,
        acceptanceCriteria: ['AC 1'],
        technicalNotes,
        priority: 'medium' as PriorityLevel,
        order: 1,
    });

    const createPlanWithStories = (stories: DeveloperStory[]): CompletePlan => {
        const plan = createMinimalPlan();
        plan.developerStories = stories;
        return plan;
    };

    // ============================================================================
    // DEFAULT_BACKEND_CONFIG Tests
    // ============================================================================
    describe('DEFAULT_BACKEND_CONFIG', () => {
        it('Test 1: should have express-ts as default framework', () => {
            expect(DEFAULT_BACKEND_CONFIG.framework).toBe('express-ts');
        });

        it('Test 2: should have postgresql as default database', () => {
            expect(DEFAULT_BACKEND_CONFIG.database).toBe('postgresql');
        });

        it('Test 3: should include auth by default', () => {
            expect(DEFAULT_BACKEND_CONFIG.includeAuth).toBe(true);
        });

        it('Test 4: should have jwt as default auth type', () => {
            expect(DEFAULT_BACKEND_CONFIG.authType).toBe('jwt');
        });

        it('Test 5: should include CORS by default', () => {
            expect(DEFAULT_BACKEND_CONFIG.includeCors).toBe(true);
        });

        it('Test 6: should include logging by default', () => {
            expect(DEFAULT_BACKEND_CONFIG.includeLogging).toBe(true);
        });

        it('Test 7: should include Docker by default', () => {
            expect(DEFAULT_BACKEND_CONFIG.includeDocker).toBe(true);
        });
    });

    // ============================================================================
    // METHOD_VERBS Tests
    // ============================================================================
    describe('METHOD_VERBS', () => {
        it('Test 8: should map get to GET', () => {
            expect(METHOD_VERBS.get).toBe('GET');
        });

        it('Test 9: should map create to POST', () => {
            expect(METHOD_VERBS.create).toBe('POST');
        });

        it('Test 10: should map update to PUT', () => {
            expect(METHOD_VERBS.update).toBe('PUT');
        });

        it('Test 11: should map delete to DELETE', () => {
            expect(METHOD_VERBS.delete).toBe('DELETE');
        });
    });

    // ============================================================================
    // SQL_TYPES Tests
    // ============================================================================
    describe('SQL_TYPES', () => {
        it('Test 12: should have postgresql types', () => {
            expect(SQL_TYPES.postgresql).toBeDefined();
            expect(SQL_TYPES.postgresql.id).toContain('SERIAL');
        });

        it('Test 13: should have mysql types', () => {
            expect(SQL_TYPES.mysql).toBeDefined();
            expect(SQL_TYPES.mysql.id).toContain('AUTO_INCREMENT');
        });

        it('Test 14: should have sqlite types', () => {
            expect(SQL_TYPES.sqlite).toBeDefined();
            expect(SQL_TYPES.sqlite.id).toContain('AUTOINCREMENT');
        });
    });

    // ============================================================================
    // generateBackend Tests
    // ============================================================================
    describe('generateBackend()', () => {
        it('Test 15: should return files array', () => {
            const plan = createPlanWithStories([createDeveloperStory('d1', 'Create user endpoint')]);
            const result = generateBackend(plan);
            expect(Array.isArray(result.files)).toBe(true);
            expect(result.files.length).toBeGreaterThan(0);
        });

        it('Test 16: should return summary string', () => {
            const plan = createPlanWithStories([createDeveloperStory('d1', 'Create user endpoint')]);
            const result = generateBackend(plan);
            expect(typeof result.summary).toBe('string');
        });

        it('Test 17: should return routes array', () => {
            const plan = createPlanWithStories([createDeveloperStory('d1', 'Create user endpoint')]);
            const result = generateBackend(plan);
            expect(Array.isArray(result.routes)).toBe(true);
        });

        it('Test 18: should return warnings array', () => {
            const plan = createMinimalPlan();
            const result = generateBackend(plan);
            expect(Array.isArray(result.warnings)).toBe(true);
        });

        it('Test 19: should warn when no routes found', () => {
            const plan = createMinimalPlan();
            const result = generateBackend(plan);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain('No API routes');
        });

        it('Test 20: should generate auth middleware when configured', () => {
            const plan = createPlanWithStories([createDeveloperStory('d1', 'Create user')]);
            const config: BackendConfig = { ...DEFAULT_BACKEND_CONFIG, includeAuth: true };
            const result = generateBackend(plan, config);
            expect(result.files.some(f => f.path.includes('auth.ts'))).toBe(true);
        });

        it('Test 21: should skip Docker when disabled', () => {
            const plan = createPlanWithStories([createDeveloperStory('d1', 'Create user')]);
            const config: BackendConfig = { ...DEFAULT_BACKEND_CONFIG, includeDocker: false };
            const result = generateBackend(plan, config);
            expect(result.files.some(f => f.path.includes('Dockerfile'))).toBe(false);
        });
    });

    // ============================================================================
    // extractRoutes Tests
    // ============================================================================
    describe('extractRoutes()', () => {
        it('Test 22: should extract routes from developer stories', () => {
            const plan = createPlanWithStories([
                createDeveloperStory('d1', 'Create user endpoint'),
                createDeveloperStory('d2', 'Get products list'),
            ]);
            const routes = extractRoutes(plan);
            expect(routes.length).toBeGreaterThanOrEqual(2);
        });

        it('Test 23: should extract routes from features', () => {
            const plan = createMinimalPlan();
            plan.featureBlocks = [createFeature('f1', 'User Management')];
            const routes = extractRoutes(plan);
            expect(routes.length).toBeGreaterThan(0);
        });

        it('Test 24: should not duplicate routes', () => {
            const plan = createPlanWithStories([createDeveloperStory('d1', 'Create user')]);
            plan.featureBlocks = [createFeature('f1', 'User CRUD')];
            const routes = extractRoutes(plan);
            const uniquePaths = new Set(routes.map(r => `${r.method} ${r.path}`));
            expect(routes.length).toBe(uniquePaths.size);
        });
    });

    // ============================================================================
    // storyToRoute Tests
    // ============================================================================
    describe('storyToRoute()', () => {
        it('Test 25: should create route from story', () => {
            const story = createDeveloperStory('d1', 'Create user endpoint');
            const route = storyToRoute(story);
            expect(route).not.toBeNull();
            expect(route?.method).toBe('POST');
        });

        it('Test 26: should infer POST for create actions', () => {
            const story = createDeveloperStory('d1', 'Create new product');
            const route = storyToRoute(story);
            expect(route?.method).toBe('POST');
        });

        it('Test 27: should infer GET for fetch actions', () => {
            const story = createDeveloperStory('d1', 'Fetch user profile');
            const route = storyToRoute(story);
            expect(route?.method).toBe('GET');
        });

        it('Test 28: should set requiresAuth for protected routes', () => {
            const story = createDeveloperStory('d1', 'Create user', 'Protected endpoint');
            const route = storyToRoute(story);
            expect(route?.requiresAuth).toBe(true);
        });

        it('Test 29: should return null if no resource found', () => {
            const story = createDeveloperStory('d1', 'Do something');
            const route = storyToRoute(story);
            expect(route).toBeNull();
        });
    });

    // ============================================================================
    // featureToRoutes Tests
    // ============================================================================
    describe('featureToRoutes()', () => {
        it('Test 30: should generate CRUD routes for management features', () => {
            const feature = createFeature('f1', 'User Management');
            const routes = featureToRoutes(feature);
            expect(routes.length).toBe(5); // GET, GET/:id, POST, PUT, DELETE
        });

        it('Test 31: should generate CRUD routes for CRUD features', () => {
            const feature = createFeature('f1', 'Product CRUD');
            const routes = featureToRoutes(feature);
            expect(routes.length).toBe(5);
        });

        it('Test 32: should return empty for non-CRUD features', () => {
            const feature = createFeature('f1', 'Dashboard View');
            const routes = featureToRoutes(feature);
            expect(routes.length).toBe(0);
        });
    });

    // ============================================================================
    // generateCrudRoutes Tests
    // ============================================================================
    describe('generateCrudRoutes()', () => {
        it('Test 33: should generate 5 CRUD routes', () => {
            const routes = generateCrudRoutes('user');
            expect(routes.length).toBe(5);
        });

        it('Test 34: should include list route', () => {
            const routes = generateCrudRoutes('user');
            expect(routes.some(r => r.method === 'GET' && r.path === '/users')).toBe(true);
        });

        it('Test 35: should include get by id route', () => {
            const routes = generateCrudRoutes('user');
            expect(routes.some(r => r.method === 'GET' && r.path.includes(':id'))).toBe(true);
        });

        it('Test 36: should include create route', () => {
            const routes = generateCrudRoutes('user');
            expect(routes.some(r => r.method === 'POST')).toBe(true);
        });

        it('Test 37: should include update route', () => {
            const routes = generateCrudRoutes('user');
            expect(routes.some(r => r.method === 'PUT')).toBe(true);
        });

        it('Test 38: should include delete route', () => {
            const routes = generateCrudRoutes('user');
            expect(routes.some(r => r.method === 'DELETE')).toBe(true);
        });
    });

    // ============================================================================
    // inferHttpMethod Tests
    // ============================================================================
    describe('inferHttpMethod()', () => {
        it('Test 39: should infer GET for get action', () => {
            expect(inferHttpMethod('get user')).toBe('GET');
        });

        it('Test 40: should infer POST for create action', () => {
            expect(inferHttpMethod('create user')).toBe('POST');
        });

        it('Test 41: should infer PUT for update action', () => {
            expect(inferHttpMethod('update user')).toBe('PUT');
        });

        it('Test 42: should infer DELETE for delete action', () => {
            expect(inferHttpMethod('delete user')).toBe('DELETE');
        });

        it('Test 43: should default to GET for unknown actions', () => {
            expect(inferHttpMethod('process data')).toBe('GET');
        });
    });

    // ============================================================================
    // inferResource Tests
    // ============================================================================
    describe('inferResource()', () => {
        it('Test 44: should extract resource from create action', () => {
            expect(inferResource('create user')).toBe('user');
        });

        it('Test 45: should extract resource from get action', () => {
            expect(inferResource('get products')).toBe('products');
        });

        it('Test 46: should extract resource from endpoint pattern', () => {
            expect(inferResource('user endpoint')).toBe('user');
        });

        it('Test 47: should return null for no resource', () => {
            expect(inferResource('do something')).toBeNull();
        });
    });

    // ============================================================================
    // inferQueryParams Tests
    // ============================================================================
    describe('inferQueryParams()', () => {
        it('Test 48: should infer pagination params', () => {
            const story = createDeveloperStory('d1', 'List users', 'Paginated response');
            const params = inferQueryParams(story);
            expect(params.some(p => p.name === 'page')).toBe(true);
            expect(params.some(p => p.name === 'limit')).toBe(true);
        });

        it('Test 49: should infer filter params', () => {
            const story = createDeveloperStory('d1', 'List users', 'Support filtering');
            const params = inferQueryParams(story);
            expect(params.some(p => p.name === 'filter')).toBe(true);
        });

        it('Test 50: should infer sort params', () => {
            const story = createDeveloperStory('d1', 'List users', 'Support sorting');
            const params = inferQueryParams(story);
            expect(params.some(p => p.name === 'sortBy')).toBe(true);
        });
    });

    // ============================================================================
    // groupRoutesByResource Tests
    // ============================================================================
    describe('groupRoutesByResource()', () => {
        it('Test 51: should group routes by resource', () => {
            const routes: APIRoute[] = [
                { method: 'GET', path: '/users', handler: 'getUsers', responseType: 'User[]', description: '', requiresAuth: false, queryParams: [] },
                { method: 'POST', path: '/users', handler: 'createUser', responseType: 'User', description: '', requiresAuth: false, queryParams: [] },
                { method: 'GET', path: '/products', handler: 'getProducts', responseType: 'Product[]', description: '', requiresAuth: false, queryParams: [] },
            ];
            const groups = groupRoutesByResource(routes);
            expect(Object.keys(groups)).toContain('users');
            expect(Object.keys(groups)).toContain('products');
        });

        it('Test 52: should group multiple routes for same resource', () => {
            const routes: APIRoute[] = [
                { method: 'GET', path: '/users', handler: 'getUsers', responseType: 'User[]', description: '', requiresAuth: false, queryParams: [] },
                { method: 'POST', path: '/users', handler: 'createUser', responseType: 'User', description: '', requiresAuth: false, queryParams: [] },
            ];
            const groups = groupRoutesByResource(routes);
            expect(groups.users.length).toBe(2);
        });
    });

    // ============================================================================
    // inferMigrations Tests
    // ============================================================================
    describe('inferMigrations()', () => {
        it('Test 53: should infer migrations from stories', () => {
            const plan = createPlanWithStories([
                createDeveloperStory('d1', 'Create user endpoint', '', 'Store users'),
            ]);
            const migrations = inferMigrations(plan, DEFAULT_BACKEND_CONFIG);
            expect(migrations.length).toBeGreaterThan(0);
        });

        it('Test 54: should include timestamp columns', () => {
            const plan = createPlanWithStories([createDeveloperStory('d1', 'Create user')]);
            const migrations = inferMigrations(plan, DEFAULT_BACKEND_CONFIG);
            if (migrations.length > 0) {
                expect(migrations[0].columns.some(c => c.name === 'created_at')).toBe(true);
            }
        });
    });

    // ============================================================================
    // createMigration Tests
    // ============================================================================
    describe('createMigration()', () => {
        it('Test 55: should create migration with table name', () => {
            const migration = createMigration('user', '', DEFAULT_BACKEND_CONFIG);
            expect(migration.table).toBe('users');
        });

        it('Test 56: should include id column', () => {
            const migration = createMigration('user', '', DEFAULT_BACKEND_CONFIG);
            expect(migration.columns.some(c => c.name === 'id')).toBe(true);
        });

        it('Test 57: should include name column when noted', () => {
            const migration = createMigration('product', 'Store product name', DEFAULT_BACKEND_CONFIG);
            expect(migration.columns.some(c => c.name === 'name')).toBe(true);
        });
    });

    // ============================================================================
    // generateUpMigration Tests
    // ============================================================================
    describe('generateUpMigration()', () => {
        it('Test 58: should generate CREATE TABLE statement', () => {
            const columns = [
                { name: 'id', type: 'SERIAL PRIMARY KEY', nullable: false, primaryKey: true, unique: true },
            ];
            const sql = generateUpMigration('users', columns, SQL_TYPES.postgresql);
            expect(sql).toContain('CREATE TABLE');
            expect(sql).toContain('users');
        });
    });

    // ============================================================================
    // Code Generation Tests
    // ============================================================================
    describe('generateRouteFile()', () => {
        const mockRoute: APIRoute = {
            method: 'GET',
            path: '/users',
            handler: 'getUsers',
            responseType: 'User[]',
            description: 'Get all users',
            requiresAuth: false,
            queryParams: [],
        };

        it('Test 59: should generate route file', () => {
            const file = generateRouteFile('users', [mockRoute], DEFAULT_BACKEND_CONFIG);
            expect(file.path).toContain('users.ts');
            expect(file.content).toContain('Router');
        });

        it('Test 60: should include express imports', () => {
            const file = generateRouteFile('users', [mockRoute], DEFAULT_BACKEND_CONFIG);
            expect(file.content).toContain('import { Router');
        });
    });

    describe('generateRouteHandler()', () => {
        const mockRoute: APIRoute = {
            method: 'POST',
            path: '/users',
            handler: 'createUser',
            responseType: 'User',
            description: 'Create user',
            requiresAuth: false,
            queryParams: [],
        };

        it('Test 61: should generate async function', () => {
            const handler = generateRouteHandler(mockRoute, DEFAULT_BACKEND_CONFIG);
            expect(handler).toContain('async function');
        });

        it('Test 62: should include try-catch', () => {
            const handler = generateRouteHandler(mockRoute, DEFAULT_BACKEND_CONFIG);
            expect(handler).toContain('try {');
            expect(handler).toContain('catch');
        });

        it('Test 63: should use 201 status for POST', () => {
            const handler = generateRouteHandler(mockRoute, DEFAULT_BACKEND_CONFIG);
            expect(handler).toContain('201');
        });
    });

    describe('generateErrorHandler()', () => {
        it('Test 64: should generate error handler', () => {
            const file = generateErrorHandler(DEFAULT_BACKEND_CONFIG);
            expect(file.path).toContain('errorHandler.ts');
            expect(file.content).toContain('errorHandler');
        });
    });

    describe('generateCorsMiddleware()', () => {
        it('Test 65: should generate CORS middleware', () => {
            const file = generateCorsMiddleware(DEFAULT_BACKEND_CONFIG);
            expect(file.path).toContain('cors.ts');
            expect(file.content).toContain('cors');
        });
    });

    describe('generateAuthMiddleware()', () => {
        it('Test 66: should generate JWT auth middleware', () => {
            const file = generateAuthMiddleware(DEFAULT_BACKEND_CONFIG);
            expect(file.path).toContain('auth.ts');
            expect(file.content).toContain('jwt');
        });

        it('Test 67: should include generateToken function', () => {
            const file = generateAuthMiddleware(DEFAULT_BACKEND_CONFIG);
            expect(file.content).toContain('generateToken');
        });
    });

    describe('generateLoggingMiddleware()', () => {
        it('Test 68: should generate winston logger', () => {
            const file = generateLoggingMiddleware(DEFAULT_BACKEND_CONFIG);
            expect(file.path).toContain('logger.ts');
            expect(file.content).toContain('winston');
        });
    });

    describe('generateDatabaseConfig()', () => {
        it('Test 69: should generate SQL config for postgresql', () => {
            const file = generateDatabaseConfig(DEFAULT_BACKEND_CONFIG);
            expect(file.content).toContain('Pool');
        });

        it('Test 70: should generate MongoDB config', () => {
            const config: BackendConfig = { ...DEFAULT_BACKEND_CONFIG, database: 'mongodb' };
            const file = generateDatabaseConfig(config);
            expect(file.content).toContain('mongoose');
        });
    });

    describe('generateMainIndex()', () => {
        it('Test 71: should generate main index file', () => {
            const routes: APIRoute[] = [{ method: 'GET', path: '/users', handler: 'getUsers', responseType: 'User[]', description: '', requiresAuth: false, queryParams: [] }];
            const file = generateMainIndex(routes, DEFAULT_BACKEND_CONFIG);
            expect(file.path).toContain('index.ts');
            expect(file.content).toContain('express');
        });

        it('Test 72: should include health check endpoint', () => {
            const file = generateMainIndex([], DEFAULT_BACKEND_CONFIG);
            expect(file.content).toContain('/health');
        });
    });

    describe('generateConfigFile()', () => {
        it('Test 73: should generate config with zod validation', () => {
            const file = generateConfigFile(DEFAULT_BACKEND_CONFIG);
            expect(file.content).toContain('zod');
        });
    });

    describe('generateEnvFile()', () => {
        it('Test 74: should generate .env.example', () => {
            const file = generateEnvFile(DEFAULT_BACKEND_CONFIG);
            expect(file.path).toContain('.env.example');
            expect(file.content).toContain('NODE_ENV');
        });

        it('Test 75: should include database URL', () => {
            const file = generateEnvFile(DEFAULT_BACKEND_CONFIG);
            expect(file.content).toContain('DATABASE_URL');
        });
    });

    describe('generatePackageJson()', () => {
        it('Test 76: should generate package.json', () => {
            const file = generatePackageJson(DEFAULT_BACKEND_CONFIG);
            expect(file.path).toContain('package.json');
            const pkg = JSON.parse(file.content);
            expect(pkg.name).toBe(DEFAULT_BACKEND_CONFIG.packageName);
        });

        it('Test 77: should include express dependency', () => {
            const file = generatePackageJson(DEFAULT_BACKEND_CONFIG);
            const pkg = JSON.parse(file.content);
            expect(pkg.dependencies.express).toBeDefined();
        });

        it('Test 78: should include scripts', () => {
            const file = generatePackageJson(DEFAULT_BACKEND_CONFIG);
            const pkg = JSON.parse(file.content);
            expect(pkg.scripts.dev).toBeDefined();
            expect(pkg.scripts.build).toBeDefined();
        });
    });

    describe('generateTsConfig()', () => {
        it('Test 79: should generate tsconfig.json', () => {
            const file = generateTsConfig(DEFAULT_BACKEND_CONFIG);
            expect(file.path).toContain('tsconfig.json');
            const config = JSON.parse(file.content);
            expect(config.compilerOptions.strict).toBe(true);
        });
    });

    describe('generateDockerfile()', () => {
        it('Test 80: should generate Dockerfile', () => {
            const file = generateDockerfile(DEFAULT_BACKEND_CONFIG);
            expect(file.path).toContain('Dockerfile');
            expect(file.content).toContain('FROM node');
        });

        it('Test 81: should use multi-stage build', () => {
            const file = generateDockerfile(DEFAULT_BACKEND_CONFIG);
            expect(file.content).toContain('AS builder');
        });
    });

    describe('generateDockerCompose()', () => {
        it('Test 82: should generate docker-compose.yml', () => {
            const file = generateDockerCompose(DEFAULT_BACKEND_CONFIG);
            expect(file.path).toContain('docker-compose.yml');
            expect(file.content).toContain('services');
        });

        it('Test 83: should include database service for postgresql', () => {
            const file = generateDockerCompose(DEFAULT_BACKEND_CONFIG);
            expect(file.content).toContain('postgres');
        });

        it('Test 84: should include mongodb service when configured', () => {
            const config: BackendConfig = { ...DEFAULT_BACKEND_CONFIG, database: 'mongodb' };
            const file = generateDockerCompose(config);
            expect(file.content).toContain('mongo');
        });
    });

    // ============================================================================
    // Utility Function Tests
    // ============================================================================
    describe('toPascalCase()', () => {
        it('Test 85: should convert dash-case', () => {
            expect(toPascalCase('user-profile')).toBe('UserProfile');
        });

        it('Test 86: should convert space-separated', () => {
            expect(toPascalCase('user profile')).toBe('UserProfile');
        });
    });

    describe('generateSummary()', () => {
        it('Test 87: should include route count', () => {
            const routes: APIRoute[] = [{ method: 'GET', path: '/users', handler: 'get', responseType: '', description: '', requiresAuth: false, queryParams: [] }];
            const summary = generateSummary(routes, [], DEFAULT_BACKEND_CONFIG);
            expect(summary).toContain('1');
        });

        it('Test 88: should include framework name', () => {
            const summary = generateSummary([], [], DEFAULT_BACKEND_CONFIG);
            expect(summary).toContain('express-ts');
        });
    });

    // ============================================================================
    // Integration Tests
    // ============================================================================
    describe('Integration Tests', () => {
        it('Test 89: should generate complete backend for user API', () => {
            const plan = createPlanWithStories([
                createDeveloperStory('d1', 'Create user endpoint', 'Protected', 'Store in database'),
                createDeveloperStory('d2', 'Get user profile', 'Paginated'),
            ]);
            const result = generateBackend(plan);

            expect(result.routes.length).toBeGreaterThanOrEqual(2);
            expect(result.files.length).toBeGreaterThan(5);
            expect(result.warnings.length).toBe(0);
        });

        it('Test 90: should handle feature-based CRUD generation', () => {
            const plan = createMinimalPlan();
            plan.featureBlocks = [
                createFeature('f1', 'Product Management'),
                createFeature('f2', 'Order Management'),
            ];
            const result = generateBackend(plan);

            expect(result.routes.length).toBe(10); // 5 CRUD × 2 resources
        });

        it('Test 91: should skip optional features when disabled', () => {
            const plan = createPlanWithStories([createDeveloperStory('d1', 'Create user')]);
            const config: BackendConfig = {
                ...DEFAULT_BACKEND_CONFIG,
                includeAuth: false,
                includeCors: false,
                includeLogging: false,
                includeDocker: false,
            };
            const result = generateBackend(plan, config);

            expect(result.files.some(f => f.path.includes('auth.ts'))).toBe(false);
            expect(result.files.some(f => f.path.includes('cors.ts'))).toBe(false);
            expect(result.files.some(f => f.path.includes('Dockerfile'))).toBe(false);
        });
    });
});
