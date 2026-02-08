/**
 * Tests for Planning Types (MT-033)
 *
 * Tests for the ValidationSeverity enum which is the only executable code in types.ts.
 */

import { ValidationSeverity } from '../../src/planning/types';

describe('Planning Types', () => {
    describe('ValidationSeverity enum', () => {
        it('Test 1: should define ERROR value', () => {
            expect(ValidationSeverity.ERROR).toBe('error');
        });

        it('Test 2: should define WARNING value', () => {
            expect(ValidationSeverity.WARNING).toBe('warning');
        });

        it('Test 3: should define INFO value', () => {
            expect(ValidationSeverity.INFO).toBe('info');
        });

        it('Test 4: should have exactly 3 severity levels', () => {
            const values = Object.values(ValidationSeverity);
            expect(values).toHaveLength(3);
        });

        it('Test 5: should be usable in type guards', () => {
            const severity: ValidationSeverity = ValidationSeverity.ERROR;
            expect(severity === ValidationSeverity.ERROR).toBe(true);
        });
    });
});
