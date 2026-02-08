/**
 * Tests for Planning Wizard HTML Generation
 *
 * This file tests the wizardHtml.ts module which generates the complete
 * HTML template for the Planning Wizard webview including styles, scripts,
 * and page routing.
 *
 * **Simple explanation**: Tests the "view" generator that creates
 * the wizard's visual HTML structure and embedded JavaScript handlers.
 */

import { generateWizardHTML } from '../../src/ui/wizardHtml';
import { WizardState, CompletePlan, PriorityLevel, WizardPage } from '../../src/planning/types';
import * as Pages from '../../src/ui/wizardPages';

// Mock the wizardPages module
jest.mock('../../src/ui/wizardPages', () => ({
    renderPage1Overview: jest.fn().mockReturnValue('<div>Page 1 Overview Content</div>'),
    renderPage2Features: jest.fn().mockReturnValue('<div>Page 2 Features Content</div>'),
    renderPage3Linking: jest.fn().mockReturnValue('<div>Page 3 Linking Content</div>'),
    renderPage4UserStories: jest.fn().mockReturnValue('<div>Page 4 User Stories Content</div>'),
    renderPage5DevStories: jest.fn().mockReturnValue('<div>Page 5 Dev Stories Content</div>'),
    renderPage6SuccessCriteria: jest.fn().mockReturnValue('<div>Page 6 Success Criteria Content</div>'),
}));

