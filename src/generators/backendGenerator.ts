/**
 * Backend Scaffolding Generator (MT-033.24)
 *
 * **Simple explanation**: Generates production-ready backend server code from
 * your developer stories. Creates RESTful APIs, database schemas, authentication,
 * and all the boilerplate you need to start building your server.
 *
 * @module generators/backendGenerator
 */

import { CompletePlan, DeveloperStory, FeatureBlock } from '../planning/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for backend code generation.
 */
export interface BackendConfig {
    /** Backend framework/runtime */
    framework: BackendFramework;
    /** Database to use */
    database: DatabaseType;
    /** Include authentication boilerplate */
    includeAuth: boolean;
    /** Authentication type */
    authType: AuthType;
    /** Include CORS configuration */
    includeCors: boolean;
    /** Include logging setup */
    includeLogging: boolean;
    /** Include Docker configuration */
    includeDocker: boolean;
    /** Base directory for generated files */
    baseDir: string;
    /** Package name */
    packageName: string;
}

/**
 * Supported backend frameworks.
 */
export type BackendFramework = 'express-ts' | 'fastify-ts' | 'nest-ts' | 'flask-py' | 'fastapi-py';

/**
 * Supported databases.
 */
export type DatabaseType = 'postgresql' | 'mysql' | 'sqlite' | 'mongodb' | 'none';

/**
 * Authentication types.
 */
export type AuthType = 'jwt' | 'session' | 'oauth' | 'none';

/**
 * Route extracted from a developer story.
 */
export interface APIRoute {
    /** HTTP method */
    method: HttpMethod;
    /** URL path */
    path: string;
    /** Handler name */
    handler: string;
    /** Response type */
    responseType: string;
    /** Request body type (if applicable) */
    requestBody?: string;
    /** Query parameters */
    queryParams: QueryParam[];
    /** Route description */
    description: string;
    /** Whether route requires authentication */
    requiresAuth: boolean;
}

/**
 * HTTP methods.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Query parameter definition.
 */
export interface QueryParam {
    name: string;
    type: string;
    required: boolean;
    description?: string;
}

/**
 * Database migration definition.
 */
export interface Migration {
    /** Migration name */
    name: string;
    /** Table name */
    table: string;
    /** Columns to create */
    columns: ColumnDefinition[];
    /** Up migration SQL */
    up: string;
    /** Down migration SQL */
    down: string;
}

/**
 * Column definition for migrations.
 */
export interface ColumnDefinition {
    name: string;
    type: string;
    nullable: boolean;
    primaryKey: boolean;
    unique: boolean;
    defaultValue?: string;
    references?: { table: string; column: string };
}

/**
 * Result of backend generation.
 */
export interface BackendResult {
    /** Generated files */
    files: GeneratedBackendFile[];
    /** Summary of what was generated */
    summary: string;
    /** Routes that were created */
    routes: APIRoute[];
    /** Warnings or suggestions */
    warnings: string[];
}

/**
 * A generated backend file.
 */
