# Copilot Instructions Updater Skill

**Purpose**: Keep copilot-instructions.md current with critical project information  
**Related Files**: `.github/copilot-instructions.md`, all skills  
**Keywords**: instructions, copilot-config, api-docs, maintenance

## Instructions Document Role

The `.github/copilot-instructions.md` is Copilot's "system prompt" - it tells AI how to work with your codebase.

**Simple explanation**: Like an employee handbook for an AI. It explains the job (maintain COE), the rules (patterns to follow), and where to find answers (skill links).

## What Goes in Instructions

### 1. Project Overview
- Quick summary of what COE is
- Core mission and goals
- Key technologies used

### 2. Architecture Overview
- 3-layer architecture diagram
- Service list and purposes
- Key files and their roles

### 3. Coding Conventions
- Code style requirements
- Pattern enforcement
- Common mistakes to avoid

### 4. Development Workflows
- Build commands
- Test commands  
- Debugging setup
- LLM configuration

### 5. Critical Skills
- Most important skills to know
- Where to find specific patterns
- When to use which skill

### 6. Testing Requirements
- Coverage expectations
- Test setup patterns
- Test naming conventions

### 7. Troubleshooting
- Common issues and fixes
- Error message interpretations
- Debug tips

## When to Update Instructions

Update when:

1. **New critical pattern**: All developers need to know
   Example: "New error handling approach"

2. **Major architecture change**: Update architecture section
   Example: "Added new service type"

3. **Development workflow changes**: Update commands section
   Example: "New build process"

4. **Common mistakes emerging**: Add to pitfalls section
   Example: "3 people made same mistake"

5. **Skills major overhaul**: Update skill references
   Example: "Completely rewrote 6 skills"

6. **Technology upgrades**: Update setup instructions
   Example: "Updated Node.js version"

## Instructions Maintenance Checklist

Quarterly, verify:

- [ ] All commands still work (run them)
- [ ] All file paths still exist
- [ ] All link destinations still exist
- [ ] Test coverage numbers accurate
- [ ] LLM setup instructions current
- [ ] Code examples run without errors
- [ ] Skills referenced in instructions exist
- [ ] Key technologies/versions current

## What NOT to Put in Instructions

Too verbose:
- Don't list every single method (use skills instead)
- Don't duplicate skill documentation
- Don't include historical decisions (document in PRD)

Too trivial:
- Don't mention simple things everyone knows
- Don't list obvious project structure

## Prioritization in Instructions

Instructions should focus on:

🔴 **CRITICAL** (must-know):
- Architecture overview
- Initialization order  
- Most common patterns
- Build/test commands
- Where to ask for help

🟡 **IMPORTANT** (should-know):
- Key files and purposes
- Testing setup
- Configuration
- Common mistakes

🟢 **NICE-TO-KNOW** (reference):
- Detailed patterns (link to skills)
- Historical decisions (link to PRD)
- Research links

## Instructions Structure Template

```markdown
# Copilot Instructions

## Project Overview
[One paragraph - what is COE?]

## Architecture
[Diagram showing 3 layers]

## Quick Start
[5-minute getting started]

## Essential Commands
[Build, test, debug - the 3 commands daily]

## Critical Skills
[Top 5 most important skills to know]

## Common Mistakes
[Top 3 mistakes to avoid]

## Testing
[Coverage requirements, setup pattern]

## Debugging
[How to debug local, remote, tests]

## Where to Find Answers
[Links to skills, PRD, etc.]

## Troubleshooting
[Common errors and solutions]

## References
[Links to docs, architecture docs]
```

## Keeping Instructions Lightweight

Good instructions are:
- ✅ Scannable (headings, bullet points)
- ✅ Actionable (not just theory)
- ✅ Links to details (skills, docs)
- ✅ Current (not outdated examples)

Bad instructions are:
- ❌ One long wall of text
- ❌ Too detailed (duplicates skills)
- ❌ Out of date (code examples don't run)
- ❌ No links (hard to find stuff)

## Related Skills
- **[17-document-updater.md](17-document-updater.md)** - Doc updates
- **[19-prd-maintenance.md](19-prd-maintenance.md)** - PRD updates
- **[04-jsdoc-style.md](04-jsdoc-style.md)** - Documentation style
