// ./mcpServer.Test.ts
import { MCPServer } from '../../src/mcpServer/mcpServer';
import { routeToPlanningAgent, routeToVerificationAgent, routeToAnswerAgent } from '../../src/services/orchestrator';
import { logError, logInfo } from '../../src/logger';

jest.mock('../../src/services/orchestrator', () => ({
  ...jest.requireActual('../../src/services/orchestrator'),
  routeToPlanningAgent: jest.fn(),
  routeToVerificationAgent: jest.fn(),
  routeToAnswerAgent: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  ...jest.requireActual('../../src/logger'),
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('MCPServer.handleCallCOEAgent', () => {
  let server: MCPServer;
  let sendResponseSpy: jest.SpyInstance<unknown, [string | number | null, unknown]>;
  let sendErrorSpy: jest.SpyInstance<unknown, [string | number | null, number, string]>;

  beforeEach(() => {
    server = new MCPServer();
    sendResponseSpy = jest.spyOn(server as MCPServer, 'sendResponse').mockImplementation();
    sendErrorSpy = jest.spyOn(server as MCPServer, 'sendError').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle the "plan" command successfully', async () => {
    (routeToPlanningAgent as jest.Mock).mockResolvedValue('Planning response');
    const request = { id: 1, params: { command: 'plan', args: { task: 'Test task' } } };

    await server.handleCallCOEAgent(request);

    expect(routeToPlanningAgent).toHaveBeenCalledWith('Test task');
    expect(sendResponseSpy).toHaveBeenCalledWith(1, 'Planning response');
    expect(sendErrorSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle the "verify" command successfully', async () => {
    (routeToVerificationAgent as jest.Mock).mockResolvedValue({ passed: true, explanation: 'All good' });
    const request = { id: 2, params: { command: 'verify', args: { code: 'Test code' } } };

    await server.handleCallCOEAgent(request);

    expect(routeToVerificationAgent).toHaveBeenCalledWith('Verification', 'Test code');
    expect(sendResponseSpy).toHaveBeenCalledWith(2, 'PASS - All good');
    expect(sendErrorSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle the "ask" command successfully', async () => {
    (routeToAnswerAgent as jest.Mock).mockResolvedValue('Answer response');
    const request = { id: 3, params: { command: 'ask', args: { question: 'Test question' } } };

    await server.handleCallCOEAgent(request);

    expect(routeToAnswerAgent).toHaveBeenCalledWith('Test question');
    expect(sendResponseSpy).toHaveBeenCalledWith(3, 'Answer response');
    expect(sendErrorSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should return an error for an unknown command', async () => {
    const request = { id: 4, params: { command: 'unknown', args: {} } };

    await server.handleCallCOEAgent(request);

    expect(sendErrorSpy).toHaveBeenCalledWith(4, -32602, 'Unknown COE command: unknown. Valid commands: plan, verify, ask');
    expect(sendResponseSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should return an error for missing args', async () => {
    const request = { id: 5, params: { command: 'plan' } };

    await server.handleCallCOEAgent(request);

    expect(sendErrorSpy).toHaveBeenCalledWith(5, -32602, 'Missing or invalid args object');
    expect(sendResponseSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should return an error for missing required argument "task" in "plan" command', async () => {
    const request = { id: 6, params: { command: 'plan', args: {} } };

    await server.handleCallCOEAgent(request);

    expect(sendErrorSpy).toHaveBeenCalledWith(6, -32602, 'Missing required argument: task');
    expect(sendResponseSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should return an error for missing required argument "code" in "verify" command', async () => {
    const request = { id: 7, params: { command: 'verify', args: {} } };

    await server.handleCallCOEAgent(request);

    expect(sendErrorSpy).toHaveBeenCalledWith(7, -32602, 'Missing required argument: code');
    expect(sendResponseSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should return an error for missing required argument "question" in "ask" command', async () => {
    const request = { id: 8, params: { command: 'ask', args: {} } };

    await server.handleCallCOEAgent(request);

    expect(sendErrorSpy).toHaveBeenCalledWith(8, -32602, 'Missing required argument: question');
    expect(sendResponseSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle thrown errors gracefully', async () => {
    (routeToPlanningAgent as jest.Mock).mockRejectedValue(new Error('Planning error'));
    const request = { id: 9, params: { command: 'plan', args: { task: 'Test task' } } };

    await server.handleCallCOEAgent(request);

    expect(logError).toHaveBeenCalledWith('[MCP] COE agent error: Planning error');
    expect(sendErrorSpy).toHaveBeenCalledWith(9, -32603, 'COE agent failed: Planning error');
    expect(sendResponseSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should log info for successful execution', async () => {
    (routeToPlanningAgent as jest.Mock).mockResolvedValue('Planning response');
    const request = { id: 10, params: { command: 'plan', args: { task: 'Test task' } } };

    await server.handleCallCOEAgent(request);

    expect(logInfo).toHaveBeenCalledWith('[MCP] COE agent called: command=plan, args={"task":"Test task"}');
    expect(logInfo).toHaveBeenCalledWith('[MCP] COE agent completed: command=plan, responseLength=16');
  });
});