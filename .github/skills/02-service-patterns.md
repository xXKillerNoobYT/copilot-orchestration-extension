# Service Implementation Pattern

**Purpose**: Standard singleton pattern for all COE services  
**Related Files**: `src/services/orchestrator.ts`, `src/services/ticketDb.ts`, `src/services/llmService.ts`  
**Keywords**: singleton, service, initialization, dependency injection

## Standard Service Template

All core services follow this **exact** pattern:

```typescript
// src/services/myService.ts
import * as vscode from 'vscode';
import { logInfo, logError } from '../logger';
import { getConfigInstance } from '../config';

// 1. Private singleton instance
let instance: MyService | null = null;

// 2. Service class (internal)
class MyService {
    private context: vscode.ExtensionContext | null = null;
    
    async init(context: vscode.ExtensionContext): Promise<void> {
        this.context = context;
        const config = getConfigInstance();
        
        // Initialization logic here
        logInfo('MyService initialized');
    }
    
    // Public methods
    async doSomething(): Promise<void> {
        if (!this.context) {
            throw new Error('MyService not initialized');
        }
        // Implementation
    }
}

// 3. Initialization function (called from extension.ts)
export async function initializeMyService(context: vscode.ExtensionContext): Promise<void> {
    if (instance !== null) {
        throw new Error('MyService already initialized');
    }
    instance = new MyService();
    await instance.init(context);
}

// 4. Getter function (used throughout codebase)
export function getMyServiceInstance(): MyService {
    if (!instance) {
        throw new Error('MyService not initialized. Call initializeMyService first.');
    }
    return instance;
}

// 5. Reset function (for tests only)
export function resetMyServiceForTests(): void {
    instance = null;
}
```

## Real Example: Orchestrator Service

```typescript
// src/services/orchestrator.ts
let instance: Orchestrator | null = null;

export async function initializeOrchestrator(context: vscode.ExtensionContext): Promise<void> {
    if (instance !== null) {
        throw new Error('Orchestrator already initialized');
    }
    
    instance = new Orchestrator();
    await instance.init(context);
    logInfo('Orchestrator service started');
}

export function getOrchestratorInstance(): Orchestrator {
    if (!instance) {
        throw new Error('Orchestrator not initialized. Call initializeOrchestrator first.');
    }
    return instance;
}

export function resetOrchestratorForTests(): void {
    instance = null;
}

class Orchestrator {
    private taskQueue: Task[] = [];
    private config: Config | null = null;
    
    async init(context: vscode.ExtensionContext): Promise<void> {
        this.config = getConfigInstance();
        logInfo('Orchestrator initialized with queue');
    }
    
    async getNextTask(): Promise<Task | null> {
        if (this.taskQueue.length === 0) {
            return null;
        }
        return this.taskQueue.shift() || null;
    }
}
```

## Usage Pattern

### In extension.ts (initialization)

```typescript
// src/extension.ts
export async function activate(context: vscode.ExtensionContext) {
    try {
        // Initialize in dependency order
        initializeLogger(context);
        await initializeConfig(context);
        await initializeMyService(context);
        
        logInfo('COE activated successfully');
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`COE activation failed: ${msg}`);
    }
}
```

### In other modules (usage)

```typescript
// src/ui/someProvider.ts
import { getMyServiceInstance } from '../services/myService';

export class SomeProvider {
    async handleAction(): Promise<void> {
        const service = getMyServiceInstance();
        await service.doSomething();
    }
}
```

### In tests (setup)

```typescript
// tests/myService.test.ts
import { 
    initializeMyService, 
    getMyServiceInstance, 
    resetMyServiceForTests 
} from '../src/services/myService';

describe('MyService', () => {
    let mockContext: vscode.ExtensionContext;
    
    beforeEach(() => {
        jest.clearAllMocks();
        resetMyServiceForTests(); // CRITICAL: Reset singleton
        
        mockContext = {
            extensionPath: '/mock/path',
            globalState: { get: jest.fn(), update: jest.fn() },
            // ... other context properties
        } as any;
    });
    
    it('Test 1: should initialize service successfully', async () => {
        await initializeMyService(mockContext);
        
        const instance = getMyServiceInstance();
        expect(instance).toBeDefined();
    });
    
    it('Test 2: should throw if accessed before initialization', () => {
        expect(() => getMyServiceInstance()).toThrow('not initialized');
    });
});
```

