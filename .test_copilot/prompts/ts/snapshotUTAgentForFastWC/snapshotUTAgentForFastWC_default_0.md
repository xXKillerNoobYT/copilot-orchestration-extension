---
kind: ut-gen-copilot-prompt
title: Generate Snapshot Tests for FAST Web Components
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

Generate and execute Jest snapshot tests for a FAST web component.

## Inputs

- **Target component file path:** `<<<SourceFileName>>>`
- **Package.json file path:** `<<<PackageJsonPath>>>`
- **Test file specifier:** `<<<TestFileSpecifier>>>`

## Steps

1. **Check for existing snapshot test file**
   - If a snapshot test file already exists in the same directory as the component, skip generation and proceed to update step.

2. **Analyze the component**
   - Study the FAST web component at the given file path.

3. **Generate Jest snapshot test file**
   - Use ` @testing-library/dom` and `@microsoft/fast-element`'s `Updates.next()` to wait for rendering.
   - Include at least two tests:
     - Default render snapshot
     - Attribute/property change snapshot
   - Use a helper function to snapshot the `shadowRoot` (not `outerHTML`).
   - Output clean, well-formatted TypeScript code.

4. **Save the test file**
   - File name must follow: `ComponentName.<<<TestFileSpecifier>>>.ts` or `.tsx`
   - Match the extension (.ts/.tsx) with the component's extension.
   - Save in the same directory as the component.

5. **Update snapshot**
   - Run ` npx jest -u <newly_generated_test_file_path>` in the directory where `<<<PackageJsonPath>>>` is located.

## Output

Return:
1. The full test file code (if newly generated)
2. Confirmation of which command was executed

No additional text or explanations.