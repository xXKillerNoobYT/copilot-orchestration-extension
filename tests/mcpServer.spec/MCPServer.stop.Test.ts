// ./mcpServer.Test.ts
import { MCPServer } from '../../src/mcpServer/mcpServer';
import { logInfo } from '../../src/logger';

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('MCPServer', () => {
  let mockInputStream: NodeJS.ReadableStream;
  let mockOutputStream: NodeJS.WritableStream;
  let server: MCPServer;

  beforeEach(() => {
    mockInputStream = {
      removeAllListeners: jest.fn(),
      pause: jest.fn(),
    } as unknown as NodeJS.ReadableStream;

    mockOutputStream = {} as NodeJS.WritableStream;

    server = new MCPServer(mockInputStream, mockOutputStream);
    (server as MCPServer & { isStarted: boolean }).isStarted = true; // Set isStarted to true for testing
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
    describe('stop', () => {
    /** @aiContributed-2026-02-03 */
        it('should stop the server when it is started', () => {
      server.stop();

      expect(logInfo).toHaveBeenCalledWith('MCP server stopping...');
      expect(mockInputStream.removeAllListeners).toHaveBeenCalledWith('data');
      expect(mockInputStream.pause).not.toHaveBeenCalled(); // Not process.stdin
      expect((server as MCPServer & { isStarted: boolean }).isStarted).toBe(false);
      expect(logInfo).toHaveBeenCalledWith('MCP server stopped');
    });

    /** @aiContributed-2026-02-03 */
        it('should pause inputStream if it is process.stdin', () => {
      const stdin = process.stdin as unknown as NodeJS.ReadableStream;
      server = new MCPServer(stdin, mockOutputStream);
      (server as MCPServer & { isStarted: boolean }).isStarted = true;

      server.stop();

      expect(stdin.removeAllListeners).toHaveBeenCalledWith('data');
      expect(stdin.pause).toHaveBeenCalled();
      expect((server as MCPServer & { isStarted: boolean }).isStarted).toBe(false);
      expect(logInfo).toHaveBeenCalledWith('MCP server stopped');
    });

    /** @aiContributed-2026-02-03 */
        it('should do nothing if the server is not started', () => {
      (server as MCPServer & { isStarted: boolean }).isStarted = false;

      server.stop();

      expect(logInfo).not.toHaveBeenCalled();
      expect(mockInputStream.removeAllListeners).not.toHaveBeenCalled();
      expect(mockInputStream.pause).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-03 */
        it('should handle case where inputStream is already paused', () => {
      mockInputStream.pause = jest.fn(() => {
        throw new Error('Stream already paused');
      });

      expect(() => server.stop()).not.toThrow();
      expect(logInfo).toHaveBeenCalledWith('MCP server stopping...');
      expect(mockInputStream.removeAllListeners).toHaveBeenCalledWith('data');
      expect((server as MCPServer & { isStarted: boolean }).isStarted).toBe(false);
      expect(logInfo).toHaveBeenCalledWith('MCP server stopped');
    });
  });
});