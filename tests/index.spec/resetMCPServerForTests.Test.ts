// ./index.Test.ts
import { resetMCPServerForTests, getMCPServerInstance, initializeMCPServer } from '../../src/mcpServer/index';
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

/** @aiContributed-2026-02-04 */
describe('resetMCPServerForTests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-04 */
    it('should stop and reset the MCP server if it exists', () => {
        initializeMCPServer();
        const instance = getMCPServerInstance();
        expect(instance).not.toBeNull();

        resetMCPServerForTests();

        expect(instance?.stop).toHaveBeenCalledTimes(1);
        expect(getMCPServerInstance()).toBeNull();
    });

    /** @aiContributed-2026-02-04 */
    it('should do nothing if the MCP server is not initialized', () => {
        resetMCPServerForTests();

        expect(logInfo).not.toHaveBeenCalled();
        expect(logWarn).not.toHaveBeenCalled();
        expect(getMCPServerInstance()).toBeNull();
    });
});