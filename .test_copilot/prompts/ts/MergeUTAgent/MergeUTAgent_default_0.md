---
kind: ut-gen-copilot-prompt
title: Merge Unit Test Files (Agent)
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

# Action Required: Merge and Cleanup Separated Unit Test Files

## Task
Merge multiple separated TypeScript unit test files into a single comprehensive test file. The comprehensive test file may or may not exist; if it does not exist, create it.

## Files
### Merged Test File (Target):
<<<TargetFilePath>>>

### Separated Test Files (Sources to Merge):
<<<FilePathList>>>

## Instructions
Perform these steps strictly in order:

1. **Ensure Target File Exists**
   - If the merged test file at `<<<TargetFilePath>>>` does not exist, create it first as an empty valid test file suitable for the framework `<<<TestFramework>>>`.

2. **Merge Test Cases**
   - Append all tests from each separated test file listed above into the merged test file.
   - Move module mocks inside corresponding `describe` blocks to prevent conflicts.
   - Clearly resolve naming conflicts and duplication.

3. **Cleanup Merged File**
   - Remove duplicate imports, redundant mocks, or unnecessary code.
   - Ensure the merged test file is clean, readable, and correctly formatted.

4. **Validation**
   - Run the merged test file using the testing framework `<<<TestFramework>>>`.
   - Confirm that all tests pass without errors.
   - **Do NOT proceed** if any tests fail.

5. **Delete Separated Files**
   - Only after successful validation, delete all separated test files listed above.

## Safety Measures
- Keep the `@aiContributed-@{date}` tag before the test cases (if it exists).
- Do **NOT** delete any source files if merging or validation fails.
- Do **NOT** overwrite or delete unrelated files.
- Do **NOT** return or output any file contents or logs.

## Execution Note
Perform these actions silently and accurately, adhering strictly to these instructions.