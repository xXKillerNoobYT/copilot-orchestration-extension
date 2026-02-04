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

/** @aiContributed-2026-02-03 */
describe('MCPServer.handleCallCOEAgent', () => {
  let server: MCPServer;
  let sendResponseSpy: jest.SpyInstance;
  let sendErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    server = new MCPServer();
    sendResponseSpy = jest.spyOn(server as unknown as { sendResponse: (id: number, response: string) => void }, 'sendResponse').mockImplementation();
    sendErrorSpy = jest.spyOn(server as unknown as { sendError: (id: number, code: number, message: string) => void }, 'sendError').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle the "plan" command successfully', async () => {
    (routeToPlanningAgent as jest.Mock).mockResolvedValue('Planning response');
    const request: COEAgentRequest = { id: 1, params: { command: 'plan', args: { task: 'Test task' } } };

    await (server as unknown as { handleCallCOEAgent: (request: COEAgentRequest) => Promise<void> }).handleCallCOEAgent(request);

    expect(routeToPlanningAgent).toHaveBeenCalledWith('Test task');
    expect(sendResponseSpy).toHaveBeenCalledWith(1, 'Planning response');
    expect(logInfo).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle the "verify" command successfully', async () => {
    (routeToVerificationAgent as jest.Mock).mockResolvedValue({ passed: true, explanation: 'All good' });
    const request: COEAgentRequest = { id: 2, params: { command: 'verify', args: { code: 'Test code' } } };

    await (server as unknown as { handleCallCOEAgent: (request: COEAgentRequest) => Promise<void> }).handleCallCOEAgent(request);

    expect(routeToVerificationAgent).toHaveBeenCalledWith('Verification', 'Test code');
    expect(sendResponseSpy).toHaveBeenCalledWith(2, 'PASS - All good');
    expect(logInfo).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle the "ask" command successfully', async () => {
    (routeToAnswerAgent as jest.Mock).mockResolvedValue('Answer response');
    const request: COEAgentRequest = { id: 3, params: { command: 'ask', args: { question: 'Test question' } } };

    await (server as unknown as { handleCallCOEAgent: (request: COEAgentRequest) => Promise<void> }).handleCallCOEAgent(request);

    expect(routeToAnswerAgent).toHaveBeenCalledWith('Test question');
    expect(sendResponseSpy).toHaveBeenCalledWith(3, 'Answer response');
    expect(logInfo).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should return an error for an unknown command', async () => {
    const request: COEAgentRequest = { id: 4, params: { command: 'unknown', args: {} } };

    await (server as unknown as { handleCallCOEAgent: (request: COEAgentRequest) => Promise<void> }).handleCallCOEAgent(request);

    expect(sendErrorSpy).toHaveBeenCalledWith(4, -32602, 'Unknown COE command: unknown. Valid commands: plan, verify, ask');
    expect(logInfo).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should return an error for missing args', async () => {
    const request: COEAgentRequest = { id: 5, params: { command: 'plan' } };

    await (server as unknown as { handleCallCOEAgent: (request: COEAgentRequest) => Promise<void> }).handleCallCOEAgent(request);

    expect(sendErrorSpy).toHaveBeenCalledWith(5, -32602, 'Missing or invalid args object');
    expect(logInfo).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should return an error for missing required argument in "plan"', async () => {
    const request: COEAgentRequest = { id: 6, params: { command: 'plan', args: {} } };

    await (server as unknown as { handleCallCOEAgent: (request: COEAgentRequest) => Promise<void> }).handleCallCOEAgent(request);

    expect(sendErrorSpy).toHaveBeenCalledWith(6, -32602, 'Missing required argument: task');
    expect(logInfo).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle thrown errors gracefully', async () => {
    (routeToPlanningAgent as jest.Mock).mockRejectedValue(new Error('Test error'));
    const request: COEAgentRequest = { id: 7, params: { command: 'plan', args: { task: 'Test task' } } };

    await (server as unknown as { handleCallCOEAgent: (request: COEAgentRequest) => Promise<void> }).handleCallCOEAgent(request);

    expect(sendErrorSpy).toHaveBeenCalledWith(7, -32603, 'COE agent failed: Test error');
    expect(logError).toHaveBeenCalledWith('[MCP] COE agent error: Test error');
  });
});