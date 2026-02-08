/**
 * Full-Stack Project Generator (MT-033.25)
 *
 * Generates complete full-stack monorepo projects by combining frontend and backend code.
 *
 * **Simple explanation**: Takes your frontend (React) and backend (Express) code plus a plan
 * and creates a complete, production-ready project structure with Docker, CI/CD, and documentation.
 */

import { CompletePlan, SuccessCriterion } from '../planning/types';
import { FrontendResult, generateFrontend, FrontendConfig, DEFAULT_FRONTEND_CONFIG } from './frontendGenerator';
import { BackendResult, generateBackend, BackendConfig, DEFAULT_BACKEND_CONFIG } from './backendGenerator';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Configuration options for project generation.
 *
 * **Simple explanation**: Settings that control how the monorepo is structured.
 */
export interface ProjectConfig {
    /** The project name (used in package.json) */
    projectName: string;

    /** Package scope for monorepo (e.g., @myorg) */
    packageScope?: string;

    /** Monorepo tool: npm-workspaces, lerna, or turborepo */
    monorepoTool: 'npm-workspaces' | 'lerna' | 'turborepo';

    /** Include Docker setup */
    includeDocker: boolean;

    /** Include GitHub Actions CI/CD */
    includeGithubActions: boolean;

    /** Include database seeders */
    includeSeeders: boolean;

    /** Include Husky git hooks */
    includeHusky: boolean;

    /** Include Prettier configuration */
    includePrettier: boolean;

    /** Include ESLint configuration */
    includeEslint: boolean;

    /** Frontend configuration */
    frontendConfig: FrontendConfig;

    /** Backend configuration */
    backendConfig: BackendConfig;
}

/**
 * Default project configuration.
 */
export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
    projectName: 'my-fullstack-app',
    monorepoTool: 'npm-workspaces',
    includeDocker: true,
    includeGithubActions: true,
    includeSeeders: true,
    includeHusky: true,
    includePrettier: true,
    includeEslint: true,
    frontendConfig: DEFAULT_FRONTEND_CONFIG,
    backendConfig: DEFAULT_BACKEND_CONFIG,
};

/**
 * A generated file with its path and content.
 */
export interface GeneratedFile {
    path: string;
    content: string;
}

/**
 * Result of project generation.
 *
 * **Simple explanation**: Everything produced by the generator - files, structure info, and warnings.
 */
export interface ProjectResult {
    /** All generated files */
    files: GeneratedFile[];

    /** Project structure description */
    structure: string;

    /** Build summary */
    summary: string;

    /** Any warnings or notes */
    warnings: string[];

    /** Frontend generation result */
    frontendResult: FrontendResult;

    /** Backend generation result */
    backendResult: BackendResult;
}

// ============================================================================
// Main Generator Function
// ============================================================================

/**
 * Generates a complete full-stack monorepo project.
 *
 * **Simple explanation**: Takes your plan and creates a complete project with frontend,
 * backend, Docker, CI/CD, and all the files you need to start developing.
 *
 * @param plan - The complete plan to generate from
 * @param config - Project configuration (uses defaults if not provided)
 * @returns ProjectResult with all generated files and metadata
 */
