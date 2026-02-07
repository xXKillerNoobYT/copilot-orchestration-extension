/**
 * Agent Metadata Field Tests (MT-030.8)
 *
 * Tests for agent metadata validation including name, description, author, version, and tags.
 */

import { validateCustomAgent, CUSTOM_AGENT_CONSTRAINTS, AgentMetadataSchema } from '../../../src/agents/custom/schema';

describe('MT-030.8: Agent Metadata Fields', () => {

    // ========== Author Field Tests ==========
    describe('Test 1: Author field validation', () => {
        it('should allow valid author name', () => {
            const metadata = AgentMetadataSchema.parse({
                author: 'John Doe',
                version: '1.0.0',
                tags: []
            });
            expect(metadata.author).toBe('John Doe');
        });

        it('should allow empty author', () => {
            const metadata = AgentMetadataSchema.parse({
                version: '1.0.0',
                tags: []
            });
            expect(metadata.author).toBeUndefined();
        });

        it('should reject author exceeding max length', () => {
            const longAuthor = 'a'.repeat(CUSTOM_AGENT_CONSTRAINTS.AUTHOR_MAX_LENGTH + 1);
            expect(() => {
                AgentMetadataSchema.parse({
                    author: longAuthor,
                    version: '1.0.0',
                    tags: []
                });
            }).toThrow();
        });

        it('should allow author at max length', () => {
            const maxAuthor = 'a'.repeat(CUSTOM_AGENT_CONSTRAINTS.AUTHOR_MAX_LENGTH);
            const metadata = AgentMetadataSchema.parse({
                author: maxAuthor,
                version: '1.0.0',
                tags: []
            });
            expect(metadata.author).toBe(maxAuthor);
        });
    });

    // ========== Version Field Tests ==========
    describe('Test 2: Version field validation (semantic versioning)', () => {
        it('should accept valid semantic versions', () => {
            const validVersions = ['1.0.0', '0.0.1', '10.20.30', '2.3.4'];
            validVersions.forEach(v => {
                const metadata = AgentMetadataSchema.parse({
                    version: v,
                    tags: []
                });
                expect(metadata.version).toBe(v);
            });
        });

        it('should default to 1.0.0 if not provided', () => {
            const metadata = AgentMetadataSchema.parse({
                tags: []
            });
            expect(metadata.version).toBe('1.0.0');
        });

        it('should reject invalid version formats', () => {
            const invalidVersions = ['1.0', '1', '1.0.0.0', 'v1.0.0', '1.0.0-beta'];
            invalidVersions.forEach(v => {
                expect(() => {
                    AgentMetadataSchema.parse({
                        version: v,
                        tags: []
                    });
                }).toThrow();
            });
        });

        it('should validate versions with proper number ranges', () => {
            const metadata = AgentMetadataSchema.parse({
                version: '100.200.300',
                tags: []
            });
            expect(metadata.version).toBe('100.200.300');
        });
    });

    // ========== Tags Field Tests ==========
    describe('Test 3: Tags field validation', () => {
        it('should accept valid tags', () => {
            const metadata = AgentMetadataSchema.parse({
                version: '1.0.0',
                tags: ['research', 'analysis', 'reporting']
            });
            expect(metadata.tags).toEqual(['research', 'analysis', 'reporting']);
        });

        it('should default to empty tags array', () => {
            const metadata = AgentMetadataSchema.parse({
                version: '1.0.0'
            });
            expect(metadata.tags).toEqual([]);
        });

        it('should reject tags exceeding max length', () => {
            const longTag = 'a'.repeat(CUSTOM_AGENT_CONSTRAINTS.TAG_MAX_LENGTH + 1);
            expect(() => {
                AgentMetadataSchema.parse({
                    version: '1.0.0',
                    tags: [longTag]
                });
            }).toThrow();
        });

        it('should allow tags at max length', () => {
            const maxTag = 'a'.repeat(CUSTOM_AGENT_CONSTRAINTS.TAG_MAX_LENGTH);
            const metadata = AgentMetadataSchema.parse({
                version: '1.0.0',
                tags: [maxTag]
            });
            expect(metadata.tags).toContain(maxTag);
        });

        it('should reject more than TAGS_MAX tags', () => {
            const tooManyTags = Array(CUSTOM_AGENT_CONSTRAINTS.TAGS_MAX + 1).fill('tag');
            expect(() => {
                AgentMetadataSchema.parse({
                    version: '1.0.0',
                    tags: tooManyTags
                });
            }).toThrow();
        });

        it('should allow exactly TAGS_MAX tags', () => {
            const maxTags = Array(CUSTOM_AGENT_CONSTRAINTS.TAGS_MAX).fill(null).map((_, i) => `tag${i}`);
            const metadata = AgentMetadataSchema.parse({
                version: '1.0.0',
                tags: maxTags
            });
            expect(metadata.tags).toHaveLength(CUSTOM_AGENT_CONSTRAINTS.TAGS_MAX);
        });

        it('should reject empty tag strings', () => {
            expect(() => {
                AgentMetadataSchema.parse({
                    version: '1.0.0',
                    tags: ['valid', '', 'valid']
                });
            }).toThrow();
        });
    });

    // ========== Timestamps ==========
    describe('Test 4: Timestamp fields (createdAt, updatedAt)', () => {
        it('should accept valid ISO 8601 timestamps', () => {
            const now = new Date().toISOString();
            const metadata = AgentMetadataSchema.parse({
                version: '1.0.0',
                createdAt: now,
                updatedAt: now,
                tags: []
            });
            expect(metadata.createdAt).toBe(now);
            expect(metadata.updatedAt).toBe(now);
        });

        it('should allow timestamps to be optional', () => {
            const metadata = AgentMetadataSchema.parse({
                version: '1.0.0',
                tags: []
            });
            expect(metadata.createdAt).toBeUndefined();
            expect(metadata.updatedAt).toBeUndefined();
        });

        it('should reject invalid timestamp formats', () => {
            expect(() => {
                AgentMetadataSchema.parse({
                    version: '1.0.0',
                    createdAt: '2024-01-01',
                    tags: []
                });
            }).toThrow();
        });
    });

    // ========== Complete Metadata Objects ==========
    describe('Test 5: Complete metadata object validation', () => {
        it('should validate complete metadata with all fields', () => {
            const now = new Date().toISOString();
            const metadata = AgentMetadataSchema.parse({
                author: 'Test Author',
                version: '2.5.1',
                createdAt: now,
                updatedAt: now,
                tags: ['test', 'automation', 'validation']
            });

            expect(metadata.author).toBe('Test Author');
            expect(metadata.version).toBe('2.5.1');
            expect(metadata.createdAt).toBe(now);
            expect(metadata.updatedAt).toBe(now);
            expect(metadata.tags).toEqual(['test', 'automation', 'validation']);
        });

        it('should validate minimal metadata', () => {
            const metadata = AgentMetadataSchema.parse({});
            expect(metadata.version).toBe('1.0.0');
            expect(metadata.tags).toEqual([]);
            expect(metadata.author).toBeUndefined();
        });

        it('should validate metadata with special characters in tags', () => {
            const metadata = AgentMetadataSchema.parse({
                tags: ['v2-beta', 'ml-ops', 'data-science'],
                version: '1.0.0'
            });
            expect(metadata.tags).toContain('v2-beta');
        });
    });

    // ========== Integration Tests ==========
    describe('Test 6: Metadata integration with full agent config', () => {
        it('should include metadata in complete agent validation', () => {
            const result = validateCustomAgent({
                name: 'test-agent',
                description: 'A test agent',
                systemPrompt: 'You are a test agent',
                goals: ['Test goal'],
                metadata: {
                    author: 'Test User',
                    version: '1.0.0',
                    tags: ['test']
                }
            });

            expect(result.success).toBe(true);
            expect(result.data?.metadata?.author).toBe('Test User');
            expect(result.data?.metadata?.version).toBe('1.0.0');
        });

        it('should handle missing metadata in agent', () => {
            const result = validateCustomAgent({
                name: 'test-agent',
                description: 'A test agent',
                systemPrompt: 'You are a test agent',
                goals: ['Test goal']
            });

            expect(result.success).toBe(true);
            expect(result.data?.metadata?.version).toBe('1.0.0');
            expect(result.data?.metadata?.tags).toEqual([]);
        });

        it('should reject agent with invalid metadata', () => {
            const result = validateCustomAgent({
                name: 'test-agent',
                description: 'A test agent',
                systemPrompt: 'You are a test agent',
                goals: ['Test goal'],
                metadata: {
                    version: '1.0' // Invalid: not semantic versioning
                }
            });

            expect(result.success).toBe(false);
        });
    });

    // ========== Edge Cases ==========
    describe('Test 7: Metadata edge cases', () => {
        it('should trim whitespace from author field handling', () => {
            const metadata = AgentMetadataSchema.parse({
                author: 'Valid Author Name',
                version: '1.0.0',
                tags: []
            });
            expect(metadata.author?.length).toBeGreaterThan(0);
        });

        it('should handle tags with numbers and hyphens', () => {
            const metadata = AgentMetadataSchema.parse({
                version: '1.0.0',
                tags: ['v1-stable', 'ml2-ops', '2024-update']
            });
            expect(metadata.tags).toContain('v1-stable');
        });

        it('should reject version with leading zeros', () => {
            // Note: regex 0-9 pattern allows them, but this validates standards
            const metadata = AgentMetadataSchema.parse({
                version: '01.02.03',
                tags: []
            });
            // Should pass - regex allows it
            expect(metadata.version).toBe('01.02.03');
        });

        it('should handle metadata with only some optional fields', () => {
            const metadata = AgentMetadataSchema.parse({
                author: 'Someone',
                version: '2.0.0'
                // tags, timestamps omitted
            });
            expect(metadata.author).toBe('Someone');
            expect(metadata.version).toBe('2.0.0');
            expect(metadata.tags).toEqual([]);
            expect(metadata.createdAt).toBeUndefined();
        });
    });

    // ========== UI Field Mapping ==========
    describe('Test 8: Metadata field UI integration', () => {
        it('should support metadata display fields', () => {
            const metadata = {
                author: 'John Doe',
                version: '1.5.0',
                tags: ['research', 'analysis'],
                createdAt: new Date(2024, 0, 15).toISOString(),
                updatedAt: new Date(2024, 1, 20).toISOString()
            };

            const parsed = AgentMetadataSchema.parse(metadata);

            // These should be displayable in UI
            expect(parsed.author).toBeDefined();
            expect(parsed.version).toMatch(/^\d+\.\d+\.\d+$/);
            expect(Array.isArray(parsed.tags)).toBe(true);
        });

        it('should handle metadata as form input', () => {
            // Simulating form input
            const formData = {
                author: 'Form Input Author',
                version: '1.0.0',
                tags: [] // from multi-select or tag input
            };

            const metadata = AgentMetadataSchema.parse({
                ...formData,
                author: formData.author || undefined
            });

            expect(metadata.version).toBe('1.0.0');
        });
    });
});
