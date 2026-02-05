// ./server.Test.ts
import { MCPServer } from '../../src/mcpServer/server';
import { validateGetNextTaskParams } from '../../src/mcpServer/tools/getNextTask';
import { handleGetNextTask } from '../../src/mcpServer/tools/getNextTask';

jest.mock('../../src/mcpServer/tools/getNextTask', () => ({
  ...jest.requireActual('../../src/mcpServer/tools/getNextTask'),
  validateGetNextTaskParams: jest.fn(),
  handleGetNextTask: jest.fn(),
}));

interface Request {
  id: number;
  params: Record<string, unknown> | null;
}

interface ServerWithSpies extends MCPServer {
  sendResponse: (...args: [number, unknown]) => void;
  sendError: (...args: [number, number, string]) => void;
  handleGetNextTask: (req: Request) => Promise<void>;
}

/** @aiContributed-2026-02-04 */
describe('MCPServer - handleGetNextTask', () => {
  let server: ServerWithSpies;
  let sendResponseSpy: jest.SpyInstance;
  let sendErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    server = new MCPServer() as ServerWithSpies;
    sendResponseSpy = jest.spyOn(server, 'sendResponse').mockImplementation();
    sendErrorSpy = jest.spyOn(server, 'sendError').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
  it('should send an error if parameters are invalid', async () => {
    (validateGetNextTaskParams as jest.Mock).mockReturnValue({ isValid: false, error: 'Invalid params' });

    const request: Request = { id: 1, params: { invalid: true } };
    await server.handleGetNextTask(request);

    expect(validateGetNextTaskParams).toHaveBeenCalledWith(request.params);
    expect(sendErrorSpy).toHaveBeenCalledWith(1, -32602, 'Invalid parameters: Invalid params');
    expect(sendResponseSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should send a response with task data on success', async () => {
    (validateGetNextTaskParams as jest.Mock).mockReturnValue({ isValid: true });
    (handleGetNextTask as jest.Mock).mockResolvedValue({ success: true, task: { id: 'task1' } });

    const request: Request = { id: 2, params: { valid: true } };
    await server.handleGetNextTask(request);

    expect(validateGetNextTaskParams).toHaveBeenCalledWith(request.params);
    expect(handleGetNextTask).toHaveBeenCalledWith(request.params);
    expect(sendResponseSpy).toHaveBeenCalledWith(2, { id: 'task1' });
    expect(sendErrorSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should send an error if the tool handler fails', async () => {
    (validateGetNextTaskParams as jest.Mock).mockReturnValue({ isValid: true });
    (handleGetNextTask as jest.Mock).mockResolvedValue({ success: false, error: { code: 'ORCHESTRATOR_NOT_INITIALIZED', message: 'Initialization error' } });

    const request: Request = { id: 3, params: { valid: true } };
    await server.handleGetNextTask(request);

    expect(validateGetNextTaskParams).toHaveBeenCalledWith(request.params);
    expect(handleGetNextTask).toHaveBeenCalledWith(request.params);
    expect(sendErrorSpy).toHaveBeenCalledWith(3, -32603, 'Initialization error');
    expect(sendResponseSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should handle null parameters gracefully', async () => {
    (handleGetNextTask as jest.Mock).mockResolvedValue({ success: true, task: { id: 'task2' } });

    const request: Request = { id: 4, params: null };
    await server.handleGetNextTask(request);

    expect(validateGetNextTaskParams).not.toHaveBeenCalled();
    expect(handleGetNextTask).toHaveBeenCalledWith(null);
    expect(sendResponseSpy).toHaveBeenCalledWith(4, { id: 'task2' });
    expect(sendErrorSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should handle unexpected errors gracefully', async () => {
    (validateGetNextTaskParams as jest.Mock).mockImplementation(() => {
      throw new Error('Unexpected error');
    });

    const request: Request = { id: 5, params: { valid: true } };
    await server.handleGetNextTask(request);

    expect(sendErrorSpy).toHaveBeenCalledWith(5, -32603, 'Unexpected error');
    expect(sendResponseSpy).not.toHaveBeenCalled();
  });
});