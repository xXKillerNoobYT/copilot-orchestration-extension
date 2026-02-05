/**
 * Validation Error Handlers
 *
 * Provides helper functions for throwing standardized validation errors.
 *
 * **Simple explanation**: When someone gives us bad input (like missing a
 * required field or sending a number that's too big), these functions create
 * friendly error messages that explain exactly what went wrong.
 *
 * @module validationErrors
 * @since MT-002.2
 */

import { ErrorCode } from './errorCodes';

/**
 * Base interface for validation errors
 */
export interface ValidationError {
    code: ErrorCode;
    message: string;
    param?: string;
    expected?: string;
    received?: string;
}

/**
 * Create a validation error for a missing required parameter.
 *
 * **Simple explanation**: Like checking if someone forgot to fill in a required
 * field on a form.
 *
 * @param paramName - The name of the missing parameter
 * @returns ValidationError object with details
 *
 * @example
 * throw createMissingParamError('ticketId');
 * // Error: Missing required parameter: ticketId
 */
export function createMissingParamError(paramName: string): ValidationError {
    return {
        code: ErrorCode.INVALID_PARAM,
        message: `Missing required parameter: ${paramName}`,
        param: paramName,
    };
}

/**
 * Throw an error for a missing required parameter.
 *
 * @param paramName - The name of the missing parameter
 * @throws Error with standardized message
 */
export function throwMissingParam(paramName: string): never {
    const error = createMissingParamError(paramName);
    throw new Error(`[${error.code}] ${error.message}`);
}

/**
 * Create a validation error for an invalid parameter type.
 *
 * **Simple explanation**: Like when someone writes "hello" in a field that
 * expects a number.
 *
 * @param paramName - The name of the parameter
 * @param expected - The expected type (e.g., "string", "number")
 * @param received - The actual type that was received
 * @returns ValidationError object with details
 */
export function createInvalidTypeError(
    paramName: string,
    expected: string,
    received: string
): ValidationError {
    return {
        code: ErrorCode.INVALID_PARAM,
        message: `Invalid type for parameter '${paramName}': expected ${expected}, received ${received}`,
        param: paramName,
        expected,
        received,
    };
}

/**
 * Throw an error for an invalid parameter type.
 *
 * @param paramName - The name of the parameter
 * @param expected - The expected type
 * @param received - The actual type
 * @throws Error with standardized message
 */
export function throwInvalidType(
    paramName: string,
    expected: string,
    received: string
): never {
    const error = createInvalidTypeError(paramName, expected, received);
    throw new Error(`[${error.code}] ${error.message}`);
}

/**
 * Create a validation error for a value outside acceptable range.
 *
 * **Simple explanation**: Like when someone enters 999 for an age field that
 * only accepts 0-150.
 *
 * @param paramName - The name of the parameter
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param received - The actual value that was received
 * @returns ValidationError object with details
 */
export function createOutOfRangeError(
    paramName: string,
    min: number,
    max: number,
    received: number
): ValidationError {
    return {
        code: ErrorCode.INVALID_PARAM,
        message: `Value out of range for '${paramName}': must be between ${min} and ${max}, received ${received}`,
        param: paramName,
        expected: `${min}-${max}`,
        received: String(received),
    };
}

/**
 * Throw an error for a value outside acceptable range.
 *
 * @param paramName - The name of the parameter
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param received - The actual value
 * @throws Error with standardized message
 */
export function throwOutOfRange(
    paramName: string,
    min: number,
    max: number,
    received: number
): never {
    const error = createOutOfRangeError(paramName, min, max, received);
    throw new Error(`[${error.code}] ${error.message}`);
}

/**
 * Create a validation error for an invalid enum value.
 *
 * **Simple explanation**: Like when someone picks "maybe" for a yes/no question.
 *
 * @param paramName - The name of the parameter
 * @param allowedValues - Array of allowed values
 * @param received - The actual value that was received
 * @returns ValidationError object with details
 */
export function createInvalidEnumError(
    paramName: string,
    allowedValues: string[],
    received: string
): ValidationError {
    return {
        code: ErrorCode.INVALID_PARAM,
        message: `Invalid value for '${paramName}': must be one of [${allowedValues.join(', ')}], received '${received}'`,
        param: paramName,
        expected: allowedValues.join('|'),
        received,
    };
}

/**
 * Throw an error for an invalid enum value.
 *
 * @param paramName - The name of the parameter
 * @param allowedValues - Array of allowed values
 * @param received - The actual value
 * @throws Error with standardized message
 */
export function throwInvalidEnum(
    paramName: string,
    allowedValues: string[],
    received: string
): never {
    const error = createInvalidEnumError(paramName, allowedValues, received);
    throw new Error(`[${error.code}] ${error.message}`);
}

/**
 * Validate that a required parameter is present.
 *
 * **Simple explanation**: A quick check that throws an error if a value is
 * missing, otherwise returns the value unchanged.
 *
 * @param value - The value to check
 * @param paramName - The name of the parameter (for error messages)
 * @returns The value if present
 * @throws Error if value is null or undefined
 */
export function requireParam<T>(value: T | null | undefined, paramName: string): T {
    if (value === null || value === undefined) {
        throwMissingParam(paramName);
    }
    return value;
}

/**
 * Validate that a string is not empty.
 *
 * @param value - The string to check
 * @param paramName - The name of the parameter
 * @returns The string if non-empty
 * @throws Error if string is empty or whitespace-only
 */
export function requireNonEmptyString(value: string | null | undefined, paramName: string): string {
    const str = requireParam(value, paramName);
    if (str.trim().length === 0) {
        throw new Error(`[${ErrorCode.INVALID_PARAM}] Parameter '${paramName}' cannot be empty`);
    }
    return str;
}

/**
 * Validate that a number is within range.
 *
 * @param value - The number to check
 * @param paramName - The name of the parameter
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns The number if in range
 * @throws Error if out of range
 */
export function requireInRange(
    value: number | null | undefined,
    paramName: string,
    min: number,
    max: number
): number {
    const num = requireParam(value, paramName);
    if (num < min || num > max) {
        throwOutOfRange(paramName, min, max, num);
    }
    return num;
}