export function generateProject(
    plan: CompletePlan,
    config: ProjectConfig = DEFAULT_PROJECT_CONFIG
): ProjectResult {
    const warnings: string[] = [];
    const files: GeneratedFile[] = [];

    // Generate frontend
    const frontendResult = generateFrontend(plan, config.frontendConfig);
    warnings.push(...frontendResult.warnings.map(w => `[frontend] ${w}`));

    // Generate backend
    const backendResult = generateBackend(plan, config.backendConfig);
    warnings.push(...backendResult.warnings.map(w => `[backend] ${w}`));

    // Prefix frontend files with frontend/
    const frontendFiles = frontendResult.files.map(f => ({
        path: `frontend/${f.path}`,
        content: f.content,
    }));
    files.push(...frontendFiles);

    // Prefix backend files with backend/
    const backendFiles = backendResult.files.map(f => ({
        path: `backend/${f.path}`,
        content: f.content,
    }));
    files.push(...backendFiles);

    // Generate root monorepo files
    files.push(generateRootPackageJson(config));
    files.push(generateRootTsConfig(config));
    files.push(generateGitignore(config));
    files.push(generateReadme(plan, config, frontendResult, backendResult));
    files.push(generateArchitectureMd(plan, config));
    files.push(generateContributingMd(config));
    files.push(generateEnvExample(config));

    // Generate docs from success criteria
    files.push(...generateDocs(plan, config));

    // Generate test setup files
    files.push(...generateTestSetup(plan, config));

    // Optional: Docker
    if (config.includeDocker) {
        files.push(...generateDockerFiles(config));
    }

    // Optional: GitHub Actions
    if (config.includeGithubActions) {
        files.push(...generateGithubActions(config));
    }

    // Optional: Database seeders
    if (config.includeSeeders) {
        files.push(...generateSeeders(plan, config));
    }

    // Optional: Husky git hooks
    if (config.includeHusky) {
        files.push(generateHuskyConfig(config));
    }

    // Optional: Prettier
    if (config.includePrettier) {
        files.push(generatePrettierConfig(config));
    }

    // Optional: ESLint
    if (config.includeEslint) {
        files.push(generateEslintConfig(config));
    }

    const structure = generateStructureDescription(files, config);
    const summary = generateProjectSummary(frontendResult, backendResult, config, warnings);

    return {
        files,
        structure,
        summary,
        warnings,
        frontendResult,
        backendResult,
    };
}

// ============================================================================
// Root Configuration Files
// ============================================================================

/**
 * Generates root package.json for monorepo.
 */
export function generateRootPackageJson(config: ProjectConfig): GeneratedFile {
    const scope = config.packageScope ? `${config.packageScope}/` : '';

    const packageJson: Record<string, unknown> = {
        name: config.projectName,
        version: '0.1.0',
        private: true,
        workspaces: ['frontend', 'backend'],
        scripts: {
            'dev': 'concurrently "npm run dev:frontend" "npm run dev:backend"',
            'dev:frontend': 'npm run dev -w frontend',
            'dev:backend': 'npm run dev -w backend',
            'build': 'npm run build -w frontend && npm run build -w backend',
            'build:frontend': 'npm run build -w frontend',
            'build:backend': 'npm run build -w backend',
            'test': 'npm run test -w frontend && npm run test -w backend',
            'test:frontend': 'npm run test -w frontend',
            'test:backend': 'npm run test -w backend',
            'lint': 'eslint . --ext .ts,.tsx',
            'lint:fix': 'eslint . --ext .ts,.tsx --fix',
            'format': 'prettier --write "**/*.{ts,tsx,json,md}"',
            'format:check': 'prettier --check "**/*.{ts,tsx,json,md}"',
            'clean': 'rm -rf frontend/dist backend/dist node_modules',
            'docker:build': 'docker-compose build',
            'docker:up': 'docker-compose up -d',
            'docker:down': 'docker-compose down',
            'docker:logs': 'docker-compose logs -f',
            'db:migrate': 'npm run migrate -w backend',
            'db:seed': 'npm run seed -w backend',
            'prepare': config.includeHusky ? 'husky install' : undefined,
        },
        devDependencies: {
            'concurrently': '^8.2.0',
            'typescript': '^5.3.0',
            ...(config.includeEslint ? {
                'eslint': '^8.55.0',
                '@typescript-eslint/eslint-plugin': '^6.13.0',
                '@typescript-eslint/parser': '^6.13.0',
            } : {}),
            ...(config.includePrettier ? {
                'prettier': '^3.1.0',
            } : {}),
            ...(config.includeHusky ? {
                'husky': '^8.0.0',
                'lint-staged': '^15.2.0',
            } : {}),
        },
        engines: {
            node: '>=18.0.0',
            npm: '>=9.0.0',
        },
    };

    // Remove undefined values
    if (!config.includeHusky) {
        delete (packageJson.scripts as Record<string, unknown>).prepare;
    }

    // Add lint-staged config if Husky enabled
    if (config.includeHusky) {
        packageJson['lint-staged'] = {
            '*.{ts,tsx}': ['eslint --fix', 'prettier --write'],
            '*.{json,md}': ['prettier --write'],
        };
    }

    return {
        path: 'package.json',
        content: JSON.stringify(packageJson, null, 2),
    };
}

