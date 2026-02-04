/**
 * Tests for MCP error code registry.
 */

import { ErrorCode } from '../../src/errors/errorCodes';

describe('ErrorCode Enum', () => {
    it('Test 1: should define key error codes', () => {
        expect(ErrorCode.INVALID_PARAM).toBe('INVALID_PARAM');
        expect(ErrorCode.TOKEN_LIMIT_EXCEEDED).toBe('TOKEN_LIMIT_EXCEEDED');
        expect(ErrorCode.TIMEOUT).toBe('TIMEOUT');
    });

    it('Test 2: should include drift-related error codes', () => {
        expect(ErrorCode.DRIFT_THRESHOLD_EXCEEDED).toBe('DRIFT_THRESHOLD_EXCEEDED');
        expect(ErrorCode.COHERENCE_DROP).toBe('COHERENCE_DROP');
    });

    it('Test 3: should have unique values', () => {
        const values = Object.values(ErrorCode);
        const uniqueValues = new Set(values);
        expect(uniqueValues.size).toBe(values.length);
    });
});
