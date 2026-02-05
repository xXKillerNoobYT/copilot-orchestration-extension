# Testing Conventions

**Purpose**: Standard testing patterns for COE including "Test N:" naming, mocking, and setup  
**Related Files**: `tests/*.test.ts`, `tests/__mocks__/vscode.ts`, `jest.config.js`  
**Keywords**: testing, jest, mocking, setup, teardown, coverage

## Test Naming Convention

**All test descriptions MUST be prefixed with `"Test N: "`:**

```typescript
describe('Orchestrator Service', () => {
    describe('initialization', () => {
        it('Test 1: should initialize with default timeout when config missing', async () => {
            mockFs.existsSync.mockReturnValue(false);
            
            await initializeOrchestrator(mockContext);
            const instance = getOrchestratorInstance();
            
            expect(instance).toBeDefined();
        });

        it('Test 2: should read timeout from config.orchestrator.taskTimeoutSeconds', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                orchestrator: { taskTimeoutSeconds: 120 }
            }));
            
            await initializeOrchestrator(mockContext);
            // ... assertions
        });

        it('Test 3: should fallback to llm.timeoutSeconds if orchestrator config missing', async () => {
            // ... test code
        });
    });
});
```

**Purpose**: Sequential tracking and easy reference in test output.

## Standard Test Setup Pattern

Every test file follows this structure:

```typescript
import { ExtensionContext } from 'vscode';
import {
    initializeMyService,
    getMyServiceInstance,
    resetMyServiceForTests
} from '../src/services/myService';
import { logInfo, logError } from '../src/logger';

// Mock external dependencies
jest.mock('../src/logger');
jest.mock('fs');

describe('MyService Tests', () => {
    let mockContext: ExtensionContext;
    
    beforeEach(() => {
        // 1. Clear all mocks (prevents state leakage)
        jest.clearAllMocks();
        
        // 2. Use real timers (prevent interference from previous tests)
        jest.useRealTimers();
        
        // 3. Reset singleton (CRITICAL for service tests)
        resetMyServiceForTests();
        
        // 4. Create mock context
        mockContext = {
            extensionPath: '/mock/extension/path',
            globalState: {
                get: jest.fn(),
                update: jest.fn()
            },
            subscriptions: []
        } as any;
        
        // 5. Setup default mock behavior
        (logInfo as jest.Mock).mockImplementation(() => {});
        (logError as jest.Mock).mockImplementation(() => {});
    });

    afterEach(() => {
        // Clean up fake timers if used in tests
        jest.useRealTimers();
    });
    
    // Tests here...
});
```

## VS Code API Mocking

**All tests must import from `tests/__mocks__/vscode.ts`:**

### Mock Setup (jest.config.js)

```javascript
module.exports = {
    moduleNameMapper: {
        '^vscode$': '<rootDir>/tests/__mocks__/vscode.ts'
    }
};
```

### Mock Implementation

```typescript
// tests/__mocks__/vscode.ts
export const window = {
    createOutputChannel: jest.fn(() => ({
        appendLine: jest.fn(),
        show: jest.fn(),
        dispose: jest.fn()
    })),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
};

export const workspace = {
    getConfiguration: jest.fn((section?: string) => ({
        get: jest.fn((key: string, defaultValue?: any) => defaultValue),
        update: jest.fn()
    }))
};

export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
}

export class TreeItem {
    label?: string;
    description?: string;
    tooltip?: string;
    iconPath?: any;
    command?: any;
    collapsibleState: TreeItemCollapsibleState;
    
    constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
        this.label = label;
        this.collapsibleState = collapsibleState ?? TreeItemCollapsibleState.None;
    }
}

export class EventEmitter<T> {
    private listeners: Array<(e: T) => any> = [];
    
    fire(data: T): void {
        this.listeners.forEach(listener => listener(data));
    }
    
    get event() {
        return (listener: (e: T) => any) => {
            this.listeners.push(listener);
        };
    }
}
```

### Using Mocked VS Code API

```typescript
import * as vscode from 'vscode';

it('Test 4: should create output channel on init', async () => {
    await initializeLogger(mockContext);
    
    expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('COE Logs');
});

it('Test 5: should show error message when operation fails', async () => {
    await someFailingOperation();
    
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed:')
    );
});
```

## Mocking External Dependencies

### LLM Service Mocking

```typescript
// tests/orchestrator.test.ts
jest.mock('../src/services/llmService');

import { completeLLM, streamLLM } from '../src/services/llmService';

const mockCompleteLLM = completeLLM as jest.MockedFunction<typeof completeLLM>;
const mockStreamLLM = streamLLM as jest.MockedFunction<typeof streamLLM>;

beforeEach(() => {
    mockCompleteLLM.mockResolvedValue({
        content: 'Mocked LLM response',
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
    });
    
    mockStreamLLM.mockImplementation(async (prompt, onChunk, onDone) => {
        onChunk('Chunk 1 ');
        onChunk('Chunk 2');
        onDone?.('Chunk 1 Chunk 2');
        return { content: 'Chunk 1 Chunk 2', usage: { total_tokens: 15 } };
    });
});
```