/**
 * Generates root tsconfig.json for monorepo.
 */
export function generateRootTsConfig(config: ProjectConfig): GeneratedFile {
    const tsConfig = {
        compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            declaration: true,
            declarationMap: true,
            composite: true,
        },
        references: [
            { path: './frontend' },
            { path: './backend' },
        ],
        exclude: ['node_modules', '**/dist', '**/coverage'],
    };

    return {
        path: 'tsconfig.json',
        content: JSON.stringify(tsConfig, null, 2),
    };
}

/**
 * Generates comprehensive .gitignore for monorepo.
 */
export function generateGitignore(config: ProjectConfig): GeneratedFile {
    const lines = [
        '# Dependencies',
        'node_modules/',
        '',
        '# Build outputs',
        'dist/',
        'build/',
        'out/',
        '',
        '# Coverage',
        'coverage/',
        '',
        '# Environment files',
        '.env',
        '.env.local',
        '.env.*.local',
        '',
        '# IDE',
        '.idea/',
        '.vscode/',
        '*.swp',
        '*.swo',
        '',
        '# OS',
        '.DS_Store',
        'Thumbs.db',
        '',
        '# Logs',
        '*.log',
        'npm-debug.log*',
        'yarn-debug.log*',
        'yarn-error.log*',
        '',
        '# Runtime data',
        'pids',
        '*.pid',
        '*.seed',
        '*.pid.lock',
        '',
        '# Test artifacts',
        '.nyc_output',
        '',
        '# Docker',
        'docker-compose.override.yml',
    ];

    return {
        path: '.gitignore',
        content: lines.join('\n'),
    };
}

/**
 * Generates comprehensive README.md.
 */
export function generateReadme(
    plan: CompletePlan,
    config: ProjectConfig,
    frontendResult: FrontendResult,
    backendResult: BackendResult
): GeneratedFile {
    const projectName = plan.overview?.name || config.projectName;
    const description = plan.overview?.description || 'A full-stack application';

    const content = `# ${projectName}

${description}

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
${config.includeDocker ? '- Docker & Docker Compose' : ''}

### Installation

\`\`\`bash
# Clone the repository
git clone <repository-url>
cd ${config.projectName}

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Start development servers
npm run dev
\`\`\`

This will start:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:3001

## 📁 Project Structure

\`\`\`
${config.projectName}/
├── frontend/           # React frontend application
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── pages/      # Page components
│   │   └── styles/     # CSS modules
│   └── package.json
├── backend/            # Express API server
│   ├── src/
│   │   ├── routes/     # API routes
│   │   ├── middleware/ # Express middleware
│   │   └── config/     # Configuration
│   └── package.json
├── docs/               # Documentation
├── database/           # Database migrations and seeds
└── docker/             # Docker configuration
\`\`\`

## 🛠️ Development

### Available Scripts

| Command | Description |
|---------|-------------|
| \`npm run dev\` | Start both frontend and backend in development mode |
| \`npm run build\` | Build both packages for production |
| \`npm run test\` | Run all tests |
| \`npm run lint\` | Lint all TypeScript files |
| \`npm run format\` | Format code with Prettier |
${config.includeDocker ? '| `npm run docker:up` | Start Docker containers |' : ''}

### Frontend Development

\`\`\`bash
# Start frontend only
npm run dev:frontend

# Run frontend tests
npm run test:frontend

# Build frontend
npm run build:frontend
\`\`\`

### Backend Development

\`\`\`bash
# Start backend only
npm run dev:backend

# Run backend tests
npm run test:backend

# Run database migrations
npm run db:migrate
\`\`\`

${config.includeDocker ? `## 🐳 Docker

### Development with Docker

\`\`\`bash
# Build and start containers
npm run docker:up

# View logs
npm run docker:logs

# Stop containers
npm run docker:down
\`\`\`
` : ''}

