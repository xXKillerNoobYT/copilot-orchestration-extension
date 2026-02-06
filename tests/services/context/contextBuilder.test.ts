/**
 * @file context/contextBuilder.test.ts
 * @description Tests for ContextBuilder (MT-017.4)
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn()
}));

import {
    ContextBuilder,
    createContextBuilder,
    ContextSection
} from '../../../src/services/context/contextBuilder';

describe('ContextBuilder', () => {
    let builder: ContextBuilder;

    beforeEach(() => {
        builder = createContextBuilder();
    });

    const createSection = (id: string, type: ContextSection['type'], priority: ContextSection['priority']): ContextSection => ({
        id,
        content: `Content for ${id}`,
        priority,
        type
    });

    describe('Test 1: constructor', () => {
        it('should create instance with default config', () => {
            expect(builder).toBeInstanceOf(ContextBuilder);
            expect(builder.count()).toBe(0);
        });

        it('should create instance with custom config', () => {
            const customBuilder = createContextBuilder({
                separator: '\n===\n',
                sectionHeaders: true
            });
            expect(customBuilder).toBeInstanceOf(ContextBuilder);
        });
    });

    describe('Test 2: setSection', () => {
        it('should add a section', () => {
            builder.setSection(createSection('test', 'custom', 'normal'));
            expect(builder.count()).toBe(1);
        });

        it('should update existing section', () => {
            builder.setSection(createSection('test', 'custom', 'normal'));
            builder.setSection({ ...createSection('test', 'custom', 'high'), content: 'Updated' });

            expect(builder.count()).toBe(1);
            expect(builder.getSection('test')?.content).toBe('Updated');
        });
    });

    describe('Test 3: getSection', () => {
        it('should get section by ID', () => {
            builder.setSection(createSection('test', 'custom', 'normal'));
            const section = builder.getSection('test');

            expect(section).toBeDefined();
            expect(section?.id).toBe('test');
        });

        it('should return undefined for non-existent section', () => {
            expect(builder.getSection('nonexistent')).toBeUndefined();
        });
    });

    describe('Test 4: removeSection', () => {
        it('should remove a section', () => {
            builder.setSection(createSection('test', 'custom', 'normal'));
            const result = builder.removeSection('test');

            expect(result).toBe(true);
            expect(builder.count()).toBe(0);
        });

        it('should return false for non-existent section', () => {
            expect(builder.removeSection('nonexistent')).toBe(false);
        });
    });

    describe('Test 5: getSections', () => {
        it('should return sections in order', () => {
            builder.setSection(createSection('doc', 'documentation', 'low'));
            builder.setSection(createSection('system', 'system', 'critical'));
            builder.setSection(createSection('task', 'task', 'high'));

            const sections = builder.getSections();

            // System should be first
            expect(sections[0].type).toBe('system');
            // Then task
            expect(sections[1].type).toBe('task');
            // Then documentation
            expect(sections[2].type).toBe('documentation');
        });
    });

    describe('Test 6: getSectionsByType', () => {
        it('should filter sections by type', () => {
            builder.setSection(createSection('file1', 'file', 'normal'));
            builder.setSection(createSection('file2', 'file', 'high'));
            builder.setSection(createSection('doc1', 'documentation', 'low'));

            const files = builder.getSectionsByType('file');
            expect(files).toHaveLength(2);
            expect(files.every(s => s.type === 'file')).toBe(true);
        });
    });

    describe('Test 7: build', () => {
        it('should build context string', () => {
            builder.setSection(createSection('test', 'custom', 'normal'));
            const context = builder.build();

            expect(context).toContain('Content for test');
        });

        it('should include headers when configured', () => {
            const headerBuilder = createContextBuilder({ sectionHeaders: true });
            headerBuilder.setSection(createSection('test', 'system', 'critical'));

            const context = headerBuilder.build();
            expect(context).toContain('System Instructions');
        });
    });

    describe('Test 8: has', () => {
        it('should check if section exists', () => {
            builder.setSection(createSection('test', 'custom', 'normal'));

            expect(builder.has('test')).toBe(true);
            expect(builder.has('nonexistent')).toBe(false);
        });
    });

    describe('Test 9: clear', () => {
        it('should clear all sections', () => {
            builder.setSection(createSection('test1', 'custom', 'normal'));
            builder.setSection(createSection('test2', 'custom', 'normal'));
            builder.clear();

            expect(builder.count()).toBe(0);
        });
    });

    describe('Test 10: clone', () => {
        it('should create a copy', () => {
            builder.setSection(createSection('test', 'custom', 'normal'));
            const clone = builder.clone();

            expect(clone.count()).toBe(1);

            // Modifications to clone should not affect original
            clone.setSection(createSection('new', 'custom', 'normal'));
            expect(builder.count()).toBe(1);
            expect(clone.count()).toBe(2);
        });
    });

    describe('Test 11: merge', () => {
        it('should merge sections from another builder', () => {
            const other = createContextBuilder();
            other.setSection(createSection('other1', 'custom', 'normal'));
            other.setSection(createSection('other2', 'custom', 'normal'));

            builder.setSection(createSection('original', 'custom', 'normal'));
            builder.merge(other);

            expect(builder.count()).toBe(3);
        });

        it('should not overwrite existing sections by default', () => {
            const other = createContextBuilder();
            other.setSection({ ...createSection('test', 'custom', 'normal'), content: 'New' });

            builder.setSection({ ...createSection('test', 'custom', 'normal'), content: 'Original' });
            builder.merge(other, false);

            expect(builder.getSection('test')?.content).toBe('Original');
        });

        it('should overwrite when specified', () => {
            const other = createContextBuilder();
            other.setSection({ ...createSection('test', 'custom', 'normal'), content: 'New' });

            builder.setSection({ ...createSection('test', 'custom', 'normal'), content: 'Original' });
            builder.merge(other, true);

            expect(builder.getSection('test')?.content).toBe('New');
        });
    });

    describe('Test 12: getSummary', () => {
        it('should return summary string', () => {
            builder.setSection(createSection('test', 'custom', 'normal'));
            const summary = builder.getSummary();

            expect(summary).toContain('Context Builder Summary');
            expect(summary).toContain('test');
            expect(summary).toContain('custom');
        });
    });
});
