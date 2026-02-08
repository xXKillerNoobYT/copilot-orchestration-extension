/**
 * Tests for Visual Detection System
 *
 * Tests for visual comparison and layout detection.
 */

import {
    VisualDetector,
    VisualComparisonResult,
    ChangedRegion,
    VisualDetectionConfig,
    initializeVisualDetector,
    getVisualDetector,
    resetVisualDetector,
} from '../../../src/agents/verification/visualDetection';

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import { logInfo, logWarn } from '../../../src/logger';

describe('VisualDetector', () => {
    let detector: VisualDetector;

    beforeEach(() => {
        jest.clearAllMocks();
        resetVisualDetector();
        detector = new VisualDetector();
    });

    afterEach(() => {
        resetVisualDetector();
    });

    // ============================================================================
    // Constructor Tests
    // ============================================================================
    describe('constructor', () => {
        it('Test 1: should create with default config', () => {
            const det = new VisualDetector();
            expect(det).toBeDefined();
            expect(det.getBaselines().size).toBe(0);
        });

        it('Test 2: should create with custom config', () => {
            const det = new VisualDetector({
                pixelDiffThreshold: 0.5,
                matchThreshold: 90,
            });
            expect(det).toBeDefined();
        });

        it('Test 3: should merge partial config with defaults', () => {
            const det = new VisualDetector({
                viewportWidth: 1920,
            });
            expect(det).toBeDefined();
        });
    });

    // ============================================================================
    // setBaseline Tests
    // ============================================================================
    describe('setBaseline()', () => {
        it('Test 4: should set a baseline', () => {
            detector.setBaseline('homepage', '/path/to/baseline.png');
            
            expect(detector.getBaselines().has('homepage')).toBe(true);
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Set baseline for homepage')
            );
        });

        it('Test 5: should overwrite existing baseline', () => {
            detector.setBaseline('homepage', '/path/old.png');
            detector.setBaseline('homepage', '/path/new.png');
            
            expect(detector.getBaselines().get('homepage')).toBe('/path/new.png');
        });

        it('Test 6: should handle multiple baselines', () => {
            detector.setBaseline('homepage', '/path/home.png');
            detector.setBaseline('settings', '/path/settings.png');
            detector.setBaseline('profile', '/path/profile.png');
            
            expect(detector.getBaselines().size).toBe(3);
        });
    });

    // ============================================================================
    // compare Tests
    // ============================================================================
    describe('compare()', () => {
        it('Test 7: should create baseline when none exists', async () => {
            const result = await detector.compare('newView', '/path/current.png');
            
            expect(result.matches).toBe(true);
            expect(result.differencePercent).toBe(0);
            expect(detector.getBaselines().has('newView')).toBe(true);
            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('No baseline for newView')
            );
        });

        it('Test 8: should compare against existing baseline', async () => {
            detector.setBaseline('homepage', '/path/baseline.png');
            
            const result = await detector.compare('homepage', '/path/current.png');
            
            expect(result.screenshots?.baseline).toBe('/path/baseline.png');
            expect(result.screenshots?.current).toBe('/path/current.png');
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Comparing homepage to baseline')
            );
        });

        it('Test 9: should return pixel method by default', async () => {
            detector.setBaseline('page', '/path/base.png');
            const result = await detector.compare('page', '/path/current.png');
            
            expect(result.method).toBe('pixel');
        });

        it('Test 10: should include changed regions', async () => {
            detector.setBaseline('page', '/path/base.png');
            const result = await detector.compare('page', '/path/current.png');
            
            expect(result.changedRegions).toBeDefined();
            expect(Array.isArray(result.changedRegions)).toBe(true);
        });

        it('Test 11: should not create diff path when no difference', async () => {
            detector.setBaseline('page', '/path/base.png');
            const result = await detector.compare('page', '/path/current.png');
            
            // Placeholder returns 0 difference
            expect(result.differencePercent).toBe(0);
            expect(result.screenshots?.diff).toBeUndefined();
        });
    });

    // ============================================================================
    // detectLayoutChanges Tests
    // ============================================================================
    describe('detectLayoutChanges()', () => {
        it('Test 12: should return array of changes', async () => {
            const result = await detector.detectLayoutChanges('<html></html>', '<html></html>');
            
            expect(Array.isArray(result)).toBe(true);
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Layout comparison complete')
            );
        });

        it('Test 13: should handle empty DOM strings', async () => {
            const result = await detector.detectLayoutChanges('', '');
            expect(result).toEqual([]);
        });

        it('Test 14: should handle complex DOM', async () => {
            const baselineDOM = '<div class="container"><span>Hello</span></div>';
            const currentDOM = '<div class="container"><span>World</span></div>';
            
            const result = await detector.detectLayoutChanges(baselineDOM, currentDOM);
            expect(result).toBeDefined();
        });
    });

    // ============================================================================
    // checkResponsive Tests
    // ============================================================================
    describe('checkResponsive()', () => {
        it('Test 15: should check multiple viewports', async () => {
            const viewports = [
                { width: 1920, height: 1080, name: 'desktop' },
                { width: 768, height: 1024, name: 'tablet' },
                { width: 375, height: 667, name: 'mobile' },
            ];
            
            const results = await detector.checkResponsive('http://test.com', viewports);
            
            expect(results.size).toBe(3);
            expect(results.has('desktop')).toBe(true);
            expect(results.has('tablet')).toBe(true);
            expect(results.has('mobile')).toBe(true);
        });

        it('Test 16: should log each viewport check', async () => {
            const viewports = [{ width: 1280, height: 720, name: 'default' }];
            
            await detector.checkResponsive('http://test.com', viewports);
            
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Checking responsive at 1280x720')
            );
        });

        it('Test 17: should return structural method for responsive', async () => {
            const viewports = [{ width: 1280, height: 720, name: 'default' }];
            
            const results = await detector.checkResponsive('http://test.com', viewports);
            const result = results.get('default');
            
            expect(result?.method).toBe('structural');
        });

        it('Test 18: should handle empty viewports array', async () => {
            const results = await detector.checkResponsive('http://test.com', []);
            expect(results.size).toBe(0);
        });
    });

    // ============================================================================
    // getBaselines Tests
    // ============================================================================
    describe('getBaselines()', () => {
        it('Test 19: should return empty map initially', () => {
            expect(detector.getBaselines().size).toBe(0);
        });

        it('Test 20: should return copy of baselines', () => {
            detector.setBaseline('test', '/path.png');
            
            const baselines1 = detector.getBaselines();
            const baselines2 = detector.getBaselines();
            
            // Should be different map instances
            expect(baselines1).not.toBe(baselines2);
            // But with same content
            expect(baselines1.get('test')).toBe(baselines2.get('test'));
        });
    });

    // ============================================================================
    // clearBaselines Tests
    // ============================================================================
    describe('clearBaselines()', () => {
        it('Test 21: should clear all baselines', () => {
            detector.setBaseline('page1', '/p1.png');
            detector.setBaseline('page2', '/p2.png');
            
            detector.clearBaselines();
            
            expect(detector.getBaselines().size).toBe(0);
        });

        it('Test 22: should be safe to call when empty', () => {
            detector.clearBaselines();
            expect(detector.getBaselines().size).toBe(0);
        });
    });

    // ============================================================================
    // Singleton Functions Tests
    // ============================================================================
    describe('singleton functions', () => {
        it('Test 23: initializeVisualDetector should create instance', () => {
            const instance = initializeVisualDetector();
            expect(instance).toBeDefined();
            expect(instance).toBeInstanceOf(VisualDetector);
        });

        it('Test 24: initializeVisualDetector should accept config', () => {
            const instance = initializeVisualDetector({ matchThreshold: 80 });
            expect(instance).toBeDefined();
        });

        it('Test 25: getVisualDetector should return singleton', () => {
            const instance1 = getVisualDetector();
            const instance2 = getVisualDetector();
            expect(instance1).toBe(instance2);
        });

        it('Test 26: resetVisualDetector should clear singleton', () => {
            const instance1 = getVisualDetector();
            resetVisualDetector();
            const instance2 = getVisualDetector();
            expect(instance1).not.toBe(instance2);
        });

        it('Test 27: getVisualDetector should create if not exists', () => {
            resetVisualDetector();
            const instance = getVisualDetector();
            expect(instance).toBeDefined();
        });
    });

    // ============================================================================
    // Edge Cases
    // ============================================================================
    describe('edge cases', () => {
        it('Test 28: should handle special characters in view names', () => {
            detector.setBaseline('page/with/slashes', '/path.png');
            expect(detector.getBaselines().has('page/with/slashes')).toBe(true);
        });

        it('Test 29: should handle empty view name', () => {
            detector.setBaseline('', '/path.png');
            expect(detector.getBaselines().has('')).toBe(true);
        });

        it('Test 30: should handle very long paths', async () => {
            const longPath = '/very/long/' + 'path/'.repeat(50) + 'file.png';
            detector.setBaseline('test', longPath);
            const result = await detector.compare('test', longPath);
            expect(result).toBeDefined();
        });
    });
});
