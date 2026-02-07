/**
 * Dependency Script Generator (MT-033.25)
 *
 * **Simple explanation**: Generates setup scripts and configuration for
 * managing feature dependencies. Creates build order scripts, dependency
 * installation, and verification checks.
 *
 * @module generators/dependencyScripts
 */

import { CompletePlan, FeatureBlock, BlockLink, DependencyType } from '../planning/types';
import { detectCycles, calculateCriticalPath } from '../ui/dependencyGraph';

// ============================================================================
// Types
// ============================================================================

export interface DependencyScriptConfig {
    /** Output format for scripts */
    format: 'bash' | 'powershell' | 'makefile' | 'npm';
    /** Include verification checks */
    includeVerification: boolean;
    /** Include rollback procedures */
    includeRollback: boolean;
    /** Parallel execution support */
    parallelExecution: boolean;
    /** Verbose logging in scripts */
    verbose: boolean;
}

export interface GeneratedScript {
    /** Script name */
    name: string;
    /** File path */
    path: string;
    /** Script content */
    content: string;
    /** Script purpose */
    description: string;
    /** Execution order (if applicable) */
    order?: number;
}

export interface DependencyGraph {
    /** All nodes (features) */
    nodes: string[];
    /** Edges (dependencies) */
    edges: Array<{ from: string; to: string; type: DependencyType }>;
    /** Build order (topologically sorted) */
    buildOrder: string[];
    /** Parallel execution groups */
    parallelGroups: string[][];
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_SCRIPT_CONFIG: DependencyScriptConfig = {
    format: 'npm',
    includeVerification: true,
    includeRollback: false,
    parallelExecution: true,
    verbose: true,
};

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate all dependency scripts for a plan.
 *
 * **Simple explanation**: Creates scripts that help you build features
 * in the right order, respecting dependencies between them.
 */
export function generateDependencyScripts(
    plan: CompletePlan,
    config: DependencyScriptConfig = DEFAULT_SCRIPT_CONFIG
): GeneratedScript[] {
    const scripts: GeneratedScript[] = [];
    const graph = buildDependencyGraph(plan);

    // Main build script
    scripts.push(generateBuildScript(plan, graph, config));

    // Individual feature scripts
    scripts.push(...generateFeatureScripts(plan, graph, config));

    // Verification script
    if (config.includeVerification) {
        scripts.push(generateVerificationScript(plan, graph, config));
    }

    // Dependency check script
    scripts.push(generateDependencyCheckScript(plan, graph, config));

    // Rollback script
    if (config.includeRollback) {
        scripts.push(generateRollbackScript(plan, graph, config));
    }

    // Package.json scripts section
    if (config.format === 'npm') {
        scripts.push(generateNpmScripts(plan, graph, config));
    }

    return scripts;
}

// ============================================================================
// Graph Building
// ============================================================================

/**
 * Build dependency graph from plan.
 */
export function buildDependencyGraph(plan: CompletePlan): DependencyGraph {
    const nodes = plan.featureBlocks.map(f => f.id);
    const edges = plan.blockLinks
        .filter(l => l.dependencyType === 'requires' || l.dependencyType === 'blocks')
        .map(l => ({
            from: l.sourceBlockId,
            to: l.targetBlockId,
            type: l.dependencyType,
        }));

    // Topological sort for build order
    const buildOrder = topologicalSort(nodes, edges);

    // Group into parallel execution batches
    const parallelGroups = groupForParallelExecution(nodes, edges);

    return { nodes, edges, buildOrder, parallelGroups };
}

/**
 * Topological sort using Kahn's algorithm.
 */
function topologicalSort(
    nodes: string[],
    edges: Array<{ from: string; to: string }>
): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize
    nodes.forEach(n => {
        inDegree.set(n, 0);
        adjacency.set(n, []);
    });

    // Build adjacency and in-degree
    // For 'requires': A requires B means B must be built before A
    // So edge from A -> B means A depends on B
    edges.forEach(e => {
        inDegree.set(e.from, (inDegree.get(e.from) || 0) + 1);
        const adj = adjacency.get(e.to) || [];
        adj.push(e.from);
        adjacency.set(e.to, adj);
    });

    // Find all nodes with no dependencies
    const queue: string[] = [];
    nodes.forEach(n => {
        if ((inDegree.get(n) || 0) === 0) {
            queue.push(n);
        }
    });

