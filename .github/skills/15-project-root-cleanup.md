# Skill 15: Project Root Folder Cleanup

> Keep the project root clean by organizing loose files into proper locations.

## Why This Matters

A cluttered root folder makes the project look unprofessional and makes it hard to find what matters. Temporary files, test outputs, and one-off scripts pile up during development. This skill ensures they get filed properly.

## Rules

### Files That BELONG in Root
- `README.md` - Main project README
- `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` - AI agent instructions (mirrored)
- `PRD.md` - Product Requirements Document
- `package.json`, `tsconfig.json`, `jest.config.js` - Build/config files
- `.eslintrc.json`, `.gitignore` - Linting and git config
- `CHANGELOG.md` - Release history (if exists)
- `LICENSE` - License file (if exists)

### Files That Should Be MOVED
| File Pattern | Destination | Why |
|---|---|---|
| `*_output*.txt`, `*_results*.txt` | `.tmp/test-outputs/` | Test output logs |
| `*_progress.txt` | `.tmp/progress/` | Session progress tracking |
| `FAILING_TESTS_*.md` | `.tmp/debug-notes/` | Historical debug notes |
| `temp_*.txt` | `.tmp/` | Temporary data |
| `final_coverage.txt` | `.tmp/coverage/` | Coverage snapshots |
| `apply-*.js`, `debug-*.js` | `scripts/` | One-off helper scripts |
| `MT-*-COMPLETION-GUIDE.md` | `Docs/completion-guides/` | Task completion guides |

### Directory Structure
```
project-root/
├── .coe/              # Runtime config and cache (gitignored except config.json)
├── .github/           # GitHub workflows and skills
├── .tmp/              # ALL temporary files (gitignored)
│   ├── test-outputs/  # Test run logs
│   ├── debug-notes/   # Historical analysis files
│   ├── progress/      # Progress tracking files
│   └── coverage/      # Coverage reports
├── Docs/              # Project documentation
│   ├── This Program's Plans/  # Architecture and planning
│   └── completion-guides/     # Task completion guides
├── scripts/           # Helper scripts (apply-mt001.js, debug-cache.js)
├── src/               # Source code
└── tests/             # Test files
```

## Cleanup Procedure

1. **Identify loose files**: `ls` the root and check against the "BELONG" list
2. **Create target dirs** if missing: `.tmp/`, `scripts/`, `Docs/completion-guides/`
3. **Move files** to proper locations
4. **Update `.gitignore`**: Ensure `.tmp/` is ignored
5. **Verify nothing breaks**: Run `npm run compile && npm run test:once`

## When To Clean Up

- After a major feature or stage completion
- Before creating a pull request
- When the root has 5+ temporary/output files
- At the start of a new session if clutter is noticed

## Common Mistakes

1. **Don't delete** - Move to `.tmp/` instead. You might need debug notes later.
2. **Don't move package.json** - Build config files stay in root.
3. **Don't ignore .coe/config.json** - It should be tracked (example config for new users).
4. **Don't clean during active debugging** - Wait until the issue is resolved.
