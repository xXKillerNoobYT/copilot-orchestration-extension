// ./server.Test.ts
import { MCPServer } from '../../src/mcpServer/server';
import { routeToPlanningAgent, routeToVerificationAgent, routeToAnswerAgent } from '../../src/services/orchestrator';
import { logInfo, logError } from '../../src/logger';

jest.mock('../../src/services/orchestrator', () => ({
  ...jest.requireActual('../../src/services/orchestrator'),
  routeToPlanningAgent: jest.fn(),
  routeToVerificationAgent: jest.fn(),
  routeToAnswerAgent: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  ...jest.requireActual('../../src/logger'),
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

interface COEAgentRequest {
  id: number;
  params: {
    command: string;
    args?: Record<string, unknown>;
  };
}

interface MCPServerWithSpies extends MCPServer {
  sendResponse: jest.Mock;
  sendError: jest.Mock;
}

/** @aiContributed-2026-02-04 */
describe('MCPServer.handleCallCOEAgent', () => {
  let server: MCPServerWithSpies;

  beforeEach(() => {
    server = new MCPServer() as MCPServerWithSpies;
    server.sendResponse = jest.fn();
    server.sendError = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
  it('should handle the "plan" command successfully', async () => {
    (routeToPlanningAgent as jest.Mock).mockResolvedValue('Planning response');
    const request: COEAgentRequest = { id: 1, params: { command: 'plan', args: { task: 'Test task' } } };

    await server.handleCallCOEAgent(request);

    expect(routeToPlanningAgent).toHaveBeenCalledWith('Test task');
    expect(server.sendResponse).toHaveBeenCalledWith(1, 'Planning response');
    expect(logInfo).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should handle the "verify" command successfully', async () => {
    (routeToVerificationAgent as jest.Mock).mockResolvedValue({ passed: true, explanation: 'All good' });
    const request: COEAgentRequest = { id: 2, params: { command: 'verify', args: { code: 'Test code' } } };

    await server.handleCallCOEAgent(request);

    expect(routeToVerificationAgent).toHaveBeenCalledWith('Verification', 'Test code');
    expect(server.sendResponse).toHaveBeenCalledWith(2, 'PASS - All good');
    expect(logInfo).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should handle the "ask" command successfully', async () => {
    (routeToAnswerAgent as jest.Mock).mockResolvedValue('Answer response');
    const request: COEAgentRequest = { id: 3, params: { command: 'ask', args: { question: 'Test question' } } };

    await server.handleCallCOEAgent(request);

    expect(routeToAnswerAgent).toHaveBeenCalledWith('Test question');
    expect(server.sendResponse).toHaveBeenCalledWith(3, 'Answer response');
    expect(logInfo).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should return an error for an unknown command', async () => {
    const request: COEAgentRequest = { id: 4, params: { command: 'unknown', args: {} } };

    await server.handleCallCOEAgent(request);

    expect(server.sendError).toHaveBeenCalledWith(4, -32602, 'Unknown COE command: unknown. Valid commands: plan, verify, ask');
    expect(logInfo).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should return an error for missing args', async () => {
    const request: COEAgentRequest = { id: 5, params: { command: 'plan' } };

    await server.handleCallCOEAgent(request);

    expect(server.sendError).toHaveBeenCalledWith(5, -32602, 'Missing or invalid args object');
    expect(logInfo).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should return an error for missing required argument in "plan"', async () => {
    const request: COEAgentRequest = { id: 6, params: { command: 'plan', args: {} } };

    await server.handleCallCOEAgent(request);

    expect(server.sendError).toHaveBeenCalledWith(6, -32602, 'Missing required argument: task');
    expect(logInfo).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should return an error for missing required argument in "verify"', async () => {
    const request: COEAgentRequest = { id: 7, params: { command: 'verify', args: {} } };

    await server.handleCallCOEAgent(request);

    expect(server.sendError).toHaveBeenCalledWith(7, -32602, 'Missing required argument: code');
    expect(logInfo).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should return an error for missing required argument in "ask"', async () => {
    const request: COEAgentRequest = { id: 8, params: { command: 'ask', args: {} } };

    await server.handleCallCOEAgent(request);

    expect(server.sendError).toHaveBeenCalledWith(8, -32602, 'Missing required argument: question');
    expect(logInfo).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should handle thrown errors gracefully', async () => {
    (routeToPlanningAgent as jest.Mock).mockRejectedValue(new Error('Test error'));
    const request: COEAgentRequest = { id: 9, params: { command: 'plan', args: { task: 'Test task' } } };

    await server.handleCallCOEAgent(request);

    expect(server.sendError).toHaveBeenCalledWith(9, -32603, 'COE agent failed: Test error');
    expect(logError).toHaveBeenCalledWith('[MCP] COE agent error: Test error');
  });
});