    const result: string[] = [];
    while (queue.length > 0) {
        const node = queue.shift()!;
        result.push(node);

        const neighbors = adjacency.get(node) || [];
        for (const neighbor of neighbors) {
            const newDegree = (inDegree.get(neighbor) || 1) - 1;
            inDegree.set(neighbor, newDegree);
            if (newDegree === 0) {
                queue.push(neighbor);
            }
        }
    }

    // Check for cycles
    if (result.length !== nodes.length) {
        console.warn('Dependency cycle detected, using original order');
        return nodes;
    }

    return result;
}

/**
 * Group nodes into parallel execution batches.
 */
function groupForParallelExecution(
    nodes: string[],
    edges: Array<{ from: string; to: string }>
): string[][] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    nodes.forEach(n => {
        inDegree.set(n, 0);
        adjacency.set(n, []);
    });

    edges.forEach(e => {
        inDegree.set(e.from, (inDegree.get(e.from) || 0) + 1);
        const adj = adjacency.get(e.to) || [];
        adj.push(e.from);
        adjacency.set(e.to, adj);
    });

    const groups: string[][] = [];
    const remaining = new Set(nodes);

    while (remaining.size > 0) {
        // Find all nodes with no remaining dependencies
        const currentGroup: string[] = [];
        for (const node of remaining) {
            if ((inDegree.get(node) || 0) === 0) {
                currentGroup.push(node);
            }
        }

        if (currentGroup.length === 0) {
            // Cycle detected, add remaining to last group
            groups.push([...remaining]);
            break;
        }

        groups.push(currentGroup);

        // Remove current group and update in-degrees
        for (const node of currentGroup) {
            remaining.delete(node);
            const neighbors = adjacency.get(node) || [];
            for (const neighbor of neighbors) {
                const newDegree = (inDegree.get(neighbor) || 1) - 1;
                inDegree.set(neighbor, newDegree);
            }
        }
    }

    return groups;
}

// ============================================================================
// Script Generators
// ============================================================================

function generateBuildScript(
    plan: CompletePlan,
    graph: DependencyGraph,
    config: DependencyScriptConfig
): GeneratedScript {
    const featureMap = new Map(plan.featureBlocks.map(f => [f.id, f]));

    switch (config.format) {
        case 'bash':
            return generateBashBuildScript(plan, graph, featureMap, config);
        case 'powershell':
            return generatePowerShellBuildScript(plan, graph, featureMap, config);
        case 'makefile':
            return generateMakefileBuildScript(plan, graph, featureMap, config);
        case 'npm':
        default:
            return generateNpmBuildScript(plan, graph, featureMap, config);
    }
}

