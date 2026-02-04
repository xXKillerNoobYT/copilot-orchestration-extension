// ./index.Test.ts
import { resetMCPServerForTests, getMCPServerInstance } from '../../src/mcpServer/index';
import { MCPServer } from '../../src/mcpServer/server';

jest.mock('../../src/mcpServer/server', () => {
    return {
        ...jest.requireActual('../../src/mcpServer/server'),
        MCPServer: jest.fn().mockImplementation(() => ({
            stop: jest.fn(),
        })),
    };
});

jest.mock('../../src/utils/logger', () => {
    return {
        ...jest.requireActual('../../src/utils/logger'),
        Logger: {
            debug: jest.fn(),
            info: jest.fn(),
            error: jest.fn(),
        },
    };
});

/** @aiContributed-2026-02-03 */
describe('resetMCPServerForTests', () => {
    let mockMCPServerInstance: MCPServer;

    beforeEach(() => {
        jest.clearAllMocks();
        mockMCPServerInstance = new MCPServer();
        (getMCPServerInstance as jest.Mock).mockReturnValue(mockMCPServerInstance);
    });

    /** @aiContributed-2026-02-03 */
    it('should stop and reset the MCP server instance if it exists', () => {
        resetMCPServerForTests();

        expect(mockMCPServerInstance.stop).toHaveBeenCalledTimes(1);
        expect(getMCPServerInstance()).toBeNull();
    });

    /** @aiContributed-2026-02-03 */
    it('should do nothing if no MCP server instance exists', () => {
        (getMCPServerInstance as jest.Mock).mockReturnValue(null);

        resetMCPServerForTests();

        expect(mockMCPServerInstance.stop).not.toHaveBeenCalled();
        expect(getMCPServerInstance()).toBeNull();
    });
});