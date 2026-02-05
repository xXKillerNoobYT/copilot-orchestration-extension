# GitHub Copilot Skills for COE

This directory contains specialized GitHub Copilot skills for developing the **Copilot Orchestration Extension (COE)**. These skills teach Copilot about COE-specific patterns, conventions, and best practices discovered through comprehensive codebase analysis.

## 📚 Skill Index

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

## 🎯 Quick Reference Guide

### When working on...

| Task | Use Skills |
|------|-----------|
| **Creating a new service** | 02, 10, 11 |
| **Adding a TreeView** | 05, 09 |
| **Writing tests** | 03, 14 |
| **LLM integration** | 06, 07, 10 |
| **MCP tools** | 08, 09 |
| **Agent coordination** | 12, 02 |
| **Database operations** | 13, 11 |
| **Documentation** | 04 |
| **Debugging issues** | 14, 15 |
| **Understanding architecture** | 01, 02, 12 |

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
5. **14-15**: Advanced (troubleshooting, workflows)

Each skill includes:
- ✅ Real code examples from COE codebase
- ✅ Related file references with paths
- ✅ Common mistakes and solutions
- ✅ Keywords for discoverability

## 🔄 Maintenance

**Last Updated**: February 4, 2026  
**Coverage**: 50+ source files, 30+ test files, 10+ architecture documents  
**Maintained By**: COE Development Team

When updating skills:
1. Keep examples synchronized with actual codebase
2. Update file paths if files are moved/renamed
3. Add new skills for new patterns discovered
4. Cross-reference related skills for context

---

**Need help?** Check `.github/copilot-instructions.md` for full development guide.
