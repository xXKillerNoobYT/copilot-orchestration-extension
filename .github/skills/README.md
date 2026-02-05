# GitHub Copilot Skills for COE

This directory contains specialized GitHub Copilot skills for developing the **Copilot Orchestration Extension (COE)**. These skills teach Copilot about COE-specific patterns, conventions, and best practices discovered through comprehensive codebase analysis.

## 📚 Skill Index (28 Skills Total)

### Core Architecture (01-02)
- **[01-coe-architecture.md](01-coe-architecture.md)** - 3-layer architecture, singleton pattern, event-driven updates
- **[02-service-patterns.md](02-service-patterns.md)** - Service implementation template with initialization patterns

### Testing & Documentation (03-04)
- **[03-testing-conventions.md](03-testing-conventions.md)** - "Test N:" naming, mocking, setup/teardown patterns
- **[04-jsdoc-style.md](04-jsdoc-style.md)** - Technical summary + "Simple explanation" documentation style

### UI Integration (05)
- **[05-treeview-providers.md](05-treeview-providers.md)** - TreeDataProvider implementation, auto-refresh patterns

### LLM Integration (06-07)
- **[06-llm-integration.md](06-llm-integration.md)** - Streaming, timeout handling, Server-Sent Events
- **[07-conversation-management.md](07-conversation-management.md)** - History pruning, chatId tracking

### Protocols & Integration (08-09)
- **[08-mcp-protocol.md](08-mcp-protocol.md)** - JSON-RPC 2.0, error codes, MCP tool patterns
- **[09-vscode-api-patterns.md](09-vscode-api-patterns.md)** - Commands, status bar, configuration

### Core Patterns (10-13)
- **[10-configuration-management.md](10-configuration-management.md)** - Config loading, validation, fallbacks
- **[11-error-handling-patterns.md](11-error-handling-patterns.md)** - Typed catches, graceful degradation
- **[12-agent-coordination.md](12-agent-coordination.md)** - Agent routing, autonomous workflows
- **[13-database-patterns.md](13-database-patterns.md)** - SQLite with in-memory fallback

### Troubleshooting & Workflows (14-15)
- **[14-common-pitfalls.md](14-common-pitfalls.md)** - Mistakes to avoid, performance tips
- **[15-dev-workflows.md](15-dev-workflows.md)** - Build, test, debug, LLM setup

### Advanced Management (16-22)
- **[16-orchestrator-agent.md](16-orchestrator-agent.md)** - Project manager role, task breakdown, progress tracking
- **[17-document-updater.md](17-document-updater.md)** - Keep documentation current, find gaps, support new developers
- **[18-skill-updater.md](18-skill-updater.md)** - Maintain skill library, create new skills, version management
- **[19-prd-maintenance.md](19-prd-maintenance.md)** - Maintain Product Requirements Document, feature status tracking
- **[20-noob-proofing.md](20-noob-proofing.md)** - Make COE accessible for new developers, clear error messages
- **[21-copilot-instructions-updater.md](21-copilot-instructions-updater.md)** - Keep copilot-instructions.md current
- **[22-test-fixer.md](22-test-fixer.md)** - Fix tests properly after code updates, prevent regressions

### Quality Control & Verification (23-26, 28)
- **[23-plan-drift-detection.md](23-plan-drift-detection.md)** - Detect when code deviates from plan, inform team immediately
- **[24-observation-skill.md](24-observation-skill.md)** - Observe patterns, behavior, detect issues early
- **[25-fixing-plan-drift.md](25-fixing-plan-drift.md)** - Correct deviations, restore alignment between code and plan
- **[26-safety-checklist.md](26-safety-checklist.md)** - Pre-flight safety checks before committing code
- **[28-user-request-validation.md](28-user-request-validation.md)** - Validate user requests, stop work on blocked tasks and unsafe operations

### Project Tracking (27)
- **[27-project-breakdown-maintenance.md](27-project-breakdown-maintenance.md)** - Keep PROJECT-BREAKDOWN & TODO List.md accurate and current

## 🎯 Quick Reference Guide

### When working on...

| Task | Use Skills |
|------|-----------|
| **Creating a new service** | 02, 10, 11 |
| **Adding a TreeView** | 05, 09 |
| **Writing tests** | 03, 14, 22 |
| **LLM integration** | 06, 07, 10 |
| **MCP tools** | 08, 09 |
| **Agent coordination** | 12, 16, 02 |
| **Database operations** | 13, 11 |
| **Documentation** | 04, 17, 21 |
| **Debugging issues** | 14, 15, 22 |
| **Understanding architecture** | 01, 02, 12, 16 |
| **New developer onboarding** | 20, 01, 02, 03 |
| **Fixing test failures** | 22, 03, 14 |
| **Maintaining skills library** | 18, 17, 04 |
| **Project management** | 16, 19, 18 |
| **Setting up COE instructions** | 21, 16, 20 |
| **Detecting plan drift** | 23, 24, 25 |
| **Fixing drift and realignment** | 25, 23, 26 |
| **Quality assurance** | 26, 23, 24, 22 |
| **Monitoring and observation** | 24, 23, 14 |
| **Pre-commit safety checks** | 26, 03, 22, 14 |
| **Updating project checklist** | 27, 19, 23, 24 |
| **Validating user requests** | 28, 23, 26, 27 |
| **Stopping blocked/unsafe work** | 28, 23, 26 |

## 🚀 How GitHub Copilot Uses These Skills

GitHub Copilot automatically discovers and uses skills from `.github/skills/` when:
- You're writing code in COE project files
- You request code generation or explanation
- You ask questions about patterns or conventions
- You're fixing bugs or refactoring

**Pro tip**: Reference skill names in comments to guide Copilot:
```typescript
// Following skill 02-service-patterns.md singleton pattern
let instance: MyService | null = null;
```

## 📖 Skill Organization

Skills are numbered for progressive learning:
1. **01-02**: Foundation (architecture, services)
2. **03-05**: UI and testing fundamentals
3. **06-09**: External integrations (LLM, MCP, VS Code)
4. **10-13**: Core implementation patterns
5. **14-15**: Advanced workflows (troubleshooting, development)
6. **16-22**: Management and maintenance (orchestration, documentation, team support)
7. **23-26, 28**: Quality control and verification (drift detection, observation, safety checks, request validation)
8. **27**: Project tracking (master checklist maintenance)

Each skill includes:
- ✅ Real code examples from COE codebase
- ✅ Related file references with paths
- ✅ Common mistakes and solutions
- ✅ Keywords for discoverability

## 🔄 Maintenance

**Last Updated**: February 4, 2026  
**Total Skills**: 28 (covering all COE patterns)  
**Coverage**: 50+ source files, 30+ test files, 10+ architecture documents  
**Maintained By**: COE Development Team

When updating skills:
1. Keep examples synchronized with actual codebase
2. Update file paths if files are moved/renamed
3. Add new skills for new patterns discovered
4. Cross-reference related skills for context

---

**Need help?** Check `.github/copilot-instructions.md` for full development guide.
