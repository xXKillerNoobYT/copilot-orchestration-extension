// ./index.Test.ts
import { getMCPServerInstance, initializeMCPServer, resetMCPServerForTests } from '../../src/mcpServer/index';
import { MCPServer } from '../../src/mcpServer/server';

jest.mock('../../src/mcpServer/server', () => {
  return {
      ...jest.requireActual('../../src/mcpServer/server'),
    MCPServer: jest.fn().mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn(),
    })),
  };
});

/** @aiContributed-2026-02-03 */
describe('getMCPServerInstance', () => {
  beforeEach(() => {
    resetMCPServerForTests();
  });

  /** @aiContributed-2026-02-03 */
    it('should return null if the MCP server is not initialized', () => {
    const instance = getMCPServerInstance();
    expect(instance).toBeNull();
  });

  /** @aiContributed-2026-02-03 */
    it('should return the MCP server instance after initialization', () => {
    initializeMCPServer();
    const instance = getMCPServerInstance();
    expect(instance).not.toBeNull();
    expect(instance).toBeInstanceOf(MCPServer);
  });

  /** @aiContributed-2026-02-03 */
    it('should return the same instance if called multiple times after initialization', () => {
    initializeMCPServer();
    const instance1 = getMCPServerInstance();
    const instance2 = getMCPServerInstance();
    expect(instance1).toBe(instance2);
  });

  /** @aiContributed-2026-02-03 */
    it('should return null after the MCP server is reset', () => {
    initializeMCPServer();
    resetMCPServerForTests();
    const instance = getMCPServerInstance();
    expect(instance).toBeNull();
  });
});