export interface GeneratedBackendFile {
    /** Relative file path */
    path: string;
    /** File content */
    content: string;
    /** File description */
    description: string;
    /** File type */
    type: 'route' | 'middleware' | 'model' | 'config' | 'migration' | 'test' | 'index';
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_BACKEND_CONFIG: BackendConfig = {
    framework: 'express-ts',
    database: 'postgresql',
    includeAuth: true,
    authType: 'jwt',
    includeCors: true,
    includeLogging: true,
    includeDocker: true,
    baseDir: 'backend',
    packageName: 'my-api',
};

/**
 * Maps HTTP methods to action verbs.
 */
export const METHOD_VERBS: Record<string, HttpMethod> = {
    'get': 'GET',
    'fetch': 'GET',
    'retrieve': 'GET',
    'list': 'GET',
    'read': 'GET',
    'create': 'POST',
    'add': 'POST',
    'insert': 'POST',
    'update': 'PUT',
    'modify': 'PUT',
    'edit': 'PUT',
    'patch': 'PATCH',
    'delete': 'DELETE',
    'remove': 'DELETE',
};

/**
 * Maps database types to SQL types.
 */
export const SQL_TYPES: Record<string, Record<string, string>> = {
    postgresql: {
        id: 'SERIAL PRIMARY KEY',
        string: 'VARCHAR(255)',
        text: 'TEXT',
        integer: 'INTEGER',
        boolean: 'BOOLEAN',
        timestamp: 'TIMESTAMP WITH TIME ZONE',
        json: 'JSONB',
    },
    mysql: {
        id: 'INT AUTO_INCREMENT PRIMARY KEY',
        string: 'VARCHAR(255)',
        text: 'TEXT',
        integer: 'INT',
        boolean: 'TINYINT(1)',
        timestamp: 'DATETIME',
        json: 'JSON',
    },
    sqlite: {
        id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
        string: 'TEXT',
        text: 'TEXT',
        integer: 'INTEGER',
        boolean: 'INTEGER',
        timestamp: 'TEXT',
        json: 'TEXT',
    },
};

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate backend code from a plan.
 *
 * **Simple explanation**: Takes your developer stories and creates a complete
 * backend server with API routes, database connections, authentication, and
 * all the configuration you need.
 */
export function generateBackend(
    plan: CompletePlan,
    config: BackendConfig = DEFAULT_BACKEND_CONFIG
): BackendResult {
    const files: GeneratedBackendFile[] = [];
    const warnings: string[] = [];

    // Extract routes from developer stories
    const routes = extractRoutes(plan);

    // Generate route files
    const routeGroups = groupRoutesByResource(routes);
    for (const [resource, resourceRoutes] of Object.entries(routeGroups)) {
        files.push(generateRouteFile(resource, resourceRoutes, config));
    }

    // Generate middleware files
    files.push(generateErrorHandler(config));
    if (config.includeCors) {
        files.push(generateCorsMiddleware(config));
    }
    if (config.includeAuth) {
        files.push(generateAuthMiddleware(config));
    }
    if (config.includeLogging) {
        files.push(generateLoggingMiddleware(config));
    }

    // Generate database files
    if (config.database !== 'none') {
        files.push(generateDatabaseConfig(config));
        const migrations = inferMigrations(plan, config);
        for (const migration of migrations) {
            files.push(generateMigrationFile(migration, config));
        }
    }

    // Generate configuration files
    files.push(generateMainIndex(routes, config));
    files.push(generateConfigFile(config));
    files.push(generateEnvFile(config));
    files.push(generatePackageJson(config));
    files.push(generateTsConfig(config));

    // Generate Docker files if requested
    if (config.includeDocker) {
        files.push(generateDockerfile(config));
        files.push(generateDockerCompose(config));
    }

    // Collect warnings
    if (routes.length === 0) {
        warnings.push('No API routes could be extracted from the plan. Consider adding developer stories.');
    }

    return {
        files,
        summary: generateSummary(routes, files, config),
        routes,
        warnings,
    };
}

// ============================================================================
// Route Extraction
// ============================================================================

/**
 * Extract API routes from developer stories.
 *
 * **Simple explanation**: Looks at your developer stories and figures out what
 * API endpoints you need (like GET /users, POST /login).
 */
export function extractRoutes(plan: CompletePlan): APIRoute[] {
    const routes: APIRoute[] = [];

    // Extract from developer stories
    for (const story of plan.developerStories) {
        const route = storyToRoute(story);
        if (route) {
            routes.push(route);
        }
    }

    // Extract additional routes from features
    for (const feature of plan.featureBlocks) {
        const featureRoutes = featureToRoutes(feature);
        for (const route of featureRoutes) {
            if (!routes.some(r => r.path === route.path && r.method === route.method)) {
                routes.push(route);
            }
        }
    }

    return routes;
}

/**
 * Convert a developer story to an API route.
 */
export function storyToRoute(story: DeveloperStory): APIRoute | null {
    const method = inferHttpMethod(story.action);
    const resource = inferResource(story.action);

    if (!resource) {
        return null;
    }

    return {
        method,
        path: `/${resource}`,
        handler: `${method.toLowerCase()}${toPascalCase(resource)}`,
        responseType: `${toPascalCase(resource)}${method === 'GET' ? '[]' : ''}`,
        description: story.action,
        requiresAuth: story.action.toLowerCase().includes('auth') ||
            story.apiNotes.toLowerCase().includes('protected'),
        queryParams: inferQueryParams(story),
    };
}

/**
 * Extract routes from a feature block.
 */
export function featureToRoutes(feature: FeatureBlock): APIRoute[] {
    const routes: APIRoute[] = [];
    const name = feature.name.toLowerCase();

    // Check for CRUD patterns
    if (name.includes('management') || name.includes('crud')) {
        const resource = name.replace(/management|crud/gi, '').trim();
        routes.push(...generateCrudRoutes(resource));
    }

    return routes;
}

/**
 * Generate standard CRUD routes for a resource.
 */
export function generateCrudRoutes(resource: string): APIRoute[] {
    const singular = resource.replace(/s$/, '');
    const plural = singular + 's';

    return [
        {
            method: 'GET',
            path: `/${plural}`,
            handler: `list${toPascalCase(plural)}`,
            responseType: `${toPascalCase(singular)}[]`,
            description: `List all ${plural}`,
            requiresAuth: false,
            queryParams: [
                { name: 'page', type: 'number', required: false },
                { name: 'limit', type: 'number', required: false },
            ],
        },
        {
            method: 'GET',
            path: `/${plural}/:id`,
            handler: `get${toPascalCase(singular)}`,
            responseType: toPascalCase(singular),
            description: `Get a single ${singular}`,
            requiresAuth: false,
            queryParams: [],
        },
        {
            method: 'POST',
            path: `/${plural}`,
            handler: `create${toPascalCase(singular)}`,
            responseType: toPascalCase(singular),
            requestBody: `Create${toPascalCase(singular)}Input`,
            description: `Create a new ${singular}`,
            requiresAuth: true,
            queryParams: [],
        },
        {
            method: 'PUT',
            path: `/${plural}/:id`,
            handler: `update${toPascalCase(singular)}`,
            responseType: toPascalCase(singular),
            requestBody: `Update${toPascalCase(singular)}Input`,
            description: `Update a ${singular}`,
            requiresAuth: true,
            queryParams: [],
        },
        {
            method: 'DELETE',
            path: `/${plural}/:id`,
            handler: `delete${toPascalCase(singular)}`,
            responseType: 'void',
            description: `Delete a ${singular}`,
            requiresAuth: true,
            queryParams: [],
        },
    ];
}

/**
 * Infer HTTP method from action string.
 */
export function inferHttpMethod(action: string): HttpMethod {
    const actionLower = action.toLowerCase();

    for (const [verb, method] of Object.entries(METHOD_VERBS)) {
        if (actionLower.includes(verb)) {
            return method;
        }
    }

    return 'GET';
}

/**
 * Infer resource name from action string.
 */
export function inferResource(action: string): string | null {
    const actionLower = action.toLowerCase();

    // Common resource patterns
    const patterns = [
        /(?:create|add|insert|get|fetch|list|update|delete|remove)\s+(?:a\s+)?(\w+)/i,
        /(\w+)\s+(?:endpoint|api|route)/i,
        /manage\s+(\w+)/i,
    ];

    for (const pattern of patterns) {
        const match = actionLower.match(pattern);
        if (match && match[1]) {
            return match[1].toLowerCase();
        }
    }

    return null;
}

/**
 * Infer query parameters from developer story.
 */
export function inferQueryParams(story: DeveloperStory): QueryParam[] {
    const params: QueryParam[] = [];
    const apiNotes = story.apiNotes.toLowerCase();

    if (apiNotes.includes('pagination') || apiNotes.includes('paginated')) {
        params.push({ name: 'page', type: 'number', required: false });
        params.push({ name: 'limit', type: 'number', required: false });
    }

    if (apiNotes.includes('filter') || apiNotes.includes('search')) {
        params.push({ name: 'filter', type: 'string', required: false });
    }

    if (apiNotes.includes('sort')) {
        params.push({ name: 'sortBy', type: 'string', required: false });
        params.push({ name: 'order', type: 'string', required: false });
    }

    return params;
}

/**
 * Group routes by their resource name.
 */
export function groupRoutesByResource(routes: APIRoute[]): Record<string, APIRoute[]> {
    const groups: Record<string, APIRoute[]> = {};

    for (const route of routes) {
        const resource = route.path.split('/')[1]?.replace(/:\w+/g, '') || 'default';
        if (!groups[resource]) {
            groups[resource] = [];
        }
        groups[resource].push(route);
    }

    return groups;
}

// ============================================================================
// Migration Inference
// ============================================================================

/**
 * Infer database migrations from the plan.
 */
export function inferMigrations(plan: CompletePlan, config: BackendConfig): Migration[] {
    const migrations: Migration[] = [];
    const tables = new Set<string>();

    // Infer from developer stories
    for (const story of plan.developerStories) {
        const resource = inferResource(story.action);
        if (resource && !tables.has(resource)) {
            tables.add(resource);
            migrations.push(createMigration(resource, story.databaseNotes, config));
        }
    }

    // Infer from features
    for (const feature of plan.featureBlocks) {
        const name = feature.name.toLowerCase().replace(/\s+/g, '_');
        if (!tables.has(name) && feature.technicalNotes.toLowerCase().includes('database')) {
            tables.add(name);
            migrations.push(createMigration(name, feature.technicalNotes, config));
        }
    }

    return migrations;
}

/**
 * Create a migration for a resource.
 */
export function createMigration(
    resource: string,
    notes: string,
    config: BackendConfig
): Migration {
    const table = resource.endsWith('s') ? resource : resource + 's';
    const sqlTypes = SQL_TYPES[config.database] || SQL_TYPES.postgresql;

    // Default columns
    const columns: ColumnDefinition[] = [
        { name: 'id', type: sqlTypes.id, nullable: false, primaryKey: true, unique: true },
        { name: 'created_at', type: sqlTypes.timestamp, nullable: false, primaryKey: false, unique: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: sqlTypes.timestamp, nullable: false, primaryKey: false, unique: false, defaultValue: 'CURRENT_TIMESTAMP' },
    ];

    // Add name/title if implied
    if (notes.toLowerCase().includes('name') || notes.toLowerCase().includes('title')) {
        columns.push({ name: 'name', type: sqlTypes.string, nullable: false, primaryKey: false, unique: false });
    }

    return {
        name: `create_${table}_table`,
        table,
        columns,
        up: generateUpMigration(table, columns, sqlTypes),
        down: `DROP TABLE IF EXISTS ${table};`,
    };
}

/**
 * Generate up migration SQL.
 */
export function generateUpMigration(
    table: string,
    columns: ColumnDefinition[],
    sqlTypes: Record<string, string>
): string {
    const columnDefs = columns.map(col => {
        let def = `    ${col.name} ${col.type}`;
        if (!col.nullable && !col.primaryKey) {
            def += ' NOT NULL';
        }
        if (col.defaultValue) {
            def += ` DEFAULT ${col.defaultValue}`;
        }
        return def;
    }).join(',\n');

    return `CREATE TABLE IF NOT EXISTS ${table} (\n${columnDefs}\n);`;
}

// ============================================================================
// Code Generation
// ============================================================================

/**
 * Generate route file for a resource.
 */
export function generateRouteFile(
    resource: string,
    routes: APIRoute[],
    config: BackendConfig
): GeneratedBackendFile {
    const handlers = routes.map(route => generateRouteHandler(route, config)).join('\n\n');

    const imports = `import { Router, Request, Response, NextFunction } from 'express';
${config.includeLogging ? "import { logger } from '../middleware/logger';" : ''}
${config.includeAuth ? "import { authenticate } from '../middleware/auth';" : ''}`;

    const routerSetup = routes.map(route => {
        const auth = route.requiresAuth && config.includeAuth ? ', authenticate' : '';
        return `router.${route.method.toLowerCase()}('${route.path.replace(`/${resource}`, '')}'${auth}, ${route.handler});`;
    }).join('\n');

    return {
        path: `${config.baseDir}/src/routes/${resource}.ts`,
        content: `/**
 * ${toPascalCase(resource)} Routes
 *
 * **Simple explanation**: API endpoints for ${resource} operations.
 */

${imports}

const router = Router();

// Route handlers
${handlers}

// Register routes
${routerSetup}

export default router;
`,
        description: `API routes for ${resource}`,
        type: 'route',
    };
}

/**
 * Generate a route handler function.
 */
export function generateRouteHandler(route: APIRoute, config: BackendConfig): string {
    const asyncHandler = config.includeLogging
        ? `logger.info('${route.method} ${route.path}');`
        : '';

    return `/**
 * ${route.description}
 */
async function ${route.handler}(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        ${asyncHandler}
        // TODO: Implement ${route.handler}
        res.status(${route.method === 'POST' ? '201' : '200'}).json({
            message: '${route.handler} not implemented',
        });
    } catch (error) {
        next(error);
    }
}`;
}

/**
 * Generate error handler middleware.
 */
export function generateErrorHandler(config: BackendConfig): GeneratedBackendFile {
    return {
        path: `${config.baseDir}/src/middleware/errorHandler.ts`,
        content: `/**
 * Error Handler Middleware
 *
 * **Simple explanation**: Catches errors and returns consistent error responses.
 */

import { Request, Response, NextFunction } from 'express';
${config.includeLogging ? "import { logger } from './logger';" : ''}

export interface AppError extends Error {
    statusCode?: number;
    code?: string;
}

export function errorHandler(
    err: AppError,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    ${config.includeLogging ? 'logger.error(\\`Error: \\${message}\\`, { error: err, path: req.path });' : ''}

    res.status(statusCode).json({
        success: false,
        error: {
            message,
            code: err.code || 'INTERNAL_ERROR',
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        },
    });
}
`,
        description: 'Error handling middleware',
        type: 'middleware',
    };
}

/**
 * Generate CORS middleware.
 */
export function generateCorsMiddleware(config: BackendConfig): GeneratedBackendFile {
    return {
        path: `${config.baseDir}/src/middleware/cors.ts`,
        content: `/**
 * CORS Middleware Configuration
 *
 * **Simple explanation**: Controls which websites can access your API.
 */

import cors from 'cors';

const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'];

export const corsMiddleware = cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
});
`,
        description: 'CORS configuration middleware',
        type: 'middleware',
    };
}

/**
 * Generate auth middleware.
 */
export function generateAuthMiddleware(config: BackendConfig): GeneratedBackendFile {
    const jwtContent = `/**
 * Authentication Middleware
 *
 * **Simple explanation**: Verifies JWT tokens and protects routes.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
${config.includeLogging ? "import { logger } from './logger';" : ''}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface AuthRequest extends Request {
    user?: { id: string; email: string };
}

export function authenticate(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        ${config.includeLogging ? "logger.warn('Missing or invalid authorization header');" : ''}
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
        req.user = decoded;
        next();
    } catch (error) {
        ${config.includeLogging ? "logger.warn('Invalid token');" : ''}
        res.status(401).json({ error: 'Invalid token' });
    }
}

export function generateToken(payload: { id: string; email: string }): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
`;

    return {
        path: `${config.baseDir}/src/middleware/auth.ts`,
        content: jwtContent,
        description: 'JWT authentication middleware',
        type: 'middleware',
    };
}

/**
 * Generate logging middleware.
 */
export function generateLoggingMiddleware(config: BackendConfig): GeneratedBackendFile {
    return {
        path: `${config.baseDir}/src/middleware/logger.ts`,
        content: `/**
 * Logging Middleware
 *
 * **Simple explanation**: Records API requests and application events.
 */

import winston from 'winston';

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
        }),
    ],
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
    logger.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
    }));
    logger.add(new winston.transports.File({
        filename: 'logs/combined.log',
    }));
}

export function requestLogger(req: any, res: any, next: any): void {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(\`\${req.method} \${req.path} \${res.statusCode} \${duration}ms\`);
    });
    next();
}
`,
        description: 'Winston logging configuration',
        type: 'middleware',
    };
}

/**
 * Generate database configuration.
 */
export function generateDatabaseConfig(config: BackendConfig): GeneratedBackendFile {
    const content = config.database === 'mongodb'
        ? generateMongoConfig(config)
        : generateSqlConfig(config);

    return {
        path: `${config.baseDir}/src/database/index.ts`,
        content,
        description: 'Database connection configuration',
        type: 'config',
    };
}

/**
 * Generate SQL database config.
 */
export function generateSqlConfig(config: BackendConfig): string {
    return `/**
 * Database Configuration
 *
 * **Simple explanation**: Sets up connection to ${config.database} database.
 */

import { Pool } from 'pg';
${config.includeLogging ? "import { logger } from '../middleware/logger';" : ''}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
    ${config.includeLogging ? "logger.info('Connected to database');" : ''}
});

pool.on('error', (err) => {
    ${config.includeLogging ? "logger.error('Database error', err);" : ''}
    process.exit(-1);
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    ${config.includeLogging ? "logger.debug('Executed query', { text, duration, rows: result.rowCount });" : ''}
    return result.rows;
}

export async function getClient() {
    return pool.connect();
}

export default pool;
`;
}

/**
 * Generate MongoDB config.
 */
export function generateMongoConfig(config: BackendConfig): string {
    return `/**
 * MongoDB Configuration
 *
 * **Simple explanation**: Sets up connection to MongoDB database.
 */

import mongoose from 'mongoose';
${config.includeLogging ? "import { logger } from '../middleware/logger';" : ''}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/${config.packageName}';

export async function connectDatabase(): Promise<void> {
    try {
        await mongoose.connect(MONGO_URI);
        ${config.includeLogging ? "logger.info('Connected to MongoDB');" : ''}
    } catch (error) {
        ${config.includeLogging ? "logger.error('MongoDB connection error', error);" : ''}
        process.exit(1);
    }
}

mongoose.connection.on('error', (err) => {
    ${config.includeLogging ? "logger.error('MongoDB error', err);" : ''}
});

export default mongoose;
`;
}

/**
 * Generate migration file.
 */
export function generateMigrationFile(
    migration: Migration,
    config: BackendConfig
): GeneratedBackendFile {
    const timestamp = Date.now();
    return {
        path: `${config.baseDir}/migrations/${timestamp}_${migration.name}.sql`,
        content: `-- Migration: ${migration.name}
-- Created: ${new Date().toISOString()}

-- UP
${migration.up}

-- DOWN
${migration.down}
`,
        description: `Migration for ${migration.table} table`,
        type: 'migration',
    };
}

/**
 * Generate main index file.
 */
export function generateMainIndex(routes: APIRoute[], config: BackendConfig): GeneratedBackendFile {
    const routeGroups = groupRoutesByResource(routes);
    const routeImports = Object.keys(routeGroups)
        .map(r => `import ${r}Routes from './routes/${r}';`)
        .join('\n');
    const routeUse = Object.keys(routeGroups)
        .map(r => `app.use('/api/${r}', ${r}Routes);`)
        .join('\n');

    return {
        path: `${config.baseDir}/src/index.ts`,
        content: `/**
 * Main Application Entry Point
 *
 * **Simple explanation**: Starts the Express server with all routes and middleware.
 */

import express from 'express';
import helmet from 'helmet';
${config.includeCors ? "import { corsMiddleware } from './middleware/cors';" : ''}
${config.includeLogging ? "import { logger, requestLogger } from './middleware/logger';" : ''}
import { errorHandler } from './middleware/errorHandler';
${config.database !== 'none' && config.database !== 'mongodb' ? "import pool from './database';" : ''}
${config.database === 'mongodb' ? "import { connectDatabase } from './database';" : ''}
${routeImports}

const app = express();
const PORT = process.env.PORT || 3000;

// Global middleware
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
${config.includeCors ? 'app.use(corsMiddleware);' : ''}
${config.includeLogging ? 'app.use(requestLogger);' : ''}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
${routeUse || '// No routes generated'}

// Error handler (must be last)
app.use(errorHandler);

// Start server
async function start() {
    ${config.database === 'mongodb' ? 'await connectDatabase();' : ''}
    app.listen(PORT, () => {
        ${config.includeLogging ? `logger.info(\`Server running on port \${PORT}\`);` : `console.log(\`Server running on port \${PORT}\`);`}
    });
}

