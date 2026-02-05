/**
 * Tests for Schema Documentation Generator
 *
 * Covers: MT-005.9 (Schema Documentation Generation)
 *
 * @since MT-005.9
 */

import {
    TICKETS_SCHEMA,
    INDEXES,
    generateSchemaMarkdown,
    getSchemaField,
    getRequiredFields,
    getFieldsByVersion,
} from '../../../scripts/generateSchemaDoc';

describe('Schema Documentation Generator (MT-005.9)', () => {

    // ─── Schema Definition ───────────────────────────────────────────────

    describe('Schema Definition', () => {
        it('Test 1: should define all expected fields', () => {
            const fieldNames = TICKETS_SCHEMA.map(f => f.name);
            expect(fieldNames).toContain('id');
            expect(fieldNames).toContain('title');
            expect(fieldNames).toContain('status');
            expect(fieldNames).toContain('type');
            expect(fieldNames).toContain('thread');
            expect(fieldNames).toContain('createdAt');
            expect(fieldNames).toContain('updatedAt');
            expect(fieldNames).toContain('priority');
            expect(fieldNames).toContain('version');
            expect(fieldNames).toContain('parent_ticket_id');
            expect(fieldNames).toContain('depends_on');
            expect(fieldNames).toContain('history');
        });

        it('Test 2: should have descriptions for all fields', () => {
            for (const field of TICKETS_SCHEMA) {
                expect(field.description).toBeTruthy();
                expect(field.description.length).toBeGreaterThan(10);
            }
        });

        it('Test 3: should have types for all fields', () => {
            for (const field of TICKETS_SCHEMA) {
                expect(['TEXT', 'INTEGER']).toContain(field.type);
            }
        });

        it('Test 4: should have examples for most fields', () => {
            const withExamples = TICKETS_SCHEMA.filter(f => f.example);
            expect(withExamples.length).toBeGreaterThan(TICKETS_SCHEMA.length * 0.8);
        });

        it('Test 5: should track migration versions for all fields', () => {
            for (const field of TICKETS_SCHEMA) {
                expect(field.addedInVersion).toBeDefined();
                expect(field.addedInVersion).toBeGreaterThan(0);
            }
        });
    });

    // ─── Index Definitions ───────────────────────────────────────────────

    describe('Index Definitions', () => {
        it('Test 6: should define 4 performance indexes', () => {
            expect(INDEXES.length).toBe(4);
        });

        it('Test 7: should include status_type composite index', () => {
            const idx = INDEXES.find(i => i.name === 'idx_tickets_status_type');
            expect(idx).toBeDefined();
            expect(idx!.columns).toContain('status');
            expect(idx!.columns).toContain('type');
        });

        it('Test 8: should have descriptions for all indexes', () => {
            for (const idx of INDEXES) {
                expect(idx.description).toBeTruthy();
            }
        });
    });

    // ─── generateSchemaMarkdown ──────────────────────────────────────────

    describe('generateSchemaMarkdown', () => {
        let markdown: string;

        beforeAll(() => {
            markdown = generateSchemaMarkdown();
        });

        it('Test 9: should generate non-empty markdown', () => {
            expect(markdown.length).toBeGreaterThan(100);
        });

        it('Test 10: should include title', () => {
            expect(markdown).toContain('# Ticket Database Schema');
        });

        it('Test 11: should include fields summary table', () => {
            expect(markdown).toContain('## Fields Summary');
            expect(markdown).toContain('| # | Field |');
        });

        it('Test 12: should include field details section', () => {
            expect(markdown).toContain('## Field Details');
            expect(markdown).toContain('### `id`');
            expect(markdown).toContain('### `title`');
        });

        it('Test 13: should include indexes section', () => {
            expect(markdown).toContain('## Indexes');
            expect(markdown).toContain('idx_tickets_status_type');
        });

        it('Test 14: should include status values', () => {
            expect(markdown).toContain('## Status Values');
            expect(markdown).toContain('`open`');
            expect(markdown).toContain('`done`');
        });

        it('Test 15: should include type values', () => {
            expect(markdown).toContain('## Type Values');
            expect(markdown).toContain('`ai_to_human`');
        });

        it('Test 16: should include state transitions', () => {
            expect(markdown).toContain('## State Transitions');
            expect(markdown).toContain('open');
            expect(markdown).toContain('done');
        });

        it('Test 17: should include all field names in summary table', () => {
            for (const field of TICKETS_SCHEMA) {
                expect(markdown).toContain(`\`${field.name}\``);
            }
        });
    });

    // ─── Helper Functions ────────────────────────────────────────────────

    describe('getSchemaField', () => {
        it('Test 18: should find field by name', () => {
            const field = getSchemaField('title');
            expect(field).toBeDefined();
            expect(field!.type).toBe('TEXT');
            expect(field!.required).toBe(true);
        });

        it('Test 19: should return undefined for unknown field', () => {
            expect(getSchemaField('nonexistent')).toBeUndefined();
        });
    });

    describe('getRequiredFields', () => {
        it('Test 20: should return required fields', () => {
            const required = getRequiredFields();
            expect(required).toContain('id');
            expect(required).toContain('title');
            expect(required).toContain('status');
            expect(required).toContain('createdAt');
            expect(required).toContain('updatedAt');
        });

        it('Test 21: should not include optional fields', () => {
            const required = getRequiredFields();
            expect(required).not.toContain('description');
            expect(required).not.toContain('type');
            expect(required).not.toContain('resolution');
        });
    });

    describe('getFieldsByVersion', () => {
        it('Test 22: should return fields from version 1', () => {
            const v1Fields = getFieldsByVersion(1);
            expect(v1Fields.length).toBeGreaterThan(0);
            expect(v1Fields.some(f => f.name === 'id')).toBe(true);
            expect(v1Fields.some(f => f.name === 'title')).toBe(true);
        });

        it('Test 23: should return fields from version 2', () => {
            const v2Fields = getFieldsByVersion(2);
            expect(v2Fields.some(f => f.name === 'priority')).toBe(true);
            expect(v2Fields.some(f => f.name === 'creator')).toBe(true);
        });

        it('Test 24: should return empty for non-existent version', () => {
            expect(getFieldsByVersion(99)).toHaveLength(0);
        });
    });
});
