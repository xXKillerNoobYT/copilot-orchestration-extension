# I have a function `<<<FunctionName>>>` in the file <<<SourceFileName>>>, and now it changed.
I need to upgrade the unit test file <<<SpecFileName>>>.
# Guidelines:
- Do not include any explanation.
- The test file MUST NOT have any Typescript errors.
- MUST NOT mock the functions, classes and values in the same file.
- MUST NOT redefine or overwrite the methods/classes that need to be tested. Only spy or mock dependencies used inside them.
- MUST NOT use an object with the same method to overwrite the class instance to test the logic.
- Mock all the dependent functions and classes from other module or files in the test cases.
- Mock the timezones when necessary!!!
- The test cases MUST be meaningful and cover the main logic of the function.
- DO NOT add placeholder imports!!!
- DO NOT use `new Date()` or `Date.now()` in the test code.
- MUST RETURN THE TEST CODE IN THE FORMAT OF ```<<<Language>>>\n<Test code>\n```.
- DO NOT use null-assertion operator `!` in the test code.
- MUST NOT keep unused data or value in the test code.
- Do NOT mock any React built-in hooks (do not mock useState, useEffect, useRef, useMemo, etc.).
- Do NOT call jest.spyOn(React, ...) under any circumstances.
- Test behavior using real rendering and user interactions, not implementation details.
- For async logic inside useEffect, only mock external dependencies (e.g., fetch, API calls). Do NOT mock useEffect itself.
- Use screen and fireEvent or userEvent for queries and interactions.

# Source codes:
```<<<Language>>>
<<<SourceCode>>>
```
---
kind: ut-gen-copilot-prompt
title: Repair Function Unit Tests
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

The function `<<<FunctionName>>>` in file `<<<SourceFileName>>>` has changed. Update the unit test file `<<<SpecFileName>>>` to match the new implementation.

## Guidelines

**Test Design:**
- Update existing tests to match the new implementation.
- Add new tests to cover any new logic branch or edge case.
- Maintain happy path tests and key edge cases (null, undefined, errors, timeouts, file locks).
- For async code, mock external dependencies only—do NOT mock `useEffect` or React hooks.

**Mocking Rules:**
- Mock all dependent functions and classes from other modules/files.
- For React components: use real rendering and user interactions. Mock only external dependencies (not built-in hooks).
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

**Updated function `<<<FunctionName>>>` (from <<<SourceFileName>>>):**
```<<<Language>>>
<<<SourceCode>>>
```

**Current test code (<<<SpecFileName>>>):**
```<<<Language>>>
<<<Spec>>>
```

## Output

Return **ONLY** the updated test code in a single markdown code block:
```<<<Language>>>
[updated complete test code]
```
