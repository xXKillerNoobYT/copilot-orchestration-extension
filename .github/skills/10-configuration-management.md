# Configuration Management Pattern

**Purpose**: Load and validate configuration from .coe/config.json with fallback defaults  
**Related Files**: `src/config/index.ts`, `src/config/loader.ts`, `src/config/schema.ts`  
**Keywords**: configuration, config, validation, defaults, coe-config

## Configuration Architecture

COE uses centralized configuration with two sources:

1. **`.coe/config.json`** - User workspace config (gitignored)
2. **VS Code settings** - Extension settings (via package.json)

```typescript
// src/config/schema.ts

export interface Config {
    llm: {
        endpoint: string;
        model: string;
        timeoutSeconds: number;
        maxTokens: number;
        startupTimeoutSeconds: number;
    };
    orchestrator?: {
        taskTimeoutSeconds?: number;
    };
    agents?: {
        enableResearchAgent?: boolean;
    };
}

export const DEFAULT_CONFIG: Config = {
    llm: {
        endpoint: 'http://127.0.0.1:1234/v1',
        model: 'ministral-3-14b-reasoning',
        timeoutSeconds: 60,
        maxTokens: 2048,
        startupTimeoutSeconds: 300
    }
};
```

## Config Loader with Validation

```typescript
// src/config/loader.ts

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Config, DEFAULT_CONFIG } from './schema';

/**
 * Load configuration from .coe/config.json with fallback to defaults.
 * 
 * **Simple explanation**: Like loading settings from a preferences file.
 * We check if .coe/config.json exists in workspace, read it if found,
 * validate it's correct, then fill in any missing values with defaults.
 * 
 * @param context - Extension context for workspace path
 * @returns Validated configuration object
 */
export async function loadConfig(context: vscode.ExtensionContext): Promise<Config> {
    const workspaceRoot = getWorkspaceRoot();
    
    if (!workspaceRoot) {
        logWarn('No workspace opened, using default config');
        return { ...DEFAULT_CONFIG };
    }
    
    const configPath = path.join(workspaceRoot, '.coe', 'config.json');
    
    // Check if config file exists
    if (!fs.existsSync(configPath)) {
        logInfo(`No config file at ${configPath}, using defaults`);
        return { ...DEFAULT_CONFIG };
    }
    
    try {
        // Read and parse config file
        const fileContents = fs.readFileSync(configPath, 'utf-8');
        const userConfig = JSON.parse(fileContents);
        
        // Merge with defaults (user config overrides defaults)
        const mergedConfig = mergeConfigs(DEFAULT_CONFIG, userConfig);
        
        // Validate configuration
        validateConfig(mergedConfig);
        
        logInfo(`Loaded config from ${configPath}`);
        return mergedConfig;
        
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to load config from ${configPath}: ${msg}`);
        logWarn('Falling back to default config');
        return { ...DEFAULT_CONFIG };
    }
}

function getWorkspaceRoot(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}
```

## Deep Merge Pattern

```typescript
/**
 * Deep merge two configuration objects.
 * 
 * **Simple explanation**: Like combining two dictionaries where the second
 * overrides the first. If both have the same key, we use the value from
 * userConfig. Missing keys in userConfig keep their defaults.
 * 
 * @param defaultConfig - Base configuration
 * @param userConfig - User overrides
 * @returns Merged configuration
 */
function mergeConfigs(defaultConfig: Config, userConfig: Partial<Config>): Config {
    return {
        llm: {
            ...defaultConfig.llm,
            ...userConfig.llm
        },
        orchestrator: {
            ...defaultConfig.orchestrator,
            ...userConfig.orchestrator
        },
        agents: {
            ...defaultConfig.agents,
            ...userConfig.agents
        }
    };
}
```

## Configuration Validation

```typescript
/**
 * Validate configuration object has required fields and correct types.
 * 
 * **Simple explanation**: Like a bouncer checking IDs. We verify the config
 * has all required fields with correct types before accepting it.
 * 
 * @param config - Configuration to validate
 * @throws Error if validation fails
 */
