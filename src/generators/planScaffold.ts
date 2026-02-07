/**
 * Plan Scaffolding Generator (MT-033.23)
 *
 * **Simple explanation**: Generates project folder structure and configuration
 * files based on your plan. Creates the basic scaffold you need to start
 * implementing the features you designed.
 *
 * @module generators/planScaffold
 */

import * as crypto from 'crypto';
import { CompletePlan, FeatureBlock, ProjectOverview } from '../planning/types';

// ============================================================================
// Types
// ============================================================================

export interface ScaffoldConfig {
    /** Project type (web-app, api, cli, vscode-extension, docs) */
    projectType: ProjectType;
    /** Base directory for generated files */
    baseDir: string;
    /** Package name (npm style) */
    packageName: string;
    /** Include test structure */
    includeTests: boolean;
    /** Include CI/CD configuration */
    includeCi: boolean;
    /** TypeScript configuration level */
    tsConfig: 'strict' | 'standard' | 'minimal';
    /** License type */
    license: 'MIT' | 'Apache-2.0' | 'ISC' | 'GPL-3.0' | 'none';
    /** Author info */
    author?: string;
}

export type ProjectType = 'web-app' | 'rest-api' | 'cli-tool' | 'vscode-extension' | 'docs-site' | 'library';

export interface GeneratedFile {
    /** Relative path from base directory */
    path: string;
    /** File content */
    content: string;
    /** Whether file should overwrite existing */
    overwrite: boolean;
    /** Description of what this file is for */
    description: string;
}

