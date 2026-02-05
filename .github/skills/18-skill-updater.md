# Skill Updater Skill

**Purpose**: Keep GitHub Copilot skills current and create new skills as patterns emerge  
**Related Files**: `.github/skills/*.md`, codebase patterns  
**Keywords**: skill-management, skill-updates, new-patterns, pattern-discovery

## Skill Maintenance Workflow

### When to Update Existing Skills

1. **Code changes significantly**: Update real code examples
2. **New edge cases discovered**: Add to common mistakes sections
3. **Better patterns found**: Improve explanations and metaphors
4. **Examples become outdated**: Replace with current code

### When to Create New Skills

1. **New pattern emerges**: Not covered by existing skills
2. **Repeated mistakes**: New mistake pattern discovered (add to skill)
3. **Major feature added**: Major new functionality needs documentation
4. **Feedback from developers**: If multiple people ask same question

## Skill Version Management

Each skill should track changes:

```markdown
# Skill Title

**Last Updated**: February 4, 2026
**Status**: Current ✓ (Updated in last month)
**Version**: 1.2

## Recent Updates
- Updated code examples to match latest codebase
- Added new mistake about token limits
- Clarified error handling pattern
```

## Skill Quality Metrics

Each skill should have:

- ✅ Clear purpose statement
- ✅ 3-5 real code examples from codebase  
- ✅ Related skills cross-referenced
- ✅ Common mistakes section
- ✅ When-to-use guidance
- ✅ Simple explanation / metaphor

## Updating a Skill: Checklist

When updating a skill file:

- [ ] Run code examples - do they still work?
- [ ] Check file paths - are references current?
- [ ] Update examples if code changed
- [ ] Add new discoveries to mistakes section
- [ ] Verify links to related skills
- [ ] Update timestamps
- [ ] Get feedback from team

## Creating a New Skill: Checklist

When creating new skill:

- [ ] Numbered sequentially (next available number)
- [ ] Clear purpose and keywords
- [ ] 3+ real code examples
- [ ] Common mistakes section
- [ ] Related skills section
- [ ] Simple explanations / metaphors
- [ ] Added to skills README.md
- [ ] Links bidirectional (related skills link back)

## Skill Discovery Process

### Finding patterns needing documentation:

1. **Code review**: "Hmm, everyone does this the same way"
   → Might need a skill

2. **Issue patterns**: "Three people asked about this"
   → Definitely needs a skill

3. **Test failures**: "This test keeps failing for same reason"
   → Add to existing skill or create new

4. **Onboarding feedback**: "New dev struggled with X"
   → Improve documentation or create skill

## Example: Adding New Skill

```
Pattern discovered: Teams format error messages inconsistently

Decision: Create new skill "Error Messages and User Communication"

Steps:
1. Create 23-error-messages.md
2. Document pattern with 4 code examples
3. Add common mistakes (bad error messages)
4. Update 11-error-handling-patterns.md and 20-noob-proofing.md 
   to link to new skill
5. Update skills README.md with new skill entry
6. Get feedback: "Makes sense? Too verbose? Missing anything?"
```

## Automated Skill Monitoring

Skills need updates if:

```
🔴 RED FLAGS:
- Last update >3 months ago
- Code examples use deprecated APIs
- Referenced files don't exist in codebase
- Multiple team members ask same question
- Test failures match skill's use case

✅ SIGNALS TO UPDATE:
- New pattern stabilizes
- Better explanation discovered
- Related skill created
- Team feedback highlights gap
```

## Skill Dependencies

Map out which skills relate:

```
02-service-patterns (core)
  ├→ 03-testing-conventions
  ├→ 10-configuration-management
  └→ 11-error-handling-patterns

06-llm-integration (core)
  ├→ 07-conversation-management
  └→ 11-error-handling-patterns

12-agent-coordination (core)
  ├→ 16-orchestrator-agent
  ├→ 06-llm-integration
  └→ 02-service-patterns
```

Update one skill → Check all dependent skills for needed updates.

## Related Skills
- **[04-jsdoc-style.md](04-jsdoc-style.md)** - Documentation quality
- **[17-document-updater.md](17-document-updater.md)** - Doc updates
- **[README.md](README.md)** - Skill index
