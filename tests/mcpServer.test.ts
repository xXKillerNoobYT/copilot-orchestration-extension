/**
 * Tests for mcpServer.ts
 * 
 * Tests the MCP server including:
 * - JSON-RPC request handling
 * - getNextTask tool invocation
 * - Error handling (invalid JSON, unknown method)
 * - Response formatting
 * - Server start/stop lifecycle
 */

import { MCPServer } from '../src/mcpServer/server';
import * as orchestrator from '../src/services/orchestrator';
import * as reportTaskDoneTool from '../src/mcpServer/tools/reportTaskDone';
import * as askQuestionTool from '../src/mcpServer/tools/askQuestion';
import * as getErrorsTool from '../src/mcpServer/tools/getErrors';
import { Readable, Writable } from 'stream';
import { EventEmitter } from 'events';

// Mock the orchestrator module
jest.mock('../src/services/orchestrator');

// Mock the tool modules
jest.mock('../src/mcpServer/tools/reportTaskDone');
jest.mock('../src/mcpServer/tools/askQuestion');
jest.mock('../src/mcpServer/tools/getErrors');

// Mock the logger module
jest.mock('../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

// Cast mocks to typed versions
const mockOrchestrator = orchestrator as jest.Mocked<typeof orchestrator>;
const mockReportTaskDone = reportTaskDoneTool as jest.Mocked<typeof reportTaskDoneTool>;
const mockAskQuestion = askQuestionTool as jest.Mocked<typeof askQuestionTool>;
const mockGetErrors = getErrorsTool as jest.Mocked<typeof getErrorsTool>;

describe('MCP Server', () => {
    let mockInputStream: Readable;
    let mockOutputStream: Writable;
    let outputData: string[];
    let mcpServer: MCPServer;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();

        // Create mock stdin (a readable stream we can write test data to)
        mockInputStream = new Readable({
            read() {
                // No-op: we'll manually push data in tests
            }
        });

        // Create mock stdout (capture what the server writes)
        outputData = [];
        mockOutputStream = new Writable({
            write(chunk: any, encoding: any, callback: any) {
                outputData.push(chunk.toString());
                callback();
            }
        });

        // Create MCP server with mocked streams
        mcpServer = new MCPServer(mockInputStream, mockOutputStream);
    });

    afterEach(() => {
        // Clean up server after each test
        if (mcpServer) {
            mcpServer.stop();
        }
    });

    describe('Server Lifecycle', () => {
        it('should start the server successfully', () => {
            mcpServer.start();

            // Verify server is listening
            expect(mockInputStream.listenerCount('data')).toBe(1);
        });

        it('should stop the server successfully', () => {
            mcpServer.start();
            mcpServer.stop();

            // Verify server cleaned up listeners
            expect(mockInputStream.listenerCount('data')).toBe(0);
        });

        it('should not start the server twice', () => {
            mcpServer.start();
            mcpServer.start();

            // Should still have only one listener
            expect(mockInputStream.listenerCount('data')).toBe(1);
        });
    });

    describe('JSON-RPC Request Handling', () => {
        it('should handle valid getNextTask request', async () => {
            // Mock orchestrator response
            const mockTask = {
                id: 'TICKET-1',
                ticketId: 'TICKET-1',
                title: 'Test Task',
                status: 'pending' as const,
                createdAt: new Date().toISOString()
            };
            mockOrchestrator.getNextTask.mockResolvedValue(mockTask);

            mcpServer.start();

            // Simulate incoming JSON-RPC request
            const request = {
                jsonrpc: '2.0',
                method: 'getNextTask',
                id: 1
            };

            mockInputStream.push(JSON.stringify(request));

            // Wait for async handler
            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify response was sent
            expect(outputData.length).toBe(1);
            const response = JSON.parse(outputData[0]);
            expect(response).toEqual({
                jsonrpc: '2.0',
                id: 1,
                result: mockTask
            });

            // Verify orchestrator was called
            expect(mockOrchestrator.getNextTask).toHaveBeenCalledTimes(1);
        });

        it('should handle invalid JSON with parse error', async () => {
            mcpServer.start();

            // Send invalid JSON
            mockInputStream.push('{ invalid json }');

            // Wait for handler
            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify error response
            expect(outputData.length).toBe(1);
            const response = JSON.parse(outputData[0]);
            expect(response).toEqual({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32700,
                    message: expect.stringContaining('Parse error')
                }
            });
        });

        it('should handle unknown method with method not found error', async () => {
            mcpServer.start();

            // Send request with unknown method
            const request = {
                jsonrpc: '2.0',
                method: 'unknownMethod',
                id: 2
            };

            mockInputStream.push(JSON.stringify(request));

            // Wait for handler
            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify error response
            expect(outputData.length).toBe(1);
            const response = JSON.parse(outputData[0]);
            expect(response).toEqual({
                jsonrpc: '2.0',
                id: 2,
                error: {
                    code: -32601,
                    message: 'Method not found: unknownMethod'
                }
            });
        });

        it('should handle invalid JSON-RPC version', async () => {
            mcpServer.start();

            // Send request with wrong JSON-RPC version
            const request = {
                jsonrpc: '1.0',
                method: 'getNextTask',
                id: 3
            };

            mockInputStream.push(JSON.stringify(request));

            // Wait for handler
            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify error response
            expect(outputData.length).toBe(1);
            const response = JSON.parse(outputData[0]);
            expect(response).toEqual({
                jsonrpc: '2.0',
                id: 3,
                error: {
                    code: -32600,
                    message: 'Invalid Request: jsonrpc must be "2.0"'
                }
            });
        });

        it('should handle orchestrator error gracefully', async () => {
            // Mock orchestrator to throw error
            mockOrchestrator.getNextTask.mockRejectedValue(new Error('Orchestrator failed'));

            mcpServer.start();

            // Send valid request
            const request = {
                jsonrpc: '2.0',
                method: 'getNextTask',
                id: 4
            };

            mockInputStream.push(JSON.stringify(request));

            // Wait for async handler
            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify error response
            expect(outputData.length).toBe(1);
            const response = JSON.parse(outputData[0]);
            expect(response).toEqual({
                jsonrpc: '2.0',
                id: 4,
                error: {
                    code: -32603,
                    message: 'Failed to get next task: Orchestrator failed'
                }
            });
        });
    });

    describe('Edge Cases', () => {
        it('should handle request without id', async () => {
            const mockTask = {
                id: 'TICKET-1',
                ticketId: 'TICKET-1',
                title: 'Test Task',
                status: 'pending' as const,
                createdAt: new Date().toISOString()
            };
            mockOrchestrator.getNextTask.mockResolvedValue(mockTask);

            mcpServer.start();

            // Request without id (notification in JSON-RPC)
            const request = {
                jsonrpc: '2.0',
                method: 'getNextTask'
            };

            mockInputStream.push(JSON.stringify(request));

            // Wait for handler
            await new Promise(resolve => setTimeout(resolve, 50));

            // Should still send response with id: null
            expect(outputData.length).toBe(1);
            const response = JSON.parse(outputData[0]);
            expect(response.id).toBe(null);
            expect(response.result).toEqual(mockTask);
        });

        it('should handle empty response from orchestrator', async () => {
            mockOrchestrator.getNextTask.mockResolvedValue(null);

            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'getNextTask',
                id: 5
            };

            mockInputStream.push(JSON.stringify(request));

            // Wait for handler
            await new Promise(resolve => setTimeout(resolve, 50));

            // Should send response with null result
            expect(outputData.length).toBe(1);
            const response = JSON.parse(outputData[0]);
            expect(response).toEqual({
                jsonrpc: '2.0',
                id: 5,
                result: null
            });
        });
    });

    describe('COE Agent Tool', () => {
        beforeEach(() => {
            // Mock orchestrator functions
            mockOrchestrator.routeToPlanningAgent = jest.fn().mockResolvedValue('Step 1: Design\nStep 2: Implement');
            mockOrchestrator.routeToVerificationAgent = jest.fn().mockResolvedValue({
                passed: true,
                explanation: 'All criteria met successfully'
            });
            mockOrchestrator.routeToAnswerAgent = jest.fn().mockResolvedValue('VS Code extensions are powerful tools...');
        });

        it('should route "plan" command to planning agent', async () => {
            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'callCOEAgent',
                params: {
                    command: 'plan',
                    args: { task: 'Add dark mode toggle' }
                },
                id: 1
            };

            mockInputStream.push(JSON.stringify(request));

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockOrchestrator.routeToPlanningAgent).toHaveBeenCalledWith('Add dark mode toggle');
            expect(outputData.length).toBe(1);
            const response = JSON.parse(outputData[0]);
            expect(response.result).toContain('Step 1: Design');
        });

        it('should route "verify" command and format result as PASS/FAIL', async () => {
            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'callCOEAgent',
                params: {
                    command: 'verify',
                    args: { task: 'Add feature', code: '+ newFeature: true' }
                },
                id: 2
            };

            mockInputStream.push(JSON.stringify(request));

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockOrchestrator.routeToVerificationAgent).toHaveBeenCalledWith('Add feature', '+ newFeature: true');
            expect(outputData.length).toBe(1);
            const response = JSON.parse(outputData[0]);
            expect(response.result).toBe('PASS - All criteria met successfully');
        });

        it('should format FAIL verification result correctly', async () => {
            mockOrchestrator.routeToVerificationAgent = jest.fn().mockResolvedValue({
                passed: false,
                explanation: 'Missing required tests'
            });

            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'callCOEAgent',
                params: {
                    command: 'verify',
                    args: { code: '+ feature: true' }
                },
                id: 3
            };

            mockInputStream.push(JSON.stringify(request));

            await new Promise(resolve => setTimeout(resolve, 50));

            const response = JSON.parse(outputData[0]);
            expect(response.result).toBe('FAIL - Missing required tests');
        });

        it('should route "ask" command to answer agent', async () => {
            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'callCOEAgent',
                params: {
                    command: 'ask',
                    args: { question: 'What is a VS Code extension?' }
                },
                id: 4
            };

            mockInputStream.push(JSON.stringify(request));

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockOrchestrator.routeToAnswerAgent).toHaveBeenCalledWith('What is a VS Code extension?');
            expect(outputData.length).toBe(1);
            const response = JSON.parse(outputData[0]);
            expect(response.result).toContain('VS Code extensions are');
        });

        it('should return error for invalid command', async () => {
            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'callCOEAgent',
                params: {
                    command: 'invalid',
                    args: {}
                },
                id: 5
            };

            mockInputStream.push(JSON.stringify(request));

            await new Promise(resolve => setTimeout(resolve, 50));

            const response = JSON.parse(outputData[0]);
            expect(response.error).toBeDefined();
            expect(response.error.code).toBe(-32602);
            expect(response.error.message).toContain('Unknown COE command');
            expect(response.error.message).toContain('plan, verify, ask');
        });

        it('should return error for missing task arg in plan command', async () => {
            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'callCOEAgent',
                params: {
                    command: 'plan',
                    args: {}
                },
                id: 6
            };

            mockInputStream.push(JSON.stringify(request));

            await new Promise(resolve => setTimeout(resolve, 50));

            const response = JSON.parse(outputData[0]);
            expect(response.error).toBeDefined();
            expect(response.error.message).toContain('Missing required argument: task');
        });

        it('should return error for missing code arg in verify command', async () => {
            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'callCOEAgent',
                params: {
                    command: 'verify',
                    args: { task: 'Test' }
                },
                id: 7
            };

            mockInputStream.push(JSON.stringify(request));

            await new Promise(resolve => setTimeout(resolve, 50));

            const response = JSON.parse(outputData[0]);
            expect(response.error).toBeDefined();
            expect(response.error.message).toContain('Missing required argument: code');
        });

        it('should return error for missing question arg in ask command', async () => {
            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'callCOEAgent',
                params: {
                    command: 'ask',
                    args: {}
                },
                id: 8
            };

            mockInputStream.push(JSON.stringify(request));

            await new Promise(resolve => setTimeout(resolve, 50));

            const response = JSON.parse(outputData[0]);
            expect(response.error).toBeDefined();
            expect(response.error.message).toContain('Missing required argument: question');
        });

        it('should return error for missing args object', async () => {
            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'callCOEAgent',
                params: {
                    command: 'plan'
                },
                id: 9
            };

            mockInputStream.push(JSON.stringify(request));

            await new Promise(resolve => setTimeout(resolve, 50));

            const response = JSON.parse(outputData[0]);
            expect(response.error).toBeDefined();
            expect(response.error.message).toContain('Missing or invalid args object');
        });

        it('should handle orchestrator errors gracefully', async () => {
            mockOrchestrator.routeToPlanningAgent = jest.fn().mockRejectedValue(new Error('LLM timeout'));

            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'callCOEAgent',
                params: {
                    command: 'plan',
                    args: { task: 'Test task' }
                },
                id: 10
            };

            mockInputStream.push(JSON.stringify(request));

            await new Promise(resolve => setTimeout(resolve, 50));

            const response = JSON.parse(outputData[0]);
            expect(response.error).toBeDefined();
            expect(response.error.code).toBe(-32603);
            expect(response.error.message).toContain('COE agent failed');
            expect(response.error.message).toContain('LLM timeout');
        });

        it('should use default task description for verify when not provided', async () => {
            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'callCOEAgent',
                params: {
                    command: 'verify',
                    args: { code: '+ test: true' }
                },
                id: 11
            };

            mockInputStream.push(JSON.stringify(request));

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockOrchestrator.routeToVerificationAgent).toHaveBeenCalledWith('Verification', '+ test: true');
        });
    });

    describe('reportTaskDone Tool', () => {
        beforeEach(() => {
            mockReportTaskDone.validateReportTaskDoneParams.mockReturnValue({ isValid: true });
            mockReportTaskDone.handleReportTaskDone.mockResolvedValue({
                success: true,
                taskId: 'TICKET-1',
                status: 'done',
                message: 'Task completed successfully'
            });
        });

        it('should handle valid reportTaskDone request', async () => {
            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'reportTaskDone',
                params: {
                    ticketId: 'TICKET-1',
                    status: 'done',
                    summary: 'Task completed successfully'
                },
                id: 1
            };

            mockInputStream.push(JSON.stringify(request));
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockReportTaskDone.handleReportTaskDone).toHaveBeenCalledWith(request.params);
            expect(outputData.length).toBe(1);
            const response = JSON.parse(outputData[0]);
            expect(response.result.success).toBe(true);
        });

        it('should return error for invalid reportTaskDone params', async () => {
            mockReportTaskDone.validateReportTaskDoneParams.mockReturnValue({
                isValid: false,
                error: 'Missing ticketId'
            });

            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'reportTaskDone',
                params: {},
                id: 2
            };

            mockInputStream.push(JSON.stringify(request));
            await new Promise(resolve => setTimeout(resolve, 50));

            const response = JSON.parse(outputData[0]);
            expect(response.error).toBeDefined();
            expect(response.error.code).toBe(-32602);
            expect(response.error.message).toContain('Invalid parameters');
        });

        it('should return error when reportTaskDone fails', async () => {
            mockReportTaskDone.handleReportTaskDone.mockResolvedValue({
                success: false,
                taskId: 'TICKET-999',
                status: 'failed',
                message: 'Failed',
                error: { code: 'NOT_FOUND', message: 'Ticket not found' }
            });

            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'reportTaskDone',
                params: {
                    ticketId: 'TICKET-999',
                    status: 'done'
                },
                id: 3
            };

            mockInputStream.push(JSON.stringify(request));
            await new Promise(resolve => setTimeout(resolve, 50));

            const response = JSON.parse(outputData[0]);
            expect(response.error).toBeDefined();
            expect(response.error.code).toBe(-32603);
            expect(response.error.message).toContain('Ticket not found');
        });
    });

    describe('askQuestion Tool', () => {
        beforeEach(() => {
            mockAskQuestion.validateAskQuestionParams.mockReturnValue({ isValid: true });
            mockAskQuestion.handleAskQuestion.mockResolvedValue({
                success: true,
                answer: 'Here is the answer...'
            });
        });

        it('should handle valid askQuestion request', async () => {
            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'askQuestion',
                params: {
                    question: 'How does deduplication work?'
                },
                id: 1
            };

            mockInputStream.push(JSON.stringify(request));
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockAskQuestion.handleAskQuestion).toHaveBeenCalledWith(request.params);
            const response = JSON.parse(outputData[0]);
            expect(response.result.success).toBe(true);
        });

        it('should return error for invalid askQuestion params', async () => {
            mockAskQuestion.validateAskQuestionParams.mockReturnValue({
                isValid: false,
                error: 'Missing question'
            });

            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'askQuestion',
                params: {},
                id: 2
            };

            mockInputStream.push(JSON.stringify(request));
            await new Promise(resolve => setTimeout(resolve, 50));

            const response = JSON.parse(outputData[0]);
            expect(response.error).toBeDefined();
            expect(response.error.code).toBe(-32602);
        });

        it('should return error when askQuestion fails', async () => {
            mockAskQuestion.handleAskQuestion.mockResolvedValue({
                success: false,
                error: { code: 'LLM_ERROR', message: 'LLM unavailable' }
            });

            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'askQuestion',
                params: { question: 'Test' },
                id: 3
            };

            mockInputStream.push(JSON.stringify(request));
            await new Promise(resolve => setTimeout(resolve, 50));

            const response = JSON.parse(outputData[0]);
            expect(response.error).toBeDefined();
            expect(response.error.message).toContain('LLM unavailable');
        });
    });

    describe('getErrors Tool', () => {
        beforeEach(() => {
            mockGetErrors.validateGetErrorsParams.mockReturnValue({ isValid: true });
            mockGetErrors.handleGetErrors.mockResolvedValue({
                success: true,
                diagnostics: {
                    typeScriptErrors: [],
                    skippedTests: [],
                    underCoverageFiles: [],
                    timestamp: new Date().toISOString(),
                    source: 'test'
                }
            });
        });

        it('should handle valid getErrors request', async () => {
            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'getErrors',
                params: {
                    filePattern: 'src/**/*.ts'
                },
                id: 1
            };

            mockInputStream.push(JSON.stringify(request));
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockGetErrors.handleGetErrors).toHaveBeenCalledWith(request.params);
            const response = JSON.parse(outputData[0]);
            expect(response.result).toBeDefined();
        });

        it('should handle getErrors request without params', async () => {
            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'getErrors',
                id: 2
            };

            mockInputStream.push(JSON.stringify(request));
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockGetErrors.handleGetErrors).toHaveBeenCalledWith(undefined);
        });

        it('should return error for invalid getErrors params', async () => {
            mockGetErrors.validateGetErrorsParams.mockReturnValue({
                isValid: false,
                error: 'Invalid file pattern'
            });

            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'getErrors',
                params: { invalidField: true },
                id: 3
            };

            mockInputStream.push(JSON.stringify(request));
            await new Promise(resolve => setTimeout(resolve, 50));

            const response = JSON.parse(outputData[0]);
            expect(response.error).toBeDefined();
            expect(response.error.code).toBe(-32602);
        });

        it('should return error when getErrors fails', async () => {
            mockGetErrors.handleGetErrors.mockResolvedValue({
                success: false,
                diagnostics: null,
                error: { code: 'SCAN_ERROR', message: 'Failed to scan files' }
            });

            mcpServer.start();

            const request = {
                jsonrpc: '2.0',
                method: 'getErrors',
                params: {},
                id: 4
            };

            mockInputStream.push(JSON.stringify(request));
            await new Promise(resolve => setTimeout(resolve, 50));

            const response = JSON.parse(outputData[0]);
            expect(response.error).toBeDefined();
            expect(response.error.message).toContain('Failed to scan files');
        });
    });
});