start().catch(console.error);

export default app;
`,
        description: 'Main application entry point',
        type: 'index',
    };
}

/**
 * Generate config file.
 */
export function generateConfigFile(config: BackendConfig): GeneratedBackendFile {
    return {
        path: `${config.baseDir}/src/config.ts`,
        content: `/**
 * Application Configuration
 *
 * **Simple explanation**: Loads and validates environment variables.
 */

import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.string().default('3000').transform(Number),
    ${config.database === 'mongodb' ? 'MONGO_URI: z.string(),' : 'DATABASE_URL: z.string(),'}
    ${config.includeAuth ? 'JWT_SECRET: z.string().min(32),' : ''}
    ${config.includeCors ? 'CORS_ORIGINS: z.string().optional(),' : ''}
    ${config.includeLogging ? "LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')," : ''}
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
        console.error('Invalid environment variables:', result.error.format());
        process.exit(1);
    }
    return result.data;
}

export const env = loadConfig();
`,
        description: 'Environment configuration with validation',
        type: 'config',
    };
}

/**
 * Generate .env.example file.
 */
export function generateEnvFile(config: BackendConfig): GeneratedBackendFile {
    const envVars = [
        'NODE_ENV=development',
        'PORT=3000',
    ];

    if (config.database === 'mongodb') {
        envVars.push(`MONGO_URI=mongodb://localhost:27017/${config.packageName}`);
    } else if (config.database !== 'none') {
        envVars.push(`DATABASE_URL=${config.database}://user:password@localhost:5432/${config.packageName}`);
    }

    if (config.includeAuth) {
        envVars.push('JWT_SECRET=your-secret-key-at-least-32-characters');
    }

    if (config.includeCors) {
        envVars.push('CORS_ORIGINS=http://localhost:3000');
    }

    if (config.includeLogging) {
        envVars.push('LOG_LEVEL=info');
    }

    return {
        path: `${config.baseDir}/.env.example`,
        content: `# Environment Configuration\n# Copy this file to .env and fill in the values\n\n${envVars.join('\n')}\n`,
        description: 'Example environment variables',
        type: 'config',
    };
}

