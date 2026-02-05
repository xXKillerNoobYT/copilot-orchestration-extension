# MCP Protocol Pattern

**Purpose**: JSON-RPC 2.0 server implementation for GitHub Copilot integration  
**Related Files**: `src/mcpServer/server.ts`, `src/mcpServer/jsonrpc.ts`, `src/mcpServer/tools/*.ts`  
**Keywords**: mcp, json-rpc, stdio, copilot, tools, methods

## MCP Server Architecture

MCP (Model Context Protocol) uses JSON-RPC 2.0 over stdio transport:

```
GitHub Copilot (Client)
       ↓ stdin (JSON-RPC requests)
┌──────────────────────────┐
│  MCP Server (COE)        │
│  - Parse JSON-RPC        │
│  - Route to tools        │
│  - Execute & respond     │
└──────────────────────────┘
       ↓ stdout (JSON-RPC responses)
GitHub Copilot (Client)
```

## JSON-RPC 2.0 Format

### Request

```json
{
  "jsonrpc": "2.0",
  "method": "getNextTask",
  "params": {},
  "id": 1
}
```

### Success Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "id": "TICKET-001",
    "title": "Add user authentication",
    "description": "Step 1: Create auth middleware..."
  }
}
```

### Error Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32600,
    "message": "Invalid Request: method must be a string"
  }
}
```

## Server Implementation

```typescript
// src/mcpServer/server.ts

export class MCPServer {
    private inputStream: NodeJS.ReadableStream;
    private outputStream: NodeJS.WritableStream;
    private tools: Map<string, ToolHandler> = new Map();
    
    constructor(
        inputStream: NodeJS.ReadableStream = process.stdin,
        outputStream: NodeJS.WritableStream = process.stdout
    ) {
        this.inputStream = inputStream;
        this.outputStream = outputStream;
        
        // Register tools
        this.registerTools();
    }
    
    private registerTools(): void {
        this.tools.set('getNextTask', handleGetNextTask);
        this.tools.set('reportTaskDone', handleReportTaskDone);
        this.tools.set('askQuestion', handleAskQuestion);
    }
    
    /**
     * Start the MCP server and process incoming JSON-RPC requests.
     * 
     * **Simple explanation**: Like a waiter taking orders. We listen
     * for requests from Copilot (stdin), execute the appropriate tool,
     * and send back results (stdout). Runs in a loop until process ends.
     */
    async start(): Promise<void> {
        const readline = createInterface({
            input: this.inputStream,
            output: undefined, // Don't echo input
            terminal: false
        });
        
        logInfo('[MCP] Server started, listening for requests...');
        
        readline.on('line', async (line: string) => {
            try {
                const request = parseJSONRPCRequest(line);
                const response = await this.handleRequest(request);
                
                // Write response to stdout
                this.outputStream.write(JSON.stringify(response) + '\n');
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                const errorResponse = createErrorResponse(-32700, `Parse error: ${msg}`);
                this.outputStream.write(JSON.stringify(errorResponse) + '\n');
            }
        });
        
        readline.on('close', () => {
            logInfo('[MCP] Server shutting down');
        });
    }
    
    private async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
        const { method, params, id } = request;
        
        // Find tool handler
        const handler = this.tools.get(method);
        
        if (!handler) {
            return createErrorResponse(-32601, `Method not found: ${method}`, id);
        }
        
        try {
            return await handler(params, id);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            return createErrorResponse(-32603, `Internal error: ${msg}`, id);
        }
    }
}
```

## JSON-RPC Parsing and Validation

