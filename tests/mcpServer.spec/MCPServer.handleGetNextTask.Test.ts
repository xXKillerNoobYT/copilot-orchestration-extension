// ./mcpServer.Test.ts
import { MCPServer } from '../../src/mcpServer/mcpServer';
import { getNextTask } from '../../src/services/orchestrator';
import { logError } from '../../src/logger';

jest.mock('../../src/services/orchestrator', () => ({
    ...jest.requireActual('../../src/services/orchestrator'),
    getNextTask: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logError: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('MCPServer.handleGetNextTask', () => {
  let server: MCPServer;
  let sendResponseSpy: jest.SpyInstance;
  let sendErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    server = new MCPServer();
    sendResponseSpy = jest.spyOn(server as unknown as { sendResponse: (id: string | null, task: unknown) => void }, 'sendResponse').mockImplementation();
    sendErrorSpy = jest.spyOn(server as unknown as { sendError: (id: string | null, code: number, message: string) => void }, 'sendError').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
  it('should send the task in the response on success', async () => {
    const mockTask = { id: 1, name: 'Test Task' };
    (getNextTask as jest.Mock).mockResolvedValue(mockTask);

    const request = { id: '123' };

    await (server as unknown as { handleGetNextTask: (req: { id: string }) => Promise<void> }).handleGetNextTask(request);

    expect(getNextTask).toHaveBeenCalledTimes(1);
    expect(sendResponseSpy).toHaveBeenCalledWith('123', mockTask);
    expect(sendErrorSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle null task response gracefully', async () => {
    (getNextTask as jest.Mock).mockResolvedValue(null);

    const request = { id: '123' };

    await (server as unknown as { handleGetNextTask: (req: { id: string }) => Promise<void> }).handleGetNextTask(request);

    expect(getNextTask).toHaveBeenCalledTimes(1);
    expect(sendResponseSpy).toHaveBeenCalledWith('123', null);
    expect(sendErrorSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should send an error response if getNextTask throws an error', async () => {
    const mockError = new Error('Test Error');
    (getNextTask as jest.Mock).mockRejectedValue(mockError);

    const request = { id: '123' };

    await (server as unknown as { handleGetNextTask: (req: { id: string }) => Promise<void> }).handleGetNextTask(request);

    expect(getNextTask).toHaveBeenCalledTimes(1);
    expect(sendResponseSpy).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(`MCP server error calling getNextTask: ${mockError}`);
    expect(sendErrorSpy).toHaveBeenCalledWith('123', -32603, 'Internal error: failed to get next task');
  });

  /** @aiContributed-2026-02-03 */
  it('should handle undefined request id', async () => {
    const mockTask = { id: 1, name: 'Test Task' };
    (getNextTask as jest.Mock).mockResolvedValue(mockTask);

    const request = { id: undefined };

    await (server as unknown as { handleGetNextTask: (req: { id: string | undefined }) => Promise<void> }).handleGetNextTask(request);

    expect(getNextTask).toHaveBeenCalledTimes(1);
    expect(sendResponseSpy).toHaveBeenCalledWith(null, mockTask);
    expect(sendErrorSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should log and send error response if getNextTask throws a non-Error object', async () => {
    const mockError = 'Non-Error exception';
    (getNextTask as jest.Mock).mockRejectedValue(mockError);

    const request = { id: '123' };

    await (server as unknown as { handleGetNextTask: (req: { id: string }) => Promise<void> }).handleGetNextTask(request);

    expect(getNextTask).toHaveBeenCalledTimes(1);
    expect(sendResponseSpy).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(`MCP server error calling getNextTask: ${mockError}`);
    expect(sendErrorSpy).toHaveBeenCalledWith('123', -32603, 'Internal error: failed to get next task');
  });
});