/**
 * Generate package.json.
 */
export function generatePackageJson(config: BackendConfig): GeneratedBackendFile {
    const dependencies: Record<string, string> = {
        'express': '^4.18.2',
        'helmet': '^7.1.0',
        'zod': '^3.22.4',
    };

    if (config.includeCors) {
        dependencies['cors'] = '^2.8.5';
    }

    if (config.includeLogging) {
        dependencies['winston'] = '^3.11.0';
    }

    if (config.includeAuth) {
        dependencies['jsonwebtoken'] = '^9.0.2';
    }

    if (config.database === 'postgresql') {
        dependencies['pg'] = '^8.11.3';
    } else if (config.database === 'mongodb') {
        dependencies['mongoose'] = '^8.0.3';
    }

    const devDependencies: Record<string, string> = {
        '@types/express': '^4.17.21',
        '@types/node': '^20.10.6',
        'typescript': '^5.3.3',
        'ts-node': '^10.9.2',
        'tsx': '^4.7.0',
        'nodemon': '^3.0.2',
    };

    if (config.includeCors) {
        devDependencies['@types/cors'] = '^2.8.17';
    }

    if (config.includeAuth) {
        devDependencies['@types/jsonwebtoken'] = '^9.0.5';
    }

    const pkg = {
        name: config.packageName,
        version: '1.0.0',
        main: 'dist/index.js',
        scripts: {
            dev: 'nodemon --exec tsx src/index.ts',
            build: 'tsc',
            start: 'node dist/index.js',
            test: 'jest',
            lint: 'eslint src --ext .ts',
        },
        dependencies,
        devDependencies,
    };

    return {
        path: `${config.baseDir}/package.json`,
        content: JSON.stringify(pkg, null, 2) + '\n',
        description: 'Package configuration',
        type: 'config',
    };
}