## 📊 API Endpoints

${backendResult.routes.map(route => `- \`${route.method} ${route.path}\` - ${route.description}`).join('\n')}

## 🧩 UI Components

${frontendResult.components.map(comp => `- **${comp}**`).join('\n')}

## 🧪 Testing

\`\`\`bash
# Run all tests
npm run test

# Run with coverage
npm run test -- --coverage
\`\`\`

## 📝 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| \`NODE_ENV\` | Environment mode | \`development\` |
| \`PORT\` | Backend server port | \`3001\` |
| \`DATABASE_URL\` | Database connection string | - |
| \`JWT_SECRET\` | JWT signing secret | - |

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see the [LICENSE](./LICENSE) file for details.

---

Generated with COE Planning Wizard
`;

    return {
        path: 'README.md',
        content,
    };
}

/**
 * Generates ARCHITECTURE.md documentation.
 */
export function generateArchitectureMd(plan: CompletePlan, config: ProjectConfig): GeneratedFile {
    const projectName = plan.overview?.name || config.projectName;

    const content = `# Architecture Overview

## ${projectName}

This document describes the high-level architecture of the application.

## System Overview

\`\`\`
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│    Frontend     │────▶│     Backend     │────▶│    Database     │
│    (React)      │     │    (Express)    │     │  (PostgreSQL)   │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
\`\`\`

## Frontend Architecture

### Technology Stack
- **Framework**: React 18 with TypeScript
- **Styling**: CSS Modules
- **State Management**: React Context / Hooks
- **Build Tool**: Vite

### Component Structure
\`\`\`
frontend/src/
├── components/     # Reusable UI components
│   ├── common/     # Shared components (Button, Input, etc.)
│   ├── forms/      # Form components
│   └── layout/     # Layout components (Header, Footer, etc.)
├── pages/          # Page-level components
├── hooks/          # Custom React hooks
├── context/        # React Context providers
├── services/       # API client services
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
\`\`\`

## Backend Architecture

### Technology Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL
- **ORM**: Raw SQL / Query Builder
- **Authentication**: JWT

### Layer Structure
\`\`\`
backend/src/
├── routes/         # Route handlers (controller layer)
├── services/       # Business logic layer
├── middleware/     # Express middleware
├── config/         # Configuration management
├── database/       # Database connection and queries
│   ├── migrations/ # Database migrations
│   └── seeds/      # Database seeders
└── types/          # TypeScript type definitions
\`\`\`

## Data Flow

1. **Client Request** → Frontend makes HTTP request to Backend API
2. **Authentication** → JWT middleware validates token
3. **Route Handler** → Express route handles request
4. **Business Logic** → Service layer processes data
5. **Database** → Query executed against PostgreSQL
6. **Response** → JSON response sent back to client

## Security Considerations

- JWT-based authentication
- CORS configuration for allowed origins
- Input validation on all endpoints
- SQL injection prevention
- Rate limiting on sensitive endpoints

## Feature Blocks

${plan.featureBlocks.map(fb => `### ${fb.name}
${fb.description}

**Purpose**: ${fb.purpose}
`).join('\n')}

## Deployment

### Docker Deployment
The application is containerized using Docker:
- Frontend: nginx serving static files
- Backend: Node.js application
- Database: PostgreSQL container

### Environment Configuration
All configuration is managed through environment variables.
See \`.env.example\` for required variables.

---

Generated with COE Planning Wizard
`;

    return {
        path: 'ARCHITECTURE.md',
        content,
    };
}

