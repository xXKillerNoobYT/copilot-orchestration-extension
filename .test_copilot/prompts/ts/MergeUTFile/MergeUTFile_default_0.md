I have a source file `<<<SourceFileName>>>` and two spec files:
- `<<<SpecFileName>>>`
- `<<<TargetFilePath>>>`
            
Merge `<<<SpecFileName>>>` into `<<<TargetFilePath>>>`, preserving all tests and resolving conflicts clearly.

Return only the merged file content within a single code block marked as ```typescript```. Do not include explanations, file paths, metadata, or additional text.

Use <<<TestFramework>>> as the test framework. Ensure the merged file is valid TypeScript and follows the framework's conventions.

# Guidelines:
1. **Imports**: 
   - Gather imports from both files.
   - Remove duplicates and sort alphabetically at the top of the merged file.

2. **Mocks/Stubs**:
   - Place mocks/stubs clearly within their relevant `describe` blocks.
   - If a mock/stub is used across multiple describes, place it globally at the top, directly below imports.

3. **Describes/Context Blocks**:
   - Merge blocks (`describe`, `context`, etc.) with identical titles by sequentially combining their contents.
   - Preserve separate blocks with unique titles without modification.
   - Maintain the original order from the target file; append new blocks from the source file afterward.

4. **Setup/Teardown Hooks** (`beforeEach`, `afterEach`, `beforeAll`, `afterAll`, or equivalent):
   - When identical hooks exist in the same scope, sequentially combine their bodies, starting with the target file hook content, then source file hook content.
   - Explicitly retain all hook statements without deduplication.

5. **Tests (`it`, `test`, etc.)**:
   - Preserve all original test cases unchanged.
   - Keep the `@aiContributed-@{date}` tag if it exists.
   - Maintain tests within their original blocks after merging.

Do not alter or optimize test logic; preserve exact original behavior.

# Files

## <<<SpecFileName>>>
```ts
<<<Spec>>>
```

---
kind: ut-gen-copilot-prompt
title: Merge Unit Test Files
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

Merge `<<<SpecFileName>>>` into `<<<TargetFilePath>>>`, preserving all tests and resolving conflicts clearly.

Return only the merged file content within a single code block. Do not include explanations, file paths, metadata, or additional text.

Use <<<TestFramework>>> as the test framework. Ensure the merged file is valid TypeScript and follows the framework's conventions.

## Guidelines

1. **Imports**: 
   - Gather imports from both files.
   - Remove duplicates and sort alphabetically at the top of the merged file.

2. **Mocks/Stubs**:
   - Place mocks/stubs clearly within their relevant `describe` blocks.
   - If a mock/stub is used across multiple describes, place it globally at the top, directly below imports.

3. **Describes/Context Blocks**:
   - Merge blocks (`describe`, `context`, etc.) with identical titles by sequentially combining their contents.
   - Preserve separate blocks with unique titles without modification.
   - Maintain the original order from the target file; append new blocks from the source file afterward.

4. **Setup/Teardown Hooks** (`beforeEach`, `afterEach`, `beforeAll`, `afterAll`, or equivalent):
   - When identical hooks exist in the same scope, sequentially combine their bodies, starting with the target file hook content, then source file hook content.
   - Explicitly retain all hook statements without deduplication.

5. **Tests** (`it`, `test`, etc.):
   - Preserve all original test cases unchanged.
   - Keep the `@aiContributed-@{date}` tag if it exists.
   - Maintain tests within their original blocks after merging.

Do not alter or optimize test logic; preserve exact original behavior.

## Input Files

**Source file to merge (`<<<SpecFileName>>>`):**
```ts
<<<Spec>>>
```

**Target file (`<<<TargetFilePath>>>`):**
```ts
<<<SpecTemplate>>>
```

## Output

Return **ONLY** the merged test code in a single markdown code block:
```typescript
[complete merged test file]
```