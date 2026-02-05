// ./server.Test.ts
import { MCPServer } from '../../src/mcpServer/server';
import { logInfo } from '../../src/logger';
import { parseJsonRpcMessage } from '../../src/mcpServer/jsonrpc';

jest.mock('../../src/logger', () => ({
  ...jest.requireActual('../../src/logger'),
  logInfo: jest.fn(),
}));

jest.mock('../../src/mcpServer/jsonrpc', () => ({
  ...jest.requireActual('../../src/mcpServer/jsonrpc'),
  parseJsonRpcMessage: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('MCPServer.handleRequest', () => {
  let server: MCPServer;
  let sendErrorSpy: jest.SpyInstance;
  let sendJsonRpcResponseSpy: jest.SpyInstance;
  let handleGetNextTaskSpy: jest.SpyInstance;
  let handleReportTaskDoneSpy: jest.SpyInstance;
  let handleAskQuestionSpy: jest.SpyInstance;
  let handleCallCOEAgentSpy: jest.SpyInstance;

  beforeEach(() => {
    server = new MCPServer();
    sendErrorSpy = jest.spyOn(server as unknown as { sendError: (id: number, code: number, message: string) => void }, 'sendError').mockImplementation();
    sendJsonRpcResponseSpy = jest.spyOn(server as unknown as { sendJsonRpcResponse: (response: unknown) => void }, 'sendJsonRpcResponse').mockImplementation();
    handleGetNextTaskSpy = jest.spyOn(server as unknown as { handleGetNextTask: (request: unknown) => Promise<void> }, 'handleGetNextTask').mockResolvedValue(undefined);
    handleReportTaskDoneSpy = jest.spyOn(server as unknown as { handleReportTaskDone: (request: unknown) => Promise<void> }, 'handleReportTaskDone').mockResolvedValue(undefined);
    handleAskQuestionSpy = jest.spyOn(server as unknown as { handleAskQuestion: (request: unknown) => Promise<void> }, 'handleAskQuestion').mockResolvedValue(undefined);
    handleCallCOEAgentSpy = jest.spyOn(server as unknown as { handleCallCOEAgent: (request: unknown) => Promise<void> }, 'handleCallCOEAgent').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
  it('should emit parse/validation errors', () => {
    const mockErrors = [{ id: null, error: { code: -32700, message: 'Parse error' } }];
    (parseJsonRpcMessage as jest.Mock).mockReturnValue({ errors: mockErrors, requests: [] });

    const data = Buffer.from('invalid json');
    (server as unknown as { handleRequest: (data: Buffer) => void }).handleRequest(data);

    expect(sendJsonRpcResponseSpy).toHaveBeenCalledWith(mockErrors[0]);
    expect(sendErrorSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should handle valid JSON-RPC requests', () => {
    const mockRequest = { jsonrpc: '2.0', method: 'getNextTask', id: 1 };
    (parseJsonRpcMessage as jest.Mock).mockReturnValue({ errors: [], requests: [mockRequest] });

    const data = Buffer.from(JSON.stringify(mockRequest));
    (server as unknown as { handleRequest: (data: Buffer) => void }).handleRequest(data);

    expect(logInfo).toHaveBeenCalledWith('MCP received request: method=getNextTask, id=1');
    expect(handleGetNextTaskSpy).toHaveBeenCalledWith(mockRequest);
  });

  /** @aiContributed-2026-02-04 */
  it('should handle batch requests', () => {
    const mockRequests = [
      { jsonrpc: '2.0', method: 'getNextTask', id: 1 },
      { jsonrpc: '2.0', method: 'reportTaskDone', id: 2 },
    ];
    (parseJsonRpcMessage as jest.Mock).mockReturnValue({ errors: [], requests: mockRequests });

    const data = Buffer.from(JSON.stringify(mockRequests));
    (server as unknown as { handleRequest: (data: Buffer) => void }).handleRequest(data);

    expect(handleGetNextTaskSpy).toHaveBeenCalledWith(mockRequests[0]);
    expect(handleReportTaskDoneSpy).toHaveBeenCalledWith(mockRequests[1]);
  });

  /** @aiContributed-2026-02-04 */
  it('should send error for unknown method', () => {
    const mockRequest = { jsonrpc: '2.0', method: 'unknownMethod', id: 1 };
    (parseJsonRpcMessage as jest.Mock).mockReturnValue({ errors: [], requests: [mockRequest] });

    const data = Buffer.from(JSON.stringify(mockRequest));
    (server as unknown as { handleRequest: (data: Buffer) => void }).handleRequest(data);

    expect(sendErrorSpy).toHaveBeenCalledWith(1, -32601, 'Method not found: unknownMethod');
  });

  /** @aiContributed-2026-02-04 */
  it('should route to handleReportTaskDone for reportTaskDone method', () => {
    const mockRequest = { jsonrpc: '2.0', method: 'reportTaskDone', id: 2 };
    (parseJsonRpcMessage as jest.Mock).mockReturnValue({ errors: [], requests: [mockRequest] });

    const data = Buffer.from(JSON.stringify(mockRequest));
    (server as unknown as { handleRequest: (data: Buffer) => void }).handleRequest(data);

    expect(handleReportTaskDoneSpy).toHaveBeenCalledWith(mockRequest);
  });

  /** @aiContributed-2026-02-04 */
  it('should route to handleAskQuestion for askQuestion method', () => {
    const mockRequest = { jsonrpc: '2.0', method: 'askQuestion', id: 3 };
    (parseJsonRpcMessage as jest.Mock).mockReturnValue({ errors: [], requests: [mockRequest] });

    const data = Buffer.from(JSON.stringify(mockRequest));
    (server as unknown as { handleRequest: (data: Buffer) => void }).handleRequest(data);

    expect(handleAskQuestionSpy).toHaveBeenCalledWith(mockRequest);
  });

  /** @aiContributed-2026-02-04 */
  it('should route to handleCallCOEAgent for callCOEAgent method', () => {
    const mockRequest = { jsonrpc: '2.0', method: 'callCOEAgent', id: 4 };
    (parseJsonRpcMessage as jest.Mock).mockReturnValue({ errors: [], requests: [mockRequest] });

    const data = Buffer.from(JSON.stringify(mockRequest));
    (server as unknown as { handleRequest: (data: Buffer) => void }).handleRequest(data);

    expect(handleCallCOEAgentSpy).toHaveBeenCalledWith(mockRequest);
  });

  /** @aiContributed-2026-02-04 */
  it('should return early if no requests are present', () => {
    (parseJsonRpcMessage as jest.Mock).mockReturnValue({ errors: [], requests: [] });

    const data = Buffer.from(JSON.stringify([]));
    (server as unknown as { handleRequest: (data: Buffer) => void }).handleRequest(data);

    expect(logInfo).not.toHaveBeenCalled();
    expect(handleGetNextTaskSpy).not.toHaveBeenCalled();
    expect(handleReportTaskDoneSpy).not.toHaveBeenCalled();
    expect(handleAskQuestionSpy).not.toHaveBeenCalled();
    expect(handleCallCOEAgentSpy).not.toHaveBeenCalled();
  });
});