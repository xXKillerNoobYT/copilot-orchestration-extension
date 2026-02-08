/**
 * Tests for Validation Error Handlers
 *
 * Tests validation error creation, throw behavior, param checking utilities,
 * and range/enum validation defined in src/errors/validationErrors.ts.
 *
 * **Simple explanation**: Verifies that all the "bad input" error helpers
 * produce correct messages, codes, and field details, and that the
 * convenience validators (requireParam, requireNonEmptyString, requireInRange)
 * accept good inputs and reject bad ones.
 */

import {
    ValidationError,
    createMissingParamError,
    throwMissingParam,
    createInvalidTypeError,
    throwInvalidType,
    createOutOfRangeError,
    throwOutOfRange,
    createInvalidEnumError,
    throwInvalidEnum,
    requireParam,
    requireNonEmptyString,
    requireInRange,
} from '../../src/errors/validationErrors';
import { ErrorCode } from '../../src/errors/errorCodes';

describe('validationErrors', () => {
    // ── createMissingParamError ───────────────────────────────────────

    describe('createMissingParamError', () => {
        it('Test 1: should create error with INVALID_PARAM code and descriptive message', () => {
            const error = createMissingParamError('ticketId');

            expect(error.code).toBe(ErrorCode.INVALID_PARAM);
            expect(error.message).toBe('Missing required parameter: ticketId');
            expect(error.param).toBe('ticketId');
        });

        it('Test 2: should not set expected or received fields', () => {
            const error = createMissingParamError('name');

            expect(error.expected).toBeUndefined();
            expect(error.received).toBeUndefined();
        });

        it('Test 3: should handle param names with special characters', () => {
            const error = createMissingParamError('options.nested.field');

            expect(error.message).toContain('options.nested.field');
            expect(error.param).toBe('options.nested.field');
        });
    });

    // ── throwMissingParam ─────────────────────────────────────────────

    describe('throwMissingParam', () => {
        it('Test 4: should throw Error with code prefix and message', () => {
            try {
                throwMissingParam('userId');
                fail('Expected throwMissingParam to throw');
            } catch (e: unknown) {
                const err = e as Error;
                expect(err).toBeInstanceOf(Error);
                expect(err.message).toBe('[INVALID_PARAM] Missing required parameter: userId');
            }
        });

        it('Test 5: should always throw (return type is never)', () => {
            let didThrow = false;
            try {
                throwMissingParam('x');
            } catch {
                didThrow = true;
            }
            expect(didThrow).toBe(true);
        });
    });

    // ── createInvalidTypeError ────────────────────────────────────────

    describe('createInvalidTypeError', () => {
        it('Test 6: should create error with expected and received types', () => {
            const error = createInvalidTypeError('age', 'number', 'string');

            expect(error.code).toBe(ErrorCode.INVALID_PARAM);
            expect(error.message).toBe(
                "Invalid type for parameter 'age': expected number, received string"
            );
            expect(error.param).toBe('age');
            expect(error.expected).toBe('number');
            expect(error.received).toBe('string');
        });

        it('Test 7: should handle complex type descriptions', () => {
            const error = createInvalidTypeError(
                'config',
                'Record<string, number>',
                'Array<string>'
            );

            expect(error.expected).toBe('Record<string, number>');
            expect(error.received).toBe('Array<string>');
            expect(error.message).toContain('Record<string, number>');
        });
    });

    // ── throwInvalidType ──────────────────────────────────────────────

    describe('throwInvalidType', () => {
        it('Test 8: should throw Error with code and type mismatch message', () => {
            try {
                throwInvalidType('count', 'number', 'boolean');
                fail('Expected throwInvalidType to throw');
            } catch (e: unknown) {
                const err = e as Error;
                expect(err.message).toContain('[INVALID_PARAM]');
                expect(err.message).toContain("parameter 'count'");
                expect(err.message).toContain('expected number');
                expect(err.message).toContain('received boolean');
            }
        });
    });

    // ── createOutOfRangeError ─────────────────────────────────────────

    describe('createOutOfRangeError', () => {
        it('Test 9: should create error with range details', () => {
            const error = createOutOfRangeError('priority', 1, 10, 25);

            expect(error.code).toBe(ErrorCode.INVALID_PARAM);
            expect(error.message).toBe(
                "Value out of range for 'priority': must be between 1 and 10, received 25"
            );
            expect(error.param).toBe('priority');
            expect(error.expected).toBe('1-10');
            expect(error.received).toBe('25');
        });

        it('Test 10: should handle negative ranges', () => {
            const error = createOutOfRangeError('temperature', -100, 100, -200);

            expect(error.message).toContain('between -100 and 100');
            expect(error.expected).toBe('-100-100');
            expect(error.received).toBe('-200');
        });

        it('Test 11: should handle zero values', () => {
            const error = createOutOfRangeError('index', 0, 50, 0);

            expect(error.received).toBe('0');
            expect(error.message).toContain('received 0');
        });
    });

    // ── throwOutOfRange ───────────────────────────────────────────────

    describe('throwOutOfRange', () => {
        it('Test 12: should throw Error with code and range message', () => {
            try {
                throwOutOfRange('timeout', 100, 60000, 999999);
                fail('Expected throwOutOfRange to throw');
            } catch (e: unknown) {
                const err = e as Error;
                expect(err.message).toContain('[INVALID_PARAM]');
                expect(err.message).toContain("'timeout'");
                expect(err.message).toContain('between 100 and 60000');
                expect(err.message).toContain('received 999999');
            }
        });
    });

    // ── createInvalidEnumError ────────────────────────────────────────

    describe('createInvalidEnumError', () => {
        it('Test 13: should create error listing allowed values', () => {
            const error = createInvalidEnumError(
                'status',
                ['open', 'closed', 'pending'],
                'maybe'
            );

            expect(error.code).toBe(ErrorCode.INVALID_PARAM);
            expect(error.message).toBe(
                "Invalid value for 'status': must be one of [open, closed, pending], received 'maybe'"
            );
            expect(error.param).toBe('status');
            expect(error.expected).toBe('open|closed|pending');
            expect(error.received).toBe('maybe');
        });

        it('Test 14: should handle single allowed value', () => {
            const error = createInvalidEnumError('mode', ['auto'], 'manual');

            expect(error.message).toContain('[auto]');
            expect(error.expected).toBe('auto');
        });

        it('Test 15: should handle empty allowed values array', () => {
            const error = createInvalidEnumError('type', [], 'anything');

            expect(error.message).toContain('must be one of []');
            expect(error.expected).toBe('');
        });
    });

    // ── throwInvalidEnum ──────────────────────────────────────────────

    describe('throwInvalidEnum', () => {
        it('Test 16: should throw Error with code and enum message', () => {
            try {
                throwInvalidEnum('role', ['admin', 'user', 'guest'], 'superadmin');
                fail('Expected throwInvalidEnum to throw');
            } catch (e: unknown) {
                const err = e as Error;
                expect(err.message).toContain('[INVALID_PARAM]');
                expect(err.message).toContain("'role'");
                expect(err.message).toContain('admin, user, guest');
                expect(err.message).toContain("'superadmin'");
            }
        });
    });

    // ── requireParam ──────────────────────────────────────────────────

    describe('requireParam', () => {
        it('Test 17: should return value when present', () => {
            expect(requireParam('hello', 'name')).toBe('hello');
            expect(requireParam(42, 'count')).toBe(42);
            expect(requireParam(false, 'flag')).toBe(false);
            expect(requireParam(0, 'zero')).toBe(0);
            expect(requireParam('', 'empty')).toBe('');
        });

        it('Test 18: should throw for null values', () => {
            expect(() => requireParam(null, 'param')).toThrow('[INVALID_PARAM]');
            expect(() => requireParam(null, 'param')).toThrow(
                'Missing required parameter: param'
            );
        });

        it('Test 19: should throw for undefined values', () => {
            expect(() => requireParam(undefined, 'field')).toThrow('[INVALID_PARAM]');
        });

        it('Test 20: should return complex objects unchanged', () => {
            const obj = { a: 1, b: [2, 3] };
            expect(requireParam(obj, 'config')).toBe(obj);
        });
    });

    // ── requireNonEmptyString ─────────────────────────────────────────

    describe('requireNonEmptyString', () => {
        it('Test 21: should return non-empty strings unchanged', () => {
            expect(requireNonEmptyString('hello', 'name')).toBe('hello');
            expect(requireNonEmptyString('  padded  ', 'val')).toBe('  padded  ');
        });

        it('Test 22: should throw for null or undefined', () => {
            expect(() => requireNonEmptyString(null, 'param')).toThrow(
                'Missing required parameter'
            );
            expect(() => requireNonEmptyString(undefined, 'param')).toThrow(
                'Missing required parameter'
            );
        });

        it('Test 23: should throw for empty string', () => {
            expect(() => requireNonEmptyString('', 'name')).toThrow(
                "Parameter 'name' cannot be empty"
            );
        });

        it('Test 24: should throw for whitespace-only string', () => {
            expect(() => requireNonEmptyString('   ', 'title')).toThrow(
                "Parameter 'title' cannot be empty"
            );
            expect(() => requireNonEmptyString('\t\n', 'desc')).toThrow(
                "Parameter 'desc' cannot be empty"
            );
        });

        it('Test 25: should include INVALID_PARAM code in empty string error', () => {
            try {
                requireNonEmptyString('', 'field');
                fail('Expected to throw');
            } catch (e: unknown) {
                const err = e as Error;
                expect(err.message).toContain('[INVALID_PARAM]');
            }
        });
    });

    // ── requireInRange ────────────────────────────────────────────────

    describe('requireInRange', () => {
        it('Test 26: should return value when within range', () => {
            expect(requireInRange(5, 'count', 1, 10)).toBe(5);
        });

        it('Test 27: should return value at lower boundary', () => {
            expect(requireInRange(1, 'count', 1, 10)).toBe(1);
        });

        it('Test 28: should return value at upper boundary', () => {
            expect(requireInRange(10, 'count', 1, 10)).toBe(10);
        });

        it('Test 29: should throw for null or undefined', () => {
            expect(() => requireInRange(null, 'val', 0, 100)).toThrow(
                'Missing required parameter'
            );
            expect(() => requireInRange(undefined, 'val', 0, 100)).toThrow(
                'Missing required parameter'
            );
        });

        it('Test 30: should throw for values below minimum', () => {
            expect(() => requireInRange(-1, 'priority', 0, 10)).toThrow(
                '[INVALID_PARAM]'
            );
            expect(() => requireInRange(-1, 'priority', 0, 10)).toThrow(
                'Value out of range'
            );
        });

        it('Test 31: should throw for values above maximum', () => {
            expect(() => requireInRange(11, 'priority', 0, 10)).toThrow(
                'between 0 and 10'
            );
        });

        it('Test 32: should handle negative ranges', () => {
            expect(requireInRange(-5, 'offset', -10, -1)).toBe(-5);
            expect(() => requireInRange(0, 'offset', -10, -1)).toThrow(
                'Value out of range'
            );
        });

        it('Test 33: should handle zero-width range (min equals max)', () => {
            expect(requireInRange(42, 'exact', 42, 42)).toBe(42);
            expect(() => requireInRange(43, 'exact', 42, 42)).toThrow(
                'Value out of range'
            );
        });
    });

    // ── Integration / Cross-cutting ───────────────────────────────────

    describe('Cross-cutting concerns', () => {
        it('Test 34: should produce consistent error code across all create functions', () => {
            const errors: ValidationError[] = [
                createMissingParamError('a'),
                createInvalidTypeError('b', 'number', 'string'),
                createOutOfRangeError('c', 0, 10, 20),
                createInvalidEnumError('d', ['x'], 'y'),
            ];

            for (const error of errors) {
                expect(error.code).toBe(ErrorCode.INVALID_PARAM);
            }
        });

        it('Test 35: should always include param field in all create functions', () => {
            expect(createMissingParamError('a').param).toBe('a');
            expect(createInvalidTypeError('b', 'x', 'y').param).toBe('b');
            expect(createOutOfRangeError('c', 0, 1, 2).param).toBe('c');
            expect(createInvalidEnumError('d', ['e'], 'f').param).toBe('d');
        });

        it('Test 36: should produce Error instances from all throw functions', () => {
            const throwers: Array<() => never> = [
                () => throwMissingParam('a'),
                () => throwInvalidType('b', 'x', 'y'),
                () => throwOutOfRange('c', 0, 1, 2),
                () => throwInvalidEnum('d', ['e'], 'f'),
            ];

            for (const thrower of throwers) {
                try {
                    thrower();
                    fail('Expected to throw');
                } catch (e: unknown) {
                    expect(e).toBeInstanceOf(Error);
                    expect((e as Error).message).toContain('[INVALID_PARAM]');
                }
            }
        });
    });
});