```typescript
// src/mcpServer/jsonrpc.ts

export interface JSONRPCRequest {
    jsonrpc: '2.0';
    method: string;
    params?: any;
    id?: number | string | null;
}

export interface JSONRPCResponse {
    jsonrpc: '2.0';
    id: number | string | null;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

/**
 * Parse and validate JSON-RPC 2.0 request.
 * 
 * **Simple explanation**: Like a security checkpoint. We check that
 * the incoming request has all required fields and follows JSON-RPC rules
 * before processing it.
 * 
 * @param line - Raw JSON string from stdin
 * @returns Parsed and validated request
 * @throws Error if invalid JSON or malformed request
 */
export function parseJSONRPCRequest(line: string): JSONRPCRequest {
    const parsed = JSON.parse(line);
    
    // Validate JSON-RPC 2.0 format
    if (parsed.jsonrpc !== '2.0') {
        throw new Error('Invalid JSON-RPC version (must be "2.0")');
    }
    
    if (typeof parsed.method !== 'string') {
        throw new Error('method must be a string');
    }
    
    return parsed as JSONRPCRequest;
}

/**
 * Create JSON-RPC error response.
 * 
 * @param code - Error code (standard JSON-RPC codes)
 * @param message - Human-readable error message
 * @param id - Request ID (null for parse errors)
 * @returns Formatted error response
 */
export function createErrorResponse(
    code: number,
    message: string,
    id: number | string | null = null
): JSONRPCResponse {
    return {
        jsonrpc: '2.0',
        id: id,
        error: {
            code: code,
            message: message
        }
    };
}
```

## Standard Error Codes

```typescript
// JSON-RPC 2.0 standard error codes
export const ErrorCodes = {
    PARSE_ERROR: -32700,      // Invalid JSON
    INVALID_REQUEST: -32600,  // Missing required fields
    METHOD_NOT_FOUND: -32601, // Unknown method
    INVALID_PARAMS: -32602,   // Invalid parameters
    INTERNAL_ERROR: -32603    // Server error
};
```

## Tool Implementation Pattern

```typescript
// src/mcpServer/tools/getNextTask.ts

type ToolHandler = (params: any, id: number | string | null) => Promise<JSONRPCResponse>;

/**
 * Handle getNextTask MCP tool request.
 * 
 * **Simple explanation**: Like a task dispatcher. Copilot asks "what should
 * I work on next?" and we return the first pending task from the queue.
 * 
 * @param params - Request parameters (none expected)
 * @param id - Request ID
 * @returns Task object or null if queue empty
 */
export async function handleGetNextTask(
    params: any,
    id: number | string | null
): Promise<JSONRPCResponse> {
    try {
        const orchestrator = getOrchestratorInstance();
        const task = await orchestrator.getNextTask();
        
        if (!task) {
            return {
                jsonrpc: '2.0',
                id: id,
                result: null
            };
        }
        
        return {
            jsonrpc: '2.0',
            id: id,
            result: {
                id: task.id,
                title: task.title,
                description: task.description || '',
                status: task.status
            }
        };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return createErrorResponse(-32603, `Failed to get next task: ${msg}`, id);
    }
}
```

## Tool with Parameters

```typescript
// src/mcpServer/tools/askQuestion.ts

/**
 * Handle askQuestion MCP tool request.
 * Validates required 'question' parameter and optional 'chatId'.
 * 
 * @param params - { question: string, chatId?: string }
 * @param id - Request ID
 * @returns { answer: string, chatId: string }
 */
export async function handleAskQuestion(
    params: any,
    id: number | string | null
): Promise<JSONRPCResponse> {
    // Validate parameters
    if (!params || typeof params !== 'object') {
        return createErrorResponse(-32602, 'params must be an object', id);
    }
    
    const { question, chatId } = params;
    
    if (!question || typeof question !== 'string') {
        return createErrorResponse(-32602, 'question must be a non-empty string', id);
    }
    
    // Optional parameter validation
    if (chatId !== undefined && typeof chatId !== 'string') {
        return createErrorResponse(-32602, 'chatId must be a string if provided', id);
    }
    
    try {
        const orchestrator = getOrchestratorInstance();
        const answer = await orchestrator.routeToAnswerAgent(question, chatId);
        
        return {
            jsonrpc: '2.0',
            id: id,
            result: {
                answer: answer,
                chatId: chatId || 'new'
            }
        };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return createErrorResponse(-32603, `Failed to answer question: ${msg}`, id);
    }
}
```

## Standalone Mode Setup