function generateBashBuildScript(
    plan: CompletePlan,
    graph: DependencyGraph,
    featureMap: Map<string, FeatureBlock>,
    config: DependencyScriptConfig
): GeneratedScript {
    const lines: string[] = [
        '#!/bin/bash',
        '',
        '# Build script for ' + plan.overview.name,
        '# Generated from plan - DO NOT EDIT MANUALLY',
        '',
        'set -e  # Exit on error',
        config.verbose ? 'set -x  # Print commands' : '',
        '',
        '# Colors for output',
        'RED="\\033[0;31m"',
        'GREEN="\\033[0;32m"',
        'YELLOW="\\033[1;33m"',
        'NC="\\033[0m"',
        '',
        'echo_status() { echo -e "${GREEN}[BUILD]${NC} $1"; }',
        'echo_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }',
        'echo_error() { echo -e "${RED}[ERROR]${NC} $1"; }',
        '',
        '# Build functions for each feature',
    ].filter(Boolean);

    // Generate build function for each feature
    for (const featureId of graph.buildOrder) {
        const feature = featureMap.get(featureId);
        if (!feature) continue;

        const funcName = toSnakeCase(feature.name);
        const deps = graph.edges.filter(e => e.from === featureId).map(e => {
            const dep = featureMap.get(e.to);
            return dep ? toSnakeCase(dep.name) : null;
        }).filter(Boolean);

        lines.push('');
        lines.push(`build_${funcName}() {`);
        lines.push(`    echo_status "Building ${feature.name}..."`);

        // Check dependencies first
        if (deps.length > 0) {
            lines.push('    # Check dependencies');
            for (const dep of deps) {
                lines.push(`    if [ ! -f ".build/${dep}.done" ]; then`);
                lines.push(`        echo_error "Dependency ${dep} not built yet"`);
                lines.push('        return 1');
                lines.push('    fi');
            }
        }

        lines.push(`    # TODO: Add build commands for ${feature.name}`);
        lines.push(`    mkdir -p .build`);
        lines.push(`    touch .build/${funcName}.done`);
        lines.push(`    echo_status "${feature.name} built successfully"`);
        lines.push('}');
    }

    // Main build sequence
    lines.push('');
    lines.push('# Main build sequence');
    lines.push('main() {');
    lines.push('    echo_status "Starting build..."');
    lines.push('    echo_status "Build order:"');

    graph.buildOrder.forEach((id, i) => {
        const feature = featureMap.get(id);
        if (feature) {
            lines.push(`    echo "  ${i + 1}. ${feature.name}"`);
        }
    });

    lines.push('');
    lines.push('    # Clean previous build markers');
    lines.push('    rm -rf .build');
    lines.push('');

    if (config.parallelExecution && graph.parallelGroups.length > 0) {
        lines.push('    # Parallel execution groups');
        graph.parallelGroups.forEach((group, i) => {
            lines.push(`    echo_status "Building group ${i + 1}..."`);
            const funcs = group.map(id => {
                const f = featureMap.get(id);
                return f ? `build_${toSnakeCase(f.name)}` : null;
            }).filter(Boolean);

            if (funcs.length === 1) {
                lines.push(`    ${funcs[0]}`);
            } else {
                lines.push(`    # These can be built in parallel`);
                funcs.forEach(func => lines.push(`    ${func} &`));
                lines.push('    wait');
            }
        });
    } else {
        lines.push('    # Sequential build');
        for (const featureId of graph.buildOrder) {
            const feature = featureMap.get(featureId);
            if (feature) {
                lines.push(`    build_${toSnakeCase(feature.name)}`);
            }
        }
    }

    lines.push('');
    lines.push('    echo_status "Build complete!"');
    lines.push('}');
    lines.push('');
    lines.push('main "$@"');

    return {
        name: 'build.sh',
        path: 'scripts/build.sh',
        content: lines.join('\n'),
        description: 'Main build script with dependency ordering',
    };
}

function generatePowerShellBuildScript(
    plan: CompletePlan,
    graph: DependencyGraph,
    featureMap: Map<string, FeatureBlock>,
    config: DependencyScriptConfig
): GeneratedScript {
    const lines: string[] = [
        '# Build script for ' + plan.overview.name,
        '# Generated from plan - DO NOT EDIT MANUALLY',
        '',
        '$ErrorActionPreference = "Stop"',
        '',
        'function Write-Status { param($msg) Write-Host "[BUILD] $msg" -ForegroundColor Green }',
        'function Write-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }',
        'function Write-Err { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }',
        '',
    ];

    // Generate build function for each feature
    for (const featureId of graph.buildOrder) {
        const feature = featureMap.get(featureId);
        if (!feature) continue;

        const funcName = toPascalCase(feature.name);

        lines.push(`function Build-${funcName} {`);
        lines.push(`    Write-Status "Building ${feature.name}..."`);
        lines.push(`    # TODO: Add build commands for ${feature.name}`);
        lines.push(`    New-Item -ItemType Directory -Force -Path ".build" | Out-Null`);
        lines.push(`    New-Item -ItemType File -Force -Path ".build/${funcName}.done" | Out-Null`);
        lines.push(`    Write-Status "${feature.name} built successfully"`);
        lines.push('}');
        lines.push('');
    }

    // Main function
    lines.push('function Invoke-Build {');
    lines.push('    Write-Status "Starting build..."');
    lines.push('    Remove-Item -Recurse -Force ".build" -ErrorAction SilentlyContinue');
    lines.push('');

    for (const featureId of graph.buildOrder) {
        const feature = featureMap.get(featureId);
        if (feature) {
            lines.push(`    Build-${toPascalCase(feature.name)}`);
        }
    }

    lines.push('');
    lines.push('    Write-Status "Build complete!"');
    lines.push('}');
    lines.push('');
    lines.push('Invoke-Build');

    return {
        name: 'build.ps1',
        path: 'scripts/build.ps1',
        content: lines.join('\n'),
        description: 'PowerShell build script with dependency ordering',
    };
}

