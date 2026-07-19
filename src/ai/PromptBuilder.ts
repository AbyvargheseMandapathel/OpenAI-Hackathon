import * as path from "node:path";

import type { BuildPromptOptions, PromptPayload } from "../models/PromptPayload";
import type { RepositoryContextFile } from "../models/RepositoryContext";

const MAX_REPOSITORY_FILE_CHARS = 8_000;
const CONTEXT_RADIUS_LINES = 80;

export class PromptBuilder {
  public build(options: BuildPromptOptions): PromptPayload {
    const sections = {
      repositorySummary: this.buildRepositorySummary(options),
      gitHistory: this.buildGitHistory(options),
      currentFile: this.buildCurrentFileSection(options),
      currentFunction: this.extractCurrentFunction(options.documentText, options.conflict.startLine),
      conflict: options.conflict,
      codingRules: this.buildCodingRules(options),
      userPreferences: options.userPreferences ?? [],
      outputSchema: this.buildOutputSchema()
    };

    return {
      sections,
      prompt: this.renderPrompt(sections)
    };
  }

  private buildRepositorySummary(options: BuildPromptOptions): string {
    const context = options.repositoryContext;
    const lines = [
      `Repository root: ${context.repositoryRoot}`,
      `Languages: ${this.joinOrUnknown(context.languages)}`,
      `Frameworks: ${this.joinOrUnknown(context.frameworks)}`,
      `Formatters: ${this.joinOrUnknown(context.formatters)}`,
      `Linters: ${this.joinOrUnknown(context.linters)}`,
      `Test frameworks: ${this.joinOrUnknown(context.testFrameworks)}`
    ];

    const fileSections = [...context.files]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((file) => this.renderRepositoryFile(file));

    return [...lines, ...fileSections].join("\n");
  }

  private buildGitHistory(options: BuildPromptOptions): string {
    const git = options.gitContext;
    return [
      `Repository root: ${git.repositoryRoot}`,
      `Current branch: ${git.currentBranch}`,
      `Merge target: ${git.mergeTarget ?? "not detected"}`,
      `Remote URL: ${git.remoteUrl ?? "not detected"}`,
      "GitHub:",
      this.buildGitHubSection(options),
      "Changed files:",
      this.renderList(git.changedFiles),
      "Recent log:",
      this.renderList(git.recentLog),
      "Diff:",
      this.renderBlock(git.diff || "No diff available."),
      "Blame:",
      this.renderBlock(git.blame || "No blame available.")
    ].join("\n");
  }

  private buildGitHubSection(options: BuildPromptOptions): string {
    const github = options.gitContext.github;
    if (!github?.enabled) {
      return "GitHub API context is disabled.";
    }

    const repository = github.repository
      ? [
          `Repository: ${github.repository.fullName}`,
          `Default branch: ${github.repository.defaultBranch ?? "unknown"}`,
          `URL: ${github.repository.htmlUrl}`
        ].join("\n")
      : "Repository: unavailable";
    const pullRequest = github.pullRequest
      ? [
          `Pull request: #${github.pullRequest.number} ${github.pullRequest.title}`,
          `State: ${github.pullRequest.state}`,
          `Branches: ${github.pullRequest.headRef} -> ${github.pullRequest.baseRef}`,
          `URL: ${github.pullRequest.htmlUrl}`
        ].join("\n")
      : "Pull request: unavailable";
    const openPullRequests = github.openPullRequests
      .map((request) => `#${request.number} ${request.headRef} -> ${request.baseRef}: ${request.title}`)
      .join("\n") || "none";
    const diagnostics = github.diagnostics.join("\n") || "none";

    return [
      repository,
      pullRequest,
      "Open pull requests:",
      openPullRequests,
      "Diagnostics:",
      diagnostics
    ].join("\n");
  }

