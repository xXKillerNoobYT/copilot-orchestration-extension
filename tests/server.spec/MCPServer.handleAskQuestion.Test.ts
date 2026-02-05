// ./server.Test.ts
import { MCPServer } from '../../src/mcpServer/server';
import { validateAskQuestionParams } from '../../src/mcpServer/tools/askQuestion';
import { handleAskQuestion } from '../../src/mcpServer/tools/askQuestion';

jest.mock('../../src/mcpServer/tools/askQuestion', () => ({
  ...jest.requireActual('../../src/mcpServer/tools/askQuestion'),
  validateAskQuestionParams: jest.fn(),
  handleAskQuestion: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('MCPServer.handleAskQuestion', () => {
  let server: MCPServer;
  let mockSendResponse: jest.SpyInstance<void, [string | number | null, unknown]>;
  let mockSendError: jest.SpyInstance<void, [string | number | null, number, string]>;

  beforeEach(() => {
    server = new MCPServer();
    mockSendResponse = jest.spyOn(server as unknown as { sendResponse: (id: string | number | null, response: unknown) => void }, 'sendResponse').mockImplementation();
    mockSendError = jest.spyOn(server as unknown as { sendError: (id: string | number | null, code: number, message: string) => void }, 'sendError').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
  it('should send a response when parameters are valid and handleAskQuestion succeeds', async () => {
    const request = {
      id: '1',
      params: { question: 'What is the capital of France?' },
    };
    (validateAskQuestionParams as jest.Mock).mockReturnValue({ isValid: true });
    (handleAskQuestion as jest.Mock).mockResolvedValue({ success: true, answer: 'Paris' });

    await (server as unknown as { handleAskQuestion: (request: { id: string; params: { question: string } }) => Promise<void> }).handleAskQuestion(request);

    expect(validateAskQuestionParams).toHaveBeenCalledWith(request.params);
    expect(handleAskQuestion).toHaveBeenCalledWith(request.params);
    expect(mockSendResponse).toHaveBeenCalledWith('1', { success: true, answer: 'Paris' });
    expect(mockSendError).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should send an error when parameters are invalid', async () => {
    const request = {
      id: '2',
      params: null,
    };
    (validateAskQuestionParams as jest.Mock).mockReturnValue({ isValid: false, error: 'Invalid params' });

    await (server as unknown as { handleAskQuestion: (request: { id: string; params: null }) => Promise<void> }).handleAskQuestion(request);

    expect(validateAskQuestionParams).toHaveBeenCalledWith(request.params);
    expect(mockSendError).toHaveBeenCalledWith('2', -32602, 'Invalid parameters: Invalid params');
    expect(mockSendResponse).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should send an error when handleAskQuestion fails with a specific error message', async () => {
    const request = {
      id: '3',
      params: { question: 'What is the capital of France?' },
    };
    (validateAskQuestionParams as jest.Mock).mockReturnValue({ isValid: true });
    (handleAskQuestion as jest.Mock).mockResolvedValue({ success: false, error: { message: 'Service unavailable' } });

    await (server as unknown as { handleAskQuestion: (request: { id: string; params: { question: string } }) => Promise<void> }).handleAskQuestion(request);

    expect(validateAskQuestionParams).toHaveBeenCalledWith(request.params);
    expect(handleAskQuestion).toHaveBeenCalledWith(request.params);
    expect(mockSendError).toHaveBeenCalledWith('3', -32603, 'Service unavailable');
    expect(mockSendResponse).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
  it('should send a generic error message when handleAskQuestion fails without an error message', async () => {
    const request = {
      id: '4',
      params: { question: 'What is the capital of France?' },
    };
    (validateAskQuestionParams as jest.Mock).mockReturnValue({ isValid: true });
    (handleAskQuestion as jest.Mock).mockResolvedValue({ success: false });

    await (server as unknown as { handleAskQuestion: (request: { id: string; params: { question: string } }) => Promise<void> }).handleAskQuestion(request);

    expect(validateAskQuestionParams).toHaveBeenCalledWith(request.params);
    expect(handleAskQuestion).toHaveBeenCalledWith(request.params);
    expect(mockSendError).toHaveBeenCalledWith('4', -32603, 'Failed to get answer');
    expect(mockSendResponse).not.toHaveBeenCalled();
  });
});