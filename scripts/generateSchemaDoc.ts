/**
 * Schema Documentation Generator
 *
 * Generates markdown documentation of the ticket database schema,
 * including field descriptions, types, constraints, and examples.
 *
 * **Simple explanation**: Like a secretary who writes up a nice report
 * about how the database is organized. Run this script to get an
 * up-to-date description of every field in the tickets table.
 *
 * @module scripts/generateSchemaDoc
 * @since MT-005.9
 */

/**
 * Schema field definition for documentation
 */
export interface SchemaField {
    /** Column name */
    name: string;
    /** SQLite data type */
    type: string;
    /** Whether the field is required */
    required: boolean;
    /** Default value (if any) */
    defaultValue?: string;
    /** Human-readable description */
    description: string;
    /** Example value */
    example?: string;
    /** Constraints (e.g., CHECK, length limits) */
    constraints?: string[];
    /** Which migration introduced this field */
    addedInVersion?: number;
}

/**
 * Complete schema definition for the tickets table
 */
export const TICKETS_SCHEMA: SchemaField[] = [
    {
        name: 'id',
        type: 'TEXT',
        required: true,
        description: 'Unique ticket identifier. Format: TK-XXXX for regular tickets, MT-XXX for master tickets, MT-XXX.Y for sub-tickets.',
        example: 'TK-0001',
        constraints: ['PRIMARY KEY', 'NOT NULL'],
        addedInVersion: 1,
    },
    {
        name: 'title',
        type: 'TEXT',
        required: true,
        description: 'Short summary of the ticket (max 200 chars).',
        example: 'Fix login page crash on submit',
        constraints: ['NOT NULL', 'CHECK(length(title) <= 200)'],
        addedInVersion: 1,
    },
    {
        name: 'status',
        type: 'TEXT',
        required: true,
        description: 'Current ticket state. Controls workflow progression.',
        example: 'open',
        constraints: [
            'NOT NULL',
            "CHECK(status IN ('open','in-progress','done','blocked','pending','in_review','resolved','rejected','escalated'))",
        ],
        addedInVersion: 1,
    },
    {
        name: 'type',
        type: 'TEXT',
        required: false,
        description: 'Ticket routing type. Determines which agent handles the ticket.',
        example: 'ai_to_human',
        constraints: ["CHECK(type IN ('ai_to_human','human_to_ai','answer_agent'))"],
        addedInVersion: 1,
    },
    {
        name: 'thread',
        type: 'TEXT',
        required: false,
        description: 'JSON array of conversation messages between agents and humans.',
        example: '[{"role":"user","content":"Hello","createdAt":"2026-01-01T00:00:00Z"}]',
        constraints: ['JSON array format'],
        addedInVersion: 1,
    },
    {
        name: 'createdAt',
        type: 'TEXT',
        required: true,
        description: 'ISO 8601 timestamp when the ticket was created. Immutable.',
        example: '2026-02-01T10:30:00.000Z',
        constraints: ['NOT NULL', 'Immutable after creation'],
        addedInVersion: 1,
    },
    {
        name: 'updatedAt',
        type: 'TEXT',
        required: true,
        description: 'ISO 8601 timestamp of the last modification. Auto-updated.',
        example: '2026-02-05T14:22:00.000Z',
        constraints: ['NOT NULL', 'Auto-updated on every write'],
        addedInVersion: 1,
    },
    {
        name: 'description',
        type: 'TEXT',
        required: false,
        description: 'Detailed ticket description (max 800 chars).',
        example: 'The login page throws an unhandled exception when...',
        constraints: ['CHECK(length(description) <= 800)'],
        addedInVersion: 1,
    },
    {
        name: 'conversationHistory',
        type: 'TEXT',
        required: false,
        description: 'Serialized Answer Agent conversation history for context preservation.',
        example: '(JSON string)',
        constraints: ['JSON format'],
        addedInVersion: 1,
    },
    {
        name: 'priority',
        type: 'INTEGER',
        required: false,
        defaultValue: '2',
        description: 'Priority level (1=highest, 5=lowest).',
        example: '1',
        constraints: ['CHECK(priority BETWEEN 1 AND 5)', 'DEFAULT 2'],
        addedInVersion: 2,
    },
    {
        name: 'creator',
        type: 'TEXT',
        required: false,
        defaultValue: 'system',
        description: 'Who or what created this ticket.',
        example: 'PlanningAgent',
        constraints: ["DEFAULT 'system'"],
        addedInVersion: 2,
    },
    {
        name: 'assignee',
        type: 'TEXT',
        required: false,
        defaultValue: 'Clarity Agent',
        description: 'Who or what is responsible for this ticket.',
        example: 'VerificationAgent',
        constraints: ["DEFAULT 'Clarity Agent'"],
        addedInVersion: 2,
    },
    {
        name: 'taskId',
        type: 'TEXT',
        required: false,
        description: 'Reference to an associated task or work item.',
        example: 'MT-001.3',
        addedInVersion: 3,
    },
    {
        name: 'version',
        type: 'INTEGER',
        required: false,
        defaultValue: '1',
        description: 'Optimistic locking version. Incremented on every update.',
        example: '3',
        constraints: ['DEFAULT 1', '>= 1'],
        addedInVersion: 3,
    },
    {
        name: 'resolution',
        type: 'TEXT',
        required: false,
        description: 'Final resolution text when ticket is resolved or closed.',
        example: 'Fixed by updating the auth middleware to handle edge cases.',
        constraints: ['CHECK(length(resolution) <= 2000)'],
        addedInVersion: 3,
    },
    {
        name: 'parent_ticket_id',
        type: 'TEXT',
        required: false,
        description: 'Parent ticket ID for sub-tickets (creates hierarchy).',
        example: 'MT-001',
        constraints: ['REFERENCES tickets(id)'],
        addedInVersion: 5,
    },
    {
        name: 'depends_on',
        type: 'TEXT',
        required: false,
        defaultValue: '[]',
        description: 'JSON array of ticket IDs that must be resolved first.',
        example: '["TK-0001","TK-0002"]',
        constraints: ['JSON array format', "DEFAULT '[]'"],
        addedInVersion: 5,
    },
    {
        name: 'blocks',
        type: 'TEXT',
        required: false,
        defaultValue: '[]',
        description: 'JSON array of ticket IDs that this ticket blocks.',
        example: '["TK-0005"]',
        constraints: ['JSON array format', "DEFAULT '[]'"],
        addedInVersion: 5,
    },
    {
        name: 'stage_gate',
        type: 'INTEGER',
        required: false,
        defaultValue: '1',
        description: 'Project stage gate (1-7) this ticket belongs to.',
        example: '2',
        constraints: ['CHECK(stage_gate BETWEEN 1 AND 7)', 'DEFAULT 1'],
        addedInVersion: 6,
    },
    {
        name: 'atomic_estimate_minutes',
        type: 'INTEGER',
        required: false,
        defaultValue: '30',
        description: 'Estimated time for this task in minutes (15-60).',
        example: '45',
        constraints: ['CHECK(atomic_estimate_minutes BETWEEN 15 AND 60)', 'DEFAULT 30'],
        addedInVersion: 6,
    },
    {
        name: 'doc_reference',
        type: 'TEXT',
        required: false,
        description: 'Reference to a documentation file related to this ticket.',
        example: 'Docs/This Program\'s Plans/01-Architecture-Document.md',
        addedInVersion: 7,
    },
    {
        name: 'history',
        type: 'TEXT',
        required: false,
        defaultValue: '{}',
        description: 'JSON object tracking audit history of changes.',
        example: '{"changes":[{"field":"status","from":"open","to":"in-progress","at":"2026-02-01"}]}',
        constraints: ['JSON object format', "DEFAULT '{}'"],
        addedInVersion: 7,
    },
];

