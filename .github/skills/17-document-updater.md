# Document Updater Skill

**Purpose**: Keep documentation current, find gaps, and strengthen weak areas (especially for new developers)  
**Related Files**: `Docs/`, `.github/copilot-instructions.md`, `README.md`  
**Keywords**: documentation, updater, gaps, errors, new-developer

## Document Updater Responsibilities

### 1. Find Documentation Gaps

```
When code changes are made:
✓ Check if existing docs mention this feature
✓ Find missing explanations
✓ Identify outdated examples
✓ Flag weak areas
```

### 2. Strengthen Weak Areas

Especially important for new developers who might not understand:
- Why patterns exist (not just how)
- Common mistakes (with solutions)
- Simple explanations and metaphors
- Step-by-step guides vs just code

### 3. Keep Docs in Sync

When major code changes happen:
- Update relevant documentation
- Update examples to match new code
- Refresh architecture diagrams
- Update file paths in references

## Documentation Quality Checklist

For code documentation, verify:
- [ ] Has JSDoc comment (technical summary)
- [ ] Has "Simple explanation" (beginner-friendly)
- [ ] Examples are current (not outdated)
- [ ] Related files referenced with correct paths
- [ ] Links cross-reference related patterns

For guides, check:
- [ ] Includes why (not just what and how)
- [ ] Has real code examples from codebase
- [ ] Includes common mistakes (with fixes)
- [ ] Easy for beginners to understand
- [ ] Step-by-step instructions are clear

## Common Documentation Gaps

**❌ Gaps found in many projects:**
- "What is this pattern and why use it?"
- "Here's the mistake I just made, how do I avoid it?"
- "Walk me through this step-by-step"
- "What do I do if X goes wrong?"

**✅ Solutions:**
- Add "Why" sections explaining rationale
- Create "Common Mistakes" with fixes
- Add walkthroughs for complex features
- Create troubleshooting guides

## Document Updater in Action

```
Code Change: Add new service
  ↓
Document Updater checks:
  - Is there a skill for this pattern? ✓ (02-service-patterns.md)
  - Does the skill have current examples? ✗ (old code)
  - Are there common problems documented? ✗
  - Can a new dev understand this? ✗ (missing explanation)
  ↓
Document Updater updates:
  1. Update 02-service-patterns.md with new real code
  2. Add common mistakes section
  3. Add simple explanation with metaphor
  4. Update skills README.md with reference
  ↓
Result: New docs ready for new developer
```

## Supporting New Developers

When docs are written for **beginners**, always include:

1. **What**: Clear description of feature
2. **Why**: Reason it exists, when to use it
3. **How**: Step-by-step instructions
4. **Examples**: Real code from codebase
5. **Mistakes**: Common pitfalls and fixes
6. **Analogy**: Simple metaphor explaining concept

### Example for Singletons

❌ **Without beginner support:**
```typescript
let instance: Service | null = null;

export function getServiceInstance(): Service {
    if (!instance) throw new Error('Not initialized');
    return instance;
}
```

✅ **With beginner support:**
```typescript
// Like asking for the store manager - there's only one
// This function finds them for you (singleton pattern)
let instance: Service | null = null;

export function getServiceInstance(): Service {
    if (!instance) throw new Error('Not initialized');
    return instance;
}
```

## Related Skills
- **[04-jsdoc-style.md](04-jsdoc-style.md)** - Documentation style
- **[20-noob-proofing.md](20-noob-proofing.md)** - New developer support
- **[21-copilot-instructions-updater.md](21-copilot-instructions-updater.md)** - Instructions updates
