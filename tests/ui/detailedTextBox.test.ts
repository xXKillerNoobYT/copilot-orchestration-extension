/**
 * Tests for Detailed Text Box Component (MT-033.9)
 *
 * Unit tests for the rich text input component with character counter,
 * markdown preview, undo/redo, and auto-save support.
 */

import {
    renderDetailedTextBox,
    getDetailedTextBoxStyles,
    getDetailedTextBoxScript,
    DetailedTextBoxOptions,
    TextBoxState,
    TEXT_BOX_DEFAULTS,
} from '../../src/ui/detailedTextBox';

// ============================================================================
// Constants and Types Tests
// ============================================================================

describe('DetailedTextBox', () => {
    describe('TEXT_BOX_DEFAULTS', () => {
        it('Test 1: should have MAX_LENGTH of 2000', () => {
            expect(TEXT_BOX_DEFAULTS.MAX_LENGTH).toBe(2000);
        });

        it('Test 2: should have MIN_HEIGHT of 100', () => {
            expect(TEXT_BOX_DEFAULTS.MIN_HEIGHT).toBe(100);
        });

        it('Test 3: should have MAX_UNDO_STEPS of 50', () => {
            expect(TEXT_BOX_DEFAULTS.MAX_UNDO_STEPS).toBe(50);
        });

        it('Test 4: should have AUTO_SAVE_DELAY_MS of 1000', () => {
            expect(TEXT_BOX_DEFAULTS.AUTO_SAVE_DELAY_MS).toBe(1000);
        });
    });

    describe('DetailedTextBoxOptions interface', () => {
        it('Test 5: should accept minimal required options', () => {
            const options: DetailedTextBoxOptions = {
                id: 'test-box',
                label: 'Test Label',
                value: '',
                fieldPath: 'test.field',
            };

            expect(options.id).toBe('test-box');
            expect(options.value).toBe('');
        });

        it('Test 6: should accept all optional options', () => {
            const options: DetailedTextBoxOptions = {
                id: 'full-box',
                label: 'Full Label',
                value: 'Some text',
                placeholder: 'Enter text...',
                maxLength: 500,
                minHeight: 200,
                enableMarkdown: true,
                enableUndoRedo: true,
                fieldPath: 'overview.description',
                required: true,
                hint: 'This is a hint',
                error: 'This is an error',
            };

            expect(options.maxLength).toBe(500);
            expect(options.required).toBe(true);
        });
    });

    describe('TextBoxState interface', () => {
        it('Test 7: should define valid state structure', () => {
            const state: TextBoxState = {
                value: 'Current value',
                undoStack: ['Previous value'],
                redoStack: [],
                showPreview: false,
                lastSaved: 'Saved value',
            };

            expect(state.undoStack.length).toBe(1);
            expect(state.showPreview).toBe(false);
        });
    });

    // ========================================================================
    // renderDetailedTextBox Tests
    // ========================================================================

    describe('renderDetailedTextBox', () => {
        const baseOptions: DetailedTextBoxOptions = {
            id: 'test-textbox',
            label: 'Test Label',
            value: 'Initial value',
            fieldPath: 'overview.name',
        };

        it('Test 8: should render basic HTML structure', () => {
            const html = renderDetailedTextBox(baseOptions);

            expect(html).toContain('<div class="detailed-textbox"');
            expect(html).toContain('id="test-textbox-container"');
        });

        it('Test 9: should include label', () => {
            const html = renderDetailedTextBox(baseOptions);

            expect(html).toContain('Test Label');
        });

        it('Test 10: should include textarea with correct id', () => {
            const html = renderDetailedTextBox(baseOptions);

            expect(html).toContain('<textarea');
            expect(html).toContain('id="test-textbox"');
        });

        it('Test 11: should escape HTML in value', () => {
            const options: DetailedTextBoxOptions = {
                ...baseOptions,
                value: '<script>alert("XSS")</script>',
            };
            const html = renderDetailedTextBox(options);

            expect(html).not.toContain('<script>');
            expect(html).toContain('&lt;script&gt;');
        });

        it('Test 12: should include character counter', () => {
            const options: DetailedTextBoxOptions = {
                ...baseOptions,
                value: 'Hello',
                maxLength: 100,
            };
            const html = renderDetailedTextBox(options);

            expect(html).toContain('5');
            expect(html).toContain('100');
        });

        it('Test 13: should mark as over limit when exceeded', () => {
            const options: DetailedTextBoxOptions = {
                ...baseOptions,
                value: 'This is a long value',
                maxLength: 5,
            };
            const html = renderDetailedTextBox(options);

            expect(html).toContain('over-limit');
        });

        it('Test 14: should include placeholder', () => {
            const options: DetailedTextBoxOptions = {
                ...baseOptions,
                placeholder: 'Enter description...',
            };
            const html = renderDetailedTextBox(options);

            expect(html).toContain('placeholder="Enter description..."');
        });

        it('Test 15: should set min-height style', () => {
            const options: DetailedTextBoxOptions = {
                ...baseOptions,
                minHeight: 250,
            };
            const html = renderDetailedTextBox(options);

            expect(html).toContain('min-height: 250px');
        });

        it('Test 16: should include undo button when enabled', () => {
            const options: DetailedTextBoxOptions = {
                ...baseOptions,
                enableUndoRedo: true,
            };
            const html = renderDetailedTextBox(options);

            expect(html).toContain('undo');
        });

        it('Test 17: should include redo button when enabled', () => {
            const options: DetailedTextBoxOptions = {
                ...baseOptions,
                enableUndoRedo: true,
            };
            const html = renderDetailedTextBox(options);

            expect(html).toContain('redo');
        });

        it('Test 18: should hide undo/redo when disabled', () => {
            const options: DetailedTextBoxOptions = {
                ...baseOptions,
                enableUndoRedo: false,
            };
            const html = renderDetailedTextBox(options);

            // Check if undo/redo section is excluded or hidden
            expect(html).not.toMatch(/class=".*undo-redo.*"[^>]*>[^<]/);
        });

        it('Test 19: should include markdown preview toggle when enabled', () => {
            const options: DetailedTextBoxOptions = {
                ...baseOptions,
                enableMarkdown: true,
            };
            const html = renderDetailedTextBox(options);

            expect(html).toContain('preview');
        });

        it('Test 20: should hide markdown when disabled', () => {
            const options: DetailedTextBoxOptions = {
                ...baseOptions,
                enableMarkdown: false,
            };
            const html = renderDetailedTextBox(options);

            // Markdown preview option should not be visible
            expect(html).not.toContain('toggle-preview');
        });

        it('Test 21: should mark required fields', () => {
            const options: DetailedTextBoxOptions = {
                ...baseOptions,
                required: true,
            };
            const html = renderDetailedTextBox(options);

            expect(html).toContain('required');
        });

        it('Test 22: should include hint text', () => {
            const options: DetailedTextBoxOptions = {
                ...baseOptions,
                hint: 'This field is for project description',
            };
            const html = renderDetailedTextBox(options);

            expect(html).toContain('This field is for project description');
        });

        it('Test 23: should include error message', () => {
            const options: DetailedTextBoxOptions = {
                ...baseOptions,
                error: 'This field cannot be empty',
            };
            const html = renderDetailedTextBox(options);

            expect(html).toContain('This field cannot be empty');
            expect(html).toContain('error');
        });

        it('Test 24: should include fieldPath in data attributes', () => {
            const html = renderDetailedTextBox(baseOptions);

            expect(html).toContain('overview.name');
        });

        it('Test 25: should handle empty value', () => {
            const options: DetailedTextBoxOptions = {
                ...baseOptions,
                value: '',
            };
            const html = renderDetailedTextBox(options);

            expect(html).toContain('0');
        });

        it('Test 26: should use default maxLength when not specified', () => {
            const html = renderDetailedTextBox(baseOptions);

            expect(html).toContain(`${TEXT_BOX_DEFAULTS.MAX_LENGTH}`);
        });
    });

    // ========================================================================
    // getDetailedTextBoxStyles Tests
    // ========================================================================

    describe('getDetailedTextBoxStyles', () => {
        it('Test 27: should return CSS string', () => {
            const styles = getDetailedTextBoxStyles();

            expect(typeof styles).toBe('string');
            expect(styles.length).toBeGreaterThan(100);
        });

        it('Test 28: should include textbox class styles', () => {
            const styles = getDetailedTextBoxStyles();

            expect(styles).toContain('.detailed-textbox');
        });

        it('Test 29: should use VS Code theme variables', () => {
            const styles = getDetailedTextBoxStyles();

            expect(styles).toContain('--vscode-');
        });

        it('Test 30: should include character counter styles', () => {
            const styles = getDetailedTextBoxStyles();

            expect(styles).toContain('dtb-counter');
        });

        it('Test 31: should include over-limit styles', () => {
            const styles = getDetailedTextBoxStyles();

            expect(styles).toContain('over-limit');
        });

        it('Test 32: should include toolbar styles', () => {
            const styles = getDetailedTextBoxStyles();

            expect(styles).toContain('toolbar');
        });

        it('Test 33: should include error state styles', () => {
            const styles = getDetailedTextBoxStyles();

            expect(styles).toContain('error');
        });

        it('Test 34: should include preview area styles', () => {
            const styles = getDetailedTextBoxStyles();

            expect(styles).toContain('preview');
        });

        it('Test 35: should include hover and focus states', () => {
            const styles = getDetailedTextBoxStyles();

            expect(styles).toMatch(/:hover|:focus/);
        });
    });

    // ========================================================================
    // getDetailedTextBoxScript Tests
    // ========================================================================

    describe('getDetailedTextBoxScript', () => {
        it('Test 36: should return JavaScript string', () => {
            const script = getDetailedTextBoxScript();

            expect(typeof script).toBe('string');
            expect(script.length).toBeGreaterThan(100);
        });

        it('Test 37: should include state management function', () => {
            const script = getDetailedTextBoxScript();

            expect(script).toContain('dtbGetState');
        });

        it('Test 38: should include input handler function', () => {
            const script = getDetailedTextBoxScript();

            expect(script).toContain('dtbOnInput');
        });

        it('Test 39: should include change handler function', () => {
            const script = getDetailedTextBoxScript();

            expect(script).toContain('dtbOnChange');
        });

        it('Test 40: should include keydown handler function', () => {
            const script = getDetailedTextBoxScript();

            expect(script).toContain('dtbOnKeyDown');
        });

        it('Test 41: should include undo function', () => {
            const script = getDetailedTextBoxScript();

            expect(script).toContain('dtbUndo');
        });

        it('Test 42: should include redo function', () => {
            const script = getDetailedTextBoxScript();

            expect(script).toContain('dtbRedo');
        });

        it('Test 43: should include preview toggle function', () => {
            const script = getDetailedTextBoxScript();

            expect(script).toContain('dtbTogglePreview');
        });

        it('Test 44: should include markdown rendering function', () => {
            const script = getDetailedTextBoxScript();

            expect(script).toContain('renderMarkdownToHtml');
        });

        it('Test 45: should include HTML escaping function', () => {
            const script = getDetailedTextBoxScript();

            expect(script).toContain('escapeHtml');
        });

        it('Test 46: should handle Ctrl+Z for undo', () => {
            const script = getDetailedTextBoxScript();

            expect(script).toContain('ctrlKey');
            expect(script).toContain("key === 'z'");
        });

        it('Test 47: should handle Ctrl+Y for redo', () => {
            const script = getDetailedTextBoxScript();

            expect(script).toContain("key === 'y'");
        });

        it('Test 48: should use callback for field changes', () => {
            const script = getDetailedTextBoxScript();

            expect(script).toContain('onFieldChange');
        });

        it('Test 49: should include state persistence', () => {
            const script = getDetailedTextBoxScript();

            expect(script).toContain('undoStack');
            expect(script).toContain('redoStack');
        });

        it('Test 50: should include max undo steps constant', () => {
            const script = getDetailedTextBoxScript();

            expect(script).toContain(`${TEXT_BOX_DEFAULTS.MAX_UNDO_STEPS}`);
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('edge cases', () => {
        it('Test 51: should handle very long values', () => {
            const longValue = 'a'.repeat(5000);
            const options: DetailedTextBoxOptions = {
                id: 'long-text',
                label: 'Long Text',
                value: longValue,
                fieldPath: 'content',
            };

            const html = renderDetailedTextBox(options);

            expect(html).toContain('5000');
            expect(html).toContain('over-limit');
        });

        it('Test 52: should handle special characters in id', () => {
            const options: DetailedTextBoxOptions = {
                id: 'text_box-123',
                label: 'Special ID',
                value: '',
                fieldPath: 'test',
            };

            const html = renderDetailedTextBox(options);

            expect(html).toContain('text_box-123');
        });

        it('Test 53: should handle unicode in value', () => {
            const options: DetailedTextBoxOptions = {
                id: 'unicode-box',
                label: 'Unicode',
                value: '日本語 🚀 中文',
                fieldPath: 'unicode',
            };

            const html = renderDetailedTextBox(options);

            expect(html).toContain('日本語');
            expect(html).toContain('🚀');
        });

        it('Test 54: should handle quotes in value', () => {
            const options: DetailedTextBoxOptions = {
                id: 'quotes-box',
                label: 'Quotes',
                value: 'He said "Hello" and \'Goodbye\'',
                fieldPath: 'quotes',
            };

            const html = renderDetailedTextBox(options);

            // Quotes should be escaped
            expect(html).toContain('&quot;');
        });

        it('Test 55: should handle newlines in value', () => {
            const options: DetailedTextBoxOptions = {
                id: 'newline-box',
                label: 'Newlines',
                value: 'Line 1\nLine 2\nLine 3',
                fieldPath: 'lines',
            };

            const html = renderDetailedTextBox(options);

            // Should render without breaking
            expect(html).toContain('Line 1');
        });

        it('Test 56: should handle zero maxLength', () => {
            const options: DetailedTextBoxOptions = {
                id: 'zero-max',
                label: 'Zero Max',
                value: '',
                maxLength: 0,
                fieldPath: 'test',
            };

            // Should not throw
            const html = renderDetailedTextBox(options);
            expect(html).toContain('0');
        });

        it('Test 57: should handle negative minHeight', () => {
            const options: DetailedTextBoxOptions = {
                id: 'neg-height',
                label: 'Negative',
                value: '',
                minHeight: -100,
                fieldPath: 'test',
            };

            // Should not throw
            const html = renderDetailedTextBox(options);
            expect(html).toBeDefined();
        });
    });

    // ========================================================================
    // Integration-like Tests
    // ========================================================================

    describe('component integration', () => {
        it('Test 58: should render complete component with all features', () => {
            const fullOptions: DetailedTextBoxOptions = {
                id: 'full-component',
                label: 'Project Description',
                value: 'This is a **test** description with _markdown_.',
                placeholder: 'Enter your project description...',
                maxLength: 1000,
                minHeight: 150,
                enableMarkdown: true,
                enableUndoRedo: true,
                fieldPath: 'overview.description',
                required: true,
                hint: 'Describe your project in detail.',
                error: undefined,
            };

            const html = renderDetailedTextBox(fullOptions);

            // Verify all components present
            expect(html).toContain('Project Description');
            expect(html).toContain('Enter your project description...');
            expect(html).toContain('1000');
            expect(html).toContain('150px');
            expect(html).toContain('Describe your project in detail.');
            expect(html).toContain('required');
        });

        it('Test 59: should combine styles and HTML correctly', () => {
            const options: DetailedTextBoxOptions = {
                id: 'combined',
                label: 'Combined',
                value: 'Test',
                fieldPath: 'test',
            };

            const html = renderDetailedTextBox(options);
            const styles = getDetailedTextBoxStyles();

            // Styles should match HTML classes
            const classMatch = html.match(/class="([^"]+)"/g);
            if (classMatch) {
                const hasMatchingStyle = classMatch.some((cls) => {
                    const className = cls.replace(/class="|"/g, '').split(' ')[0];
                    return styles.includes(className);
                });
                expect(hasMatchingStyle).toBe(true);
            }
        });

        it('Test 60: should have functions referenced in HTML', () => {
            const options: DetailedTextBoxOptions = {
                id: 'funcs',
                label: 'Functions',
                value: '',
                fieldPath: 'test',
            };

            const html = renderDetailedTextBox(options);
            const script = getDetailedTextBoxScript();

            // HTML should reference functions defined in script
            if (html.includes('dtbOnInput')) {
                expect(script).toContain('function dtbOnInput');
            }
        });
    });
});
