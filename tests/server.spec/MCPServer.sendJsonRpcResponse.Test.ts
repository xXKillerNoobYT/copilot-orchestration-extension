// ./server.Test.ts
import { MCPServer } from '../../src/mcpServer/server';
import { Writable } from 'stream';

describe('MCPServer', () => {
    describe('sendJsonRpcResponse', () => {
        let mockOutputStream: Writable;
        let server: MCPServer;

        beforeEach(() => {
            mockOutputStream = new Writable();
            mockOutputStream.write = jest.fn();
            server = new MCPServer(process.stdin, mockOutputStream);
        });

        it('should write the JSON stringified response to the output stream', () => {
            const response = {
                jsonrpc: '2.0',
                id: 1,
                result: { success: true },
            };

            (server as unknown as { sendJsonRpcResponse: (response: object) => void }).sendJsonRpcResponse(response);

            expect(mockOutputStream.write).toHaveBeenCalledWith(
                JSON.stringify(response) + '\n'
            );
        });

        it('should handle null values in the response gracefully', () => {
            const response = {
                jsonrpc: '2.0',
                id: null,
                result: null,
            };

            (server as unknown as { sendJsonRpcResponse: (response: object) => void }).sendJsonRpcResponse(response);

            expect(mockOutputStream.write).toHaveBeenCalledWith(
                JSON.stringify(response) + '\n'
            );
        });

        it('should handle undefined values in the response gracefully', () => {
            const response = {
                jsonrpc: '2.0',
                id: undefined,
                result: undefined,
            };

            (server as unknown as { sendJsonRpcResponse: (response: object) => void }).sendJsonRpcResponse(response);

            expect(mockOutputStream.write).toHaveBeenCalledWith(
                JSON.stringify(response) + '\n'
            );
        });

        it('should throw an error if the output stream is not writable', () => {
            mockOutputStream.write = jest.fn(() => {
                throw new Error('Stream not writable');
            });

            const response = {
                jsonrpc: '2.0',
                id: 1,
                result: { success: true },
            };

            expect(() => (server as unknown as { sendJsonRpcResponse: (response: object) => void }).sendJsonRpcResponse(response)).toThrow(
                'Stream not writable'
            );
        });
    });
});