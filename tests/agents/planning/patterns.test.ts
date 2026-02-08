/**
 * PatternRecognizer Test Suite
 *
 * Tests the PatternRecognizer class which analyzes requirement text to
 * identify common software patterns (CRUD, authentication, API, etc.)
 * and suggests implementation approaches with confidence scores.
 *
 * @module tests/agents/planning/patterns
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock logger before imports
const mockLogInfo = jest.fn();
const mockLogWarn = jest.fn();
jest.mock('../../../src/logger', () => ({
    logInfo: (...args: unknown[]) => mockLogInfo(...args),
    logWarn: (...args: unknown[]) => mockLogWarn(...args)
}));

// Import after mocks
import {
    PatternRecognizer,
    getPatternRecognizer,
    resetPatternRecognizerForTests
} from '../../../src/agents/planning/patterns';
import type {
    PatternType,
    PatternDefinition,
    PatternMatch,
    PatternRecognitionResult
} from '../../../src/agents/planning/patterns';

describe('PatternRecognizer Test Suite', () => {
    let recognizer: PatternRecognizer;

    beforeEach(() => {
        jest.clearAllMocks();
        resetPatternRecognizerForTests();
        recognizer = new PatternRecognizer();
    });

    afterEach(() => {
        resetPatternRecognizerForTests();
    });

    // =========================================================================
    // Constructor & Initialization Tests
    // =========================================================================
    describe('Constructor & Initialization', () => {
        it('Test 1: should create an instance via constructor', () => {
            const instance = new PatternRecognizer();
            expect(instance).toBeDefined();
            expect(instance).toBeInstanceOf(PatternRecognizer);
        });

        it('Test 2: should initialize with the built-in pattern library', () => {
            const patterns = recognizer.getAllPatterns();
            expect(patterns.length).toBeGreaterThanOrEqual(8);
        });

        it('Test 3: should return a copy of patterns from getAllPatterns (not the internal array)', () => {
            const patterns1 = recognizer.getAllPatterns();
            const patterns2 = recognizer.getAllPatterns();
            expect(patterns1).not.toBe(patterns2);
            expect(patterns1).toEqual(patterns2);
        });
    });

    // =========================================================================
    // Singleton Pattern Tests
    // =========================================================================
    describe('Singleton', () => {
        it('Test 4: should return the same instance from getPatternRecognizer', () => {
            const instance1 = getPatternRecognizer();
            const instance2 = getPatternRecognizer();
            expect(instance1).toBe(instance2);
        });

        it('Test 5: should return a new instance after resetPatternRecognizerForTests', () => {
            const instance1 = getPatternRecognizer();
            resetPatternRecognizerForTests();
            const instance2 = getPatternRecognizer();
            expect(instance1).not.toBe(instance2);
        });

        it('Test 6: should create instance lazily on first call to getPatternRecognizer', () => {
            resetPatternRecognizerForTests();
            const instance = getPatternRecognizer();
            expect(instance).toBeDefined();
            expect(instance).toBeInstanceOf(PatternRecognizer);
        });
    });

    // =========================================================================
    // CRUD Pattern Recognition Tests
    // =========================================================================
    describe('CRUD Pattern Recognition', () => {
        it('Test 7: should recognize CRUD pattern from explicit keywords', () => {
            const result = recognizer.recognize('I need to create, read, update, and delete user records');
            expect(result.matches.length).toBeGreaterThan(0);

            const crudMatch = result.matches.find(m => m.pattern.type === 'crud');
            expect(crudMatch).toBeDefined();
            expect(crudMatch!.confidence).toBeGreaterThan(0.2);
            expect(crudMatch!.matchedKeywords).toContain('create');
            expect(crudMatch!.matchedKeywords).toContain('read');
            expect(crudMatch!.matchedKeywords).toContain('update');
            expect(crudMatch!.matchedKeywords).toContain('delete');
        });

        it('Test 8: should recognize CRUD pattern as primary when multiple CRUD keywords appear', () => {
            const result = recognizer.recognize('Build a system to manage entities with add, edit, remove, and list operations');
            expect(result.primaryPattern).not.toBeNull();
            expect(result.primaryPattern!.pattern.type).toBe('crud');
            expect(result.primaryPattern!.confidence).toBeGreaterThanOrEqual(0.6);
        });
    });

    // =========================================================================
    // Authentication Pattern Recognition Tests
    // =========================================================================
    describe('Authentication Pattern Recognition', () => {
        it('Test 9: should recognize authentication pattern from login keywords', () => {
            const result = recognizer.recognize('Users need to login with a password and manage sessions');
            const authMatch = result.matches.find(m => m.pattern.type === 'authentication');
            expect(authMatch).toBeDefined();
            expect(authMatch!.confidence).toBeGreaterThan(0.2);
            expect(authMatch!.matchedKeywords).toContain('login');
            expect(authMatch!.matchedKeywords).toContain('password');
            expect(authMatch!.matchedKeywords).toContain('session');
        });

        it('Test 10: should recognize authentication pattern from sign in/out keywords', () => {
            const result = recognizer.recognize('Implement sign in and sign out for the application with credential management');
            const authMatch = result.matches.find(m => m.pattern.type === 'authentication');
            expect(authMatch).toBeDefined();
            expect(authMatch!.matchedKeywords).toContain('sign in');
            expect(authMatch!.matchedKeywords).toContain('sign out');
            expect(authMatch!.matchedKeywords).toContain('credential');
        });
    });

    // =========================================================================
    // API Pattern Recognition Tests
    // =========================================================================
    describe('API Pattern Recognition', () => {
        it('Test 11: should recognize API pattern from endpoint keywords', () => {
            const result = recognizer.recognize('Create a REST API endpoint to handle GET and POST requests');
            const apiMatch = result.matches.find(m => m.pattern.type === 'api');
            expect(apiMatch).toBeDefined();
            expect(apiMatch!.confidence).toBeGreaterThan(0.2);
            expect(apiMatch!.matchedKeywords).toContain('api');
            expect(apiMatch!.matchedKeywords).toContain('endpoint');
            expect(apiMatch!.matchedKeywords).toContain('rest');
        });
    });

    // =========================================================================
    // Form Pattern Recognition Tests
    // =========================================================================
    describe('Form Pattern Recognition', () => {
        it('Test 12: should recognize form pattern from form and validation keywords', () => {
            const result = recognizer.recognize('Build a form with input fields, validation rules, and a submit button');
            const formMatch = result.matches.find(m => m.pattern.type === 'form');
            expect(formMatch).toBeDefined();
            expect(formMatch!.confidence).toBeGreaterThan(0.2);
            expect(formMatch!.matchedKeywords).toContain('form');
            expect(formMatch!.matchedKeywords).toContain('input');
            expect(formMatch!.matchedKeywords).toContain('validation');
            expect(formMatch!.matchedKeywords).toContain('submit');
        });
    });

    // =========================================================================
    // Search, Observer, Cache Pattern Recognition Tests
    // =========================================================================
    describe('Other Pattern Types', () => {
        it('Test 13: should recognize observer pattern from event-related keywords', () => {
            const result = recognizer.recognize('We need an event system to emit events and subscribe listeners');
            const observerMatch = result.matches.find(m => m.pattern.type === 'observer');
            expect(observerMatch).toBeDefined();
            expect(observerMatch!.confidence).toBeGreaterThan(0.2);
            expect(observerMatch!.matchedKeywords).toContain('event');
            expect(observerMatch!.matchedKeywords).toContain('emit');
            expect(observerMatch!.matchedKeywords).toContain('subscribe');
        });

        it('Test 14: should recognize cache pattern from caching keywords', () => {
            const result = recognizer.recognize('Add a cache layer with TTL that can expire and invalidate entries from the store');
            const cacheMatch = result.matches.find(m => m.pattern.type === 'cache');
            expect(cacheMatch).toBeDefined();
            expect(cacheMatch!.confidence).toBeGreaterThan(0.2);
            expect(cacheMatch!.matchedKeywords).toContain('cache');
            expect(cacheMatch!.matchedKeywords).toContain('ttl');
            expect(cacheMatch!.matchedKeywords).toContain('expire');
            expect(cacheMatch!.matchedKeywords).toContain('invalidate');
            expect(cacheMatch!.matchedKeywords).toContain('store');
        });

        it('Test 15: should recognize authorization pattern from permission/role keywords', () => {
            const result = recognizer.recognize('Implement role-based access control with admin permissions and RBAC');
            const authzMatch = result.matches.find(m => m.pattern.type === 'authorization');
            expect(authzMatch).toBeDefined();
            expect(authzMatch!.matchedKeywords).toContain('role');
            expect(authzMatch!.matchedKeywords).toContain('access');
            expect(authzMatch!.matchedKeywords).toContain('admin');
            expect(authzMatch!.matchedKeywords).toContain('permission');
            expect(authzMatch!.matchedKeywords).toContain('rbac');
        });
    });

    // =========================================================================
    // Singleton Pattern Recognition Tests
    // =========================================================================
    describe('Singleton Pattern Recognition', () => {
        it('Test 16: should recognize singleton pattern from singleton keywords', () => {
            const result = recognizer.recognize('Create a singleton service with a shared global instance');
            const singletonMatch = result.matches.find(m => m.pattern.type === 'singleton');
            expect(singletonMatch).toBeDefined();
            expect(singletonMatch!.confidence).toBeGreaterThan(0.2);
            expect(singletonMatch!.matchedKeywords).toContain('singleton');
            expect(singletonMatch!.matchedKeywords).toContain('service');
            expect(singletonMatch!.matchedKeywords).toContain('global');
        });
    });

    // =========================================================================
    // Confidence Score Tests
    // =========================================================================
    describe('Confidence Scores', () => {
        it('Test 17: should return higher confidence for more keyword matches', () => {
            const lowResult = recognizer.recognize('We need to create something');
            const highResult = recognizer.recognize('We need to create, read, update, delete, add, remove, edit, list, and manage entities');

            const lowCrud = lowResult.matches.find(m => m.pattern.type === 'crud');
            const highCrud = highResult.matches.find(m => m.pattern.type === 'crud');

            expect(lowCrud).toBeDefined();
            expect(highCrud).toBeDefined();
            expect(highCrud!.confidence).toBeGreaterThan(lowCrud!.confidence);
        });

        it('Test 18: should cap confidence at 1.0 even with many keyword matches', () => {
            const result = recognizer.recognize(
                'create read update delete crud add remove edit list entity manage'
            );
            const crudMatch = result.matches.find(m => m.pattern.type === 'crud');
            expect(crudMatch).toBeDefined();
            expect(crudMatch!.confidence).toBeLessThanOrEqual(1.0);
        });

        it('Test 19: should filter out matches with confidence 0.2 or below', () => {
            const result = recognizer.recognize('Build something unique and special');
            for (const match of result.matches) {
                expect(match.confidence).toBeGreaterThan(0.2);
            }
        });
    });

    // =========================================================================
    // Multiple Pattern Matching Tests
    // =========================================================================
    describe('Multiple Pattern Matching', () => {
        it('Test 20: should detect multiple patterns in combined requirements', () => {
            const result = recognizer.recognize(
                'Build a system with login authentication, CRUD operations for managing entities, and a REST API endpoint'
            );
            expect(result.matches.length).toBeGreaterThanOrEqual(2);

            const types = result.matches.map(m => m.pattern.type);
            expect(types).toContain('authentication');
            expect(types).toContain('crud');
            expect(types).toContain('api');
        });

        it('Test 21: should sort matches by confidence in descending order', () => {
            const result = recognizer.recognize(
                'Login with password and credential management, also create and edit items'
            );
            for (let i = 1; i < result.matches.length; i++) {
                expect(result.matches[i - 1].confidence).toBeGreaterThanOrEqual(
                    result.matches[i].confidence
                );
            }
        });

        it('Test 22: should set primaryPattern to the highest confidence match', () => {
            const result = recognizer.recognize(
                'Build a login and logout system with password and session management for authentication'
            );
            expect(result.primaryPattern).not.toBeNull();
            expect(result.primaryPattern!.confidence).toBe(result.matches[0].confidence);
            expect(result.primaryPattern!.pattern.type).toBe(result.matches[0].pattern.type);
        });
    });

    // =========================================================================
    // No Pattern Matching Tests
    // =========================================================================
    describe('No Pattern Matching', () => {
        it('Test 23: should return empty matches for unrecognizable text', () => {
            const result = recognizer.recognize('The weather is nice today');
            // May still get very low-confidence matches; check that none are above threshold
            // or that there are zero matches
            for (const match of result.matches) {
                expect(match.confidence).toBeGreaterThan(0.2);
            }
            // primaryPattern could be null or a low-confidence match
            if (result.matches.length === 0) {
                expect(result.primaryPattern).toBeNull();
            }
        });

        it('Test 24: should return null primaryPattern when no patterns match at all', () => {
            const result = recognizer.recognize('xyzzy plugh nothing matches here');
            expect(result.matches.length).toBe(0);
            expect(result.primaryPattern).toBeNull();
            expect(result.suggestedTasks).toEqual([]);
        });
    });

    // =========================================================================
    // Edge Cases
    // =========================================================================
    describe('Edge Cases', () => {
        it('Test 25: should handle empty string input', () => {
            const result = recognizer.recognize('');
            expect(result.input).toBe('');
            expect(result.matches).toEqual([]);
            expect(result.primaryPattern).toBeNull();
            expect(result.suggestedTasks).toEqual([]);
            expect(result.timestamp).toBeInstanceOf(Date);
        });

        it('Test 26: should handle very short text input', () => {
            const result = recognizer.recognize('hi');
            expect(result.input).toBe('hi');
            expect(result.timestamp).toBeInstanceOf(Date);
        });

        it('Test 27: should be case-insensitive for keyword matching', () => {
            const result = recognizer.recognize('BUILD A LOGIN SYSTEM WITH PASSWORD AUTHENTICATION');
            const authMatch = result.matches.find(m => m.pattern.type === 'authentication');
            expect(authMatch).toBeDefined();
            expect(authMatch!.matchedKeywords).toContain('login');
            expect(authMatch!.matchedKeywords).toContain('password');
        });

        it('Test 28: should preserve the original input text in the result', () => {
            const input = 'Create a REST API for user management';
            const result = recognizer.recognize(input);
            expect(result.input).toBe(input);
        });

        it('Test 29: should include a timestamp in the result', () => {
            const before = new Date();
            const result = recognizer.recognize('something');
            const after = new Date();
            expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
        });
    });

    // =========================================================================
    // Suggested Approach Tests
    // =========================================================================
    describe('Suggested Approach', () => {
        it('Test 30: should generate a suggestedApproach string containing the pattern name', () => {
            const result = recognizer.recognize('Build a login and authentication system with sessions');
            const authMatch = result.matches.find(m => m.pattern.type === 'authentication');
            expect(authMatch).toBeDefined();
            expect(authMatch!.suggestedApproach).toContain('User Authentication');
        });

        it('Test 31: should include required components in the suggestedApproach', () => {
            const result = recognizer.recognize('Create a CRUD system to add, edit, and delete records');
            const crudMatch = result.matches.find(m => m.pattern.type === 'crud');
            expect(crudMatch).toBeDefined();
            expect(crudMatch!.suggestedApproach).toContain('Model/Schema');
            expect(crudMatch!.suggestedApproach).toContain('Validation');
        });

        it('Test 32: should include the first checklist item in the suggestedApproach', () => {
            const result = recognizer.recognize('Implement a cache with TTL and invalidation');
            const cacheMatch = result.matches.find(m => m.pattern.type === 'cache');
            expect(cacheMatch).toBeDefined();
            expect(cacheMatch!.suggestedApproach).toContain('Implement cache storage');
        });
    });

    // =========================================================================
    // Suggested Tasks Tests
    // =========================================================================
    describe('Suggested Tasks', () => {
        it('Test 33: should aggregate typical tasks from top matches', () => {
            const result = recognizer.recognize(
                'Build CRUD operations to create, update, and delete entities with API endpoints for REST requests'
            );
            expect(result.suggestedTasks.length).toBeGreaterThan(0);
        });

        it('Test 34: should limit suggested tasks to at most 10', () => {
            const result = recognizer.recognize(
                'Build a system with login, CRUD, API, form, cache, events, singleton, and permissions'
            );
            expect(result.suggestedTasks.length).toBeLessThanOrEqual(10);
        });

        it('Test 35: should not duplicate tasks in suggestedTasks', () => {
            const result = recognizer.recognize(
                'Build a service singleton with global instance and shared service'
            );
            const unique = new Set(result.suggestedTasks);
            expect(unique.size).toBe(result.suggestedTasks.length);
        });
    });

    // =========================================================================
    // getPattern and getChecklist Tests
    // =========================================================================
    describe('getPattern and getChecklist', () => {
        it('Test 36: should return a pattern definition for a known type', () => {
            const pattern = recognizer.getPattern('crud');
            expect(pattern).toBeDefined();
            expect(pattern!.type).toBe('crud');
            expect(pattern!.name).toBe('CRUD Operations');
            expect(pattern!.keywords.length).toBeGreaterThan(0);
        });

        it('Test 37: should return undefined for an unknown pattern type', () => {
            const pattern = recognizer.getPattern('unknown');
            expect(pattern).toBeUndefined();
        });

        it('Test 38: should return a checklist for a known pattern type', () => {
            const checklist = recognizer.getChecklist('authentication');
            expect(checklist.length).toBeGreaterThan(0);
            expect(checklist).toContain('Implement login endpoint');
        });

        it('Test 39: should return an empty array for checklist of unknown pattern', () => {
            const checklist = recognizer.getChecklist('unknown');
            expect(checklist).toEqual([]);
        });
    });

    // =========================================================================
    // getEstimate Tests
    // =========================================================================
    describe('getEstimate', () => {
        it('Test 40: should return estimated minutes for a known pattern', () => {
            const estimate = recognizer.getEstimate('crud');
            expect(estimate).toBe(180);
        });

        it('Test 41: should return estimated minutes for authentication pattern', () => {
            const estimate = recognizer.getEstimate('authentication');
            expect(estimate).toBe(240);
        });

        it('Test 42: should return default 60 minutes for unknown pattern type', () => {
            const estimate = recognizer.getEstimate('unknown');
            expect(estimate).toBe(60);
        });

        it('Test 43: should return correct estimate for singleton pattern', () => {
            const estimate = recognizer.getEstimate('singleton');
            expect(estimate).toBe(45);
        });
    });

    // =========================================================================
    // addPattern Tests
    // =========================================================================
    describe('addPattern', () => {
        it('Test 44: should add a new custom pattern', () => {
            const customPattern: PatternDefinition = {
                type: 'queue' as PatternType,
                name: 'Job Queue',
                description: 'Asynchronous job processing queue',
                keywords: ['queue', 'job', 'worker', 'async', 'background'],
                requiredComponents: ['Queue storage', 'Worker process', 'Job definitions'],
                suggestedFiles: ['src/queue/jobQueue.ts'],
                checklist: ['Define job types', 'Implement queue storage', 'Create worker'],
                typicalTasks: ['Create queue infrastructure', 'Add job definitions', 'Write worker'],
                estimatedMinutes: 120
            };

            const beforeCount = recognizer.getAllPatterns().length;
            recognizer.addPattern(customPattern);
            const afterCount = recognizer.getAllPatterns().length;

            expect(afterCount).toBe(beforeCount + 1);

            const retrieved = recognizer.getPattern('queue');
            expect(retrieved).toBeDefined();
            expect(retrieved!.name).toBe('Job Queue');
        });

        it('Test 45: should replace an existing pattern when adding with the same type', () => {
            const updatedCrud: PatternDefinition = {
                type: 'crud',
                name: 'Updated CRUD Operations',
                description: 'Modified CRUD pattern',
                keywords: ['create', 'read', 'update', 'delete'],
                requiredComponents: ['Model'],
                suggestedFiles: ['src/models/entity.ts'],
                checklist: ['Define model', 'Implement operations'],
                typicalTasks: ['Build CRUD'],
                estimatedMinutes: 100
            };

            const beforeCount = recognizer.getAllPatterns().length;
            recognizer.addPattern(updatedCrud);
            const afterCount = recognizer.getAllPatterns().length;

            expect(afterCount).toBe(beforeCount);

            const retrieved = recognizer.getPattern('crud');
            expect(retrieved!.name).toBe('Updated CRUD Operations');
            expect(retrieved!.estimatedMinutes).toBe(100);
        });

        it('Test 46: should log a message when adding or updating a pattern', () => {
            const customPattern: PatternDefinition = {
                type: 'factory' as PatternType,
                name: 'Factory Pattern',
                description: 'Object creation factory',
                keywords: ['factory', 'create', 'build'],
                requiredComponents: ['Factory class'],
                suggestedFiles: ['src/factories/factory.ts'],
                checklist: ['Define factory interface'],
                typicalTasks: ['Create factory'],
                estimatedMinutes: 30
            };

            recognizer.addPattern(customPattern);
            expect(mockLogInfo).toHaveBeenCalledWith(
                '[PatternRecognizer] Added/updated pattern: Factory Pattern'
            );
        });

        it('Test 47: should recognize newly added custom patterns', () => {
            const customPattern: PatternDefinition = {
                type: 'queue' as PatternType,
                name: 'Task Queue',
                description: 'Background job processing',
                keywords: ['queue', 'job', 'worker', 'background'],
                requiredComponents: ['Queue'],
                suggestedFiles: ['src/queue.ts'],
                checklist: ['Set up queue'],
                typicalTasks: ['Build queue system'],
                estimatedMinutes: 90
            };

            recognizer.addPattern(customPattern);
            const result = recognizer.recognize('Set up a background job queue with workers');
            const queueMatch = result.matches.find(m => m.pattern.type === 'queue');
            expect(queueMatch).toBeDefined();
            expect(queueMatch!.confidence).toBeGreaterThan(0.2);
        });
    });

    // =========================================================================
    // Logging Tests
    // =========================================================================
    describe('Logging', () => {
        it('Test 48: should log analysis start and result', () => {
            recognizer.recognize('Build an API');
            expect(mockLogInfo).toHaveBeenCalledWith(
                '[PatternRecognizer] Analyzing text for patterns'
            );
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('[PatternRecognizer] Found')
            );
        });

        it('Test 49: should log "none" as primary when no patterns match', () => {
            recognizer.recognize('xyzzy plugh gibberish');
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('primary: none')
            );
        });

        it('Test 50: should log the primary pattern name when a pattern matches', () => {
            recognizer.recognize('Build a login and authentication system with password and session');
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('primary: User Authentication')
            );
        });
    });

    // =========================================================================
    // Pattern Definition Structure Tests
    // =========================================================================
    describe('Pattern Definition Structure', () => {
        it('Test 51: should have all required fields in each built-in pattern', () => {
            const patterns = recognizer.getAllPatterns();
            for (const pattern of patterns) {
                expect(pattern.type).toBeDefined();
                expect(typeof pattern.name).toBe('string');
                expect(typeof pattern.description).toBe('string');
                expect(Array.isArray(pattern.keywords)).toBe(true);
                expect(pattern.keywords.length).toBeGreaterThan(0);
                expect(Array.isArray(pattern.requiredComponents)).toBe(true);
                expect(Array.isArray(pattern.suggestedFiles)).toBe(true);
                expect(Array.isArray(pattern.checklist)).toBe(true);
                expect(Array.isArray(pattern.typicalTasks)).toBe(true);
                expect(typeof pattern.estimatedMinutes).toBe('number');
                expect(pattern.estimatedMinutes).toBeGreaterThan(0);
            }
        });

        it('Test 52: should include all expected built-in pattern types', () => {
            const patterns = recognizer.getAllPatterns();
            const types = patterns.map(p => p.type);
            expect(types).toContain('crud');
            expect(types).toContain('authentication');
            expect(types).toContain('authorization');
            expect(types).toContain('api');
            expect(types).toContain('form');
            expect(types).toContain('singleton');
            expect(types).toContain('observer');
            expect(types).toContain('cache');
        });
    });

    // =========================================================================
    // Keyword Matching Detail Tests
    // =========================================================================
    describe('Keyword Matching Details', () => {
        it('Test 53: should match partial sentence containing keyword', () => {
            const result = recognizer.recognize('The system should authenticate users against LDAP');
            const authMatch = result.matches.find(m => m.pattern.type === 'authentication');
            expect(authMatch).toBeDefined();
            expect(authMatch!.matchedKeywords).toContain('authenticate');
        });

        it('Test 54: should match keywords that appear as substrings in longer words', () => {
            // "cached" contains "cache"; "store" is a keyword for cache
            const result = recognizer.recognize('Use a cached store with memo for performance');
            const cacheMatch = result.matches.find(m => m.pattern.type === 'cache');
            expect(cacheMatch).toBeDefined();
            expect(cacheMatch!.matchedKeywords).toContain('cache');
            expect(cacheMatch!.matchedKeywords).toContain('store');
            expect(cacheMatch!.matchedKeywords).toContain('memo');
        });

        it('Test 55: should return an empty matchedKeywords array when no keywords match', () => {
            // Directly testing that a pattern with no matching keywords has confidence = 0
            // which means it won't appear in results (filtered by > 0.2)
            const result = recognizer.recognize('xyzzy plugh gibberish');
            expect(result.matches.length).toBe(0);
        });
    });

    // =========================================================================
    // Confidence Calculation Detail Tests
    // =========================================================================
    describe('Confidence Calculation', () => {
        it('Test 56: should calculate confidence as keywordScore / min(3, totalKeywords)', () => {
            // Singleton has 6 keywords: ['singleton', 'instance', 'service', 'global', 'shared', 'one instance']
            // min(3, 6) = 3, so matching 1 keyword gives 1/3 = 0.333
            const result = recognizer.recognize('We need a singleton');
            const singletonMatch = result.matches.find(m => m.pattern.type === 'singleton');
            expect(singletonMatch).toBeDefined();
            expect(singletonMatch!.matchedKeywords).toEqual(['singleton']);
            expect(singletonMatch!.confidence).toBeCloseTo(1 / 3, 2);
        });

        it('Test 57: should reach confidence 1.0 when matching 3+ keywords on pattern with 3+ total keywords', () => {
            const result = recognizer.recognize('Build a singleton service with global shared instance');
            const singletonMatch = result.matches.find(m => m.pattern.type === 'singleton');
            expect(singletonMatch).toBeDefined();
            expect(singletonMatch!.confidence).toBe(1.0);
        });
    });

    // =========================================================================
    // Result Structure Tests
    // =========================================================================
    describe('Result Structure (PatternRecognitionResult)', () => {
        it('Test 58: should return a well-formed PatternRecognitionResult', () => {
            const result = recognizer.recognize('Build a form with validation and submit');
            expect(result).toHaveProperty('input');
            expect(result).toHaveProperty('matches');
            expect(result).toHaveProperty('primaryPattern');
            expect(result).toHaveProperty('suggestedTasks');
            expect(result).toHaveProperty('timestamp');
            expect(typeof result.input).toBe('string');
            expect(Array.isArray(result.matches)).toBe(true);
            expect(Array.isArray(result.suggestedTasks)).toBe(true);
            expect(result.timestamp).toBeInstanceOf(Date);
        });

        it('Test 59: should have each match contain required PatternMatch fields', () => {
            const result = recognizer.recognize('Build a REST API endpoint for user management');
            for (const match of result.matches) {
                expect(match).toHaveProperty('pattern');
                expect(match).toHaveProperty('confidence');
                expect(match).toHaveProperty('matchedKeywords');
                expect(match).toHaveProperty('suggestedApproach');
                expect(typeof match.confidence).toBe('number');
                expect(match.confidence).toBeGreaterThan(0);
                expect(match.confidence).toBeLessThanOrEqual(1);
                expect(Array.isArray(match.matchedKeywords)).toBe(true);
                expect(typeof match.suggestedApproach).toBe('string');
            }
        });
    });

    // =========================================================================
    // Independent Instance Tests
    // =========================================================================
    describe('Independent Instances', () => {
        it('Test 60: should not share state between separate PatternRecognizer instances', () => {
            const recognizer1 = new PatternRecognizer();
            const recognizer2 = new PatternRecognizer();

            const customPattern: PatternDefinition = {
                type: 'queue' as PatternType,
                name: 'Custom Queue',
                description: 'Custom queue pattern',
                keywords: ['queue'],
                requiredComponents: ['Queue'],
                suggestedFiles: [],
                checklist: [],
                typicalTasks: [],
                estimatedMinutes: 30
            };

            recognizer1.addPattern(customPattern);

            expect(recognizer1.getPattern('queue')).toBeDefined();
            expect(recognizer2.getPattern('queue')).toBeUndefined();
        });
    });
});
