// ./server.Test.ts
import { MCPServer } from '../../src/mcpServer/server';
import { validateReportTaskDoneParams } from '../../src/mcpServer/tools/reportTaskDone';

jest.mock('../../src/mcpServer/tools/reportTaskDone', () => ({
  ...jest.requireActual('../../src/mcpServer/tools/reportTaskDone'),
  validateReportTaskDoneParams: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('MCPServer.handleReportTaskDone', () => {
  let server: MCPServer;
  let sendResponseSpy: jest.SpyInstance;
  let sendErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    server = new MCPServer();
    sendResponseSpy = jest.spyOn(server as unknown as { sendResponse: () => void }, 'sendResponse').mockImplementation();
    sendErrorSpy = jest.spyOn(server as unknown as { sendError: () => void }, 'sendError').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
  it('should send a response when parameters are valid and the operation succeeds', async () => {
    const request = { id: '1', params: { taskId: '123' } };
    (validateReportTaskDoneParams as jest.Mock).mockReturnValue({ isValid: true });
    const handleReportTaskDone = jest.fn().mockResolvedValue({ success: true });
    jest.spyOn(server as unknown as { handleReportTaskDone: () => void }, 'handleReportTaskDone').mockImplementation(handleReportTaskDone);

    await (server as unknown as { handleReportTaskDone: (req: typeof request) => Promise<void> }).handleReportTaskDone(request);

    expect(validateReportTaskDoneParams).toHaveBeenCalledWith(request.params);
    expect(sendResponseSpy).toHaveBeenCalledWith('1', { success: true });
    expect(sendErrorSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should send an error when parameters are invalid', async () => {
    const request = { id: '2', params: { taskId: null } };
    (validateReportTaskDoneParams as jest.Mock).mockReturnValue({ isValid: false, error: 'Invalid taskId' });

    await (server as unknown as { handleReportTaskDone: (req: typeof request) => Promise<void> }).handleReportTaskDone(request);

    expect(validateReportTaskDoneParams).toHaveBeenCalledWith(request.params);
    expect(sendErrorSpy).toHaveBeenCalledWith('2', -32602, 'Invalid parameters: Invalid taskId');
    expect(sendResponseSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should send an error when the operation fails', async () => {
    const request = { id: '3', params: { taskId: '123' } };
    (validateReportTaskDoneParams as jest.Mock).mockReturnValue({ isValid: true });
    const handleReportTaskDone = jest.fn().mockResolvedValue({ success: false, error: { message: 'Operation failed' } });
    jest.spyOn(server as unknown as { handleReportTaskDone: () => void }, 'handleReportTaskDone').mockImplementation(handleReportTaskDone);

    await (server as unknown as { handleReportTaskDone: (req: typeof request) => Promise<void> }).handleReportTaskDone(request);

    expect(validateReportTaskDoneParams).toHaveBeenCalledWith(request.params);
    expect(sendErrorSpy).toHaveBeenCalledWith('3', -32603, 'Operation failed');
    expect(sendResponseSpy).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle missing error message gracefully', async () => {
    const request = { id: '4', params: { taskId: '123' } };
    (validateReportTaskDoneParams as jest.Mock).mockReturnValue({ isValid: true });
    const handleReportTaskDone = jest.fn().mockResolvedValue({ success: false });
    jest.spyOn(server as unknown as { handleReportTaskDone: () => void }, 'handleReportTaskDone').mockImplementation(handleReportTaskDone);

    await (server as unknown as { handleReportTaskDone: (req: typeof request) => Promise<void> }).handleReportTaskDone(request);

    expect(validateReportTaskDoneParams).toHaveBeenCalledWith(request.params);
    expect(sendErrorSpy).toHaveBeenCalledWith('4', -32603, 'Failed to report task status');
    expect(sendResponseSpy).not.toHaveBeenCalled();
  });
});