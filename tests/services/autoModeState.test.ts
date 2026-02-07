/**
 * Tests for Auto Mode State Management
 *
 * Tests the centralized runtime state for Auto/Manual ticket processing mode.
 * Validates session override behavior, processed tickets tracking, and debounce.
 *
 * @module tests/services/autoModeState.test
 */

import {
    getAutoModeEnabled,
    setAutoModeOverride,
    isTicketProcessed,
    markTicketProcessed,
    getDebounceTimer,
    setDebounceTimer,
    clearDebounceTimer,
    resetAutoModeState,
    getProcessedTicketsCount,
    AUTO_PLAN_DEBOUNCE_MS
} from '../../src/services/autoModeState';

// Mock vscode
const mockGet = jest.fn();
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: mockGet
        }))
    }
}));

// Mock logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

describe('AutoModeState', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        resetAutoModeState();
        // Default mock: autoProcessTickets setting is true
        mockGet.mockReturnValue(true);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // =========================================================================
    // Auto Mode Toggle Tests
    // =========================================================================

    describe('Auto Mode Toggle', () => {
        it('Test 1: should return setting value when no override is set', () => {
            mockGet.mockReturnValue(true);
            expect(getAutoModeEnabled()).toBe(true);

            mockGet.mockReturnValue(false);
            expect(getAutoModeEnabled()).toBe(false);
        });

        it('Test 2: should return override value when override is set', () => {
            mockGet.mockReturnValue(true);

            setAutoModeOverride(false);
            expect(getAutoModeEnabled()).toBe(false);

            setAutoModeOverride(true);
            expect(getAutoModeEnabled()).toBe(true);
        });

        it('Test 3: should override setting regardless of setting value', () => {
            // Setting is true, but override is false
            mockGet.mockReturnValue(true);
            setAutoModeOverride(false);
            expect(getAutoModeEnabled()).toBe(false);

            // Setting is false, but override is true  
            mockGet.mockReturnValue(false);
            setAutoModeOverride(true);
            expect(getAutoModeEnabled()).toBe(true);
        });

        it('Test 4: should revert to setting after reset', () => {
            mockGet.mockReturnValue(false);

            setAutoModeOverride(true);
            expect(getAutoModeEnabled()).toBe(true);

            resetAutoModeState();
            expect(getAutoModeEnabled()).toBe(false);
        });

        it('Test 5: should use default true when mock returns true', () => {
            // In production, vscode.workspace.getConfiguration().get() uses the
            // second parameter as default when the setting is undefined.
            // Our mock simulates this by returning true by default.
            mockGet.mockReturnValue(true);
            expect(getAutoModeEnabled()).toBe(true);
        });
    });

    // =========================================================================
    // Processed Tickets Tracking Tests
    // =========================================================================

    describe('Processed Tickets Tracking', () => {
        it('Test 6: should return false for unprocessed tickets', () => {
            expect(isTicketProcessed('ticket-1')).toBe(false);
            expect(isTicketProcessed('ticket-2')).toBe(false);
        });

        it('Test 7: should return true for processed tickets', () => {
            markTicketProcessed('ticket-1');
            expect(isTicketProcessed('ticket-1')).toBe(true);
            expect(isTicketProcessed('ticket-2')).toBe(false);
        });

        it('Test 8: should track multiple processed tickets', () => {
            markTicketProcessed('ticket-1');
            markTicketProcessed('ticket-2');
            markTicketProcessed('ticket-3');

            expect(isTicketProcessed('ticket-1')).toBe(true);
            expect(isTicketProcessed('ticket-2')).toBe(true);
            expect(isTicketProcessed('ticket-3')).toBe(true);
            expect(getProcessedTicketsCount()).toBe(3);
        });

        it('Test 9: should clear processed tickets on reset', () => {
            markTicketProcessed('ticket-1');
            markTicketProcessed('ticket-2');
            expect(getProcessedTicketsCount()).toBe(2);

            resetAutoModeState();
            expect(isTicketProcessed('ticket-1')).toBe(false);
            expect(isTicketProcessed('ticket-2')).toBe(false);
            expect(getProcessedTicketsCount()).toBe(0);
        });

        it('Test 10: should handle duplicate marks idempotently', () => {
            markTicketProcessed('ticket-1');
            markTicketProcessed('ticket-1');
            markTicketProcessed('ticket-1');

            expect(isTicketProcessed('ticket-1')).toBe(true);
            expect(getProcessedTicketsCount()).toBe(1);
        });
    });

    // =========================================================================
    // Debounce Timer Tests
    // =========================================================================

    describe('Debounce Timer', () => {
        it('Test 11: should initially have no debounce timer', () => {
            expect(getDebounceTimer()).toBeNull();
        });

        it('Test 12: should set and get debounce timer', () => {
            const timer = setTimeout(() => {}, 1000);
            setDebounceTimer(timer);

            expect(getDebounceTimer()).toBe(timer);
        });

        it('Test 13: should clear debounce timer', () => {
            const timer = setTimeout(() => {}, 1000);
            setDebounceTimer(timer);
            expect(getDebounceTimer()).toBe(timer);

            clearDebounceTimer();
            expect(getDebounceTimer()).toBeNull();
        });

        it('Test 14: should clear timer on reset', () => {
            const timer = setTimeout(() => {}, 1000);
            setDebounceTimer(timer);

            resetAutoModeState();
            expect(getDebounceTimer()).toBeNull();
        });

        it('Test 15: should handle clearDebounceTimer when no timer set', () => {
            // Should not throw
            expect(() => clearDebounceTimer()).not.toThrow();
            expect(getDebounceTimer()).toBeNull();
        });

        it('Test 16: should export correct debounce constant', () => {
            expect(AUTO_PLAN_DEBOUNCE_MS).toBe(500);
        });
    });

    // =========================================================================
    // Session Override Scenarios Tests
    // =========================================================================

    describe('Session Override Scenarios', () => {
        it('Test 17: should simulate quick toggle use case', () => {
            // User has Auto enabled in settings
            mockGet.mockReturnValue(true);
            expect(getAutoModeEnabled()).toBe(true);

            // User clicks toggle to disable temporarily
            setAutoModeOverride(false);
            expect(getAutoModeEnabled()).toBe(false);

            // User clicks toggle again to re-enable
            setAutoModeOverride(true);
            expect(getAutoModeEnabled()).toBe(true);
        });

        it('Test 18: should simulate extension restart resets override', () => {
            mockGet.mockReturnValue(false);

            // User manually enabled Auto for this session
            setAutoModeOverride(true);
            expect(getAutoModeEnabled()).toBe(true);

            // Simulate extension restart (reset is called in deactivate)
            resetAutoModeState();

            // Should revert to setting value
            expect(getAutoModeEnabled()).toBe(false);
        });

        it('Test 19: should track processed tickets during session', () => {
            // First ticket comes in
            expect(isTicketProcessed('ticket-001')).toBe(false);
            markTicketProcessed('ticket-001');

            // Same ticket update should be detected as processed
            expect(isTicketProcessed('ticket-001')).toBe(true);

            // New ticket is not processed
            expect(isTicketProcessed('ticket-002')).toBe(false);
        });
    });

    // =========================================================================
    // Reset Function Tests
    // =========================================================================

    describe('Reset Function', () => {
        it('Test 20: should reset all state components', () => {
            // Set up various state
            mockGet.mockReturnValue(false);
            setAutoModeOverride(true);
            markTicketProcessed('ticket-1');
            markTicketProcessed('ticket-2');
            const timer = setTimeout(() => {}, 1000);
            setDebounceTimer(timer);

            // Verify state is set
            expect(getAutoModeEnabled()).toBe(true); // Override
            expect(getProcessedTicketsCount()).toBe(2);
            expect(getDebounceTimer()).not.toBeNull();

            // Reset
            resetAutoModeState();

            // Verify all reset
            expect(getAutoModeEnabled()).toBe(false); // Back to setting
            expect(getProcessedTicketsCount()).toBe(0);
            expect(getDebounceTimer()).toBeNull();
        });
    });
});
