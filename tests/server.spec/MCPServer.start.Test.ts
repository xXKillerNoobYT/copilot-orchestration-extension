// ./server.Test.ts
import { MCPServer } from '../../src/mcpServer/server';
import { logWarn, logInfo } from '../../src/logger';
import { logRegisteredTools } from '../../src/mcpServer/integration';

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logWarn: jest.fn(),
    logInfo: jest.fn(),
}));

jest.mock('../../src/mcpServer/integration', () => ({
    ...jest.requireActual('../../src/mcpServer/integration'),
    logRegisteredTools: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('MCPServer', () => {
    let server: MCPServer;
    let mockInputStream: NodeJS.ReadableStream;
    let mockOutputStream: NodeJS.WritableStream;

    beforeEach(() => {
        mockInputStream = {
            resume: jest.fn(),
            on: jest.fn(),
        } as unknown as NodeJS.ReadableStream;

        mockOutputStream = {} as NodeJS.WritableStream;

        server = new MCPServer(mockInputStream, mockOutputStream);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-04 */
    describe('start', () => {
        /** @aiContributed-2026-02-04 */
        it('should start the server successfully when not already started', () => {
            server.start();

            expect(logInfo).toHaveBeenCalledWith('MCP server starting...');
            expect(mockInputStream.resume).toHaveBeenCalled();
            expect(mockInputStream.on).toHaveBeenCalledWith('data', expect.any(Function));
            expect(logRegisteredTools).toHaveBeenCalled();
            expect(logInfo).toHaveBeenCalledWith('MCP server started successfully');
        });

        /** @aiContributed-2026-02-04 */
        it('should not start the server if it is already started', () => {
            server.start();
            server.start();

            expect(logWarn).toHaveBeenCalledWith('MCP server already started, ignoring duplicate start call');
            expect(logInfo).toHaveBeenCalledTimes(2); // Only the first start logs twice
            expect(mockInputStream.resume).toHaveBeenCalledTimes(1);
            expect(mockInputStream.on).toHaveBeenCalledTimes(1);
            expect(logRegisteredTools).toHaveBeenCalledTimes(1);
        });

        /** @aiContributed-2026-02-04 */
        it('should handle inputStream being process.stdin', () => {
            const stdinServer = new MCPServer(process.stdin, mockOutputStream);
            stdinServer.start();

            expect(process.stdin.resume).toHaveBeenCalled();
            expect(logInfo).toHaveBeenCalledWith('MCP server starting...');
            expect(logRegisteredTools).toHaveBeenCalled();
        });

        /** @aiContributed-2026-02-04 */
        it('should register shutdown handlers when starting the server', () => {
            const registerShutdownHandlersSpy = jest.spyOn(server as unknown as { registerShutdownHandlers: () => void }, 'registerShutdownHandlers');
            server.start();

            expect(registerShutdownHandlersSpy).toHaveBeenCalled();
        });

        /** @aiContributed-2026-02-04 */
        it('should not call inputStream.resume if inputStream is not process.stdin', () => {
            server.start();

            expect(mockInputStream.resume).toHaveBeenCalledTimes(1);
            expect(mockInputStream.resume).not.toHaveBeenCalledWith(process.stdin);
        });
    });
});