---
kind: ut-gen-copilot-prompt
title: Generate Function Unit Tests
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

Write comprehensive unit tests with <<<TestFramework>>> for the function or function component `<<<FunctionName>>>` in a new spec file (`<<<SpecFileName>>>`).

## Guidelines

**Test Design:**
- Test cases MUST be meaningful and cover the main logic.
- Include happy path tests and key edge cases (null, undefined, errors, timeouts, file locks).
- For async code, mock external dependencies only (e.g., fetch, API calls)—do NOT mock `useEffect` or React hooks.

**Mocking Rules:**
- Mock all dependent functions and classes from other modules/files.
- For React components: use real rendering and user interactions. Mock only external dependencies (not built-in hooks like `useState`, `useEffect`, `useRef`, `useMemo`).
- Never call `jest.spyOn(React, ...)`.
- Use `screen` and `fireEvent` or `userEvent` for queries and interactions.
- Mock timezones when necessary.

**Code Quality:**
- No TypeScript errors. Return code must compile.
- Do not redefine or overwrite the function under test—only spy or mock dependencies.
- No placeholder imports; no unused data.
- Do NOT use `null-assertion` operator (`!`).
- Do NOT use `new Date()` or `Date.now()` in test code.
- Do NOT mock React built-in hooks (useState, useEffect, useRef, useMemo, etc.).

## Input

**Source code:**
```typescript
<<<SourceCode>>>
```

## Output

Return **ONLY** a single markdown code block with the test code:
```typescript
[complete test code]
```