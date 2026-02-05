/**
 * Multi-platform AI assistant support for perf-skill
 */

export const AI_PLATFORMS = [
  "claude",
  "cursor", 
  "windsurf",
  "copilot",
  "kiro",
  "codex",
  "qoder",
  "roocode",
  "gemini",
  "trae",
  "opencode",
  "continue",
  "codebuddy",
  "all",
] as const;

export type AIPlatform = (typeof AI_PLATFORMS)[number];

export interface PlatformConfig {
  platform: string;
  displayName: string;
  installType: "skill" | "workflow" | "rule";
  folderStructure: {
    root: string;
    skillPath: string;
    filename: string;
  };
  frontmatter: Record<string, string> | null;
  sections: {
    quickReference: boolean;
  };
  description: string;
}

/**
 * Platform configurations - defines how each AI platform expects skills to be installed
 */
export const PLATFORM_CONFIGS: Record<Exclude<AIPlatform, "all">, PlatformConfig> = {
  claude: {
    platform: "claude",
    displayName: "Claude Code",
    installType: "skill",
    folderStructure: {
      root: ".claude",
      skillPath: "skills/perf-skill",
      filename: "SKILL.md",
    },
    frontmatter: null,
    sections: {
      quickReference: true,
    },
    description: "Performance profile evidence extractor. Converts pprof CPU and heap profiles to structured Markdown and JSON. Actions: analyze, convert, diff, profile, run, compare, investigate, optimize. File types: .pb.gz, .pprof, CPU profile, heap profile. Scenarios: slow API, memory leak, high CPU, performance regression, before/after comparison.",
  },
  cursor: {
    platform: "cursor",
    displayName: "Cursor",
    installType: "skill",
    folderStructure: {
      root: ".cursor",
      skillPath: "skills/perf-skill",
      filename: "SKILL.md",
    },
    frontmatter: null,
    sections: {
      quickReference: false,
    },
    description: "Performance profile evidence extractor. Converts pprof CPU and heap profiles to structured Markdown and JSON. Actions: analyze, convert, diff, profile, run, compare, investigate, optimize. File types: .pb.gz, .pprof, CPU profile, heap profile. Scenarios: slow API, memory leak, high CPU, performance regression, before/after comparison.",
  },
  windsurf: {
    platform: "windsurf",
    displayName: "Windsurf",
    installType: "workflow",
    folderStructure: {
      root: ".windsurf",
      skillPath: "workflows",
      filename: "perf-skill.md",
    },
    frontmatter: {
      name: "perf-skill",
      trigger: "manual",
    },
    sections: {
      quickReference: false,
    },
    description: "Performance profile evidence extractor for pprof CPU and heap profiles.",
  },
  copilot: {
    platform: "copilot",
    displayName: "GitHub Copilot",
    installType: "workflow",
    folderStructure: {
      root: ".github",
      skillPath: "copilot-instructions",
      filename: "perf-skill.md",
    },
    frontmatter: null,
    sections: {
      quickReference: false,
    },
    description: "Performance profile evidence extractor for pprof CPU and heap profiles.",
  },
  kiro: {
    platform: "kiro",
    displayName: "Kiro",
    installType: "workflow",
    folderStructure: {
      root: ".kiro",
      skillPath: "workflows",
      filename: "perf-skill.md",
    },
    frontmatter: {
      name: "perf-skill",
      trigger: "manual",
    },
    sections: {
      quickReference: false,
    },
    description: "Performance profile evidence extractor for pprof CPU and heap profiles.",
  },
  codex: {
    platform: "codex",
    displayName: "Codex CLI",
    installType: "skill",
    folderStructure: {
      root: ".codex",
      skillPath: "skills/perf-skill",
      filename: "SKILL.md",
    },
    frontmatter: null,
    sections: {
      quickReference: false,
    },
    description: "Performance profile evidence extractor for pprof CPU and heap profiles.",
  },
  qoder: {
    platform: "qoder",
    displayName: "Qoder",
    installType: "skill",
    folderStructure: {
      root: ".qoder",
      skillPath: "skills/perf-skill",
      filename: "SKILL.md",
    },
    frontmatter: null,
    sections: {
      quickReference: false,
    },
    description: "Performance profile evidence extractor for pprof CPU and heap profiles.",
  },
  roocode: {
    platform: "roocode",
    displayName: "Roo Code",
    installType: "workflow",
    folderStructure: {
      root: ".roo",
      skillPath: "workflows",
      filename: "perf-skill.md",
    },
    frontmatter: {
      name: "perf-skill",
      trigger: "manual",
    },
    sections: {
      quickReference: false,
    },
    description: "Performance profile evidence extractor for pprof CPU and heap profiles.",
  },
  gemini: {
    platform: "gemini",
    displayName: "Gemini CLI",
    installType: "skill",
    folderStructure: {
      root: ".gemini",
      skillPath: "skills/perf-skill",
      filename: "SKILL.md",
    },
    frontmatter: null,
    sections: {
      quickReference: false,
    },
    description: "Performance profile evidence extractor for pprof CPU and heap profiles.",
  },
  trae: {
    platform: "trae",
    displayName: "Trae",
    installType: "rule",
    folderStructure: {
      root: ".trae",
      skillPath: "rules",
      filename: "perf-skill.md",
    },
    frontmatter: null,
    sections: {
      quickReference: false,
    },
    description: "Performance profile evidence extractor for pprof CPU and heap profiles.",
  },
  opencode: {
    platform: "opencode",
    displayName: "OpenCode",
    installType: "skill",
    folderStructure: {
      root: ".opencode",
      skillPath: "skills/perf-skill",
      filename: "SKILL.md",
    },
    frontmatter: null,
    sections: {
      quickReference: false,
    },
    description: "Performance profile evidence extractor for pprof CPU and heap profiles.",
  },
  continue: {
    platform: "continue",
    displayName: "Continue",
    installType: "skill",
    folderStructure: {
      root: ".continue",
      skillPath: "skills/perf-skill",
      filename: "SKILL.md",
    },
    frontmatter: null,
    sections: {
      quickReference: false,
    },
    description: "Performance profile evidence extractor for pprof CPU and heap profiles.",
  },
  codebuddy: {
    platform: "codebuddy",
    displayName: "CodeBuddy",
    installType: "skill",
    folderStructure: {
      root: ".codebuddy",
      skillPath: "skills/perf-skill",
      filename: "SKILL.md",
    },
    frontmatter: null,
    sections: {
      quickReference: false,
    },
    description: "Performance profile evidence extractor for pprof CPU and heap profiles.",
  },
};

export function isPlatformValid(platform: string): platform is AIPlatform {
  return AI_PLATFORMS.includes(platform as AIPlatform);
}

export function getPlatformConfig(platform: Exclude<AIPlatform, "all">): PlatformConfig {
  return PLATFORM_CONFIGS[platform];
}

export function getAllPlatforms(): Exclude<AIPlatform, "all">[] {
  return AI_PLATFORMS.filter((p): p is Exclude<AIPlatform, "all"> => p !== "all");
}