function validateConfig(config: Config): void {
    // Validate LLM endpoint
    if (!config.llm.endpoint || typeof config.llm.endpoint !== 'string') {
        throw new Error('llm.endpoint must be a non-empty string');
    }
    
    if (!config.llm.endpoint.startsWith('http')) {
        throw new Error('llm.endpoint must be a valid HTTP URL');
    }
    
    // Validate model
    if (!config.llm.model || typeof config.llm.model !== 'string') {
        throw new Error('llm.model must be a non-empty string');
    }
    
    // Validate timeouts
    if (typeof config.llm.timeoutSeconds !== 'number' || config.llm.timeoutSeconds <= 0) {
        throw new Error('llm.timeoutSeconds must be a positive number');
    }
    
    if (typeof config.llm.maxTokens !== 'number' || config.llm.maxTokens <= 0) {
        throw new Error('llm.maxTokens must be a positive number');
    }
}
```

## Singleton Config Service

```typescript
// src/config/index.ts

let instance: Config | null = null;

/**
 * Initialize configuration singleton.
 * 
 * @param context - Extension context
 */
export async function initializeConfig(context: vscode.ExtensionContext): Promise<void> {
    if (instance !== null) {
        throw new Error('Config already initialized');
    }
    
    instance = await loadConfig(context);
    logInfo('Configuration initialized');
}

/**
 * Get configuration singleton instance.
 * 
 * **Simple explanation**: Like asking for the restaurant menu - there's
 * only one menu (singleton) that everyone shares. This function gives you
 * access to the current config settings.
 * 
 * @returns Configuration object
 * @throws Error if not initialized
 */
export function getConfigInstance(): Config {
    if (!instance) {
        throw new Error('Config not initialized. Call initializeConfig first.');
    }
    return instance;
}

// For tests only
export function resetConfigForTests(): void {
    instance = null;
}
```

## Example .coe/config.json

```json
{
  "llm": {
    "endpoint": "http://192.168.1.205:1234/v1",
    "model": "ministral-3-14b-reasoning",
    "timeoutSeconds": 90,
    "maxTokens": 4096,
    "startupTimeoutSeconds": 300
  },
  "orchestrator": {
    "taskTimeoutSeconds": 120
  },
  "agents": {
    "enableResearchAgent": false
  }
}
```

## VS Code Settings Integration

```typescript
/**
 * Get value from VS Code settings with fallback to config.json.
 * 
 * **Simple explanation**: Like checking two preference files. First we check
 * VS Code settings (user/workspace), then fall back to .coe/config.json if not found.
 * 
 * @param key - Setting key (e.g., 'autoProcessTickets')
 * @param configFallback - Fallback from config.json
 * @param defaultValue - Final fallback value
 */
function getSettingWithFallback<T>(
    key: string,
    configFallback: T | undefined,
    defaultValue: T
): T {
    const vscodeConfig = vscode.workspace.getConfiguration('coe');
    const vscodeValue = vscodeConfig.get<T>(key);
    
    // Priority: VS Code setting > config.json > default
    return vscodeValue !== undefined ? vscodeValue : configFallback ?? defaultValue;
}

// Usage
const config = getConfigInstance();
const autoProcess = getSettingWithFallback(
    'autoProcessTickets',
    config.agents?.enableAutoProcessing,
    false
);
```

## Service-Specific Config Extraction

```typescript
// In a service that needs config
class MyService {
    private config: ServiceConfig;
    
    async init(context: vscode.ExtensionContext): Promise<void> {
        const globalConfig = getConfigInstance();
        
        // Extract service-specific config with fallbacks
        this.config = {
            timeout: globalConfig.myService?.timeout || 30,
            retries: globalConfig.myService?.retries || 3,
            endpoint: globalConfig.myService?.endpoint || 'http://localhost:8080'
        };
        
        logInfo(`MyService configured: timeout=${this.config.timeout}s, retries=${this.config.retries}`);
    }
}
```

## Config File Creation Helper

```typescript
/**
 * Create default .coe/config.json if it doesn't exist.
 * 
 * **Simple explanation**: Like creating a preferences file with sensible defaults.
 * Helps users get started without manually writing JSON.
 */
