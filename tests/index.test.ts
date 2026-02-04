// ./index.test.ts
import { getMCPServerInstance, initializeMCPServer, resetMCPServerForTests } from '../src/mcpServer/index';
import { MCPServer } from '../src/mcpServer/server';
import { logInfo, logWarn } from '../src/logger';

// Mock logger first
jest.mock('../src/logger', () => ({
  ...jest.requireActual('../src/logger'),
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

// Mock MCPServer with proper instance method mocking
const mockStart = jest.fn();
const mockStop = jest.fn();

jest.mock('../src/mcpServer/server', () => {
  const actual = jest.requireActual('../src/mcpServer/server');
  return {
    ...actual,
    MCPServer: jest.fn().mockImplementation(() => ({
      start: mockStart,
      stop: mockStop,
    })),
  };
});

/** @aiContributed-2026-02-03 */
describe('getMCPServerInstance', () => {
  beforeEach(() => {
    resetMCPServerForTests();
    jest.clearAllMocks();
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
    expect(instance).toHaveProperty('start');
    expect(instance).toHaveProperty('stop');
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

  /** @aiContributed-2026-02-03 */
  it('should not initialize a new MCP server if one already exists', () => {
    initializeMCPServer();
    const instance1 = getMCPServerInstance();
    initializeMCPServer();
    const instance2 = getMCPServerInstance();
    expect(instance1).toBe(instance2);
    expect(MCPServer).toHaveBeenCalledTimes(1);
  });
});

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
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(logInfo).toHaveBeenCalledWith('MCP server initialized and started');
  });

  /** @aiContributed-2026-02-03 */
  it('should not initialize a new MCP server if one already exists', () => {
    initializeMCPServer();
    initializeMCPServer();

    expect(logWarn).toHaveBeenCalledWith('MCP server already exists, not creating a new instance');
    expect(MCPServer).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  /** @aiContributed-2026-02-03 */
  it('should handle resetting the MCP server for tests', () => {
    initializeMCPServer();
    resetMCPServerForTests();

    expect(mockStop).toHaveBeenCalledTimes(1);
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
    expect(instance).toHaveProperty('start');
    expect(instance).toHaveProperty('stop');
  });

  /** @aiContributed-2026-02-03 */
  it('should log appropriate messages when MCP server is initialized in standalone mode', () => {
    initializeMCPServer();

    expect(logInfo).toHaveBeenCalledWith('Initializing MCP server...');
    expect(logInfo).toHaveBeenCalledWith('MCP server initialized and started');
  });
});

/** @aiContributed-2026-02-03 */
describe('resetMCPServerForTests', () => {
  beforeEach(() => {
    resetMCPServerForTests();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
  it('should stop and reset the MCP server instance if it exists', () => {
    initializeMCPServer();
    resetMCPServerForTests();

    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(getMCPServerInstance()).toBeNull();
  });

  /** @aiContributed-2026-02-03 */
  it('should do nothing if no MCP server instance exists', () => {
    resetMCPServerForTests();

    expect(getMCPServerInstance()).toBeNull();
  });
});