function generateMakefileBuildScript(
    plan: CompletePlan,
    graph: DependencyGraph,
    featureMap: Map<string, FeatureBlock>,
    config: DependencyScriptConfig
): GeneratedScript {
    const lines: string[] = [
        '# Makefile for ' + plan.overview.name,
        '# Generated from plan - DO NOT EDIT MANUALLY',
        '',
        '.PHONY: all clean ' + plan.featureBlocks.map(f => toSnakeCase(f.name)).join(' '),
        '',
        'all: ' + graph.buildOrder.map(id => {
            const f = featureMap.get(id);
            return f ? toSnakeCase(f.name) : '';
        }).filter(Boolean).join(' '),
        '',
    ];

    // Generate targets for each feature
    for (const feature of plan.featureBlocks) {
        const targetName = toSnakeCase(feature.name);
        const deps = graph.edges
            .filter(e => e.from === feature.id)
            .map(e => {
                const dep = featureMap.get(e.to);
                return dep ? toSnakeCase(dep.name) : null;
            })
            .filter(Boolean)
            .join(' ');

        lines.push(`${targetName}: ${deps}`);
        lines.push(`\t@echo "Building ${feature.name}..."`);
        lines.push(`\t# TODO: Add build commands for ${feature.name}`);
        lines.push(`\t@mkdir -p .build`);
        lines.push(`\t@touch .build/${targetName}.done`);
        lines.push(`\t@echo "${feature.name} built successfully"`);
        lines.push('');
    }

    lines.push('clean:');
    lines.push('\t@rm -rf .build');
    lines.push('\t@echo "Clean complete"');

    return {
        name: 'Makefile',
        path: 'Makefile',
        content: lines.join('\n'),
        description: 'Makefile with automatic dependency resolution',
    };
}

function generateNpmBuildScript(
    plan: CompletePlan,
    graph: DependencyGraph,
    featureMap: Map<string, FeatureBlock>,
    config: DependencyScriptConfig
): GeneratedScript {
    const content = `/**
 * Build orchestration script
 * 
 * Generated from plan - DO NOT EDIT MANUALLY
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BUILD_DIR = '.build';

// Build order based on dependencies
const BUILD_ORDER = ${JSON.stringify(
        graph.buildOrder.map(id => ({
            id,
            name: featureMap.get(id)?.name || id,
        })),
        null,
        2
    )};

// Parallel execution groups
const PARALLEL_GROUPS = ${JSON.stringify(
        graph.parallelGroups.map(group =>
            group.map(id => ({
                id,
                name: featureMap.get(id)?.name || id,
            }))
        ),
        null,
        2
    )};

function log(msg) {
    console.log('\\x1b[32m[BUILD]\\x1b[0m', msg);
}

function warn(msg) {
    console.log('\\x1b[33m[WARN]\\x1b[0m', msg);
}

function error(msg) {
    console.error('\\x1b[31m[ERROR]\\x1b[0m', msg);
}

function ensureBuildDir() {
    if (!fs.existsSync(BUILD_DIR)) {
        fs.mkdirSync(BUILD_DIR, { recursive: true });
    }
}

function markComplete(featureId) {
    ensureBuildDir();
    fs.writeFileSync(
        path.join(BUILD_DIR, \`\${featureId}.done\`),
        new Date().toISOString()
    );
}

function isComplete(featureId) {
    return fs.existsSync(path.join(BUILD_DIR, \`\${featureId}.done\`));
}

async function buildFeature(feature) {
    log(\`Building \${feature.name}...\`);
    
    // TODO: Add actual build logic for each feature
    // This is where you would add npm scripts, compile commands, etc.
    
    markComplete(feature.id);
    log(\`\${feature.name} built successfully\`);
}

async function buildSequential() {
    log('Starting sequential build...');
    log('Build order:');
    BUILD_ORDER.forEach((f, i) => console.log(\`  \${i + 1}. \${f.name}\`));
    console.log('');
    
    for (const feature of BUILD_ORDER) {
        await buildFeature(feature);
    }
}

async function buildParallel() {
    log('Starting parallel build...');
    log(\`\${PARALLEL_GROUPS.length} parallel groups\`);
    console.log('');
    
    for (let i = 0; i < PARALLEL_GROUPS.length; i++) {
        const group = PARALLEL_GROUPS[i];
        log(\`Building group \${i + 1}: \${group.map(f => f.name).join(', ')}\`);
        
        await Promise.all(group.map(f => buildFeature(f)));
    }
}

async function clean() {
    log('Cleaning build artifacts...');
    if (fs.existsSync(BUILD_DIR)) {
        fs.rmSync(BUILD_DIR, { recursive: true });
    }
    log('Clean complete');
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--clean')) {
        await clean();
        return;
    }
    
    // Clean first
    await clean();
    
    // Build
    if (args.includes('--sequential')) {
        await buildSequential();
    } else {
        await buildParallel();
    }
    
    log('\\n✓ Build complete!');
}

main().catch(err => {
    error(err.message);
    process.exit(1);
});
`;

    return {
        name: 'build.js',
        path: 'scripts/build.js',
        content,
        description: 'Node.js build orchestration script',
    };
}

