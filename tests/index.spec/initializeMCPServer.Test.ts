// ./index.Test.ts
import { initializeMCPServer, getMCPServerInstance, resetMCPServerForTests } from '../../src/mcpServer/index';
import { MCPServer } from '../../src/mcpServer/server';
import { logInfo, logWarn } from '../../src/logger';

jest.mock('../../src/mcpServer/server', () => {
  return {
      ...jest.requireActual('../../src/mcpServer/server'),
    MCPServer: jest.fn().mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn(),
    })),
  };
});

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('initializeMCPServer', () => {
  beforeEach(() => {
    resetMCPServerForTests();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
    it('should initialize and start the MCP server if not already initialized', () => {
    initializeMCPServer();

    expect(logInfo).toHaveBeenCalledWith('Initializing MCP server...');
    expect(MCPServer).toHaveBeenCalledTimes(1);
    expect(MCPServer.prototype.start).toHaveBeenCalledTimes(1);
    expect(logInfo).toHaveBeenCalledWith('MCP server initialized and started');
  });

  /** @aiContributed-2026-02-03 */
    it('should not initialize a new MCP server if one already exists', () => {
    initializeMCPServer();
    initializeMCPServer();

    expect(logWarn).toHaveBeenCalledWith('MCP server already exists, not creating a new instance');
    expect(MCPServer).toHaveBeenCalledTimes(1);
    expect(MCPServer.prototype.start).toHaveBeenCalledTimes(1);
  });

  /** @aiContributed-2026-02-03 */
    it('should handle resetting the MCP server for tests', () => {
    initializeMCPServer();
    resetMCPServerForTests();

    expect(MCPServer.prototype.stop).toHaveBeenCalledTimes(1);
    expect(getMCPServerInstance()).toBeNull();
  });

  /** @aiContributed-2026-02-03 */
    it('should return null if MCP server is not initialized', () => {
    expect(getMCPServerInstance()).toBeNull();
  });

  /** @aiContributed-2026-02-03 */
    it('should return the MCP server instance if initialized', () => {
    initializeMCPServer();
    const instance = getMCPServerInstance();

    expect(instance).not.toBeNull();
    expect(instance).toBeInstanceOf(MCPServer);
  });
});