describe('wizardHtml', () => {
    // ============================================================================
    // Test Data Factories
    // ============================================================================

    function createMinimalPlan(): Partial<CompletePlan> {
        return {
            metadata: {
                id: 'plan-1',
                name: 'Test Plan',
                version: 1,
                createdAt: new Date('2024-01-01T00:00:00Z'),
                updatedAt: new Date('2024-01-01T00:00:00Z'),
            },
        };
    }

    function createCompletePlan(): Partial<CompletePlan> {
        return {
            metadata: {
                id: 'plan-complete',
                name: 'Complete Test Plan',
                version: 2,
                createdAt: new Date('2024-01-01T00:00:00Z'),
                updatedAt: new Date('2024-01-15T00:00:00Z'),
            },
            overview: {
                name: 'My Project',
                description: 'A comprehensive project plan',
                goals: ['Goal 1', 'Goal 2', 'Goal 3'],
            },
            featureBlocks: [
                {
                    id: 'feature-1',
                    name: 'Feature One',
                    description: 'First feature',
                    purpose: 'Core functionality',
                    acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
                    technicalNotes: 'Implementation notes',
                    priority: 'high' as PriorityLevel,
                    order: 1,
                },
                {
                    id: 'feature-2',
                    name: 'Feature Two',
                    description: 'Second feature',
                    purpose: 'Enhanced functionality',
                    acceptanceCriteria: ['Criteria A'],
                    technicalNotes: 'More notes',
                    priority: 'medium' as PriorityLevel,
                    order: 2,
                },
            ],
            userStories: [
                {
                    id: 'us-1',
                    userType: 'developer',
                    action: 'write tests',
                    benefit: 'ensure code quality',
                    relatedBlockIds: ['feature-1'],
                    acceptanceCriteria: ['Tests pass'],
                    priority: 'high' as PriorityLevel,
                },
            ],
            developerStories: [
                {
                    id: 'ds-1',
                    action: 'Implement core logic',
                    benefit: 'Enable feature functionality',
                    technicalRequirements: ['Use TDD approach'],
                    apiNotes: '',
                    databaseNotes: '',
                    estimatedHours: 8,
                    relatedBlockIds: ['feature-1'],
                    relatedTaskIds: [],
                },
            ],
            successCriteria: [
                {
                    id: 'sc-1',
                    description: '80% test coverage',
                    smartAttributes: {
                        specific: true,
                        measurable: true,
                        achievable: true,
                        relevant: true,
                        timeBound: false,
                    },
                    relatedFeatureIds: ['feature-1'],
                    relatedStoryIds: [],
                    testable: true,
                    priority: 'high' as PriorityLevel,
                },
            ],
        };
    }

    function createWizardState(page: WizardPage | string, plan?: Partial<CompletePlan>): WizardState {
        return {
            currentPage: page as WizardPage,
            plan: plan || createMinimalPlan(),
            isDirty: false,
        };
    }

    const testNonce = 'test-nonce-12345';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ============================================================================
    // Basic HTML Structure Tests
    // ============================================================================

    describe('generateWizardHTML - Basic Structure', () => {
        it('Test 1: should generate valid HTML document', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<html lang="en">');
            expect(html).toContain('<head>');
            expect(html).toContain('<body>');
            expect(html).toContain('</html>');
        });

        it('Test 2: should include meta charset and viewport', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('<meta charset="UTF-8"');
            expect(html).toContain('name="viewport"');
            expect(html).toContain('width=device-width');
        });

        it('Test 3: should include Planning Wizard title', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('<title>Planning Wizard</title>');
        });

        it('Test 4: should include wizard-container div', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('class="wizard-container"');
        });

        it('Test 5: should include nonce in script tag', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain(`<script nonce="${testNonce}">`);
        });

        it('Test 6: should serialize wizardState into script', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('let wizardState = ');
            expect(html).toContain('"currentPage":"overview"');
        });
    });

    // ============================================================================
    // CSS Styles Tests
    // ============================================================================

    describe('generateWizardHTML - CSS Styles', () => {
        it('Test 7: should include style tag with CSS', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('<style>');
            expect(html).toContain('</style>');
        });

        it('Test 8: should include CSS reset styles', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('* {');
            expect(html).toContain('margin: 0');
            expect(html).toContain('padding: 0');
            expect(html).toContain('box-sizing: border-box');
        });

        it('Test 9: should include VS Code CSS variables', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('var(--vscode-editor-background)');
            expect(html).toContain('var(--vscode-editor-foreground)');
        });

        it('Test 10: should include wizard-header styles', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('.wizard-header');
            expect(html).toContain('.progress-bar');
            expect(html).toContain('.progress-step');
        });

        it('Test 11: should include button styles', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('.btn-primary');
            expect(html).toContain('.btn-secondary');
        });

        it('Test 12: should include form section styles', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('.form-section');
            expect(html).toContain('.form-actions');
        });

        it('Test 13: should include page content styles', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('.page-content');
            expect(html).toContain('.page-subtitle');
        });
    });

    // ============================================================================
    // Progress Bar Tests
    // ============================================================================

    describe('generateWizardHTML - Progress Bar', () => {
        it('Test 14: should render 7 progress steps for 7 pages', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            // Count progress-step occurrences
            const matches = html.match(/class="progress-step/g);
            expect(matches).toHaveLength(7);
        });

        it('Test 15: should mark first step as active on overview page', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            // First step should be active, not completed
            expect(html).toContain('class="progress-step active "');
        });

        it('Test 16: should mark previous steps as completed', () => {
            const state = createWizardState('features'); // Page 2
            const html = generateWizardHTML(state, testNonce);

            // First step should be completed, second should be active
            expect(html).toContain('class="progress-step  completed"');
            expect(html).toContain('class="progress-step active "');
        });

        it('Test 17: should show page indicator with current step', () => {
            const state = createWizardState('userStories'); // Page 4
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('class="page-indicator"');
            expect(html).toContain('<strong>4</strong> of <strong>7</strong>');
        });

        it('Test 18: should include validation status placeholder', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('id="validationStatus"');
        });
    });

    // ============================================================================
    // Page Routing Tests
    // ============================================================================

    describe('generateWizardHTML - Page Routing', () => {
        it('Test 19: should call renderPage1Overview for overview page', () => {
            const state = createWizardState('overview');
            generateWizardHTML(state, testNonce);

            expect(Pages.renderPage1Overview).toHaveBeenCalledWith(state.plan);
            expect(Pages.renderPage2Features).not.toHaveBeenCalled();
        });

        it('Test 20: should call renderPage2Features for features page', () => {
            const state = createWizardState('features');
            generateWizardHTML(state, testNonce);

            expect(Pages.renderPage2Features).toHaveBeenCalledWith(state.plan);
        });

        it('Test 21: should call renderPage3Linking for linking page', () => {
            const state = createWizardState('linking');
            generateWizardHTML(state, testNonce);

            expect(Pages.renderPage3Linking).toHaveBeenCalledWith(state.plan);
        });

        it('Test 22: should call renderPage4UserStories for userStories page', () => {
            const state = createWizardState('userStories');
            generateWizardHTML(state, testNonce);

            expect(Pages.renderPage4UserStories).toHaveBeenCalledWith(state.plan);
        });

        it('Test 23: should call renderPage5DevStories for devStories page', () => {
            const state = createWizardState('devStories');
            generateWizardHTML(state, testNonce);

            expect(Pages.renderPage5DevStories).toHaveBeenCalledWith(state.plan);
        });

        it('Test 24: should call renderPage6SuccessCriteria for criteria page', () => {
            const state = createWizardState('criteria');
            generateWizardHTML(state, testNonce);

            expect(Pages.renderPage6SuccessCriteria).toHaveBeenCalledWith(state.plan);
        });

        it('Test 25: should render page 7 review inline', () => {
            const state = createWizardState('review', createCompletePlan());
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('📋 Review & Export');
            expect(html).toContain('class="review-section"');
        });

        it('Test 26: should render unknown page fallback', () => {
            const state = createWizardState('invalidPage');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('<p>Unknown page</p>');
        });

        it('Test 27: should include page content in pageContent div', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('id="pageContent"');
            expect(html).toContain('<div>Page 1 Overview Content</div>');
        });
    });

    // ============================================================================
    // Navigation Button Tests
    // ============================================================================

    describe('generateWizardHTML - Navigation Buttons', () => {
        it('Test 28: should disable Previous button on first page', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toMatch(/onclick="previousPage\(\)"[^>]*disabled/);
        });

        it('Test 29: should enable Previous button on subsequent pages', () => {
            const state = createWizardState('features');
            const html = generateWizardHTML(state, testNonce);

            // Previous button should NOT be disabled
            const prevButtonMatch = html.match(/<button[^>]*onclick="previousPage\(\)"[^>]*>/);
            expect(prevButtonMatch![0]).not.toContain('disabled');
        });

        it('Test 30: should show Next button on non-final pages', () => {
            const state = createWizardState('features');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('onclick="nextPage()"');
            // Next button should not have display:none
            const nextButtonMatch = html.match(/<button[^>]*onclick="nextPage\(\)"[^>]*>/);
            expect(nextButtonMatch![0]).not.toContain('display:none');
        });

        it('Test 31: should hide Next button on final page', () => {
            const state = createWizardState('review');
            const html = generateWizardHTML(state, testNonce);

            // Next button should have display:none
            expect(html).toMatch(/onclick="nextPage\(\)"[^>]*style="display:none"/);
        });

        it('Test 32: should hide Finish button on non-final pages', () => {
            const state = createWizardState('features');
            const html = generateWizardHTML(state, testNonce);

            // Finish button should have display:none
            expect(html).toMatch(/onclick="finishPlan\(\)"[^>]*style="display:none"/);
        });

        it('Test 33: should show Finish button on final page', () => {
            const state = createWizardState('review');
            const html = generateWizardHTML(state, testNonce);

            // Finish button should NOT have display:none
            const finishButtonMatch = html.match(/<button[^>]*onclick="finishPlan\(\)"[^>]*>/);
            expect(finishButtonMatch![0]).not.toContain('display:none');
        });

        it('Test 34: should include Save Draft button on all pages', () => {
            const pages = ['overview', 'features', 'linking', 'userStories', 'devStories', 'criteria', 'review'];

            for (const page of pages) {
                const state = createWizardState(page);
                const html = generateWizardHTML(state, testNonce);
                expect(html).toContain('onclick="saveDraft()"');
                expect(html).toContain('💾 Save Draft');
            }
        });
    });

    // ============================================================================
    // JavaScript Functions Tests
    // ============================================================================

    describe('generateWizardHTML - JavaScript Functions', () => {
        it('Test 35: should include vscode API acquisition', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('const vscode = acquireVsCodeApi()');
        });

        it('Test 36: should include nextPage function', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('async function nextPage()');
            expect(html).toContain("command: 'pageChanged'");
        });

        it('Test 37: should include previousPage function', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('function previousPage()');
        });

        it('Test 38: should include onFieldChange function', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('function onFieldChange(fieldPath, value)');
        });

        it('Test 39: should include updateCounter function', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('function updateCounter(elementId, length)');
        });

        it('Test 40: should include addGoal function', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('function addGoal()');
        });

        it('Test 41: should include removeGoal function', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('function removeGoal(index)');
        });

        it('Test 42: should include updateGoal function', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('function updateGoal(index, value)');
        });

        it('Test 43: should include validateCurrentPage function', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('async function validateCurrentPage()');
        });

        it('Test 44: should include saveDraft function', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('async function saveDraft()');
            expect(html).toContain("command: 'saveDraft'");
        });

        it('Test 45: should include finishPlan function', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('async function finishPlan()');
            expect(html).toContain("command: 'finishPlan'");
        });

        it('Test 46: should include refreshPage function', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('function refreshPage()');
            expect(html).toContain("command: 'refreshPage'");
        });

        it('Test 47: should include showError function', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('function showError(message)');
            expect(html).toContain('var(--vscode-errorForeground)');
        });

        it('Test 48: should include showSuccess function', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('function showSuccess(message)');
            expect(html).toContain('var(--vscode-testing-iconPassed)');
        });

        it('Test 49: should include message event listener', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain("window.addEventListener('message'");
            expect(html).toContain("case 'draftSaved':");
            expect(html).toContain("case 'planCompleted':");
            expect(html).toContain("case 'error':");
        });
    });

    // ============================================================================
    // Page 7 Review Tests
    // ============================================================================

    describe('generateWizardHTML - Page 7 Review', () => {
        it('Test 50: should display project overview section', () => {
            const plan = createCompletePlan();
            const state = createWizardState('review', plan);
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('Project Overview');
            expect(html).toContain('My Project');
            expect(html).toContain('A comprehensive project plan');
        });

        it('Test 51: should display goals list', () => {
            const plan = createCompletePlan();
            const state = createWizardState('review', plan);
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('Goals');
            expect(html).toContain('• Goal 1');
            expect(html).toContain('• Goal 2');
            expect(html).toContain('• Goal 3');
        });

        it('Test 52: should display summary counts', () => {
            const plan = createCompletePlan();
            const state = createWizardState('review', plan);
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('2 feature blocks');
            expect(html).toContain('1 user stories');
            expect(html).toContain('1 developer stories');
            expect(html).toContain('1 success criteria');
        });

        it('Test 53: should display export options', () => {
            const plan = createCompletePlan();
            const state = createWizardState('review', plan);
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('Export Format');
            expect(html).toContain("onclick=\"exportPlan('json')\"");
            expect(html).toContain("onclick=\"exportPlan('markdown')\"");
            expect(html).toContain("onclick=\"exportPlan('yaml')\"");
            expect(html).toContain("onclick=\"exportPlan('pdf')\"");
        });

        it('Test 54: should handle missing overview gracefully', () => {
            const plan = createMinimalPlan();
            const state = createWizardState('review', plan);
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('Not specified');
        });

        it('Test 55: should handle empty goals array', () => {
            const plan = createMinimalPlan();
            plan.overview = {
                name: 'Test',
                description: 'Test desc',
                goals: [],
            };
            const state = createWizardState('review', plan);
            const html = generateWizardHTML(state, testNonce);

            // Goals section should not be rendered with empty array
            expect(html).not.toContain('class="review-list"');
        });

        it('Test 56: should handle undefined arrays with 0 count', () => {
            const plan = createMinimalPlan();
            const state = createWizardState('review', plan);
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('0 feature blocks');
            expect(html).toContain('0 user stories');
            expect(html).toContain('0 developer stories');
            expect(html).toContain('0 success criteria');
        });
    });

    // ============================================================================
    // State Serialization Tests
    // ============================================================================

    describe('generateWizardHTML - State Serialization', () => {
        it('Test 57: should serialize complete plan to JSON', () => {
            const plan = createCompletePlan();
            const state = createWizardState('overview', plan);
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('"featureBlocks"');
            expect(html).toContain('"userStories"');
            expect(html).toContain('"developerStories"');
        });

        it('Test 58: should escape special characters in JSON', () => {
            const plan = createMinimalPlan();
            plan.overview = {
                name: 'Test "Project"',
                description: 'Description with <script>alert("xss")</script>',
                goals: [],
            };
            const state = createWizardState('overview', plan);
            const html = generateWizardHTML(state, testNonce);

            // JSON.stringify handles escaping
            expect(html).toContain('\\"Project\\"');
        });

        it('Test 59: should preserve currentPage in state', () => {
            const state = createWizardState('linking');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('"currentPage":"linking"');
        });

        it('Test 60: should preserve isDirty flag', () => {
            const state = createWizardState('overview');
            state.isDirty = true;
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('"isDirty":true');
        });
    });

    // ============================================================================
    // Accessibility Tests
    // ============================================================================

    describe('generateWizardHTML - Accessibility', () => {
        it('Test 61: should include html lang attribute', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('<html lang="en">');
        });

        it('Test 62: should include button type attributes', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toMatch(/<button\s+type="button"/);
        });

        it('Test 63: should have descriptive button labels', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('← Previous');
            expect(html).toContain('Next →');
            expect(html).toContain('✓ Finish');
        });
    });

    // ============================================================================
    // Edge Cases Tests
    // ============================================================================

    describe('generateWizardHTML - Edge Cases', () => {
        it('Test 64: should handle empty nonce gracefully', () => {
            const state = createWizardState('overview');
            const html = generateWizardHTML(state, '');

            expect(html).toContain('<script nonce="">');
        });

        it('Test 65: should handle very long nonce', () => {
            const state = createWizardState('overview');
            const longNonce = 'a'.repeat(100);
            const html = generateWizardHTML(state, longNonce);

            expect(html).toContain(`<script nonce="${longNonce}">`);
        });

        it('Test 66: should handle special characters in plan data', () => {
            const plan = createMinimalPlan();
            plan.overview = {
                name: 'Test & <Project>',
                description: "Description's \"special\" chars",
                goals: ['Goal with emoji 🎯'],
            };
            const state = createWizardState('overview', plan);

            // Should not throw
            expect(() => generateWizardHTML(state, testNonce)).not.toThrow();
        });

        it('Test 67: should handle all page indices correctly', () => {
            const pageMap = ['overview', 'features', 'linking', 'userStories', 'devStories', 'criteria', 'review'];

            for (let i = 0; i < pageMap.length; i++) {
                const state = createWizardState(pageMap[i]);
                const html = generateWizardHTML(state, testNonce);

                // Should show correct step number
                expect(html).toContain(`<strong>${i + 1}</strong> of <strong>7</strong>`);
            }
        });

        it('Test 68: should handle deeply nested plan data', () => {
            const plan = createCompletePlan();
            // Add some extra properties to metadata which accepts any structure
            const state = createWizardState('overview', plan);

            expect(() => generateWizardHTML(state, testNonce)).not.toThrow();
        });

        it('Test 69: should handle large arrays gracefully', () => {
            const plan = createCompletePlan();
            plan.featureBlocks = [];
            for (let i = 0; i < 100; i++) {
                plan.featureBlocks.push({
                    id: `feature-${i}`,
                    name: `Feature ${i}`,
                    description: `Description ${i}`,
                    purpose: `Purpose ${i}`,
                    acceptanceCriteria: [],
                    technicalNotes: '',
                    priority: 'low' as PriorityLevel,
                    order: i,
                });
            }
            const state = createWizardState('review', plan);
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('100 feature blocks');
        });

        it('Test 70: should handle unicode in plan data', () => {
            const plan = createMinimalPlan();
            plan.overview = {
                name: '项目测试 プロジェクト',
                description: 'مشروع الاختبار',
                goals: ['🎯 Goal', '✅ Complete'],
            };
            const state = createWizardState('review', plan);
            const html = generateWizardHTML(state, testNonce);

            expect(html).toContain('项目测试');
            expect(html).toContain('مشروع الاختبار');
        });
    });

    // ============================================================================
    // Integration Tests
    // ============================================================================

    describe('generateWizardHTML - Integration', () => {
        it('Test 71: should generate consistent HTML for same state', () => {
            const state = createWizardState('features', createCompletePlan());

            const html1 = generateWizardHTML(state, testNonce);
            const html2 = generateWizardHTML(state, testNonce);

            expect(html1).toBe(html2);
        });

        it('Test 72: should use unique nonce per call', () => {
            const state = createWizardState('overview');

            const html1 = generateWizardHTML(state, 'nonce-1');
            const html2 = generateWizardHTML(state, 'nonce-2');

            expect(html1).toContain('nonce="nonce-1"');
            expect(html2).toContain('nonce="nonce-2"');
            expect(html1).not.toBe(html2);
        });

        it('Test 73: should serialize JSON data in script context', () => {
            const plan = createMinimalPlan();
            plan.overview = {
                name: 'Test Project',
                description: 'Normal description',
                goals: ['Goal 1'],
            };
            const state = createWizardState('overview', plan);
            const html = generateWizardHTML(state, testNonce);

            // JSON.stringify produces valid JSON inside script
            expect(html).toContain('"currentPage":"overview"');
            expect(html).toContain('"name":"Test Project"');
        });

        it('Test 74: should render complete workflow from start to finish', () => {
            const pages = ['overview', 'features', 'linking', 'userStories', 'devStories', 'criteria', 'review'];

            for (const page of pages) {
                const state = createWizardState(page, createCompletePlan());
                const html = generateWizardHTML(state, testNonce);

                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('</html>');
                expect(html).toContain('wizard-container');
            }
        });

        it('Test 75: should pass plan to page renderers correctly', () => {
            const plan = createCompletePlan();
            const state = createWizardState('features', plan);
            generateWizardHTML(state, testNonce);

            expect(Pages.renderPage2Features).toHaveBeenCalledTimes(1);
            expect(Pages.renderPage2Features).toHaveBeenCalledWith(plan);
        });
    });
});