  private buildCurrentFileSection(options: BuildPromptOptions): string {
    const relativePath = path.relative(options.repositoryContext.repositoryRoot, options.documentPath);
    const lines = options.documentText.split(/\r?\n/);
    const start = Math.max(0, options.conflict.startLine - CONTEXT_RADIUS_LINES);
    const end = Math.min(lines.length, options.conflict.endLine + CONTEXT_RADIUS_LINES + 1);
    const excerpt = lines
      .slice(start, end)
      .map((line, index) => `${start + index + 1}: ${line}`)
      .join("\n");

    return [
      `Path: ${relativePath || options.documentPath}`,
      `Conflict lines: ${options.conflict.startLine + 1}-${options.conflict.endLine + 1}`,
      "Nearby file context:",
      this.renderBlock(excerpt)
    ].join("\n");
  }

  private extractCurrentFunction(documentText: string, conflictStartLine: number): string {
    const lines = documentText.split(/\r?\n/);
    const searchStart = Math.min(conflictStartLine, lines.length - 1);

    for (let index = searchStart; index >= 0; index -= 1) {
      const line = lines[index];
      if (line && this.looksLikeSymbolStart(line)) {
        return this.renderBlock(this.extractSymbolBlock(lines, index));
      }
    }

    return "No enclosing function or class was detected.";
  }

  private looksLikeSymbolStart(line: string): boolean {
    return /^\s*(export\s+)?(async\s+)?function\s+\w+/.test(line) ||
      /^\s*(export\s+)?(class|interface|type|enum)\s+\w+/.test(line) ||
      /^\s*(public|private|protected)?\s*(async\s+)?\w+\s*\([^)]*\)\s*[:\w\s<>[\],|.&?]*\{/.test(line) ||
      /^\s*def\s+\w+\s*\(/.test(line) ||
      /^\s*func\s+\w+\s*\(/.test(line);
  }

  private extractSymbolBlock(lines: string[], startIndex: number): string {
    const endIndex = Math.min(lines.length, startIndex + 120);
    return lines
      .slice(startIndex, endIndex)
      .map((line, index) => `${startIndex + index + 1}: ${line}`)
      .join("\n");
  }

  private buildCodingRules(options: BuildPromptOptions): string[] {
    return [
      "Resolve only the provided conflict.",
      "Preserve the intended behavior from both sides when compatible.",
      "Do not introduce unrelated refactors.",
      "Follow the repository language, framework, formatter, linter, and test conventions.",
      "Return only JSON matching the output schema.",
      `Prefer these verification tools when relevant: ${this.joinOrUnknown([
        ...options.repositoryContext.formatters,
        ...options.repositoryContext.linters,
        ...options.repositoryContext.testFrameworks
      ])}.`
    ];
  }

  private buildOutputSchema(): Record<string, unknown> {
    return {
      mergedCode: "string",
      explanation: "string",
      confidence: "number from 0 to 1",
      warnings: ["string"]
    };
  }

  private renderPrompt(sections: PromptPayload["sections"]): string {
    return [
      "# Repository Summary",
      sections.repositorySummary,
      "# Git History",
      sections.gitHistory,
      "# Current File",
      sections.currentFile,
      "# Current Function",
      sections.currentFunction,
      "# Conflict",
      JSON.stringify(sections.conflict, null, 2),
      "# Coding Rules",
      this.renderList(sections.codingRules),
      "# User Preferences",
      this.renderList(sections.userPreferences),
      "# Output Schema",
      JSON.stringify(sections.outputSchema, null, 2)
    ].join("\n\n");
  }

  private renderRepositoryFile(file: RepositoryContextFile): string {
    const content =
      file.content.length > MAX_REPOSITORY_FILE_CHARS
        ? `${file.content.slice(0, MAX_REPOSITORY_FILE_CHARS)}\n[truncated]`
        : file.content;

    return [`File: ${file.path}`, this.renderBlock(content)].join("\n");
  }

  private renderList(values: string[]): string {
    if (values.length === 0) {
      return "- none";
    }

    return values.map((value) => `- ${value}`).join("\n");
  }

  private renderBlock(value: string): string {
    return ["```", value, "```"].join("\n");
  }

  private joinOrUnknown(values: string[]): string {
    return values.length > 0 ? values.join(", ") : "unknown";
  }
}
