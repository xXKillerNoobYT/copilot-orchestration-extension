// server.ts
// MCP Server class - JSON-RPC 2.0 over stdio transport

import { EventEmitter } from 'events';
import { logInfo, logError, logWarn } from '../logger';
import { routeToPlanningAgent, routeToVerificationAgent, routeToAnswerAgent } from '../services/orchestrator';
import { handleGetNextTask, validateGetNextTaskParams } from './tools/getNextTask';
import { handleReportTaskDone, validateReportTaskDoneParams } from './tools/reportTaskDone';

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
 * **Simple explanation**: This is like a waiter at a restaurant. When Copilot (the customer)
 * sends a request via stdin (like ordering food), we parse it, do the work, and send back
 * a response via stdout (like bringing the food to the table).
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
     * 
     * **Simple explanation**: Like turning on a phone - now it can receive calls (JSON-RPC requests)
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
     * 
     * **Simple explanation**: Like turning off a phone - stops listening for calls
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
     * 
     * **Simple explanation**: This runs when Copilot sends us a message - like receiving a text message
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
            } else if (request.method === 'reportTaskDone') {
                this.handleReportTaskDone(request);
            } else if (request.method === 'callCOEAgent') {
                this.handleCallCOEAgent(request);
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
     * 
     * **Simple explanation**: This asks our task queue "what should I work on next?"
     */
    private async handleGetNextTask(request: JsonRpcRequest): Promise<void> {
        // Validate parameters if provided
        const params = request.params;
        if (params) {
            const validation = validateGetNextTaskParams(params);
            if (!validation.isValid) {
                this.sendError(request.id || null, -32602, `Invalid parameters: ${validation.error}`);
                return;
            }
        }

        // Call the tool handler
        const response = await handleGetNextTask(params);

        // Send appropriate response based on success
        if (response.success) {
            // Return just the task data for backward compatibility
            this.sendResponse(request.id || null, response.task);
        } else {
            // Tool returned an error
            const errorCode = response.error?.code === 'ORCHESTRATOR_NOT_INITIALIZED' ? -32603 : -32603;
            this.sendError(request.id || null, errorCode, response.error?.message || 'Failed to get next task');
        }
    }

    /**
     * Handle reportTaskDone tool call
     * 
     * **Simple explanation**: This marks a task as done (or failed/blocked) and updates the ticket.
     */
    private async handleReportTaskDone(request: JsonRpcRequest): Promise<void> {
        const params = request.params;
        const validation = validateReportTaskDoneParams(params);
        if (!validation.isValid) {
            this.sendError(request.id || null, -32602, `Invalid parameters: ${validation.error}`);
            return;
        }

        const response = await handleReportTaskDone(params);

        if (response.success) {
            this.sendResponse(request.id || null, response);
        } else {
            const errorMessage = response.error?.message || 'Failed to report task status';
            this.sendError(request.id || null, -32603, errorMessage);
        }
    }

    /**
     * Handle callCOEAgent tool call
     * Routes command to appropriate COE agent (plan, verify, ask)
     * 
     * **Simple explanation**: Like a switchboard operator - when Copilot says "I need planning help",
     * we connect them to the Planning Agent (the right department)
     * 
     * @param request JSON-RPC request with params: { command, args }
     */
    private async handleCallCOEAgent(request: JsonRpcRequest): Promise<void> {
        try {
            const { command, args } = request.params || {};

            logInfo(`[MCP] COE agent called: command=${command}, args=${JSON.stringify(args || {}).substring(0, 100)}`);

            // Validate command
            const validCommands = ['plan', 'verify', 'ask'];
            if (!command || !validCommands.includes(command)) {
                this.sendError(
                    request.id || null,
                    -32602,
                    `Unknown COE command: ${command}. Valid commands: ${validCommands.join(', ')}`
                );
                return;
            }

            // Validate args object exists
            if (!args || typeof args !== 'object') {
                this.sendError(
                    request.id || null,
                    -32602,
                    'Missing or invalid args object'
                );
                return;
            }

            let response: string;

            // Route based on command
            switch (command) {
                case 'plan':
                    // Validate required arg
                    if (!args.task) {
                        this.sendError(request.id || null, -32602, 'Missing required argument: task');
                        return;
                    }
                    // Call planning agent
                    response = await routeToPlanningAgent(args.task);
                    break;

                case 'verify': {
                    // Validate required arg
                    if (!args.code) {
                        this.sendError(request.id || null, -32602, 'Missing required argument: code');
                        return;
                    }
                    // Call verification agent (task description optional, use args.task or default)
                    const result = await routeToVerificationAgent(args.task || 'Verification', args.code);
                    // Format response as string (Copilot expects string, not object)
                    response = `${result.passed ? 'PASS' : 'FAIL'} - ${result.explanation}`;
                    break;
                }

                case 'ask':
                    // Validate required arg
                    if (!args.question) {
                        this.sendError(request.id || null, -32602, 'Missing required argument: question');
                        return;
                    }
                    // Call answer agent
                    response = await routeToAnswerAgent(args.question);
                    break;

                default:
                    // Should never reach here due to validation above
                    this.sendError(request.id || null, -32602, `Unhandled command: ${command}`);
                    return;
            }

            // Send success response
            this.sendResponse(request.id || null, response);
            logInfo(`[MCP] COE agent completed: command=${command}, responseLength=${response.length}`);

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[MCP] COE agent error: ${msg}`);
            this.sendError(request.id || null, -32603, `COE agent failed: ${msg}`);
        }
    }

    /**
     * Send a successful JSON-RPC response
     * 
     * **Simple explanation**: Send the answer back to Copilot (like replying to a text message)
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
     * 
     * **Simple explanation**: Send an error message back when something goes wrong
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
