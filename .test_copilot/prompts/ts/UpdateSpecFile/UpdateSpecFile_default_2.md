---
kind: ut-gen-copilot-prompt
title: Update Spec File (Step 3 - Task & Output)
---

## COE Testing Standards

All generated tests MUST follow these rules:
- Use `describe()` and `it()` blocks only (never `test()`).
- Mock the VS Code API thoroughly. Follow patterns in `tests/__mocks__/vscode.ts` (e.g., mock `vscode.ExtensionContext`, `commands`, `window`, etc.).
- Target ≥ 80% branch coverage on the function/class under test.
- Import and use Logger for debugging: `import { Logger } from '../../utils/logger';` — add `Logger.debug()`, `Logger.info()`, or `Logger.error()` in mocks and at critical test steps.
- **Never write to `.coe/config.json`** — it is read-only. Only read values when needed.
- Handle offline/local LLM gracefully: endpoint `http://192.168.1.205:1234/v1`, model `mistralai/ministral-3-14b-reasoning`.
- Include the happy path + key edge cases: `null`/`undefined` inputs, thrown errors, timeouts, file locking (SQLite busy/full/EACCES), concurrent access.
- **PRESERVE ALL PLACEHOLDERS EXACTLY** (e.g., `<<<SourceCode>>>`, `<<<TestErrors>>>`, `<<<Spec>>>`, `<<<SpecFileName>>>`, `<<<ClassDeclare>>>`, etc.) — do not add, remove, or rename any.
- Output format: Return **ONLY** a single markdown code block with test code and necessary imports—no extra text, explanations, or metadata outside the code block.

## Task

**Update the test code** to increase line coverage or fix test code failures.

## Guidelines

- Do not change unrelated code in the spec file.
- Do not add redundant test cases if the line is already covered.
- Keep all JSDoc comments.
- Skip commented-out code.
- If no update is needed, return `NO_NEED_TO_CHANGE` in a code block.

## Output

Return **ONLY** the complete updated spec file in a markdown code block (or `NO_NEED_TO_CHANGE`):

```<<<Language>>>
[complete updated spec file]
```