/**
 * Generates CONTRIBUTING.md guidelines.
 */
export function generateContributingMd(config: ProjectConfig): GeneratedFile {
    const content = `# Contributing to ${config.projectName}

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## 🚀 Getting Started

1. Fork the repository
2. Clone your fork: \`git clone <your-fork-url>\`
3. Install dependencies: \`npm install\`
4. Create a branch: \`git checkout -b feature/your-feature-name\`

## 📝 Development Workflow

### Branch Naming

- \`feature/\` - New features
- \`fix/\` - Bug fixes
- \`docs/\` - Documentation updates
- \`refactor/\` - Code refactoring
- \`test/\` - Test additions or fixes

### Commit Messages

We follow [Conventional Commits](https://conventionalcommits.org/):

\`\`\`
<type>(<scope>): <description>

[optional body]

[optional footer]
\`\`\`

**Types**: feat, fix, docs, style, refactor, test, chore

**Examples**:
- \`feat(auth): add password reset functionality\`
- \`fix(api): handle null values in user response\`
- \`docs(readme): update installation instructions\`

### Code Style

${config.includePrettier ? '- Code is automatically formatted with Prettier' : ''}
${config.includeEslint ? '- ESLint is used for linting TypeScript files' : ''}
${config.includeHusky ? '- Git hooks run linting before commits' : ''}

Run before committing:
\`\`\`bash
npm run lint
npm run format
\`\`\`

## 🧪 Testing

All new features should include tests:

\`\`\`bash
# Run all tests
npm run test

# Run with coverage
npm run test -- --coverage
\`\`\`

### Test Guidelines

- Write unit tests for utility functions and services
- Write integration tests for API endpoints
- Write component tests for React components
- Aim for 80%+ code coverage

## 📤 Pull Request Process

1. Ensure all tests pass: \`npm run test\`
2. Ensure linting passes: \`npm run lint\`
3. Update documentation if needed
4. Create a pull request with a clear description
5. Request review from maintainers

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Linting passes
- [ ] No TypeScript errors
- [ ] Commit messages follow conventions

## 🐛 Bug Reports

When reporting bugs, please include:

1. Description of the bug
2. Steps to reproduce
3. Expected behavior
4. Actual behavior
5. Environment details (OS, Node version, etc.)

## 💡 Feature Requests

For feature requests, please include:

1. Description of the feature
2. Use case / motivation
3. Proposed implementation (optional)

## 📞 Questions?

Feel free to open an issue for any questions or discussions.

---

Thank you for contributing! 🙏
`;

    return {
        path: 'CONTRIBUTING.md',
        content,
    };
}

/**
 * Generates .env.example file.
 */
export function generateEnvExample(config: ProjectConfig): GeneratedFile {
    const lines = [
        '# Application',
        'NODE_ENV=development',
        '',
        '# Frontend',
        'VITE_API_URL=http://localhost:3001',
        '',
        '# Backend',
        'PORT=3001',
        '',
        '# Database',
        `DATABASE_URL=postgresql://postgres:password@localhost:5432/${config.projectName.replace(/-/g, '_')}`,
        '',
        '# Authentication',
        'JWT_SECRET=your-super-secret-jwt-key-change-in-production',
        'JWT_EXPIRES_IN=7d',
        '',
        '# CORS',
        'CORS_ORIGIN=http://localhost:3000',
        '',
        '# Optional: External Services',
        '# SMTP_HOST=',
        '# SMTP_PORT=',
        '# SMTP_USER=',
        '# SMTP_PASS=',
    ];

    return {
        path: '.env.example',
        content: lines.join('\n'),
    };
}

// ============================================================================
// Documentation Generation
// ============================================================================

/**
 * Generates documentation files from plan success criteria.
 */
