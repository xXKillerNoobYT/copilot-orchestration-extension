/**
 * Tests for JSON-RPC parsing and validation helpers.
 */

import { createErrorResponse, parseJsonRpcMessage } from '../../src/mcpServer/jsonrpc';

describe('JSON-RPC Helpers', () => {
    it('Test 1: should parse a valid single request', () => {
        const raw = JSON.stringify({ jsonrpc: '2.0', method: 'getNextTask', id: 1 });
        const result = parseJsonRpcMessage(raw);

        expect(result.isBatch).toBe(false);
        expect(result.errors.length).toBe(0);
        expect(result.requests.length).toBe(1);
        expect(result.requests[0].method).toBe('getNextTask');
    });

    it('Test 2: should return parse error on invalid JSON', () => {
        const result = parseJsonRpcMessage('{ invalid json }');

        expect(result.requests.length).toBe(0);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].error?.code).toBe(-32700);
    });

    it('Test 3: should reject invalid request objects', () => {
        const raw = JSON.stringify({ jsonrpc: '2.0', id: 1 });
        const result = parseJsonRpcMessage(raw);

        expect(result.requests.length).toBe(0);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].error?.code).toBe(-32600);
    });

    it('Test 4: should handle batch requests', () => {
        const raw = JSON.stringify([
            { jsonrpc: '2.0', method: 'getNextTask', id: 1 },
            { jsonrpc: '2.0', method: 'askQuestion', id: 2 }
        ]);

        const result = parseJsonRpcMessage(raw);

        expect(result.isBatch).toBe(true);
        expect(result.errors.length).toBe(0);
        expect(result.requests.length).toBe(2);
    });

    it('Test 5: should report invalid request inside batch', () => {
        const raw = JSON.stringify([
            { jsonrpc: '2.0', method: 'getNextTask', id: 1 },
            { jsonrpc: '2.0', id: 2 }
        ]);

        const result = parseJsonRpcMessage(raw);

        expect(result.isBatch).toBe(true);
        expect(result.requests.length).toBe(1);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].error?.code).toBe(-32600);
    });

    it('Test 6: should reject empty batch', () => {
        const raw = JSON.stringify([]);
        const result = parseJsonRpcMessage(raw);

        expect(result.isBatch).toBe(true);
        expect(result.requests.length).toBe(0);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].error?.code).toBe(-32600);
    });

    it('Test 7: should build error response', () => {
        const response = createErrorResponse(5, -32601, 'Method not found');

        expect(response.jsonrpc).toBe('2.0');
        expect(response.id).toBe(5);
        expect(response.error?.code).toBe(-32601);
    });
});