```typescript
// src/mcpServer/index.ts

let serverInstance: MCPServer | null = null;

/**
 * Initialize MCP server singleton.
 * 
 * @param inputStream - Input stream (default: process.stdin)
 * @param outputStream - Output stream (default: process.stdout)
 */
export function initializeMCPServer(
    inputStream?: NodeJS.ReadableStream,
    outputStream?: NodeJS.WritableStream
): void {
    if (serverInstance) {
        throw new Error('MCP Server already initialized');
    }
    
    serverInstance = new MCPServer(inputStream, outputStream);
}

export function getMCPServerInstance(): MCPServer {
    if (!serverInstance) {
        throw new Error('MCP Server not initialized');
    }
    return serverInstance;
}

// For tests
export function resetMCPServerForTests(): void {
    serverInstance = null;
}

// Standalone execution (when run directly with Node.js)
if (require.main === module) {
    (async () => {
        // Initialize COE services first
        const mockContext = {} as any;
        await initializeConfig(mockContext);
        await initializeTicketDb(mockContext);
        await initializeOrchestrator(mockContext);
        
        // Start MCP server
        initializeMCPServer();
        const server = getMCPServerInstance();
        await server.start();
    })();
}
```

## Testing MCP Server

```typescript
// tests/mcpServer.test.ts

import { Readable, Writable } from 'stream';

describe('MCP Server', () => {
    let inputStream: Readable;
    let outputStream: Writable;
    let outputData: string[];
    
    beforeEach(() => {
        inputStream = new Readable({ read() {} });
        outputData = [];
        outputStream = new Writable({
            write(chunk, encoding, callback) {
                outputData.push(chunk.toString());
                callback();
            }
        });
        
        resetMCPServerForTests();
    });
    
    it('Test 1: should handle getNextTask request', async () => {
        const server = new MCPServer(inputStream, outputStream);
        server.start();
        
        // Send request
        const request = JSON.stringify({
            jsonrpc: '2.0',
            method: 'getNextTask',
            id: 1
        });
        
        inputStream.push(request + '\n');
        
        // Wait for response
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify response
        expect(outputData.length).toBeGreaterThan(0);
        const response = JSON.parse(outputData[0]);
        expect(response.jsonrpc).toBe('2.0');
        expect(response.id).toBe(1);
    });
});
```

## Common Request/Response Patterns

### getNextTask

```json
// Request
{"jsonrpc":"2.0","method":"getNextTask","id":1}

// Response (task available)
{
  "jsonrpc":"2.0",
  "id":1,
  "result":{
    "id":"TICKET-001",
    "title":"Add authentication",
    "description":"Step 1: ...",
    "status":"pending"
  }
}

// Response (no tasks)
{"jsonrpc":"2.0","id":1,"result":null}
```

### askQuestion

```json
// Request
{
  "jsonrpc":"2.0",
  "method":"askQuestion",
  "params":{"question":"What is async/await?","chatId":"chat-123"},
  "id":2
}

// Response
{
  "jsonrpc":"2.0",
  "id":2,
  "result":{
    "answer":"Async/await is a pattern for...",
    "chatId":"chat-123"
  }
}
```

### reportTaskDone

```json
// Request
{
  "jsonrpc":"2.0",
  "method":"reportTaskDone",
  "params":{"taskId":"TICKET-001","result":"Completed successfully"},
  "id":3
}

// Response
{"jsonrpc":"2.0","id":3,"result":{"success":true}}
```

## Common Mistakes

❌ **Don't**: Write to stdout except JSON responses
```typescript
// BAD - breaks JSON-RPC protocol
console.log('Debug message'); // Goes to stdout!
```

✅ **Do**: Use logger (writes to VS Code Output)
```typescript
// GOOD - logs to Output panel, not stdout
logInfo('Debug message');
```

❌ **Don't**: Throw errors without catching
```typescript
// BAD - crashes server
async handleRequest(request) {
    const result = await riskyOperation(); // Might throw!
    return result;
}
```

✅ **Do**: Always catch and return error response
```typescript
// GOOD - returns JSON-RPC error
async handleRequest(request) {
    try {
        return await riskyOperation();
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return createErrorResponse(-32603, msg, request.id);
    }
}
```

## Related Skills
- **[12-agent-coordination.md](12-agent-coordination.md)** - Orchestrator routing
- **[11-error-handling-patterns.md](11-error-handling-patterns.md)** - Error responses
- **[09-vscode-api-patterns.md](09-vscode-api-patterns.md)** - VS Code integration