function generateFeatureScripts(
    plan: CompletePlan,
    graph: DependencyGraph,
    config: DependencyScriptConfig
): GeneratedScript[] {
    return plan.featureBlocks.map((feature, index) => {
        const deps = graph.edges
            .filter(e => e.from === feature.id)
            .map(e => plan.featureBlocks.find(f => f.id === e.to)?.name)
            .filter(Boolean);

        const content = `/**
 * Build script for: ${feature.name}
 * Priority: ${feature.priority}
 * Order: ${index + 1}
 * 
 * Dependencies: ${deps.length > 0 ? deps.join(', ') : 'None'}
 * 
 * Acceptance Criteria:
${feature.acceptanceCriteria.map(c => ` * - ${c}`).join('\n') || ' * - None defined'}
 */

const { execSync } = require('child_process');

console.log('Building ${feature.name}...');

// TODO: Add build commands specific to this feature
// Examples:
// execSync('npm run compile -- --scope=${toKebabCase(feature.name)}');
// execSync('tsc src/${toKebabCase(feature.name)}/**/*.ts');

console.log('${feature.name} build complete');
`;

        return {
            name: `build-${toKebabCase(feature.name)}.js`,
            path: `scripts/build-${toKebabCase(feature.name)}.js`,
            content,
            description: `Build script for ${feature.name}`,
            order: index + 1,
        };
    });
}

function generateVerificationScript(
    plan: CompletePlan,
    graph: DependencyGraph,
    config: DependencyScriptConfig
): GeneratedScript {
    const content = `/**
 * Verification script for ${plan.overview.name}
 * 
 * Verifies all features are properly built and dependencies are satisfied.
 */

const fs = require('fs');
const path = require('path');

const BUILD_DIR = '.build';

const FEATURES = ${JSON.stringify(
        plan.featureBlocks.map(f => ({ id: f.id, name: f.name })),
        null,
        2
    )};

const DEPENDENCIES = ${JSON.stringify(
        plan.blockLinks.filter(l => l.dependencyType === 'requires').map(l => ({
            feature: l.sourceBlockId,
            requires: l.targetBlockId,
        })),
        null,
        2
    )};

function verify() {
    console.log('Verifying build...');
    let errors = 0;
    
    // Check all features are built
    for (const feature of FEATURES) {
        const marker = path.join(BUILD_DIR, \`\${feature.id}.done\`);
        if (!fs.existsSync(marker)) {
            console.error(\`❌ \${feature.name} is not built\`);
            errors++;
        } else {
            console.log(\`✓ \${feature.name} is built\`);
        }
    }
    
    // Check dependencies are satisfied (built before dependent)
    for (const dep of DEPENDENCIES) {
        const featureMarker = path.join(BUILD_DIR, \`\${dep.feature}.done\`);
        const depMarker = path.join(BUILD_DIR, \`\${dep.requires}.done\`);
        
        if (fs.existsSync(featureMarker) && fs.existsSync(depMarker)) {
            const featureTime = fs.statSync(featureMarker).mtime;
            const depTime = fs.statSync(depMarker).mtime;
            
            if (depTime > featureTime) {
                console.error(\`❌ Dependency \${dep.requires} was built after \${dep.feature}\`);
                errors++;
            }
        }
    }
    
    if (errors === 0) {
        console.log('\\n✓ All verifications passed!');
        return 0;
    } else {
        console.error(\`\\n❌ \${errors} verification(s) failed\`);
        return 1;
    }
}

process.exit(verify());
`;

    return {
        name: 'verify.js',
        path: 'scripts/verify.js',
        content,
        description: 'Build verification script',
    };
}

