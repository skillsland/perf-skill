# perf-skill for Claude Marketplace

This directory contains the Claude Marketplace plugin configuration for perf-skill.

## Files

- `plugin.json` - Main plugin manifest defining skills, installation, and compatibility
- `marketplace.json` - Marketplace listing metadata (description, category, triggers)

## Publishing to Claude Marketplace

### Prerequisites

1. Ensure the npm package is published: `npm publish`
2. Verify the SKILL.md is included in the npm package
3. Test the installation: `npx perf-skill init --ai claude`

### Submission

1. Visit [Claude Marketplace Developer Portal](https://claude.ai/marketplace/developer)
2. Submit this repository for review
3. The marketplace will validate:
   - Plugin manifest schema
   - Installation process
   - Skill file structure
   - Documentation quality

### Local Testing

```bash
# Install locally for testing
npx perf-skill init --ai claude --scope project

# Verify skill installation
cat .claude/skills/perf-skill/SKILL.md
```

## Trigger Configuration

The `marketplace.json` defines when Claude should suggest this skill:

- **File patterns**: `*.pb.gz`, `*.pprof`
- **Keywords**: profile, pprof, cpu, heap, memory, performance, slow, bottleneck
- **Intents**: "analyze profile", "why is my app slow", "compare performance"

## Version Sync

Keep `version` in `plugin.json` synchronized with `package.json` version.

## Support

- Issues: https://github.com/skillsland/perf-skill/issues
- Documentation: https://github.com/skillsland/perf-skill#readme
