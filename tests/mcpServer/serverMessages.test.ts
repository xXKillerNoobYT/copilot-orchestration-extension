import { PassThrough } from 'stream';
import { MCPServer } from '../../src/mcpServer/server';
import {
    handleGetNextTask,
    validateGetNextTaskParams,
} from '../../src/mcpServer/tools/getNextTask';

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('../../src/mcpServer/integration', () => ({
    logRegisteredTools: jest.fn(),
}));

jest.mock('../../src/services/orchestrator', () => ({
    routeToPlanningAgent: jest.fn(),
    routeToVerificationAgent: jest.fn(),
    routeToAnswerAgent: jest.fn(),
}));

jest.mock('../../src/mcpServer/tools/getNextTask', () => ({
    handleGetNextTask: jest.fn(),
    validateGetNextTaskParams: jest.fn(() => ({ isValid: true })),
}));

jest.mock('../../src/mcpServer/tools/reportTaskDone', () => ({
    handleReportTaskDone: jest.fn(),
    validateReportTaskDoneParams: jest.fn(() => ({ isValid: true })),
}));

jest.mock('../../src/mcpServer/tools/askQuestion', () => ({
    handleAskQuestion: jest.fn(),
    validateAskQuestionParams: jest.fn(() => ({ isValid: true })),
}));

jest.mock('../../src/mcpServer/tools/getErrors', () => ({
    handleGetErrors: jest.fn(),
    validateGetErrorsParams: jest.fn(() => ({ isValid: true })),
}));

describe('MCPServer message handling', () => {
    const handleGetNextTaskMock = handleGetNextTask as jest.MockedFunction<typeof handleGetNextTask>;
    const validateGetNextTaskMock = validateGetNextTaskParams as jest.MockedFunction<typeof validateGetNextTaskParams>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    const readResponse = async (output: PassThrough): Promise<any> => {
        const raw = await new Promise<string>((resolve) => {
            output.once('data', (chunk) => resolve(chunk.toString()));
        });
        return JSON.parse(raw.trim());
    };

    it('Test 1: should respond to getNextTask requests', async () => {
        const input = new PassThrough();
        const output = new PassThrough();
        const server = new MCPServer(input, output);
        handleGetNextTaskMock.mockResolvedValue({ success: true, task: { id: 'TASK-1' } });

        server.start();
        input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getNextTask', params: {} }));

        const response = await readResponse(output);

        expect(response.result).toEqual({ id: 'TASK-1' });
        server.stop();
    });

    it('Test 2: should send error for invalid parameters', async () => {
        const input = new PassThrough();
        const output = new PassThrough();
        const server = new MCPServer(input, output);
        validateGetNextTaskMock.mockReturnValue({ isValid: false, error: 'bad' });

        server.start();
        input.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'getNextTask', params: { filter: 123 } }));

        const response = await readResponse(output);

        expect(response.error.code).toBe(-32602);
        server.stop();
    });

    it('Test 3: should send method not found error for unknown methods', async () => {
        const input = new PassThrough();
        const output = new PassThrough();
        const server = new MCPServer(input, output);

        server.start();
        input.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'unknownMethod' }));

        const response = await readResponse(output);

        expect(response.error.code).toBe(-32601);
        server.stop();
    });
});