export async function createDefaultConfigFile(): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    
    if (!workspaceRoot) {
        vscode.window.showWarningMessage('No workspace opened');
        return;
    }
    
    const coeDir = path.join(workspaceRoot, '.coe');
    const configPath = path.join(coeDir, 'config.json');
    
    // Check if already exists
    if (fs.existsSync(configPath)) {
        vscode.window.showInformationMessage('.coe/config.json already exists');
        return;
    }
    
    // Create .coe directory
    if (!fs.existsSync(coeDir)) {
        fs.mkdirSync(coeDir, { recursive: true });
    }
    
    // Write default config with comments
    const configWithComments = `{
  // LLM Studio configuration
  "llm": {
    "endpoint": "http://127.0.0.1:1234/v1",
    "model": "ministral-3-14b-reasoning",
    "timeoutSeconds": 60,
    "maxTokens": 2048,
    "startupTimeoutSeconds": 300
  },
  
  // Orchestrator settings
  "orchestrator": {
    "taskTimeoutSeconds": 120
  },
  
  // Agent enablement
  "agents": {
    "enableResearchAgent": false
  }
}`;
    
    fs.writeFileSync(configPath, configWithComments, 'utf-8');
    
    vscode.window.showInformationMessage('Created .coe/config.json with defaults');
    
    // Open file in editor
    const uri = vscode.Uri.file(configPath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
}
```

## Environment-Specific Config

```typescript
/**
 * Detect environment and adjust config.
 * 
 * @param config - Base configuration
 * @returns Adjusted configuration
 */
function adjustConfigForEnvironment(config: Config): Config {
    // Development mode: lower timeouts for faster feedback
    if (process.env.NODE_ENV === 'development') {
        return {
            ...config,
            llm: {
                ...config.llm,
                timeoutSeconds: 30,
                startupTimeoutSeconds: 60
            }
        };
    }
    
    // Production mode: use config as-is
    return config;
}
```

## Config Watching (Hot Reload)

```typescript
/**
 * Watch .coe/config.json for changes and reload.
 * 
 * **Simple explanation**: Like auto-refresh on a webpage. When you edit
 * the config file, we detect the change and reload automatically.
 */
export function watchConfigFile(context: vscode.ExtensionContext): void {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) return;
    
    const configPath = path.join(workspaceRoot, '.coe', 'config.json');
    
    const watcher = fs.watch(configPath, async (eventType) => {
        if (eventType === 'change') {
            logInfo('Config file changed, reloading...');
            
            try {
                resetConfigForTests(); // Reset singleton
                await initializeConfig(context);
                vscode.window.showInformationMessage('COE config reloaded');
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Failed to reload config: ${msg}`);
            }
        }
    });
    
    context.subscriptions.push({ dispose: () => watcher.close() });
}
```

## Common Mistakes

❌ **Don't**: Access config before initialization
```typescript
// BAD - crashes if called before initializeConfig
const config = getConfigInstance();
```

✅ **Do**: Initialize in activate, use in services
```typescript
// GOOD - proper order
async function activate(context) {
    await initializeConfig(context); // First
    await initializeMyService(context); // Then services
}
```

❌ **Don't**: Mutate config object
```typescript
// BAD - modifies shared singleton
const config = getConfigInstance();
config.llm.timeout = 120; // Dangerous!
```

✅ **Do**: Extract and copy values
```typescript
// GOOD - create local copy
const config = getConfigInstance();
const myTimeout = config.llm.timeout;
```

## Related Skills
- **[02-service-patterns.md](02-service-patterns.md)** - Config in services
- **[06-llm-integration.md](06-llm-integration.md)** - LLM config usage
- **[11-error-handling-patterns.md](11-error-handling-patterns.md)** - Config validation errors
