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

/** @aiContributed-2026-02-04 */
describe('getMCPServerInstance', () => {
  beforeEach(() => {
    resetMCPServerForTests();
  });

  /** @aiContributed-2026-02-04 */
    it('should return null if the MCP server is not initialized', () => {
    const instance = getMCPServerInstance();
    expect(instance).toBeNull();
  });

  /** @aiContributed-2026-02-04 */
    it('should return the MCP server instance if it is initialized', () => {
    initializeMCPServer();
    const instance = getMCPServerInstance();
    expect(instance).not.toBeNull();
    expect(instance).toBeInstanceOf(MCPServer);
  });

  /** @aiContributed-2026-02-04 */
    it('should return the same instance on multiple calls after initialization', () => {
    initializeMCPServer();
    const instance1 = getMCPServerInstance();
    const instance2 = getMCPServerInstance();
    expect(instance1).toBe(instance2);
  });

  /** @aiContributed-2026-02-04 */
    it('should return null after the server is reset', () => {
    initializeMCPServer();
    resetMCPServerForTests();
    const instance = getMCPServerInstance();
    expect(instance).toBeNull();
  });
});