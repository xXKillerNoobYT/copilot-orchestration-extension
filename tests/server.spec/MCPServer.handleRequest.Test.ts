// ./server.Test.ts
import { MCPServer } from '../../src/mcpServer/server';
import { logInfo, logError } from '../../src/logger';

jest.mock('../../src/logger', () => ({
  ...jest.requireActual('../../src/logger'),
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('MCPServer.handleRequest', () => {
  let server: MCPServer;
  let sendErrorSpy: jest.SpyInstance;
  let handleGetNextTaskSpy: jest.SpyInstance;
  let handleReportTaskDoneSpy: jest.SpyInstance;
  let handleAskQuestionSpy: jest.SpyInstance;
  let handleCallCOEAgentSpy: jest.SpyInstance;

  beforeEach(() => {
    server = new MCPServer();
    sendErrorSpy = jest.spyOn(server as unknown as Record<string, unknown>, 'sendError').mockImplementation();
    handleGetNextTaskSpy = jest.spyOn(server as unknown as Record<string, unknown>, 'handleGetNextTask').mockResolvedValue(undefined);
    handleReportTaskDoneSpy = jest.spyOn(server as unknown as Record<string, unknown>, 'handleReportTaskDone').mockResolvedValue(undefined);
    handleAskQuestionSpy = jest.spyOn(server as unknown as Record<string, unknown>, 'handleAskQuestion').mockResolvedValue(undefined);
    handleCallCOEAgentSpy = jest.spyOn(server as unknown as Record<string, unknown>, 'handleCallCOEAgent').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
  it('should log and handle valid JSON-RPC requests', () => {
    const data = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'getNextTask', id: 1 }));
    (server as unknown as Record<string, unknown>).handleRequest(data);

    expect(logInfo).toHaveBeenCalledWith('MCP received request: method=getNextTask, id=1');
    expect(handleGetNextTaskSpy).toHaveBeenCalledWith({ jsonrpc: '2.0', method: 'getNextTask', id: 1 });
  });

  /** @aiContributed-2026-02-03 */
  it('should send error for invalid JSON-RPC version', () => {
    const data = Buffer.from(JSON.stringify({ jsonrpc: '1.0', method: 'getNextTask', id: 1 }));
    (server as unknown as Record<string, unknown>).handleRequest(data);

    expect(sendErrorSpy).toHaveBeenCalledWith(1, -32600, 'Invalid JSON-RPC version');
  });

  /** @aiContributed-2026-02-03 */
  it('should send error for unknown method', () => {
    const data = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'unknownMethod', id: 1 }));
    (server as unknown as Record<string, unknown>).handleRequest(data);

    expect(sendErrorSpy).toHaveBeenCalledWith(1, -32601, 'Method not found: unknownMethod');
  });

  /** @aiContributed-2026-02-03 */
  it('should handle JSON parse errors', () => {
    const data = Buffer.from('invalid json');
    (server as unknown as Record<string, unknown>).handleRequest(data);

    expect(logError).toHaveBeenCalledWith(expect.stringContaining('MCP server error parsing JSON'));
    expect(sendErrorSpy).toHaveBeenCalledWith(null, -32700, 'Parse error');
  });

  /** @aiContributed-2026-02-03 */
  it('should route to handleReportTaskDone for reportTaskDone method', () => {
    const data = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'reportTaskDone', id: 2 }));
    (server as unknown as Record<string, unknown>).handleRequest(data);

    expect(handleReportTaskDoneSpy).toHaveBeenCalledWith({ jsonrpc: '2.0', method: 'reportTaskDone', id: 2 });
  });

  /** @aiContributed-2026-02-03 */
  it('should route to handleAskQuestion for askQuestion method', () => {
    const data = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'askQuestion', id: 3 }));
    (server as unknown as Record<string, unknown>).handleRequest(data);

    expect(handleAskQuestionSpy).toHaveBeenCalledWith({ jsonrpc: '2.0', method: 'askQuestion', id: 3 });
  });

  /** @aiContributed-2026-02-03 */
  it('should route to handleCallCOEAgent for callCOEAgent method', () => {
    const data = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'callCOEAgent', id: 4 }));
    (server as unknown as Record<string, unknown>).handleRequest(data);

    expect(handleCallCOEAgentSpy).toHaveBeenCalledWith({ jsonrpc: '2.0', method: 'callCOEAgent', id: 4 });
  });
});