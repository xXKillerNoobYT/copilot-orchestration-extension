// ./server.Test.ts
import { MCPServer } from '../../src/mcpServer/server';
import { logInfo } from '../../src/logger';

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('MCPServer', () => {
    let server: MCPServer;
    let mockInputStream: NodeJS.ReadableStream;
    let mockOutputStream: NodeJS.WritableStream;

    beforeEach(() => {
        mockInputStream = {
            removeAllListeners: jest.fn(),
            pause: jest.fn(),
        } as unknown as NodeJS.ReadableStream;

        mockOutputStream = {} as NodeJS.WritableStream;

        server = new MCPServer(mockInputStream, mockOutputStream);
        (server as MCPServer & { isStarted: boolean }).isStarted = true; // Simulate the server being started
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-04 */
    it('should stop the server when it is started', () => {
        server.stop();

        expect(logInfo).toHaveBeenCalledWith('MCP server stopping...');
        expect(mockInputStream.removeAllListeners).toHaveBeenCalledWith('data');
        expect(mockInputStream.pause).not.toHaveBeenCalled(); // Not process.stdin
        expect((server as MCPServer & { isStarted: boolean }).isStarted).toBe(false);
        expect(logInfo).toHaveBeenCalledWith('MCP server stopped');
    });

    /** @aiContributed-2026-02-04 */
    it('should pause the input stream if it is process.stdin', () => {
        (server as MCPServer & { inputStream: NodeJS.ReadableStream }).inputStream = process.stdin;

        jest.spyOn(process.stdin, 'pause').mockImplementation(() => {});

        server.stop();

        expect(process.stdin.pause).toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-04 */
    it('should do nothing if the server is not started', () => {
        (server as MCPServer & { isStarted: boolean }).isStarted = false;

        server.stop();

        expect(logInfo).not.toHaveBeenCalled();
        expect(mockInputStream.removeAllListeners).not.toHaveBeenCalled();
        expect(mockInputStream.pause).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-04 */
    it('should unregister shutdown handlers when stopping the server', () => {
        const unregisterShutdownHandlersSpy = jest.spyOn(
            server as MCPServer & { unregisterShutdownHandlers: () => void },
            'unregisterShutdownHandlers'
        );

        server.stop();

        expect(unregisterShutdownHandlersSpy).toHaveBeenCalled();
    });
});