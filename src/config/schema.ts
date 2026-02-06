import { z } from 'zod';

/**
 * Zod schema and derived TypeScript types for the entire config system.
 *
 * **Simple explanation**: Like a contract that says "these fields are allowed,
 * these types are required, and here are emergency backup values if something
 * goes wrong."
 */

// ============================================================================
// Section 1: Debug Configuration Schema
// ============================================================================

/**
 * Debug configuration determines logging verbosity.
 *
 * **Simple explanation**: Like adjusting a radio's volume – info is loud,
 * warn is medium, error is only emergencies.
 */
const DebugConfigSchema = z
  .object({
    logLevel: z.enum(['info', 'warn', 'error']).default('info'),
  })
  .default({});

export type DebugConfig = z.infer<typeof DebugConfigSchema>;

// ============================================================================
// Section 2: LLM Configuration Schema
// ============================================================================

/**
 * LLM (Large Language Model) configuration for connecting to LM Studio.
 *
 * **Simple explanation**: Like configuring directions to a restaurant –
 * where it is (endpoint), what you're ordering (model), and how long to wait
 * before giving up (timeout).
 */
const LLMConfigSchema = z
  .object({
    endpoint: z
      .string()
      .url()
      .default('http://127.0.0.1:1234/v1'),
    model: z.string().default('ministral-3-14b-reasoning'),
    timeoutSeconds: z.number().int().min(10).max(300).default(60),
    maxTokens: z.number().int().min(512).default(2048),
    startupTimeoutSeconds: z.number().int().positive().default(300),
    temperature: z.number().min(0).max(2).default(0.7),
    offlineFallbackMessage: z
      .string()
      .default('LLM offline – ticket created for manual review'),
  })
  .default({});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

// ============================================================================
// Section 3: Orchestrator Configuration Schema
// ============================================================================

/**
 * Orchestrator configuration for task management and coordination.
 *
 * **Simple explanation**: Like a project manager's stopwatch – how long
 * before marking a task as "stuck" and moving on.
 */
const OrchestratorConfigSchema = z
  .object({
    taskTimeoutSeconds: z.number().int().positive().default(30),
  })
  .default({});

export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;

// ============================================================================
// Section 4: Tickets Database Configuration Schema
// ============================================================================

/**
 * Tickets configuration for SQLite database location.
 *
 * **Simple explanation**: Like a filing cabinet's address – where to store
 * all the tasks and tickets.
 */
const TicketsConfigSchema = z
  .object({
    dbPath: z.string().default('./.coe/tickets.db'),
  })
  .default({});

export type TicketsConfig = z.infer<typeof TicketsConfigSchema>;

// ============================================================================
// Section 5: GitHub Issues Configuration Schema
// ============================================================================

/**
 * GitHub Issues configuration for syncing with GitHub.
 *
 * **Simple explanation**: Like a mailbox path – where to check for new
 * issues from GitHub when you enable that feature.
 */
const GitHubIssuesConfigSchema = z
  .object({
    path: z.string().default('github-issues'),
  })
  .default({});

export type GitHubIssuesConfig = z.infer<typeof GitHubIssuesConfigSchema>;

// ============================================================================
// Section 6: LM Studio Polling Configuration Schema
// ============================================================================

/**
 * LM Studio polling configuration for token limit checks.
 *
 * **Simple explanation**: Like a heartbeat check – how often to peek at
 * LM Studio's status without being annoying.
 */
const LMStudioPollingConfigSchema = z
  .object({
    tokenPollIntervalSeconds: z
      .number()
      .int()
      .min(10)
      .max(120)
      .default(30),
  })
  .default({});

export type LMStudioPollingConfig = z.infer<
  typeof LMStudioPollingConfigSchema
>;

// ============================================================================
// Section 7: File Watcher Configuration Schema
// ============================================================================

/**
 * File watcher configuration for debouncing file system events.
 *
 * **Simple explanation**: Like a buffer – don't react immediately to every
 * keystroke, wait a moment for the user to finish typing.
 */
const WatcherConfigSchema = z
  .object({
    debounceMs: z.number().int().positive().default(500),
  })
  .default({});

export type WatcherConfig = z.infer<typeof WatcherConfigSchema>;

// ============================================================================
// Section 8: Audit Log Configuration Schema
// ============================================================================

/**
 * Audit log configuration for tracking actions.
 *
 * **Simple explanation**: Like a security camera – toggle whether to record
 * all actions for auditing and compliance.
 */
const AuditLogConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
  })
  .default({});

export type AuditLogConfig = z.infer<typeof AuditLogConfigSchema>;

// ============================================================================
// MAIN CONFIG SCHEMA: Combine all sections
// ============================================================================

/**
 * Main configuration schema combining all sections.
 */
export const ConfigSchema = z
  .object({
    debug: DebugConfigSchema,
    llm: LLMConfigSchema,
    orchestrator: OrchestratorConfigSchema,
    tickets: TicketsConfigSchema,
    githubIssues: GitHubIssuesConfigSchema,
    lmStudioPolling: LMStudioPollingConfigSchema,
    watcher: WatcherConfigSchema,
    auditLog: AuditLogConfigSchema,
  })
  .default({});

/**
 * Main exported Config type derived from Zod schema.
 * All properties are readonly to prevent accidental mutations at runtime.
 *
 * **Simple explanation**: Like a locked suitcase – you can read what's inside,
 * but once it's sealed, you can't add more stuff.
 */
export type Config = Readonly<z.infer<typeof ConfigSchema>>;

/**
 * Hardcoded defaults for all config sections.
 * This serves as both a fallback and documentation of valid defaults.
 */
export const DEFAULT_CONFIG: Config = {
  debug: { logLevel: 'info' },
  llm: {
    endpoint: 'http://127.0.0.1:1234/v1',
    model: 'ministral-3-14b-reasoning',
    timeoutSeconds: 60,
    maxTokens: 2048,
    startupTimeoutSeconds: 300,
    temperature: 0.7,
    offlineFallbackMessage: 'LLM offline – ticket created for manual review',
  },
  orchestrator: { taskTimeoutSeconds: 30 },
  tickets: { dbPath: './.coe/tickets.db' },
  githubIssues: { path: 'github-issues' },
  lmStudioPolling: { tokenPollIntervalSeconds: 30 },
  watcher: { debounceMs: 500 },
  auditLog: { enabled: true },
} as const;