export function generateDocs(plan: CompletePlan, config: ProjectConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // API documentation
    files.push({
        path: 'docs/API.md',
        content: generateApiDoc(plan, config),
    });

    // User guide from user stories
    if (plan.userStories && plan.userStories.length > 0) {
        files.push({
            path: 'docs/USER_GUIDE.md',
            content: generateUserGuide(plan, config),
        });
    }

    // Success criteria documentation
    if (plan.successCriteria && plan.successCriteria.length > 0) {
        files.push({
            path: 'docs/SUCCESS_CRITERIA.md',
            content: generateSuccessCriteriaDoc(plan, config),
        });
    }

    return files;
}

/**
 * Generates API documentation.
 */
function generateApiDoc(plan: CompletePlan, config: ProjectConfig): string {
    const backendResult = generateBackend(plan, config.backendConfig);

    return `# API Documentation

## Base URL

\`\`\`
http://localhost:3001/api
\`\`\`

## Authentication

Most endpoints require authentication via JWT token:

\`\`\`
Authorization: Bearer <token>
\`\`\`

## Endpoints

${backendResult.routes.map(route => `### ${route.method} ${route.path}

${route.description}

**Authentication**: ${route.requiresAuth ? 'Required' : 'Not required'}

${route.queryParams.length > 0 ? `**Query Parameters**:
${route.queryParams.map(p => `- \`${p.name}\` (${p.type}${p.required ? ', required' : ''}): ${p.description}`).join('\n')}
` : ''}

**Response**: \`${route.responseType}\`

---
`).join('\n')}

## Error Responses

All error responses follow this format:

\`\`\`json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
\`\`\`

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| \`UNAUTHORIZED\` | 401 | Missing or invalid authentication |
| \`FORBIDDEN\` | 403 | Insufficient permissions |
| \`NOT_FOUND\` | 404 | Resource not found |
| \`VALIDATION_ERROR\` | 400 | Invalid request data |
| \`INTERNAL_ERROR\` | 500 | Server error |
`;
}

/**
 * Generates user guide from user stories.
 */
function generateUserGuide(plan: CompletePlan, config: ProjectConfig): string {
    return `# User Guide

## Getting Started

Welcome to ${plan.overview?.name || config.projectName}!

${plan.overview?.description || ''}

## Features

${plan.userStories.map(story => `### ${story.action}

As a **${story.userType}**, I want to ${story.action.toLowerCase()} so that ${story.benefit.toLowerCase()}.

${story.acceptanceCriteria ? `**Acceptance Criteria**:
${story.acceptanceCriteria.map(ac => `- ${ac}`).join('\n')}` : ''}
`).join('\n')}

## Tips

- Use keyboard shortcuts for faster navigation
- Check the settings page for customization options
- Contact support if you need assistance
`;
}

/**
 * Generates success criteria documentation.
 */
function generateSuccessCriteriaDoc(plan: CompletePlan, config: ProjectConfig): string {
    const groupedCriteria = plan.successCriteria.reduce((acc, sc) => {
        const category = sc.priority || 'medium';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(sc);
        return acc;
    }, {} as Record<string, SuccessCriterion[]>);

    return `# Success Criteria

## Overview

This document outlines the success criteria for ${plan.overview?.name || config.projectName}.

${Object.entries(groupedCriteria).map(([priority, criteria]) => `## Priority: ${priority}

${criteria.map(sc => `### ${sc.description}

- **Testable**: ${sc.testable ? 'Yes' : 'No'}
- **Priority**: ${sc.priority}
`).join('\n')}`).join('\n')}

## Verification

Each criterion should be verified through:
1. Automated tests
2. Manual testing
3. User acceptance testing
`;
}

// ============================================================================
// Test Setup Generation
// ============================================================================

/**
 * Generates test setup files.
 */
export function generateTestSetup(plan: CompletePlan, config: ProjectConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Jest config for root
    files.push({
        path: 'jest.config.js',
        content: `module.exports = {
  projects: ['<rootDir>/frontend', '<rootDir>/backend'],
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    '<rootDir>/**/src/**/*.{ts,tsx}',
    '!<rootDir>/**/src/**/*.d.ts',
    '!<rootDir>/**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
`,
    });

    return files;
}

