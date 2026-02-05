#!/usr/bin/env node
const fs = require('fs');

function replaceInFile(fp, old, neu) {
    let c = fs.readFileSync(fp, 'utf-8');
    if (!c.includes(old)) {
        console.log(`⚠️ Pattern not found in ${fp}`);
        return false;
    }
    fs.writeFileSync(fp, c.replace(old, neu), 'utf-8');
    return true;
}

console.log('🔧 Applying MT-001.11 configuration integration...\n');

const llmOld = `    // Read config from .coe/config.json
    const configPath = path.join(context.extensionPath, '.coe', 'config.json');
    let config = { ...DEFAULT_CONFIG }; // Start with defaults

    if (fs.existsSync(configPath)) {
        try {
            const fileContent = fs.readFileSync(configPath, 'utf-8');
            const fileConfig = JSON.parse(fileContent);

            // Merge LLM config if it exists
            if (fileConfig.llm) {
                config = { ...config, ...fileConfig.llm };
            }
        } catch (error: any) {
            logWarn(\`Failed to read config file: \${error.message}. Using defaults.\`);
        }
    } else {
        logWarn(\`Config file not found at \${configPath}. Using defaults.\`);
    }

    // Validate timeoutSeconds (must be a positive number)
    if (typeof config.timeoutSeconds !== 'number' || config.timeoutSeconds <= 0) {
        logWarn(\`Invalid timeoutSeconds: \${config.timeoutSeconds}, using default: 60\`);
        config.timeoutSeconds = 60;
    }`;

const llmNew = `    // Now using central config system
    const configInstance = getConfigInstance();
    const config = configInstance.llm;`;

replaceInFile('./src/services/llmService.ts', "import { logInfo, logWarn, logError } from '../logger';", "import { logInfo, logWarn, logError } from '../logger';\nimport { getConfigInstance } from '../config';") && console.log('✅ llmService - import');
replaceInFile('./src/services/llmService.ts', llmOld, llmNew) && console.log('✅ llmService - config read');

replaceInFile('./src/services/orchestrator.ts', "import AnswerAgent from '../agents/answerAgent';", "import AnswerAgent from '../agents/answerAgent';\nimport { getConfigInstance } from '../config';") && console.log('✅ orchestrator - import');

const orchOld = `        // Step 1: Read taskTimeoutSeconds from config
        const configPath = path.join(context.extensionPath, '.coe', 'config.json');

        try {
            if (fs.existsSync(configPath)) {
                const configContent = fs.readFileSync(configPath, 'utf-8');
                const config = JSON.parse(configContent);

                // Try orchestrator.taskTimeoutSeconds first
                if (config.orchestrator?.taskTimeoutSeconds !== undefined) {
                    const timeout = config.orchestrator.taskTimeoutSeconds;
                    // Validate that timeout is a positive number
                    if (typeof timeout === 'number' && timeout > 0) {
                        this.taskTimeoutSeconds = timeout;
                    } else {
                        logWarn(\`Invalid taskTimeoutSeconds: \${timeout}. Must be > 0. Using default 30s\`);
                    }
                }
                // Fallback to llm.timeoutSeconds
                else if (config.llm?.timeoutSeconds !== undefined) {
                    const timeout = config.llm.timeoutSeconds;
                    if (typeof timeout === 'number' && timeout > 0) {
                        this.taskTimeoutSeconds = timeout;
                    } else {
                        logWarn(\`Invalid llm.timeoutSeconds: \${timeout}. Must be > 0. Using default 30s\`);
                    }
                }
                // Otherwise keep default 30
            }
        } catch (err) {
            // Silent fail - use default 30s
            logWarn(\`Failed to read orchestrator config: \${err}\`);
        }`;

const orchNew = `        // Now using central config system
        const config = getConfigInstance();
        this.taskTimeoutSeconds = config.orchestrator.taskTimeoutSeconds;`;

replaceInFile('./src/services/orchestrator.ts', orchOld, orchNew) && console.log('✅ orchestrator - config read');

replaceInFile('./src/services/ticketDb.ts', "import { logInfo, logWarn } from '../logger';", "import { logInfo, logWarn } from '../logger';\nimport { getConfigInstance } from '../config';") && console.log('✅ ticketDb - import');

const ticketOld = `    async initialize(context: vscode.ExtensionContext): Promise<void> {
        // Step 1: Read dbPath from config (or use default)
        const configPath = path.join(context.extensionPath, '.coe', 'config.json');
        let dbPathFromConfig = './.coe/tickets.db'; // default

        try {
            if (fs.existsSync(configPath)) {
                const configContent = fs.readFileSync(configPath, 'utf-8');
                const config = JSON.parse(configContent);
                if (config.tickets?.dbPath) {
                    dbPathFromConfig = config.tickets.dbPath;
                }
            }
        } catch (err) {
            logWarn(\`Failed to read config for dbPath: \${err}\`);
        }`;

const ticketNew = `    async initialize(context: vscode.ExtensionContext): Promise<void> {
        // Now using central config system
        const config = getConfigInstance();
        const dbPathFromConfig = config.tickets.dbPath;`;

replaceInFile('./src/services/ticketDb.ts', ticketOld, ticketNew) && console.log('✅ ticketDb - config read');

replaceInFile('./src/logger.ts', "import * as path from 'path';", "import * as path from 'path';\nimport { getConfigInstance } from './config';") && console.log('✅ logger - import');

console.log('\n✅ MT-001.11 complete! Next: npm run compile && npm run test:once');