## Dependency Injection Pattern

For testability, inject dependencies:

```typescript
class MyService {
    constructor(
        private llmService?: LLMService,
        private ticketDb?: TicketDatabase
    ) {}
    
    async init(context: vscode.ExtensionContext): Promise<void> {
        // Use injected dependencies or get singletons
        this.llmService = this.llmService || getLLMServiceInstance();
        this.ticketDb = this.ticketDb || getTicketDbInstance();
    }
}

// In tests, inject mocks
const mockLLM = { completeLLM: jest.fn() };
const service = new MyService(mockLLM as any);
```

## Configuration Loading Pattern

Services that need configuration:

```typescript
class MyService {
    private config: ServiceConfig | null = null;
    
    async init(context: vscode.ExtensionContext): Promise<void> {
        const globalConfig = getConfigInstance();
        
        // Extract service-specific config with fallbacks
        this.config = {
            timeout: globalConfig.myService?.timeout || 30,
            retries: globalConfig.myService?.retries || 3,
            endpoint: globalConfig.myService?.endpoint || 'http://localhost:8080'
        };
        
        logInfo(`MyService configured: timeout=${this.config.timeout}s`);
    }
}
```

## Error Recovery Pattern

Services should handle initialization failures gracefully:

```typescript
async init(context: vscode.ExtensionContext): Promise<void> {
    try {
        await this.initializePrimaryMode();
        logInfo('Service initialized in primary mode');
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Primary mode failed (${msg}), using fallback mode`);
        
        await this.initializeFallbackMode();
        logInfo('Service initialized in fallback mode');
    }
}
```

## Common Patterns

### 1. Service with EventEmitter

```typescript
import { EventEmitter } from 'events';

class MyService extends EventEmitter {
    async performAction(): Promise<void> {
        // ... do work
        this.emit('actionComplete', result);
    }
}

// Export listener registration
export function onActionComplete(listener: (result: any) => void): void {
    const service = getMyServiceInstance();
    service.on('actionComplete', listener);
}
```

### 2. Service with Cleanup

```typescript
class MyService {
    private intervalHandle: NodeJS.Timeout | null = null;
    
    async init(context: vscode.ExtensionContext): Promise<void> {
        this.intervalHandle = setInterval(() => {
            this.periodicTask();
        }, 5000);
        
        // Register cleanup
        context.subscriptions.push({
            dispose: () => {
                if (this.intervalHandle) {
                    clearInterval(this.intervalHandle);
                }
            }
        });
    }
}
```

## Common Mistakes

❌ **Don't**: Create multiple instances
```typescript
// BAD - bypasses singleton
const service1 = new MyService();
const service2 = new MyService();
```

✅ **Do**: Always use getter
```typescript
// GOOD - enforces singleton
const service = getMyServiceInstance();
```

❌ **Don't**: Forget to reset in tests
```typescript
// BAD - previous test's instance leaks
it('Test 1', async () => {
    await initializeMyService(context);
});
it('Test 2', async () => {
    await initializeMyService(context); // Error: already initialized!
});
```

✅ **Do**: Reset in beforeEach
```typescript
// GOOD - clean slate for each test
beforeEach(() => {
    resetMyServiceForTests();
});
```

## Related Skills
- **[01-coe-architecture.md](01-coe-architecture.md)** - Architecture overview
- **[03-testing-conventions.md](03-testing-conventions.md)** - Testing singleton services
- **[10-configuration-management.md](10-configuration-management.md)** - Config loading
- **[11-error-handling-patterns.md](11-error-handling-patterns.md)** - Error recovery
