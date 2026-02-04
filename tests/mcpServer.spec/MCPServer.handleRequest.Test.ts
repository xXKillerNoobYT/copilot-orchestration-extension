// ./mcpServer.Test.ts
import { MCPServer } from '../../src/mcpServer/mcpServer';
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
  let handleCallCOEAgentSpy: jest.SpyInstance;

  beforeEach(() => {
    server = new MCPServer();
    sendErrorSpy = jest.spyOn(server as unknown as Record<string, unknown>, 'sendError').mockImplementation();
    handleGetNextTaskSpy = jest.spyOn(server as unknown as Record<string, unknown>, 'handleGetNextTask').mockImplementation();
    handleCallCOEAgentSpy = jest.spyOn(server as unknown as Record<string, unknown>, 'handleCallCOEAgent').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
  it('should log and handle valid JSON-RPC request for getNextTask', () => {
    const data = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'getNextTask', id: 1 }));
    (server as unknown as Record<string, unknown>).handleRequest(data);

    expect(logInfo).toHaveBeenCalledWith('MCP received request: method=getNextTask, id=1');
    expect(handleGetNextTaskSpy).toHaveBeenCalledWith({ jsonrpc: '2.0', method: 'getNextTask', id: 1 });
    expect(sendErrorSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should log and handle valid JSON-RPC request for callCOEAgent', () => {
    const data = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'callCOEAgent', id: 2 }));
    (server as unknown as Record<string, unknown>).handleRequest(data);

    expect(logInfo).toHaveBeenCalledWith('MCP received request: method=callCOEAgent, id=2');
    expect(handleCallCOEAgentSpy).toHaveBeenCalledWith({ jsonrpc: '2.0', method: 'callCOEAgent', id: 2 });
    expect(sendErrorSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should send error for invalid JSON-RPC version', () => {
    const data = Buffer.from(JSON.stringify({ jsonrpc: '1.0', method: 'getNextTask', id: 3 }));
    (server as unknown as Record<string, unknown>).handleRequest(data);

    expect(sendErrorSpy).toHaveBeenCalledWith(3, -32600, 'Invalid JSON-RPC version');
    expect(handleGetNextTaskSpy).not.toHaveBeenCalled();
    expect(handleCallCOEAgentSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should send error for unknown method', () => {
    const data = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'unknownMethod', id: 4 }));
    (server as unknown as Record<string, unknown>).handleRequest(data);

    expect(sendErrorSpy).toHaveBeenCalledWith(4, -32601, 'Method not found: unknownMethod');
    expect(handleGetNextTaskSpy).not.toHaveBeenCalled();
    expect(handleCallCOEAgentSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should send error for invalid JSON', () => {
    const data = Buffer.from('invalid json');
    (server as unknown as Record<string, unknown>).handleRequest(data);

    expect(logError).toHaveBeenCalledWith(expect.stringContaining('MCP server error parsing JSON'));
    expect(sendErrorSpy).toHaveBeenCalledWith(null, -32700, 'Parse error');
    expect(handleGetNextTaskSpy).not.toHaveBeenCalled();
    expect(handleCallCOEAgentSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle missing id in request and send appropriate error', () => {
    const data = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'getNextTask' }));
    (server as unknown as Record<string, unknown>).handleRequest(data);

    expect(sendErrorSpy).toHaveBeenCalledWith(null, -32600, 'Invalid JSON-RPC version');
    expect(handleGetNextTaskSpy).not.toHaveBeenCalled();
    expect(handleCallCOEAgentSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle unexpected error during request processing', () => {
    const data = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'getNextTask', id: 5 }));
    handleGetNextTaskSpy.mockImplementation(() => {
      throw new Error('Unexpected error');
    });

    (server as unknown as Record<string, unknown>).handleRequest(data);

    expect(logError).toHaveBeenCalledWith(expect.stringContaining('MCP server error parsing JSON'));
    expect(sendErrorSpy).toHaveBeenCalledWith(5, -32700, 'Parse error');
  });
});