/**
 * Index definitions for documentation
 */
export const INDEXES = [
    {
        name: 'idx_tickets_status_type',
        columns: ['status', 'type'],
        description: 'Speeds up filtering by status and type (sidebar filtering).',
    },
    {
        name: 'idx_tickets_updatedAt',
        columns: ['updatedAt DESC'],
        description: 'Speeds up sorting by recency (most recent first).',
    },
    {
        name: 'idx_tickets_priority',
        columns: ['priority'],
        description: 'Speeds up priority-based queries and sorting.',
    },
    {
        name: 'idx_tickets_creator',
        columns: ['creator'],
        description: 'Speeds up filtering by creator (agent-specific views).',
    },
];

/**
 * Generate markdown documentation for the tickets table schema.
 *
 * **Simple explanation**: Produces a nicely formatted markdown document
 * that describes every field in the database. Useful for developers
 * who need to understand the data model.
 *
 * @returns Markdown string with schema documentation
 */
export function generateSchemaMarkdown(): string {
    const lines: string[] = [];

    lines.push('# Ticket Database Schema');
    lines.push('');
    lines.push('> Auto-generated documentation of the tickets table schema.');
    lines.push(`> Generated at: ${new Date().toISOString()}`);
    lines.push('');

    // Summary table
    lines.push('## Fields Summary');
    lines.push('');
    lines.push('| # | Field | Type | Required | Default | Description |');
    lines.push('|---|-------|------|----------|---------|-------------|');

    TICKETS_SCHEMA.forEach((field, index) => {
        const required = field.required ? 'Yes' : 'No';
        const defaultVal = field.defaultValue ?? '-';
        const desc = field.description.split('.')[0]; // First sentence only
        lines.push(`| ${index + 1} | \`${field.name}\` | ${field.type} | ${required} | ${defaultVal} | ${desc} |`);
    });

    lines.push('');

    // Detailed field descriptions
    lines.push('## Field Details');
    lines.push('');

    for (const field of TICKETS_SCHEMA) {
        lines.push(`### \`${field.name}\``);
        lines.push('');
        lines.push(`- **Type**: \`${field.type}\``);
        lines.push(`- **Required**: ${field.required ? 'Yes' : 'No'}`);
        if (field.defaultValue) {
            lines.push(`- **Default**: \`${field.defaultValue}\``);
        }
        if (field.addedInVersion) {
            lines.push(`- **Added in**: Migration v${field.addedInVersion}`);
        }
        lines.push(`- **Description**: ${field.description}`);
        if (field.example) {
            lines.push(`- **Example**: \`${field.example}\``);
        }
        if (field.constraints && field.constraints.length > 0) {
            lines.push(`- **Constraints**: ${field.constraints.join(', ')}`);
        }
        lines.push('');
    }

    // Indexes section
    lines.push('## Indexes');
    lines.push('');
    lines.push('| Index Name | Columns | Purpose |');
    lines.push('|------------|---------|---------|');

    for (const idx of INDEXES) {
        lines.push(`| \`${idx.name}\` | ${idx.columns.join(', ')} | ${idx.description} |`);
    }

    lines.push('');

    // Status values
    lines.push('## Status Values');
    lines.push('');
    lines.push('| Status | Description |');
    lines.push('|--------|-------------|');
    lines.push('| `open` | New ticket, not yet started |');
    lines.push('| `in-progress` | Work is actively being done |');
    lines.push('| `done` | Work completed (terminal state) |');
    lines.push('| `blocked` | Waiting on external dependency |');
    lines.push('| `pending` | Awaiting human review/approval |');
    lines.push('| `in_review` | Under review by human or agent |');
    lines.push('| `resolved` | Issue resolved with resolution text |');
    lines.push('| `rejected` | Ticket rejected/invalid |');
    lines.push('| `escalated` | Escalated to higher priority/attention |');
    lines.push('');

    // Type values
    lines.push('## Type Values');
    lines.push('');
    lines.push('| Type | Description |');
    lines.push('|------|-------------|');
    lines.push('| `ai_to_human` | AI agent needs human input |');
    lines.push('| `human_to_ai` | Human assigns work to AI agent |');
    lines.push('| `answer_agent` | Routed to the Answer Agent for Q&A |');
    lines.push('');

    // State machine
    lines.push('## State Transitions');
    lines.push('');
    lines.push('```');
    lines.push('open ──────> in-progress ──────> done (terminal)');
    lines.push('  │              │');
    lines.push('  ├──> blocked   ├──> blocked');
    lines.push('  └──> pending   └──> pending');
    lines.push('');
    lines.push('blocked ──> open | in-progress | pending');
    lines.push('pending ──> open | in-progress | blocked');
    lines.push('```');
    lines.push('');

    return lines.join('\n');
}

/**
 * Get schema field by name.
 *
 * @param name - The field name to look up
 * @returns The field definition or undefined
 */
export function getSchemaField(name: string): SchemaField | undefined {
    return TICKETS_SCHEMA.find(f => f.name === name);
}

/**
 * Get all required fields.
 *
 * @returns Array of required field names
 */
export function getRequiredFields(): string[] {
    return TICKETS_SCHEMA.filter(f => f.required).map(f => f.name);
}

/**
 * Get fields added in a specific migration version.
 *
 * @param version - Migration version number
 * @returns Array of fields added in that version
 */
export function getFieldsByVersion(version: number): SchemaField[] {
    return TICKETS_SCHEMA.filter(f => f.addedInVersion === version);
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────

if (require.main === module) {
    const markdown = generateSchemaMarkdown();
    console.log(markdown);
}