### TicketDb Mocking with EventEmitter

```typescript
jest.mock('../src/services/ticketDb');
import * as ticketDb from '../src/services/ticketDb';

const mockTicketDb = ticketDb as jest.Mocked<typeof ticketDb>;

beforeEach(() => {
    const listeners: Array<() => void> = [];
    
    mockTicketDb.onTicketChange.mockImplementation((listener: () => void) => {
        listeners.push(listener);
    });
    
    mockTicketDb.createTicket.mockImplementation(async (ticket) => {
        const newTicket = { ...ticket, id: 'TICKET-123', createdAt: new Date().toISOString() };
        
        // Simulate event emission
        listeners.forEach(listener => listener());
        
        return newTicket;
    });
});
```

## Testing Async/Await Code

```typescript
it('Test 6: should handle async operations correctly', async () => {
    const service = getMyServiceInstance();
    
    const result = await service.asyncOperation();
    
    expect(result).toBe('expected value');
});

it('Test 7: should handle async errors', async () => {
    const service = getMyServiceInstance();
    mockDependency.doWork.mockRejectedValue(new Error('Operation failed'));
    
    await expect(service.asyncOperation()).rejects.toThrow('Operation failed');
});
```

## Testing with Fake Timers

```typescript
it('Test 8: should retry with exponential backoff', async () => {
    jest.useFakeTimers();
    
    const service = getMyServiceInstance();
    const promise = service.retryableOperation();
    
    // Fast-forward 1 second
    jest.advanceTimersByTime(1000);
    
    // Fast-forward 2 seconds
    jest.advanceTimersByTime(2000);
    
    // Fast-forward 4 seconds
    jest.advanceTimersByTime(4000);
    
    await promise;
    
    expect(mockDependency.attempt).toHaveBeenCalledTimes(3);
    
    jest.useRealTimers(); // CRITICAL: cleanup
});
```

## Coverage Requirements

From `jest.config.js`:

```javascript
module.exports = {
    coverageThreshold: {
        global: {
            lines: 0,      // Moving toward 80%
            branches: 0,   // Moving toward 80%
            functions: 0,  // Moving toward 80%
            statements: 0  // Moving toward 80%
        }
    }
};
```

**Policy**:
- Long-term goal: 80% coverage
- **All new code must maintain or improve coverage**
- Run coverage: `npm run test:once -- --coverage`
- View report: `coverage/lcov-report/index.html`

## Real Example: Orchestrator Tests

```typescript
// tests/orchestrator.test.ts
describe('Orchestrator Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
        resetOrchestratorForTests();
        resetConfigForTests();
    });
    
    describe('getNextTask', () => {
        it('Test 1: should return null when queue is empty', async () => {
            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            
            const task = await orchestrator.getNextTask();
            
            expect(task).toBeNull();
        });
        
        it('Test 2: should return first task in FIFO order', async () => {
            await initializeOrchestrator(mockContext);
            const orchestrator = getOrchestratorInstance();
            
            await orchestrator.addTask({ id: 'T1', title: 'Task 1' });
            await orchestrator.addTask({ id: 'T2', title: 'Task 2' });
            
            const task1 = await orchestrator.getNextTask();
            const task2 = await orchestrator.getNextTask();
            
            expect(task1?.id).toBe('T1');
            expect(task2?.id).toBe('T2');
        });
    });
});
```

## Common Mistakes

❌ **Don't**: Forget to reset singletons
```typescript
// BAD - test 2 will fail
it('Test 1', async () => {
    await initializeMyService(context);
});
it('Test 2', async () => {
    await initializeMyService(context); // Error: already initialized!
});
```

✅ **Do**: Reset in beforeEach
```typescript
beforeEach(() => {
    resetMyServiceForTests();
});
```

❌ **Don't**: Use fake timers without cleanup
```typescript
// BAD - timers leak to next test
it('Test 9', () => {
    jest.useFakeTimers();
    // ... test code
    // Missing jest.useRealTimers()!
});
```

✅ **Do**: Always cleanup in afterEach
```typescript
afterEach(() => {
    jest.useRealTimers();
});
```

❌ **Don't**: Forget "Test N:" prefix
```typescript
// BAD - hard to track in output
it('should initialize correctly', async () => {});
it('should handle errors', async () => {});
```

✅ **Do**: Use sequential numbering
```typescript
// GOOD - easy to reference
it('Test 1: should initialize correctly', async () => {});
it('Test 2: should handle errors', async () => {});
```

## Related Skills
- **[02-service-patterns.md](02-service-patterns.md)** - Service testing setup
- **[11-error-handling-patterns.md](11-error-handling-patterns.md)** - Testing error cases
- **[14-common-pitfalls.md](14-common-pitfalls.md)** - Testing pitfalls
