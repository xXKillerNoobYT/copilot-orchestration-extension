// ./server.Test.ts
import { MCPServer } from '../../src/mcpServer/server';
import { Logger } from '../../utils/logger';

/** @aiContributed-2026-02-04 */
describe('MCPServer', () => {
    let server: MCPServer;
    let mockProcessOn: jest.SpyInstance;
    let mockHandleSigint: jest.Mock;
    let mockHandleSigterm: jest.Mock;

    beforeEach(() => {
        mockHandleSigint = jest.fn();
        mockHandleSigterm = jest.fn();

        server = new MCPServer();
        server['handleSigint'] = mockHandleSigint;
        server['handleSigterm'] = mockHandleSigterm;

        mockProcessOn = jest.spyOn(process, 'on').mockImplementation((event, _listener) => {
            Logger.debug(`Mocked process.on called with event: ${event}`);
        });

        server['shutdownHandlersRegistered'] = false;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    /** @aiContributed-2026-02-04 */
    describe('registerShutdownHandlers', () => {
        /** @aiContributed-2026-02-04 */
        it('should register SIGINT and SIGTERM handlers if not already registered', () => {
            server['registerShutdownHandlers']();

            expect(mockProcessOn).toHaveBeenCalledTimes(2);
            expect(mockProcessOn).toHaveBeenCalledWith('SIGINT', mockHandleSigint);
            expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', mockHandleSigterm);
            expect(server['shutdownHandlersRegistered']).toBe(true);
        });

        /** @aiContributed-2026-02-04 */
        it('should not register handlers if already registered', () => {
            server['shutdownHandlersRegistered'] = true;

            server['registerShutdownHandlers']();

            expect(mockProcessOn).not.toHaveBeenCalled();
            expect(server['shutdownHandlersRegistered']).toBe(true);
        });
    });
});