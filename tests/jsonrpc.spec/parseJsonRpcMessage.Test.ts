// ./jsonrpc.Test.ts
import { parseJsonRpcMessage, createErrorResponse } from '../../src/mcpServer/jsonrpc';

/** @aiContributed-2026-02-04 */
describe('parseJsonRpcMessage', () => {
    /** @aiContributed-2026-02-04 */
    it('should parse a valid single JSON-RPC request', () => {
        const raw = JSON.stringify({
            jsonrpc: '2.0',
            method: 'testMethod',
            id: 1,
        });

        const result = parseJsonRpcMessage(raw);

        expect(result).toEqual({
            requests: [
                {
                    jsonrpc: '2.0',
                    method: 'testMethod',
                    id: 1,
                },
            ],
            errors: [],
            isBatch: false,
        });
    });

    /** @aiContributed-2026-02-04 */
    it('should parse a valid batch JSON-RPC request', () => {
        const raw = JSON.stringify([
            { jsonrpc: '2.0', method: 'method1', id: 1 },
            { jsonrpc: '2.0', method: 'method2', id: 2 },
        ]);

        const result = parseJsonRpcMessage(raw);

        expect(result).toEqual({
            requests: [
                { jsonrpc: '2.0', method: 'method1', id: 1 },
                { jsonrpc: '2.0', method: 'method2', id: 2 },
            ],
            errors: [],
            isBatch: true,
        });
    });

    /** @aiContributed-2026-02-04 */
    it('should return an error for invalid JSON', () => {
        const raw = '{ invalid json }';

        const result = parseJsonRpcMessage(raw);

        expect(result).toEqual({
            requests: [],
            errors: [
                createErrorResponse(null, -32700, expect.stringContaining('Parse error')),
            ],
            isBatch: false,
        });
    });

    /** @aiContributed-2026-02-04 */
    it('should return an error for an empty batch', () => {
        const raw = JSON.stringify([]);

        const result = parseJsonRpcMessage(raw);

        expect(result).toEqual({
            requests: [],
            errors: [
                createErrorResponse(null, -32600, 'Invalid Request: empty batch'),
            ],
            isBatch: true,
        });
    });

    /** @aiContributed-2026-02-04 */
    it('should handle mixed valid and invalid requests in a batch', () => {
        const raw = JSON.stringify([
            { jsonrpc: '2.0', method: 'validMethod', id: 1 },
            { invalid: 'request' },
        ]);

        const result = parseJsonRpcMessage(raw);

        expect(result).toEqual({
            requests: [
                { jsonrpc: '2.0', method: 'validMethod', id: 1 },
            ],
            errors: [
                createErrorResponse(null, -32600, 'Invalid Request: request must be an object'),
            ],
            isBatch: true,
        });
    });

    /** @aiContributed-2026-02-04 */
    it('should return an error for a non-object single request', () => {
        const raw = JSON.stringify('invalid');

        const result = parseJsonRpcMessage(raw);

        expect(result).toEqual({
            requests: [],
            errors: [
                createErrorResponse(null, -32600, 'Invalid Request: request must be an object'),
            ],
            isBatch: false,
        });
    });

    /** @aiContributed-2026-02-04 */
    it('should return an error for a request with missing jsonrpc field', () => {
        const raw = JSON.stringify({ method: 'testMethod', id: 1 });

        const result = parseJsonRpcMessage(raw);

        expect(result).toEqual({
            requests: [],
            errors: [
                createErrorResponse(1, -32600, 'Invalid Request: jsonrpc must be "2.0"'),
            ],
            isBatch: false,
        });
    });

    /** @aiContributed-2026-02-04 */
    it('should return an error for a request with missing method field', () => {
        const raw = JSON.stringify({ jsonrpc: '2.0', id: 1 });

        const result = parseJsonRpcMessage(raw);

        expect(result).toEqual({
            requests: [],
            errors: [
                createErrorResponse(1, -32600, 'Invalid Request: method must be a string'),
            ],
            isBatch: false,
        });
    });
});