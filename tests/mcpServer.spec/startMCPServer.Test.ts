// ./mcpServer.Test.ts
import { startMCPServer, getMCPServerInstance, stopMCPServer } from '../../src/mcpServer/mcpServer';
import { MCPServer } from '../../src/mcpServer/mcpServer';
import { logWarn } from '../../src/logger';

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logWarn: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

/** @aiContributed-2026-02-02 */
describe('startMCPServer', () => {
  afterEach(() => {
    stopMCPServer();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-02 */
    it('should create and start a new MCPServer instance if none exists', () => {
    startMCPServer();
    const instance = getMCPServerInstance();

    expect(instance).toBeInstanceOf(MCPServer);
    expect(logWarn).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-02 */
    it('should not create a new MCPServer instance if one already exists', () => {
    startMCPServer();
    startMCPServer();

    expect(logWarn).toHaveBeenCalledWith('MCP server already exists, not creating a new instance');
  });

  /** @aiContributed-2026-02-02 */
    it('should handle the case where the server is already started', () => {
    startMCPServer();
    const instance = getMCPServerInstance();

    if (instance) {
      instance.start();
    }

    expect(logWarn).toHaveBeenCalledWith('MCP server already started, ignoring duplicate start call');
  });
});