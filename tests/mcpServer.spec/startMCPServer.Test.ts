// ./mcpServer.Test.ts
import { startMCPServer, getMCPServerInstance, stopMCPServer } from '../../src/mcpServer/mcpServer';
import { MCPServer } from '../../src/mcpServer/mcpServer';
import { logWarn, logInfo } from '../../src/logger';

jest.mock('../../src/logger', () => ({
  ...jest.requireActual('../../src/logger'),
  logWarn: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('startMCPServer', () => {
  afterEach(() => {
    stopMCPServer();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
    it('should create and start a new MCPServer instance if none exists', () => {
    startMCPServer();
    const instance = getMCPServerInstance();

    expect(instance).toBeInstanceOf(MCPServer);
    expect(logWarn).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith('MCP server starting...');
    expect(logInfo).toHaveBeenCalledWith('MCP server started successfully');
  });

  /** @aiContributed-2026-02-03 */
    it('should not create a new MCPServer instance if one already exists', () => {
    startMCPServer();
    startMCPServer();

    expect(logWarn).toHaveBeenCalledWith('MCP server already exists, not creating a new instance');
    expect(logInfo).toHaveBeenCalledTimes(2); // Only the first start logs info
  });

  /** @aiContributed-2026-02-03 */
    it('should handle the case where the server is already started', () => {
    startMCPServer();
    const instance = getMCPServerInstance();

    if (instance) {
      instance.start();
    }

    expect(logWarn).toHaveBeenCalledWith('MCP server already started, ignoring duplicate start call');
  });

  /** @aiContributed-2026-02-03 */
    it('should ensure the server instance is null after stopping', () => {
    startMCPServer();
    stopMCPServer();
    const instance = getMCPServerInstance();

    expect(instance).toBeNull();
    expect(logInfo).toHaveBeenCalledWith('MCP server stopping...');
    expect(logInfo).toHaveBeenCalledWith('MCP server stopped');
  });
});