// ============================================================================
// Docker Generation
// ============================================================================

/**
 * Generates Docker configuration files.
 */
export function generateDockerFiles(config: ProjectConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Root docker-compose.yml
    files.push({
        path: 'docker-compose.yml',
        content: generateDockerCompose(config),
    });

    // Docker directory with additional configs
    files.push({
        path: 'docker/nginx.conf',
        content: generateNginxConfig(config),
    });

    return files;
}

/**
 * Generates root docker-compose.yml.
 */
export function generateDockerCompose(config: ProjectConfig): string {
    const dbService = config.backendConfig.database === 'mongodb'
        ? `  db:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - db-data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: root
      MONGO_INITDB_ROOT_PASSWORD: password`
        : `  db:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: ${config.projectName.replace(/-/g, '_')}`;

    return `version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:80"
    depends_on:
      - backend
    environment:
      - VITE_API_URL=http://localhost:3001

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    depends_on:
      - db
    environment:
      - NODE_ENV=production
      - PORT=3001
      - DATABASE_URL=${config.backendConfig.database === 'mongodb'
            ? `mongodb://root:password@db:27017/${config.projectName.replace(/-/g, '_')}?authSource=admin`
            : `postgresql://postgres:password@db:5432/${config.projectName.replace(/-/g, '_')}`}
      - JWT_SECRET=docker-secret-change-in-production

${dbService}

volumes:
  db-data:

networks:
  default:
    name: ${config.projectName}-network
