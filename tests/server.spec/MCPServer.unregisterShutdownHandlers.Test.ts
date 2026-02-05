// ./server.Test.ts
import { MCPServer } from '../../src/mcpServer/server';

/** @aiContributed-2026-02-04 */
describe('MCPServer', () => {
    let server: MCPServer;
    let mockProcessOff: jest.SpyInstance;

    beforeEach(() => {
        server = new MCPServer();
        server.shutdownHandlersRegistered = true;
        server.handleSigint = jest.fn();
        server.handleSigterm = jest.fn();
        mockProcessOff = jest.spyOn(process, 'off').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    /** @aiContributed-2026-02-04 */
    describe('unregisterShutdownHandlers', () => {
        /** @aiContributed-2026-02-04 */
        it('should unregister SIGINT and SIGTERM handlers and set shutdownHandlersRegistered to false', () => {
            server.unregisterShutdownHandlers();

            expect(mockProcessOff).toHaveBeenCalledWith('SIGINT', server.handleSigint);
            expect(mockProcessOff).toHaveBeenCalledWith('SIGTERM', server.handleSigterm);
            expect(server.shutdownHandlersRegistered).toBe(false);
        });

        /** @aiContributed-2026-02-04 */
        it('should not unregister handlers if shutdownHandlersRegistered is false', () => {
            server.shutdownHandlersRegistered = false;

            server.unregisterShutdownHandlers();

            expect(mockProcessOff).not.toHaveBeenCalled();
        });
    });
});