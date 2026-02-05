# Error Handling Patterns

**Purpose**: Typed error handling with graceful degradation across COE  
**Related Files**: All service files, especially `src/services/*.ts`  
**Keywords**: error, catch, typed, graceful-degradation, fallback

## Typed Catch Blocks (Required Pattern)

**All catch blocks MUST use `catch (error: unknown)`:**

```typescript
try {
    await riskyOperation();
} catch (error: unknown) {
    // Extract message safely
    const msg = error instanceof Error ? error.message : String(error);
    logError(`Operation failed: ${msg}`);
}
```

**Why `unknown` instead of `any`?**
- Forces type checking (TypeScript won't let you use error.message without checking)
- Prevents runtime crashes from unexpected error types
- Follows TypeScript best practices

## Standard Error Handling Pattern

```typescript
/**
 * Perform operation with standard error handling.
 * 
 * **Simple explanation**: Like wrapping a risky action in safety gear.
 * We try the operation, and if it fails, we log details and return a
 * safe fallback value instead of crashing.
 * 
 * @param operation - The risky operation to perform
 * @returns Result or fallback value
 */
async function performWithErrorHandling<T>(
    operation: () => Promise<T>,
    fallback: T,
    operationName: string
): Promise<T> {
    try {
        return await operation();
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`${operationName} failed: ${msg}`);
        
        // Show user-friendly message
        vscode.window.showErrorMessage(`${operationName} failed: ${msg}`);
        
        return fallback;
    }
}

// Usage
const tickets = await performWithErrorHandling(
    () => listTickets(),
    [], // Fallback to empty array
    'List tickets'
);
```

## Never-Throw Pattern (Services)

**Critical**: Services should NEVER throw errors - always return fallback values:

```typescript
// src/services/llmService.ts

/**
 * Complete LLM request with fallback error response.
 * NEVER throws - always returns a response object.
 * 
 * @param prompt - User's question
 * @returns LLMResponse (may contain error message in content)
 */
export async function completeLLM(prompt: string): Promise<LLMResponse> {
    try {
        const response = await fetch(endpoint, { /* ... */ });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            content: data.choices[0].message.content,
            usage: data.usage
        };
        
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`LLM completion failed: ${msg}`);
        
        // Return error in response, don't throw
        return {
            content: `[LLM Error: ${msg}]`,
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        };
    }
}
```

**Why never throw?**
- Prevents cascading failures
- Allows caller to continue with degraded functionality
- Better user experience (show error, don't crash)

## Graceful Degradation Pattern

**Fallback hierarchy** when primary method fails:

```typescript
// src/services/ticketDb.ts

async init(context: vscode.ExtensionContext): Promise<void> {
    // Try SQLite first
    try {
        await this.initializeSQLite(context);
        this.isInMemoryMode = false;
        logInfo('TicketDb using SQLite persistence');
        return;
    } catch (sqliteError: unknown) {
        const msg = sqliteError instanceof Error ? sqliteError.message : String(sqliteError);
        logWarn(`SQLite initialization failed: ${msg}`);
    }
    
    // Fallback to in-memory
    try {
        await this.initializeInMemory();
        this.isInMemoryMode = true;
        logWarn('TicketDb using in-memory storage (data will not persist)');
    } catch (memoryError: unknown) {
        const msg = memoryError instanceof Error ? memoryError.message : String(memoryError);
        logError(`In-memory initialization failed: ${msg}`);
        throw new Error('Failed to initialize ticket database');
    }
}
```

## Error Classification

```typescript
/**
 * Classify errors by severity and determine appropriate action.
 */
enum ErrorSeverity {
    INFO = 'info',       // Log only
    WARNING = 'warning', // Log + show warning
    ERROR = 'error',     // Log + show error + fallback
    FATAL = 'fatal'      // Log + show error + throw
}

class ErrorHandler {
    static handle(error: unknown, severity: ErrorSeverity, context: string): void {
        const msg = error instanceof Error ? error.message : String(error);
        
        switch (severity) {
            case ErrorSeverity.INFO:
                logInfo(`${context}: ${msg}`);
                break;
                
            case ErrorSeverity.WARNING:
                logWarn(`${context}: ${msg}`);
                vscode.window.showWarningMessage(`Warning: ${context} - ${msg}`);
                break;
                
            case ErrorSeverity.ERROR:
                logError(`${context}: ${msg}`);
                vscode.window.showErrorMessage(`Error: ${context} - ${msg}`);
                break;
                
            case ErrorSeverity.FATAL:
                logError(`FATAL: ${context}: ${msg}`);
                vscode.window.showErrorMessage(`Fatal Error: ${context} - ${msg}`);
                throw error;
        }
    }
}

// Usage
try {
    await criticalOperation();
} catch (error: unknown) {
    ErrorHandler.handle(error, ErrorSeverity.ERROR, 'Initialize service');
}
```

## Retry Pattern with Exponential Backoff

```typescript
/**
 * Retry operation with exponential backoff.
 * 
 * **Simple explanation**: Like knocking on a door repeatedly, but waiting
 * longer between each knock (1s, 2s, 4s, 8s). Gives server time to recover.
 * 
 * @param operation - Function to retry
 * @param maxRetries - Maximum retry attempts
 * @param initialDelayMs - First retry delay (doubles each time)
 * @returns Operation result
 */
async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelayMs: number = 1000
): Promise<T> {
    let lastError: unknown;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error: unknown) {
            lastError = error;
            
            if (attempt === maxRetries) {
                break; // Final attempt failed, throw below
            }
            
            const delayMs = initialDelayMs * Math.pow(2, attempt);
            const msg = error instanceof Error ? error.message : String(error);
            
            logWarn(`Attempt ${attempt + 1} failed: ${msg}. Retrying in ${delayMs}ms...`);
            
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    
    // All retries exhausted
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Operation failed after ${maxRetries + 1} attempts: ${msg}`);
}

