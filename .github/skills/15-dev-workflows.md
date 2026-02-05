# Development Workflows

**Purpose**: Build, test, debug, and LLM setup workflows forCOE development  
**Related Files**: `package.json`, `jest.config.js`, `.coe/config.json`  
**Keywords**: workflow, build, test, debug, lm-studio, npm

## Essential Commands

`ash
# Development (ALWAYS RUN FIRST)
npm run watch              # TypeScript watch mode

# Testing
npm run test               # Jest in watch mode
npm run test:once          # Single test run (for CI)
npm run test:once -- --coverage  # Coverage report

# Linting
npm run lint               # ESLint for src/**/*.ts

# Production build
npm run compile            # One-time build (for publishing)
`

**CRITICAL**: Always run `npm run watch` in background during development. VS Code debugger won't work without compiled `out/` folder.

## LLM Setup Requirements

1. Install [LM Studio](https://lmstudio.ai)
2. Download model: `ministral-3-14b-reasoning`
3. Start LM Studio server (default: http://127.0.0.1:1234/v1)
4. Configure `.coe/config.json`:

`json
{
  "llm": {
    "endpoint": "http://127.0.0.1:1234/v1",
    "model": "ministral-3-14b-reasoning",
    "timeoutSeconds": 60,
    "maxTokens": 2048
  }
}
`

5. View LLM output: VS Code Output panel → "COE Logs"

## Debugging Setup

1. Press **F5** to launch Extension Development Host
2. COE activates on `onStartupFinished`
3. Check **"COE Logs"** in Output panel for runtime logs
4. Inspect ticket database: `.coe/tickets.db` (use SQLite browser)

## Related Skills
- **[03-testing-conventions.md](03-testing-conventions.md)** - Test patterns
- **[10-configuration-management.md](10-configuration-management.md)** - Config setup
- **[14-common-pitfalls.md](14-common-pitfalls.md)** - Common issues