import {
  ConfigSchema,
  DEFAULT_CONFIG,
  type Config,
} from '../../src/config/schema';

describe('Config Schema Tests', () => {
  describe('Schema Validation (Happy Path)', () => {
    it('Test 1: should parse valid config with all fields', () => {
      const validConfig = {
        debug: { logLevel: 'warn' },
        llm: {
          endpoint: 'http://192.168.1.205:1234/v1',
          model: 'ministral',
          timeoutSeconds: 150,
          maxTokens: 4096,
          startupTimeoutSeconds: 400,
        },
        orchestrator: { taskTimeoutSeconds: 45 },
        tickets: { dbPath: './.coe/tickets.db' },
        githubIssues: { path: 'issues' },
        lmStudioPolling: { tokenPollIntervalSeconds: 60 },
        watcher: { debounceMs: 1000 },
        auditLog: { enabled: false },
      };

      const result = ConfigSchema.parse(validConfig);
      expect(result.llm.endpoint).toBe('http://192.168.1.205:1234/v1');
      expect(result.orchestrator.taskTimeoutSeconds).toBe(45);
      expect(result.auditLog.enabled).toBe(false);
    });

    it('Test 2: should apply defaults for missing optional fields', () => {
      const partialConfig = {
        llm: { endpoint: 'http://localhost:1234/v1' },
      };
      const result = ConfigSchema.parse(partialConfig);

      expect(result.llm.endpoint).toBe('http://localhost:1234/v1');
      expect(result.llm.model).toBe('ministral-3-14b-reasoning'); // default
      expect(result.orchestrator.taskTimeoutSeconds).toBe(30); // default
      expect(result.watcher.debounceMs).toBe(500); // default
    });

    it('Test 3: should use defaults for completely empty config object', () => {
      const result = ConfigSchema.parse({});

      expect(result).toEqual(DEFAULT_CONFIG);
      expect(result.llm.timeoutSeconds).toBe(60);
      expect(result.lmStudioPolling.tokenPollIntervalSeconds).toBe(30);
      expect(result.auditLog.enabled).toBe(true);
    });
  });

  describe('Schema Validation (Edge Cases)', () => {
    it('Test 4: should reject invalid enum value for logLevel', () => {
      const invalidConfig = { debug: { logLevel: 'fatal' } };
      expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('Test 5: should reject negative timeoutSeconds', () => {
      const invalidConfig = { llm: { timeoutSeconds: -5 } };
      expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('Test 6: should reject zero for positive-only fields', () => {
      const invalidConfig = { llm: { timeoutSeconds: 0 } };
      expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('Test 7: should reject string for numeric field', () => {
      const invalidConfig = { llm: { timeoutSeconds: '120' } };
      expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('Test 8: should reject tokenPollIntervalSeconds below min (10)', () => {
      const invalidConfig = {
        lmStudioPolling: { tokenPollIntervalSeconds: 5 },
      };
      expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('Test 9: should reject tokenPollIntervalSeconds above max (120)', () => {
      const invalidConfig = {
        lmStudioPolling: { tokenPollIntervalSeconds: 150 },
      };
      expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('Test 10: should reject invalid URL for endpoint', () => {
      const invalidConfig = { llm: { endpoint: 'not-a-url' } };
      expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('Test 11: should accept valid URL with custom IP', () => {
      const validConfig = { llm: { endpoint: 'http://192.168.1.205:1234/v1' } };
      const result = ConfigSchema.parse(validConfig);
      expect(result.llm.endpoint).toBe('http://192.168.1.205:1234/v1');
    });

    it('Test 12: should accept boolean true for auditLog.enabled', () => {
      const validConfig = { auditLog: { enabled: true } };
      const result = ConfigSchema.parse(validConfig);
      expect(result.auditLog.enabled).toBe(true);
    });

    it('Test 13: should reject non-boolean for auditLog.enabled', () => {
      const invalidConfig = { auditLog: { enabled: 'yes' } };
      expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('Test 14: should handle deep partial config merge', () => {
      const partialConfig = {
        llm: { endpoint: 'http://custom:1234/v1' },
        watcher: { debounceMs: 750 },
      };
      const result = ConfigSchema.parse(partialConfig);

      expect(result.llm.endpoint).toBe('http://custom:1234/v1');
      expect(result.llm.model).toBe('ministral-3-14b-reasoning'); // default
      expect(result.watcher.debounceMs).toBe(750);
      expect(result.orchestrator.taskTimeoutSeconds).toBe(30); // default
    });

    it('Test 15: should accept min boundary for tokenPollIntervalSeconds (10)', () => {
      const validConfig = {
        lmStudioPolling: { tokenPollIntervalSeconds: 10 },
      };
      const result = ConfigSchema.parse(validConfig);
      expect(result.lmStudioPolling.tokenPollIntervalSeconds).toBe(10);
    });

    it('Test 16: should accept max boundary for tokenPollIntervalSeconds (120)', () => {
      const validConfig = {
        lmStudioPolling: { tokenPollIntervalSeconds: 120 },
      };
      const result = ConfigSchema.parse(validConfig);
      expect(result.lmStudioPolling.tokenPollIntervalSeconds).toBe(120);
    });
  });

  describe('Config Immutability', () => {
    it('Test 17: returned config should be readonly (TypeScript type level)', () => {
      const config: Readonly<Config> = ConfigSchema.parse({});

      // This is primarily enforced by TypeScript at compile time
      // At runtime, this tests that the config object structure is sound
      const originalEndpoint = config.llm.endpoint;
      expect(originalEndpoint).toBe('http://127.0.0.1:1234/v1');
      // TypeScript prevents: config.llm.endpoint = 'http://hacked:1234/v1';
    });
  });

  describe('DEFAULT_CONFIG constant', () => {
    it('Test 18: DEFAULT_CONFIG should match schema defaults', () => {
      const schemaDefaults = ConfigSchema.parse({});
      expect(DEFAULT_CONFIG).toEqual(schemaDefaults);
    });

    it('Test 19: DEFAULT_CONFIG should have all required sections', () => {
      expect(DEFAULT_CONFIG.debug).toBeDefined();
      expect(DEFAULT_CONFIG.llm).toBeDefined();
      expect(DEFAULT_CONFIG.orchestrator).toBeDefined();
      expect(DEFAULT_CONFIG.tickets).toBeDefined();
      expect(DEFAULT_CONFIG.githubIssues).toBeDefined();
      expect(DEFAULT_CONFIG.lmStudioPolling).toBeDefined();
      expect(DEFAULT_CONFIG.watcher).toBeDefined();
      expect(DEFAULT_CONFIG.auditLog).toBeDefined();
    });
  });
});
