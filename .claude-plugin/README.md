# perf-skill - Claude Code Plugin

This directory contains the Claude Code plugin configuration for perf-skill.

## Plugin Structure

```
perf-skill/
  .claude-plugin/
    plugin.json          # Plugin manifest (metadata only)
    README.md            # This file
  skills/
    perf-skill/
      SKILL.md           # Skill definition (discovered by Claude Code)
```

Claude Code discovers skills via the `skills/` directory convention. The `plugin.json` provides metadata; skill contents are found automatically.

## Installation via Marketplace

Users install this plugin in two steps:

```text
# 1. Add the marketplace (this repo)
/plugin marketplace add skillsland/perf-skill

# 2. Install the plugin from the marketplace
/plugin install perf-skill@skillsland-perf
```

## Alternative: CLI Installation (project-level)

For project-level installation (commits skill to repo):

```bash
npx perf-skill init --ai claude
```

This copies the skill to `.claude/skills/perf-skill/SKILL.md` in the current project.

## Version Sync

Keep `version` in `plugin.json` synchronized with `package.json`.

## Support

- Issues: https://github.com/skillsland/perf-skill/issues
- Documentation: https://github.com/skillsland/perf-skill#readme