function generateDependencyCheckScript(
    plan: CompletePlan,
    graph: DependencyGraph,
    config: DependencyScriptConfig
): GeneratedScript {
    const cycles = detectCycles(plan);

    const content = `/**
 * Dependency analysis script for ${plan.overview.name}
 */

// Dependency Graph Summary
const GRAPH = {
    features: ${plan.featureBlocks.length},
    dependencies: ${plan.blockLinks.filter(l => l.dependencyType === 'requires').length},
    buildOrder: ${JSON.stringify(graph.buildOrder.map(id => plan.featureBlocks.find(f => f.id === id)?.name))},
    parallelGroups: ${graph.parallelGroups.length},
    hasCycles: ${cycles.length > 0},
    cycles: ${JSON.stringify(cycles)},
};

console.log('Dependency Analysis');
console.log('==================');
console.log(\`Features: \${GRAPH.features}\`);
console.log(\`Dependencies: \${GRAPH.dependencies}\`);
console.log(\`Build order: \${GRAPH.buildOrder.join(' → ')}\`);
console.log(\`Parallel groups: \${GRAPH.parallelGroups}\`);
console.log(\`Has cycles: \${GRAPH.hasCycles}\`);

if (GRAPH.hasCycles) {
    console.error('\\n⚠️  Circular dependencies detected!');
    console.error('Cycles:', GRAPH.cycles);
    process.exit(1);
}

console.log('\\n✓ No circular dependencies');
`;

    return {
        name: 'check-deps.js',
        path: 'scripts/check-deps.js',
        content,
        description: 'Dependency analysis and cycle detection',
    };
}

function generateRollbackScript(
    plan: CompletePlan,
    graph: DependencyGraph,
    config: DependencyScriptConfig
): GeneratedScript {
    const content = `/**
 * Rollback script for ${plan.overview.name}
 * 
 * Reverts build artifacts in reverse dependency order.
 */

const fs = require('fs');
const path = require('path');

const BUILD_DIR = '.build';

// Reverse build order for safe rollback
const ROLLBACK_ORDER = ${JSON.stringify(
        [...graph.buildOrder].reverse().map(id => ({
            id,
            name: plan.featureBlocks.find(f => f.id === id)?.name,
        })),
        null,
        2
    )};

function rollback(targetFeature) {
    console.log('Starting rollback...');
    
    let shouldRollback = !targetFeature;
    
    for (const feature of ROLLBACK_ORDER) {
        if (feature.id === targetFeature || feature.name === targetFeature) {
            shouldRollback = true;
        }
        
        if (shouldRollback) {
            const marker = path.join(BUILD_DIR, \`\${feature.id}.done\`);
            if (fs.existsSync(marker)) {
                console.log(\`Rolling back \${feature.name}...\`);
                fs.unlinkSync(marker);
                // TODO: Add actual rollback commands (undo builds, remove artifacts)
            }
        }
    }
    
    console.log('Rollback complete');
}

const target = process.argv[2];
rollback(target);
`;

    return {
        name: 'rollback.js',
        path: 'scripts/rollback.js',
        content,
        description: 'Build rollback script',
    };
}

function generateNpmScripts(
    plan: CompletePlan,
    graph: DependencyGraph,
    config: DependencyScriptConfig
): GeneratedScript {
    const scripts: Record<string, string> = {
        'build:all': 'node scripts/build.js',
        'build:sequential': 'node scripts/build.js --sequential',
        'build:verify': 'node scripts/verify.js',
        'build:check-deps': 'node scripts/check-deps.js',
        'build:clean': 'node scripts/build.js --clean',
    };

    // Add individual feature scripts
    for (const feature of plan.featureBlocks) {
        const kebab = toKebabCase(feature.name);
        scripts[`build:${kebab}`] = `node scripts/build-${kebab}.js`;
    }

    if (config.includeRollback) {
        scripts['build:rollback'] = 'node scripts/rollback.js';
    }

    const content = `// Add these scripts to your package.json

{
  "scripts": ${JSON.stringify(scripts, null, 4)}
}

// Example usage:
// npm run build:all          # Build all features with parallel execution
// npm run build:sequential   # Build all features in order
// npm run build:verify       # Verify build completeness
// npm run build:check-deps   # Check for dependency issues
// npm run build:clean        # Clean build artifacts
${plan.featureBlocks.map(f => `// npm run build:${toKebabCase(f.name).padEnd(20)} # Build ${f.name}`).join('\n')}
`;

    return {
        name: 'npm-scripts.json',
        path: 'scripts/npm-scripts.txt',
        content,
        description: 'NPM scripts to add to package.json',
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

function toKebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
}

function toSnakeCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase();
}

function toPascalCase(str: string): string {
    return str
        .split(/[-_\s]+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}