`;
}

/**
 * Generates nginx configuration for frontend.
 */
export function generateNginxConfig(config: ProjectConfig): string {
    return `server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;

    # Cache static assets
    location ~* \\.(?:css|js|jpg|jpeg|gif|png|ico|svg|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API proxy
    location /api {
        proxy_pass http://backend:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
`;
}

// ============================================================================
// GitHub Actions Generation
// ============================================================================

/**
 * Generates GitHub Actions CI/CD workflows.
 */
export function generateGithubActions(config: ProjectConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // CI workflow
    files.push({
        path: '.github/workflows/ci.yml',
        content: generateCiWorkflow(config),
    });

    // Deploy workflow
    files.push({
        path: '.github/workflows/deploy.yml',
        content: generateDeployWorkflow(config),
    });

    return files;
}

/**
 * Generates CI workflow for PRs.
 */
export function generateCiWorkflow(config: ProjectConfig): string {
    return `name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: password
          POSTGRES_DB: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run build

      - name: Test
        run: npm run test -- --coverage
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5432/test
          JWT_SECRET: test-secret

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  build:
    runs-on: ubuntu-latest
    needs: test

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build
          path: |
            frontend/dist
            backend/dist
`;
}

/**
 * Generates deploy workflow for main branch.
 */
export function generateDeployWorkflow(config: ProjectConfig): string {
    return `name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          NODE_ENV: production

      - name: Build Docker images
        run: docker-compose build

      # Add your deployment steps here
      # Examples:
      # - Push to container registry
      # - Deploy to cloud provider
      # - SSH to server and pull image

      - name: Deploy notification
        if: success()
        run: echo "Deployment successful!"
`;
}

// ============================================================================
// Database Seeders
// ============================================================================

/**
 * Generates database seeder files.
 */
export function generateSeeders(plan: CompletePlan, config: ProjectConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    files.push({
        path: 'database/seeds/index.ts',
        content: generateMainSeeder(plan, config),
    });

    files.push({
        path: 'database/seeds/users.ts',
        content: generateUserSeeder(config),
    });

    return files;
}

/**
 * Generates main seeder entry point.
 */
function generateMainSeeder(plan: CompletePlan, config: ProjectConfig): string {
    return `/**
 * Database Seeder Entry Point
 *
 * Run: npm run db:seed
 */

import { seedUsers } from './users';

async function seed() {
  console.log('🌱 Starting database seed...');

  try {
    await seedUsers();
    // Add more seeders here

    console.log('✅ Database seeding complete!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
`;
}

/**
 * Generates user seeder with sample data.
 */
function generateUserSeeder(config: ProjectConfig): string {
    return `/**
 * User Seeder
 *
 * Creates sample users for development.
 */

import { pool } from '../../backend/src/database';
import bcrypt from 'bcrypt';

export async function seedUsers() {
  console.log('Seeding users...');

  const users = [
    {
      email: 'admin@example.com',
      password: 'admin123',
      name: 'Admin User',
      role: 'admin',
    },
    {
      email: 'user@example.com',
      password: 'user123',
      name: 'Test User',
      role: 'user',
    },
  ];

  for (const user of users) {
    const hashedPassword = await bcrypt.hash(user.password, 10);

    await pool.query(
      \`INSERT INTO users (email, password, name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING\`,
      [user.email, hashedPassword, user.name, user.role]
    );
  }

  console.log(\`  ✓ Seeded \${users.length} users\`);
}
`;
}

// ============================================================================
// Optional Configuration Files
// ============================================================================

/**
 * Generates Husky configuration.
 */
export function generateHuskyConfig(config: ProjectConfig): GeneratedFile {
    return {
        path: '.husky/pre-commit',
        content: `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
`,
    };
}

/**
 * Generates Prettier configuration.
 */
export function generatePrettierConfig(config: ProjectConfig): GeneratedFile {
    return {
        path: '.prettierrc',
        content: JSON.stringify({
            semi: true,
            singleQuote: true,
            tabWidth: 2,
            trailingComma: 'es5',
            printWidth: 100,
            bracketSpacing: true,
            arrowParens: 'avoid',
        }, null, 2),
    };
}

/**
 * Generates ESLint configuration.
 */
export function generateEslintConfig(config: ProjectConfig): GeneratedFile {
    return {
        path: '.eslintrc.js',
        content: `module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  ignorePatterns: ['dist', 'node_modules', 'coverage'],
};
`,
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generates project structure description.
 */
export function generateStructureDescription(files: GeneratedFile[], config: ProjectConfig): string {
    const directories = new Set<string>();
    const directFiles: string[] = [];

    files.forEach(f => {
        const parts = f.path.split('/');
        if (parts.length > 1) {
            directories.add(parts[0]);
        } else {
            directFiles.push(f.path);
        }
    });

    const lines = [
        `${config.projectName}/`,
        ...Array.from(directories).map(d => `├── ${d}/`),
        ...directFiles.map(f => `├── ${f}`),
    ];

    return lines.join('\n');
}

/**
 * Generates project summary.
 */
export function generateProjectSummary(
    frontendResult: FrontendResult,
    backendResult: BackendResult,
    config: ProjectConfig,
    warnings: string[]
): string {
    const lines = [
        `Project: ${config.projectName}`,
        `Monorepo: ${config.monorepoTool}`,
        '',
        'Frontend:',
        `  - Components: ${frontendResult.components.length}`,
        `  - Files: ${frontendResult.files.length}`,
        '',
        'Backend:',
        `  - Routes: ${backendResult.routes.length}`,
        `  - Files: ${backendResult.files.length}`,
        '',
        'Features:',
        `  - Docker: ${config.includeDocker ? '✓' : '✗'}`,
        `  - GitHub Actions: ${config.includeGithubActions ? '✓' : '✗'}`,
        `  - Database Seeders: ${config.includeSeeders ? '✓' : '✗'}`,
        `  - Husky Hooks: ${config.includeHusky ? '✓' : '✗'}`,
        `  - Prettier: ${config.includePrettier ? '✓' : '✗'}`,
        `  - ESLint: ${config.includeEslint ? '✓' : '✗'}`,
    ];

    if (warnings.length > 0) {
        lines.push('', 'Warnings:', ...warnings.map(w => `  - ${w}`));
    }

    return lines.join('\n');
}
