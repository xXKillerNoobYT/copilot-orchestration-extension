// mcpServer.ts
// MCP (Model Context Protocol) server using JSON-RPC 2.0 over stdio transport

import { EventEmitter } from 'events';
import { logInfo, logError, logWarn } from '../logger';
import { getNextTask } from '../services/orchestrator';

/**
 * JSON-RPC 2.0 request structure
 */
interface JsonRpcRequest {
    jsonrpc: string;
    method: string;
    params?: any;
    id?: string | number | null;
}

/**
 * JSON-RPC 2.0 response structure
 */
interface JsonRpcResponse {
    jsonrpc: string;
    id: string | number | null;
    result?: any;
    error?: {
        code: number;
        message: string;
    };
}

/**
 * MCP Server class - handles JSON-RPC 2.0 requests over stdio
 * 
 * Beginner explanation:
 * - This server listens to "stdin" (standard input = text coming INTO our extension from Copilot)
 * - When Copilot sends a JSON-RPC request, we parse it and call the right tool
 * - We send back a JSON-RPC response via "stdout" (standard output = text going OUT to Copilot)
 */
export class MCPServer extends EventEmitter {
    private inputStream: NodeJS.ReadableStream;
    private outputStream: NodeJS.WritableStream;
    private isStarted: boolean = false;

    /**
     * Constructor allows dependency injection for testing
     * @param inputStream - defaults to process.stdin
     * @param outputStream - defaults to process.stdout
     */
    constructor(
        inputStream: NodeJS.ReadableStream = process.stdin,
        outputStream: NodeJS.WritableStream = process.stdout
    ) {
        super();
        this.inputStream = inputStream;
        this.outputStream = outputStream;
    }

    /**
     * Start the MCP server - begins listening for JSON-RPC requests
     */
    public start(): void {
        if (this.isStarted) {
            logWarn('MCP server already started, ignoring duplicate start call');
            return;
        }

        logInfo('MCP server starting...');

        // Resume stdin to start reading data (required for Node.js streams)
        if (this.inputStream === process.stdin) {
            this.inputStream.resume();
        }

        // Listen for incoming data
        this.inputStream.on('data', this.handleRequest.bind(this));

        this.isStarted = true;
        logInfo('MCP server started successfully');
    }

    /**
     * Stop the MCP server - cleans up listeners
     */
    public stop(): void {
        if (!this.isStarted) {
            return;
        }

        logInfo('MCP server stopping...');
        this.inputStream.removeAllListeners('data');

        if (this.inputStream === process.stdin) {
            this.inputStream.pause();
        }

        this.isStarted = false;
        logInfo('MCP server stopped');
    }

    /**
     * Handle incoming JSON-RPC request
     * Beginner explanation: This runs when Copilot sends us text via stdin
     */
    private handleRequest(data: Buffer): void {
        try {
            const request: JsonRpcRequest = JSON.parse(data.toString());

            logInfo(`MCP received request: method=${request.method}, id=${request.id}`);

            // Validate JSON-RPC version
            if (request.jsonrpc !== '2.0') {
                this.sendError(request.id || null, -32600, 'Invalid JSON-RPC version');
                return;
            }

            // Route to the appropriate tool handler
            if (request.method === 'getNextTask') {
                this.handleGetNextTask(request);
            } else {
                // Method not found error (JSON-RPC error code -32601)
                this.sendError(request.id || null, -32601, `Method not found: ${request.method}`);
            }
        } catch (error) {
            // Invalid JSON error (JSON-RPC error code -32700)
            logError(`MCP server error parsing JSON: ${error}`);
            this.sendError(null, -32700, 'Parse error');
        }
    }

    /**
     * Handle getNextTask tool call
     * Beginner explanation: This calls our Orchestrator to get the next task from the queue
     */
    private async handleGetNextTask(request: JsonRpcRequest): Promise<void> {
        try {
            const task = await getNextTask();
            this.sendResponse(request.id || null, task);
        } catch (error) {
            logError(`MCP server error calling getNextTask: ${error}`);
            this.sendError(request.id || null, -32603, 'Internal error: failed to get next task');
        }
    }

    /**
     * Send a successful JSON-RPC response
     * Beginner explanation: Send result back to Copilot via stdout
     */
    private sendResponse(id: string | number | null, result: any): void {
        const response: JsonRpcResponse = {
            jsonrpc: '2.0',
            id,
            result
        };
        this.outputStream.write(JSON.stringify(response) + '\n');
        logInfo(`MCP sent response: id=${id}`);
    }

    /**
     * Send a JSON-RPC error response
     * Beginner explanation: Send error back to Copilot when something goes wrong
     */
    private sendError(id: string | number | null, code: number, message: string): void {
        const errorResponse: JsonRpcResponse = {
            jsonrpc: '2.0',
            id,
            error: {
                code,
                message
            }
        };
        this.outputStream.write(JSON.stringify(errorResponse) + '\n');
        logWarn(`MCP sent error: id=${id}, code=${code}, message=${message}`);
    }
}

/**
 * Global MCP server instance
 */
let mcpServerInstance: MCPServer | null = null;

/**
 * Start the MCP server (called from extension.ts activate)
 * Beginner explanation: This is the function we call to turn on the MCP server
 */
export function startMCPServer(): void {
    if (mcpServerInstance) {
        logWarn('MCP server already exists, not creating a new instance');
        return;
    }

    mcpServerInstance = new MCPServer();
    mcpServerInstance.start();
}

/**
 * Stop the MCP server (called from extension.ts deactivate)
 */
export function stopMCPServer(): void {
    if (mcpServerInstance) {
        mcpServerInstance.stop();
        mcpServerInstance = null;
    }
}

/**
 * Get the current MCP server instance (for testing only)
 */
export function getMCPServerInstance(): MCPServer | null {
    return mcpServerInstance;
}
