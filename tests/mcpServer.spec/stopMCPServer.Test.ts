// ./mcpServer.Test.ts
import { stopMCPServer, getMCPServerInstance, startMCPServer } from '../../src/mcpServer/mcpServer';
import { MCPServer } from '../../src/mcpServer/mcpServer';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

/** @aiContributed-2026-02-03 */
describe('stopMCPServer', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
    it('should stop the MCP server if it is running', () => {
    // Arrange
    startMCPServer();
    const instance = getMCPServerInstance();
    const stopSpy = jest.spyOn(instance as MCPServer, 'stop');

    // Act
    stopMCPServer();

    // Assert
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(getMCPServerInstance()).toBeNull();
    expect(Logger.info).toHaveBeenCalledWith('MCP server stopping...');
    expect(Logger.info).toHaveBeenCalledWith('MCP server stopped');
  });

  /** @aiContributed-2026-02-03 */
    it('should do nothing if the MCP server is not running', () => {
    // Arrange
    stopMCPServer(); // Ensure no instance is running
    const stopSpy = jest.spyOn(MCPServer.prototype, 'stop');

    // Act
    stopMCPServer();

    // Assert
    expect(stopSpy).not.toHaveBeenCalled();
    expect(getMCPServerInstance()).toBeNull();
    expect(Logger.info).not.toHaveBeenCalledWith('MCP server stopping...');
  });
});