// Usage
const result = await retryWithBackoff(
    () => fetch(endpoint),
    3,    // Max 3 retries
    1000  // Start with 1s delay
);
```

## Timeout Pattern with AbortController

```typescript
/**
 * Run operation with timeout.
 * 
 * **Simple explanation**: Like a kitchen timer. If the operation doesn't
 * finish before time runs out, we cancel it and throw an error.
 * 
 * @param operation - Async operation to run
 * @param timeoutMs - Timeout in milliseconds
 * @returns Operation result
 * @throws Error if timeout exceeded
 */
async function withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number
): Promise<T> {
    const controller = new AbortController();
    
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
            controller.abort();
            reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });
    
    try {
        return await Promise.race([
            operation(),
            timeoutPromise
        ]);
    } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('timed out')) {
            logError(`Operation exceeded timeout of ${timeoutMs}ms`);
        }
        throw error;
    }
}

// Usage
const result = await withTimeout(
    () => slowLLMRequest(),
    60000 // 60 second timeout
);
```

## Validation Pattern

```typescript
/**
 * Validate input and throw descriptive errors.
 * 
 * @param value - Value to validate
 * @param fieldName - Field name for error messages
 */
function validateString(value: unknown, fieldName: string): asserts value is string {
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string, got ${typeof value}`);
    }
    
    if (value.trim().length === 0) {
        throw new Error(`${fieldName} cannot be empty`);
    }
}

function validatePositiveNumber(value: unknown, fieldName: string): asserts value is number {
    if (typeof value !== 'number') {
        throw new Error(`${fieldName} must be a number, got ${typeof value}`);
    }
    
    if (value <= 0) {
        throw new Error(`${fieldName} must be positive, got ${value}`);
    }
}

// Usage
function createTicket(title: unknown, priority: unknown): Ticket {
    validateString(title, 'title');
    validatePositiveNumber(priority, 'priority');
    
    // TypeScript now knows title is string, priority is number
    return { id: generateId(), title, priority };
}
```

## Error Context Enhancement

```typescript
/**
 * Wrap error with additional context.
 * 
 * **Simple explanation**: Like adding breadcrumbs to error messages.
 * Each layer adds more context about where the error occurred.
 */
function wrapError(error: unknown, context: string): Error {
    const msg = error instanceof Error ? error.message : String(error);
    const wrappedError = new Error(`${context}: ${msg}`);
    
    // Preserve stack trace if available
    if (error instanceof Error && error.stack) {
        wrappedError.stack = error.stack;
    }
    
    return wrappedError;
}

// Usage - building error context through layers
async function topLevelOperation(): Promise<void> {
    try {
        await middleLevelOperation();
    } catch (error: unknown) {
        throw wrapError(error, 'Top-level operation');
    }
}

async function middleLevelOperation(): Promise<void> {
    try {
        await lowLevelOperation();
    } catch (error: unknown) {
        throw wrapError(error, 'Middle-level operation');
    }
}

// Final error message:
// "Top-level operation: Middle-level operation: Low-level operation: Connection refused"
```

## Error Logging Best Practices

```typescript
/**
 * Log error with full context.
 */
function logErrorWithContext(
    error: unknown,
    operation: string,
    additionalContext?: Record<string, any>
): void {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    logError(`[${operation}] ${msg}`);
    
    if (additionalContext) {
        logError(`Context: ${JSON.stringify(additionalContext, null, 2)}`);
    }
    
    if (stack && process.env.NODE_ENV === 'development') {
        logError(`Stack trace:\n${stack}`);
    }
}

// Usage
try {
    await createTicket(ticketData);
} catch (error: unknown) {
    logErrorWithContext(error, 'Create ticket', {
        title: ticketData.title,
        type: ticketData.type,
        timestamp: new Date().toISOString()
    });
}
```

## Common Mistakes

❌ **Don't**: Use `any` in catch blocks
```typescript
// BAD - loses type safety
try {
    await operation();
} catch (error: any) {
    logError(error.message); // Could crash if error is a string!
}
```

✅ **Do**: Use `unknown` with type checking
```typescript
// GOOD - type-safe
try {
    await operation();
} catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(msg);
}
```

❌ **Don't**: Swallow errors silently
```typescript
// BAD - error disappears
try {
    await operation();
} catch (error: unknown) {
    // Nothing - error is lost!
}
```

✅ **Do**: Always log errors
```typescript
// GOOD - error is recorded
try {
    await operation();
} catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`Operation failed: ${msg}`);
}
```

❌ **Don't**: Throw from service methods
```typescript
// BAD - caller must handle
export async function getLLMResponse(prompt: string): Promise<string> {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('Failed');
    return response.text();
}
```

✅ **Do**: Return error responses
```typescript
// GOOD - never throws
export async function getLLMResponse(prompt: string): Promise<LLMResponse> {
    try {
        const response = await fetch(endpoint);
        return { content: await response.text() };
    } catch (error: unknown) {
        return { content: '[Error]' };
    }
}
```

## Related Skills
- **[02-service-patterns.md](02-service-patterns.md)** - Service error handling
- **[06-llm-integration.md](06-llm-integration.md)** - LLM error handling
- **[13-database-patterns.md](13-database-patterns.md)** - DB graceful degradation
