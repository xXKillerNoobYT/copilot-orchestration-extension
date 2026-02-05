#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// Mock VS Code ExtensionContext
const testDir = path.join(__dirname, '__debug_cache__');
const mockContext = {
    extensionPath: testDir,
    extensionUri: { fsPath: testDir },
};

// Clean up before starting
if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
}

// Import cache functions
const cache = require('./out/services/cache/index.js');
const cacheStructure = require('./out/services/cache/structure.js');

async function debug() {
    try {
        console.log('Starting cache debug...\n');

        // Initialize cache structure
        console.log('1. Initializing cache structure...');
        const initResult = await cacheStructure.initializeCacheStructure(mockContext);
        console.log(`   Result: ${initResult.success ? 'SUCCESS' : 'FAILED'}`);

        // Now try to get cache stats
        console.log('\n2. Calling getCacheStats...');
        const stats = cache.getCacheStats(mockContext);
        console.log(`   Stats object: ${JSON.stringify(stats, null, 2)}`);
        console.log(`   stats.totalItems type: ${typeof stats.totalItems}`);
        console.log(`   stats.totalItems value: ${stats.totalItems}`);

        if (stats && stats.totalItems === 0) {
            console.log('\n✓ SUCCESS: getCacheStats returned correct value!');
        } else {
            console.log('\n✗ FAILURE: getCacheStats returned unexpected value!');
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        console.error(error.stack);
    } finally {
        // Clean up
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    }
}

debug();