export interface ScaffoldResult {
    /** All generated files */
    files: GeneratedFile[];
    /** Human-readable summary */
    summary: string;
    /** Next steps instructions */
    nextSteps: string[];
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_SCAFFOLD_CONFIG: ScaffoldConfig = {
    projectType: 'web-app',
    baseDir: '.',
    packageName: 'my-project',
    includeTests: true,
    includeCi: true,
    tsConfig: 'standard',
    license: 'MIT',
};

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate project scaffold from a plan.
 *
 * **Simple explanation**: Creates all the folders and configuration files
 * you need to start building your project based on the features you planned.
 */
export function generateScaffold(
    plan: CompletePlan,
    config: ScaffoldConfig = DEFAULT_SCAFFOLD_CONFIG
): ScaffoldResult {
    const files: GeneratedFile[] = [];

    // Generate base project files
    files.push(...generateBaseFiles(plan, config));

    // Generate source structure
    files.push(...generateSourceStructure(plan, config));

    // Generate test structure if requested
    if (config.includeTests) {
        files.push(...generateTestStructure(plan, config));
    }

    // Generate CI/CD files if requested
    if (config.includeCi) {
        files.push(...generateCiFiles(config));
    }

    // Generate documentation structure
    files.push(...generateDocsStructure(plan, config));

    // Generate feature-specific files
    files.push(...generateFeatureFiles(plan, config));

    const summary = generateSummary(files, plan, config);
    const nextSteps = generateNextSteps(plan, config);

    return { files, summary, nextSteps };
}

// ============================================================================
// File Generators
// ============================================================================

function generateBaseFiles(plan: CompletePlan, config: ScaffoldConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // package.json
    files.push({
        path: 'package.json',
        content: generatePackageJson(plan, config),
        overwrite: false,
        description: 'Node.js package configuration',
    });

    // tsconfig.json
    files.push({
        path: 'tsconfig.json',
        content: generateTsConfig(config),
        overwrite: false,
        description: 'TypeScript configuration',
    });

    // README.md
    files.push({
        path: 'README.md',
        content: generateReadme(plan, config),
        overwrite: false,
        description: 'Project documentation',
    });

    // .gitignore
    files.push({
        path: '.gitignore',
        content: generateGitignore(config),
        overwrite: false,
        description: 'Git ignore rules',
    });

    // LICENSE
    if (config.license !== 'none') {
        files.push({
            path: 'LICENSE',
            content: generateLicense(config),
            overwrite: false,
            description: `${config.license} license file`,
        });
    }

    // .editorconfig
    files.push({
        path: '.editorconfig',
        content: generateEditorConfig(),
        overwrite: false,
        description: 'Editor configuration',
    });

    return files;
}

function generateSourceStructure(plan: CompletePlan, config: ScaffoldConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const srcDir = getSrcDir(config.projectType);

    // Main entry point
    files.push({
        path: `${srcDir}/index.ts`,
        content: generateMainEntry(plan, config),
        overwrite: false,
        description: 'Main application entry point',
    });

    // Feature directories
    for (const feature of plan.featureBlocks) {
        const featureDir = toKebabCase(feature.name);
        files.push({
            path: `${srcDir}/${featureDir}/index.ts`,
            content: generateFeatureIndex(feature),
            overwrite: false,
            description: `${feature.name} module entry`,
        });
    }

    // Common/shared directory
    files.push({
        path: `${srcDir}/common/types.ts`,
        content: generateCommonTypes(plan),
        overwrite: false,
        description: 'Shared type definitions',
    });

    files.push({
        path: `${srcDir}/common/utils.ts`,
        content: generateCommonUtils(),
        overwrite: false,
        description: 'Shared utility functions',
    });

    // Config directory
    files.push({
        path: `${srcDir}/config/index.ts`,
        content: generateConfigModule(config),
        overwrite: false,
        description: 'Configuration management',
    });

    return files;
}

function generateTestStructure(plan: CompletePlan, config: ScaffoldConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Jest config
    files.push({
        path: 'jest.config.js',
        content: generateJestConfig(config),
        overwrite: false,
        description: 'Jest test configuration',
    });

    // Test setup
    files.push({
        path: 'tests/setup.ts',
        content: generateTestSetup(config),
        overwrite: false,
        description: 'Test setup and global mocks',
    });

    // Feature tests
    for (const feature of plan.featureBlocks) {
        const featureDir = toKebabCase(feature.name);
        files.push({
            path: `tests/${featureDir}.test.ts`,
            content: generateFeatureTest(feature),
            overwrite: false,
            description: `Tests for ${feature.name}`,
        });
    }

    return files;
}

function generateCiFiles(config: ScaffoldConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // GitHub Actions
    files.push({
        path: '.github/workflows/ci.yml',
        content: generateGitHubActions(config),
        overwrite: false,
        description: 'GitHub Actions CI workflow',
    });

    // Renovate config for dependency updates
    files.push({
        path: '.github/renovate.json',
        content: generateRenovateConfig(),
        overwrite: false,
        description: 'Dependency update configuration',
    });

    return files;
}

function generateDocsStructure(plan: CompletePlan, config: ScaffoldConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Architecture doc
    files.push({
        path: 'docs/architecture.md',
        content: generateArchitectureDoc(plan, config),
        overwrite: false,
        description: 'Architecture documentation',
    });

    // API documentation placeholder
    files.push({
        path: 'docs/api.md',
        content: generateApiDoc(plan),
        overwrite: false,
        description: 'API documentation',
    });

    // Changelog
    files.push({
        path: 'CHANGELOG.md',
        content: generateChangelog(plan),
        overwrite: false,
        description: 'Version history',
    });

    return files;
}

function generateFeatureFiles(plan: CompletePlan, config: ScaffoldConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const srcDir = getSrcDir(config.projectType);

    for (const feature of plan.featureBlocks) {
        const featureDir = toKebabCase(feature.name);

        // Types file
        files.push({
            path: `${srcDir}/${featureDir}/types.ts`,
            content: generateFeatureTypes(feature),
            overwrite: false,
            description: `Type definitions for ${feature.name}`,
        });

        // Main implementation file
        files.push({
            path: `${srcDir}/${featureDir}/${featureDir}.ts`,
            content: generateFeatureImplementation(feature),
            overwrite: false,
            description: `Main implementation of ${feature.name}`,
        });
    }

    return files;
}

// ============================================================================
// Content Generators
// ============================================================================

function generatePackageJson(plan: CompletePlan, config: ScaffoldConfig): string {
    const scripts: Record<string, string> = {
        build: 'tsc',
        watch: 'tsc -w',
        lint: 'eslint src --ext .ts',
        'lint:fix': 'eslint src --ext .ts --fix',
    };

    if (config.includeTests) {
        scripts.test = 'jest';
        scripts['test:watch'] = 'jest --watch';
        scripts['test:coverage'] = 'jest --coverage';
    }

    const devDependencies: Record<string, string> = {
        'typescript': '^5.0.0',
        '@types/node': '^20.0.0',
        'eslint': '^8.0.0',
        '@typescript-eslint/eslint-plugin': '^6.0.0',
        '@typescript-eslint/parser': '^6.0.0',
    };

    if (config.includeTests) {
        devDependencies['jest'] = '^29.0.0';
        devDependencies['@types/jest'] = '^29.0.0';
        devDependencies['ts-jest'] = '^29.0.0';
    }

    const pkg = {
        name: config.packageName,
        version: '0.1.0',
        description: plan.overview.description,
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        scripts,
        keywords: plan.overview.goals.map(g => g.split(' ')[0].toLowerCase()),
        author: config.author || '',
        license: config.license === 'none' ? 'UNLICENSED' : config.license,
        devDependencies,
        engines: {
            node: '>=18.0.0',
        },
    };

    return JSON.stringify(pkg, null, 2);
}

function generateTsConfig(config: ScaffoldConfig): string {
    const baseConfig = {
        compilerOptions: {
            target: 'ES2022',
            module: 'commonjs',
            lib: ['ES2022'],
            outDir: './dist',
            rootDir: './src',
            declaration: true,
            declarationMap: true,
            sourceMap: true,
            esModuleInterop: true,
            forceConsistentCasingInFileNames: true,
            skipLibCheck: true,
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist', 'tests'],
    };

    // Add strictness based on config
    if (config.tsConfig === 'strict') {
        Object.assign(baseConfig.compilerOptions, {
            strict: true,
            noImplicitAny: true,
            strictNullChecks: true,
            strictFunctionTypes: true,
            strictBindCallApply: true,
            strictPropertyInitialization: true,
            noImplicitThis: true,
            noImplicitReturns: true,
            noFallthroughCasesInSwitch: true,
            noUncheckedIndexedAccess: true,
        });
    } else if (config.tsConfig === 'standard') {
        Object.assign(baseConfig.compilerOptions, {
            strict: true,
            noImplicitAny: true,
            strictNullChecks: true,
        });
    }

    return JSON.stringify(baseConfig, null, 2);
}

function generateReadme(plan: CompletePlan, config: ScaffoldConfig): string {
    const features = plan.featureBlocks.map(f => `- **${f.name}**: ${f.description || 'No description'}`).join('\n');
    const goals = plan.overview.goals.map(g => `- ${g}`).join('\n');

    return `# ${plan.overview.name}

${plan.overview.description}

## Goals

${goals || '- Define project goals'}

## Features

${features || '- No features defined yet'}

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn

### Installation

\`\`\`bash
npm install
\`\`\`

### Development

\`\`\`bash
# Build the project
npm run build

# Watch mode
npm run watch

# Run tests
npm test

# Lint
npm run lint
\`\`\`

## Project Structure

\`\`\`
${config.packageName}/
├── src/
│   ├── index.ts          # Main entry point
│   ├── config/           # Configuration
│   ├── common/           # Shared utilities
${plan.featureBlocks.map(f => `│   ├── ${toKebabCase(f.name)}/         # ${f.name}`).join('\n')}
├── tests/                # Test files
├── docs/                 # Documentation
└── dist/                 # Compiled output
\`\`\`

## License

${config.license === 'none' ? 'Unlicensed' : config.license}
`;
}

function generateGitignore(config: ScaffoldConfig): string {
    return `# Dependencies
node_modules/

# Build output
dist/
out/
build/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
.env.*.local

# Coverage
coverage/
.nyc_output/

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# TypeScript
*.tsbuildinfo

# Temporary files
tmp/
temp/
*.tmp
`;
}

function generateLicense(config: ScaffoldConfig): string {
    const year = new Date().getFullYear();
    const author = config.author || '[Author]';

    switch (config.license) {
        case 'MIT':
            return `MIT License

Copyright (c) ${year} ${author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
        case 'Apache-2.0':
            return `Apache License 2.0

Copyright ${year} ${author}

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`;
        default:
            return `Copyright (c) ${year} ${author}\nAll rights reserved.`;
    }
}

function generateEditorConfig(): string {
    return `root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[*.{yml,yaml}]
indent_size = 2

[Makefile]
indent_style = tab
`;
}

function generateMainEntry(plan: CompletePlan, config: ScaffoldConfig): string {
    const imports = plan.featureBlocks
        .map(f => `export * from './${toKebabCase(f.name)}';`)
        .join('\n');

    return `/**
 * ${plan.overview.name}
 * 
 * ${plan.overview.description}
 * 
 * @packageDocumentation
 */

${imports}

export * from './common/types';
export * from './config';
`;
}

function generateFeatureIndex(feature: FeatureBlock): string {
    const kebabName = toKebabCase(feature.name);
    return `/**
 * ${feature.name} Module
 * 
 * ${feature.description || 'No description provided'}
 * 
 * Priority: ${feature.priority}
 */

export * from './types';
export * from './${kebabName}';
`;
}

function generateCommonTypes(plan: CompletePlan): string {
    return `/**
 * Shared Type Definitions
 * 
 * Common types used across the project.
 */

/**
 * Standard result type for operations that can fail.
 */
export interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}

/**
 * Pagination options for list operations.
 */
export interface PaginationOptions {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Generic ID type.
 */
export type ID = string;

/**
 * Timestamp type.
 */
export type Timestamp = string;

/**
 * Base entity interface.
 */
export interface BaseEntity {
  id: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
`;
}

function generateCommonUtils(): string {
    return `/**
 * Shared Utility Functions
 */

/**
 * Generate a unique ID.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get current ISO timestamp.
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Sleep for specified milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safe JSON parse with fallback.
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Deep clone an object.
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if value is defined (not null or undefined).
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
`;
}

function generateConfigModule(config: ScaffoldConfig): string {
    return `/**
 * Configuration Module
 * 
 * Manages application configuration from environment and files.
 */

export interface AppConfig {
  /** Application name */
  name: string;
  /** Environment (development, production, test) */
  env: 'development' | 'production' | 'test';
  /** Debug mode */
  debug: boolean;
  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

const defaultConfig: AppConfig = {
  name: '${config.packageName}',
  env: 'development',
  debug: true,
  logLevel: 'info',
};

let config: AppConfig = { ...defaultConfig };

/**
 * Load configuration from environment.
 */
export function loadConfig(): AppConfig {
  config = {
    ...defaultConfig,
    env: (process.env.NODE_ENV as AppConfig['env']) || 'development',
    debug: process.env.DEBUG === 'true',
    logLevel: (process.env.LOG_LEVEL as AppConfig['logLevel']) || 'info',
  };
  return config;
}

/**
 * Get current configuration.
 */
export function getConfig(): AppConfig {
  return config;
}

/**
 * Update configuration.
 */
export function updateConfig(updates: Partial<AppConfig>): AppConfig {
  config = { ...config, ...updates };
  return config;
}
`;
}

function generateJestConfig(config: ScaffoldConfig): string {
    return `/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  verbose: true,
};
`;
}

function generateTestSetup(config: ScaffoldConfig): string {
    return `/**
 * Test Setup
 * 
 * Global test configuration and mocks.
 */

// Increase timeout for slow tests
jest.setTimeout(10000);

// Global before/after hooks
beforeAll(() => {
  // Setup test environment
});

afterAll(() => {
  // Cleanup test environment
});

// Reset mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});
`;
}

function generateFeatureTest(feature: FeatureBlock): string {
    const kebabName = toKebabCase(feature.name);
    const pascalName = toPascalCase(feature.name);

    const criteriaTests = feature.acceptanceCriteria.length > 0
        ? feature.acceptanceCriteria.map((c, i) => `
  it('Test ${i + 1}: ${c}', () => {
    // TODO: Implement test for: ${c}
    expect(true).toBe(true);
  });`).join('\n')
        : `
  it('Test 1: should be implemented', () => {
    // TODO: Add tests based on acceptance criteria
    expect(true).toBe(true);
  });`;

    return `/**
 * Tests for ${feature.name}
 * 
 * Priority: ${feature.priority}
 * ${feature.description || ''}
 */

import { /* TODO: import from module */ } from '../src/${kebabName}';

describe('${pascalName}', () => {
  describe('initialization', () => {
    it('Test 1: should initialize correctly', () => {
      // TODO: Implement initialization test
      expect(true).toBe(true);
    });
  });

  describe('acceptance criteria', () => {${criteriaTests}
  });
});
`;
}

function generateGitHubActions(config: ScaffoldConfig): string {
    return `name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build

      - name: Test
        run: npm test -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        if: matrix.node-version == '20.x'
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: false
`;
}

function generateRenovateConfig(): string {
    return `{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:base"
  ],
  "labels": ["dependencies"],
  "packageRules": [
    {
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": true
    }
  ]
}
`;
}

function generateArchitectureDoc(plan: CompletePlan, config: ScaffoldConfig): string {
    return `# Architecture

## Overview

${plan.overview.description}

## Goals

${plan.overview.goals.map(g => `- ${g}`).join('\n') || '- Define goals'}

## Features

${plan.featureBlocks.map(f => `
### ${f.name}

**Priority**: ${f.priority}

${f.description || 'No description'}

**Acceptance Criteria**:
${f.acceptanceCriteria.map(c => `- [ ] ${c}`).join('\n') || '- No criteria defined'}
`).join('\n')}

## Technical Decisions

- **Language**: TypeScript
- **Runtime**: Node.js >= 18
- **Module System**: CommonJS
- **Testing**: Jest

## Directory Structure

See README.md for the full directory structure.
`;
}

function generateApiDoc(plan: CompletePlan): string {
    return `# API Documentation

## Overview

This document describes the public API for ${plan.overview.name}.

## Modules

${plan.featureBlocks.map(f => `
### ${f.name}

${f.description || 'No description'}

\`\`\`typescript
// TODO: Document API
\`\`\`
`).join('\n')}
`;
}

function generateChangelog(plan: CompletePlan): string {
    const today = new Date().toISOString().split('T')[0];
    return `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
${plan.featureBlocks.map(f => `- ${f.name}: Initial implementation`).join('\n')}

## [0.1.0] - ${today}

### Added
- Initial project setup
- Basic project structure
- CI/CD configuration
`;
}

function generateFeatureTypes(feature: FeatureBlock): string {
    const pascalName = toPascalCase(feature.name);
    return `/**
 * Type definitions for ${feature.name}
 */

/**
 * ${pascalName} configuration options.
 */
export interface ${pascalName}Options {
  // TODO: Define options
}

/**
 * ${pascalName} result type.
 */
export interface ${pascalName}Result {
  success: boolean;
  // TODO: Define result shape
}
`;
}

function generateFeatureImplementation(feature: FeatureBlock): string {
    const pascalName = toPascalCase(feature.name);
    const camelName = toCamelCase(feature.name);

    return `/**
 * ${feature.name} Implementation
 * 
 * ${feature.description || 'No description'}
 * 
 * Priority: ${feature.priority}
 * 
 * Acceptance Criteria:
${feature.acceptanceCriteria.map(c => ` * - ${c}`).join('\n') || ' * - No criteria defined'}
 */

import { ${pascalName}Options, ${pascalName}Result } from './types';

/**
 * Initialize ${feature.name}.
 */
export function initialize${pascalName}(options?: ${pascalName}Options): void {
  // TODO: Implement initialization
  console.log('Initializing ${feature.name}');
}

/**
 * Main ${feature.name} function.
 */
export function ${camelName}(): ${pascalName}Result {
  // TODO: Implement main functionality
  return {
    success: true,
  };
}
`;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getSrcDir(projectType: ProjectType): string {
    switch (projectType) {
        case 'vscode-extension':
            return 'src';
        case 'cli-tool':
            return 'src';
        case 'web-app':
            return 'src';
        case 'rest-api':
            return 'src';
        default:
            return 'src';
    }
}

function toKebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
}

function toPascalCase(str: string): string {
    return str
        .split(/[-_\s]+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

function toCamelCase(str: string): string {
    const pascal = toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function generateSummary(files: GeneratedFile[], plan: CompletePlan, config: ScaffoldConfig): string {
    return `
## Scaffold Summary

- **Project**: ${plan.overview.name}
- **Type**: ${config.projectType}
- **Files Generated**: ${files.length}
- **Features**: ${plan.featureBlocks.length}
- **Tests**: ${config.includeTests ? 'Yes' : 'No'}
- **CI/CD**: ${config.includeCi ? 'Yes' : 'No'}
`;
}

function generateNextSteps(plan: CompletePlan, config: ScaffoldConfig): string[] {
    const steps = [
        'Run `npm install` to install dependencies',
        'Review and update `package.json` with correct metadata',
        'Configure environment variables if needed',
    ];

    if (plan.featureBlocks.length > 0) {
        steps.push(`Implement ${plan.featureBlocks[0].name} (highest priority: ${plan.featureBlocks.sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority))[0].name})`);
    }

    steps.push('Write tests for implemented features');
    steps.push('Update documentation as you develop');

    return steps;
}

function priorityOrder(priority: string): number {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[priority] ?? 4;
}
