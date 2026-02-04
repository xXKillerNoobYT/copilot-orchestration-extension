// ./mcpServer.Test.ts
import { MCPServer } from '../../src/mcpServer/mcpServer';
import { logWarn, logInfo } from '../../src/logger';

jest.mock('../../src/logger', () => ({
  ...jest.requireActual('../../src/logger'),
  logWarn: jest.fn(),
  logInfo: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('MCPServer', () => {
  let mockInputStream: NodeJS.ReadableStream;
  let mockOutputStream: NodeJS.WritableStream;
  let server: MCPServer;

  beforeEach(() => {
    mockInputStream = {
      resume: jest.fn(),
      on: jest.fn(),
    } as unknown as NodeJS.ReadableStream;

    mockOutputStream = {} as NodeJS.WritableStream;

    server = new MCPServer(mockInputStream, mockOutputStream);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
  describe('start', () => {
    /** @aiContributed-2026-02-03 */
    it('should start the server successfully when not already started', () => {
      server.start();

      expect(logInfo).toHaveBeenCalledWith('MCP server starting...');
      expect(mockInputStream.resume).toHaveBeenCalled();
      expect(mockInputStream.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(logInfo).toHaveBeenCalledWith('MCP server started successfully');
    });

    /** @aiContributed-2026-02-03 */
    it('should not start the server if it is already started', () => {
      server.start();
      server.start();

      expect(logWarn).toHaveBeenCalledWith('MCP server already started, ignoring duplicate start call');
      expect(mockInputStream.resume).toHaveBeenCalledTimes(1);
      expect(mockInputStream.on).toHaveBeenCalledTimes(1);
      expect(logInfo).toHaveBeenCalledTimes(2); // One for starting, one for started successfully
    });

    /** @aiContributed-2026-02-03 */
    it('should handle inputStream as process.stdin and resume it', () => {
      const stdinServer = new MCPServer(process.stdin, mockOutputStream);
      jest.spyOn(process.stdin, 'resume').mockImplementation(jest.fn());

      stdinServer.start();

      expect(process.stdin.resume).toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-03 */
    it('should bind handleRequest to the data event of inputStream', () => {
      const handleRequestSpy = jest.spyOn(server as unknown as { handleRequest: (data: Buffer) => void }, 'handleRequest').mockImplementation(() => {});

      server.start();

      const dataCallback = (mockInputStream.on as jest.Mock).mock.calls.find(
        ([eventName]) => eventName === 'data'
      )?.[1] as (data: Buffer) => void;

      expect(dataCallback).toBeDefined();
      if (dataCallback) {
        const mockData = Buffer.from('test data');
        dataCallback(mockData);
        expect(handleRequestSpy).toHaveBeenCalledWith(mockData);
      }
    });
  });
});