/**
 * Generate tsconfig.json.
 */
export function generateTsConfig(config: BackendConfig): GeneratedBackendFile {
    const tsconfig = {
        compilerOptions: {
            target: 'ES2022',
            module: 'CommonJS',
            lib: ['ES2022'],
            outDir: './dist',
            rootDir: './src',
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            resolveJsonModule: true,
            declaration: true,
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist'],
    };

    return {
        path: `${config.baseDir}/tsconfig.json`,
        content: JSON.stringify(tsconfig, null, 2) + '\n',
        description: 'TypeScript configuration',
        type: 'config',
    };
}

/**
 * Generate Dockerfile.
 */
export function generateDockerfile(config: BackendConfig): GeneratedBackendFile {
    return {
        path: `${config.baseDir}/Dockerfile`,
        content: `# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
`,
        description: 'Docker build configuration',
        type: 'config',
    };
}

/**
 * Generate docker-compose.yml.
 */
export function generateDockerCompose(config: BackendConfig): GeneratedBackendFile {
    let dbService = '';
    if (config.database === 'postgresql') {
        dbService = `
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: ${config.packageName}
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data`;
    } else if (config.database === 'mongodb') {
        dbService = `
  db:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db`;
    }

    let volumes = '';
    if (config.database === 'postgresql') {
        volumes = '\nvolumes:\n  postgres_data:';
    } else if (config.database === 'mongodb') {
        volumes = '\nvolumes:\n  mongo_data:';
    }

    return {
        path: `${config.baseDir}/docker-compose.yml`,
        content: `version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      ${config.database === 'postgresql' ? `- DATABASE_URL=postgresql://postgres:postgres@db:5432/${config.packageName}` : ''}
      ${config.database === 'mongodb' ? `- MONGO_URI=mongodb://db:27017/${config.packageName}` : ''}
    depends_on:
      ${config.database !== 'none' ? '- db' : '[]'}
${dbService}
${volumes}
`,
        description: 'Docker Compose configuration',
        type: 'config',
    };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Convert string to PascalCase.
 */
export function toPascalCase(str: string): string {
    return str
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
        .replace(/^[a-z]/, chr => chr.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Generate human-readable summary.
 */
export function generateSummary(
    routes: APIRoute[],
    files: GeneratedBackendFile[],
    config: BackendConfig
): string {
    const routeCount = routes.length;
    const fileCount = files.length;
    return `Generated ${fileCount} files with ${routeCount} API routes using ${config.framework} and ${config.database}`;
}
