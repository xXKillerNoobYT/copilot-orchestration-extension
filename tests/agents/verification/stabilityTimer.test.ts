/**
 * @file verification/stabilityTimer.test.ts
 * @description Tests for StabilityTimer (MT-015.2)
 */

import { EventEmitter } from 'events';

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn()
}));

import {
    StabilityTimer,
    createStabilityTimer
} from '../../../src/agents/verification/stabilityTimer';

describe('StabilityTimer', () => {
    let timer: StabilityTimer;

    beforeEach(() => {
        jest.useFakeTimers();
        timer = new StabilityTimer({
            delayMs: 1000, // 1 second for tests
            maxWaitMs: 5000
        });
    });

    afterEach(() => {
        timer.cancelAll();
        jest.useRealTimers();
    });

    describe('Test 1: constructor', () => {
        it('should create instance with default config', () => {
            const defaultTimer = createStabilityTimer();
            expect(defaultTimer).toBeInstanceOf(StabilityTimer);
            expect(defaultTimer).toBeInstanceOf(EventEmitter);
        });

        it('should create instance with custom config', () => {
            const customTimer = createStabilityTimer({
                delayMs: 30000,
                maxWaitMs: 120000
            });
            expect(customTimer).toBeInstanceOf(StabilityTimer);
        });
    });

    describe('Test 2: waitForStability', () => {
        it('should resolve after delay when no changes', async () => {
            const promise = timer.waitForStability(['/test/file.ts']);

            // Fast-forward past stability delay
            jest.advanceTimersByTime(1100);

            await expect(promise).resolves.toBeUndefined();
        });

        it('should emit stable event when complete', async () => {
            const stableSpy = jest.fn();
            timer.on('stable', stableSpy);

            const promise = timer.waitForStability(['/test/file.ts']);
            jest.advanceTimersByTime(1100);

            await promise;
            expect(stableSpy).toHaveBeenCalled();
        });
    });

    describe('Test 3: reportFileChange', () => {
        it('should reset timer when file changes', () => {
            const resetSpy = jest.fn();
            timer.on('reset', resetSpy);

            timer.waitForStability(['/test/file.ts']);

            // Advance partway
            jest.advanceTimersByTime(500);

            // Report file change
            timer.reportFileChange('/test/file.ts');

            expect(resetSpy).toHaveBeenCalled();
        });

        it('should ignore changes for unrelated files', () => {
            const resetSpy = jest.fn();
            timer.on('reset', resetSpy);

            timer.waitForStability(['/test/file.ts']);
            timer.reportFileChange('/other/file.ts');

            expect(resetSpy).not.toHaveBeenCalled();
        });
    });

    describe('Test 4: cancelAll', () => {
        it('should cancel active sessions', async () => {
            const promise = timer.waitForStability(['/test/file.ts']);

            expect(timer.getActiveSessionCount()).toBe(1);

            timer.cancelAll();

            // Should immediately resolve
            await promise;
            expect(timer.getActiveSessionCount()).toBe(0);
        });
    });

    describe('Test 5: maxWait timeout', () => {
        it('should resolve after maxWait even with changes', async () => {
            const promise = timer.waitForStability(['/test/file.ts']);

            // Keep resetting by reporting changes
            jest.advanceTimersByTime(4000);
            timer.reportFileChange('/test/file.ts');

            // Advance past maxWait
            jest.advanceTimersByTime(2000);

            await expect(promise).resolves.toBeUndefined();
        });
    });

    describe('Test 6: getActiveSessionCount', () => {
        it('should track multiple sessions', async () => {
            timer.waitForStability(['/test/a.ts']);
            timer.waitForStability(['/test/b.ts']);

            expect(timer.getActiveSessionCount()).toBe(2);
        });
    });
});
