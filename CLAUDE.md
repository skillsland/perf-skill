# CLAUDE.md - Developer Guide for perf-skill

This document provides guidelines for AI agents and developers working with the perf-skill codebase.

## Project Overview

perf-skill is an AI skill that converts pprof CPU and heap profiles (.pb.gz) into structured Markdown and JSON evidence. It follows a **deterministic, evidence-first** design philosophy - the tool produces factual data without AI dependencies, while AI agents can optionally enhance the output with recommendations.

## Repository Structure

```
perf-skill/
├── src/
│   ├── cli/              # CLI implementation
│   │   ├── main.ts       # CLI entry point
│   │   ├── init.ts       # Skill installation logic
│   │   ├── platforms.ts  # Multi-platform configurations
│   │   └── template.ts   # Template rendering engine
│   ├── parser/           # pprof parsing logic
│   ├── renderer/         # Markdown/JSON output
│   ├── profile/          # Node.js profiling
│   ├── server/           # HTTP API server
│   └── index.ts          # Library exports
├── test/                 # Test files
├── SKILL.md              # Main skill definition
├── .claude-plugin/       # Claude Marketplace configs
├── package.json
└── README.md
```

## Key Commands

### Development

```bash
# Build
npm run build

# Run CLI in development
npm run cli -- analyze profile.pb.gz

# Run tests
npm test

# Lint
npm run lint
```

### CLI Usage

```bash
# Analyze a profile
npx perf-skill analyze cpu.pb.gz -o report.md

# Compare profiles
npx perf-skill diff base.pb.gz current.pb.gz

# Profile and analyze a Node.js app
npx perf-skill run app.js --duration 10s

# Install skill for a platform
npx perf-skill init --ai cursor
npx perf-skill init --ai claude
npx perf-skill init --ai all
```

## Architecture Decisions

### Evidence-First Design

- The core analyzer produces structured data without AI
- LLM integration is optional (via `--ai` flag)
- All outputs are reproducible and deterministic

### Multi-Platform Support

The `init` command supports 13+ AI platforms:
- Claude, Cursor, Windsurf, Copilot, Kiro
- Codex, Qoder, Roo Code, Gemini, Trae
- OpenCode, Continue, CodeBuddy

Each platform has its own configuration in `src/cli/platforms.ts`.

### Template System

Platform-specific skill files are generated from:
1. Base `SKILL.md` content
2. Platform configuration (frontmatter, sections)
3. Template engine in `src/cli/template.ts`

## Contributing Guidelines

### Code Style

- Use TypeScript strict mode
- Follow existing patterns for error handling
- Add tests for new features
- Update SKILL.md for user-facing changes

### Testing

```bash
# Run all tests
npm test

# Run specific test file
node --test --import tsx test/parser.test.ts
```

### Pull Request Process

1. Create feature branch from `main`
2. Make changes with descriptive commits
3. Ensure tests pass: `npm test`
4. Ensure lint passes: `npm run lint`
5. Update documentation if needed
6. Submit PR with clear description

## Common Tasks

### Adding a New Platform

1. Add platform to `AI_PLATFORMS` array in `src/cli/platforms.ts`
2. Add configuration to `PLATFORM_CONFIGS` object
3. Test installation: `npm run cli -- init --ai <platform>`

### Updating SKILL.md

1. Edit the root `SKILL.md` file
2. Test rendering: `npm run cli -- init --ai claude --dry-run`
3. Verify frontmatter is valid YAML

### Publishing

```bash
# Bump version
npm version patch|minor|major

# Publish to npm
npm publish

# Sync Claude Marketplace
# - Update version in .claude-plugin/plugin.json
# - Submit to marketplace for review
```

## Debugging

### Common Issues

1. **Profile parsing fails**: Check file is valid gzip-compressed protobuf
2. **Source code not included**: Verify `--source-dir` path exists
3. **Platform install fails**: Check directory permissions

### Verbose Mode

```bash
npx perf-skill analyze profile.pb.gz --verbose
```

## Security Considerations

- Profile data may contain sensitive information
- Use `--redact` (default) to sanitize paths
- Never commit real profiles to the repository
- HTTP server has rate limiting enabled by default
