import * as path from "node:path";

import type { Conflict } from "../models/Conflict";
import type { GitContext } from "../models/GitContext";
import type { Logger } from "../services/Logger";
import { GitCommandRunner } from "./GitCommandRunner";
import type { GitHubContextService } from "./GitHubContextService";
import type { GitRepositoryService } from "./GitRepositoryService";

export interface CollectGitContextOptions {
  workspacePath: string;
  filePath: string;
  conflict: Conflict;
}

export class GitContextService {
  private readonly git = new GitCommandRunner();

  public constructor(
    private readonly logger: Logger,
    private readonly gitRepositoryService: GitRepositoryService,
    private readonly gitHubContextService?: GitHubContextService
  ) {}

  public async collectContext(options: CollectGitContextOptions): Promise<GitContext> {
    const repository = await this.gitRepositoryService.detectRepository(options.workspacePath);
    if (!repository.ok) {
      throw new Error(`Cannot collect Git context outside a repository: ${repository.error}`);
    }

    const diagnostics: string[] = [];
    const relativeFilePath = this.toGitPath(path.relative(repository.rootPath, options.filePath));

    const [branch, mergeTarget, remoteUrl, recentLog, diff, blame, changedFiles] = await Promise.all([
      this.readCurrentBranch(repository.rootPath, diagnostics),
      this.readMergeTarget(repository.rootPath, diagnostics),
      this.readOriginRemote(repository.rootPath, diagnostics),
      this.readRecentLog(repository.rootPath, relativeFilePath, diagnostics),
      this.readDiff(repository.rootPath, relativeFilePath, diagnostics),
      this.readBlame(repository.rootPath, relativeFilePath, options.conflict, diagnostics),
      this.readChangedFiles(repository.rootPath, diagnostics)
    ]);
    const github = await this.gitHubContextService?.collectContext({
      remoteUrl,
      currentBranch: branch
    });

    const context: GitContext = {
      repositoryRoot: repository.rootPath,
      currentBranch: branch,
      mergeTarget,
      remoteUrl,
      recentLog,
      diff,
      blame,
      changedFiles,
      github,
      diagnostics
    };

    this.logger.info(
      `Collected Git context for ${relativeFilePath}: ${recentLog.length} log entries, ${changedFiles.length} changed files.`
    );

    return context;
  }

  private async readCurrentBranch(repositoryRoot: string, diagnostics: string[]): Promise<string> {
    const result = await this.git.run(repositoryRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!result.ok) {
      diagnostics.push(`Unable to read current branch: ${result.error ?? result.stderr}`);
      return "unknown";
    }

    return result.stdout.trim() || "unknown";
  }

  private async readMergeTarget(repositoryRoot: string, diagnostics: string[]): Promise<string | undefined> {
    const mergeHead = await this.git.run(repositoryRoot, ["rev-parse", "--verify", "MERGE_HEAD"]);
    if (!mergeHead.ok) {
      return undefined;
    }

    const mergeCommit = mergeHead.stdout.trim();
    const name = await this.git.run(repositoryRoot, ["name-rev", "--name-only", mergeCommit]);
    if (!name.ok) {
      diagnostics.push(`Unable to name MERGE_HEAD: ${name.error ?? name.stderr}`);
      return mergeCommit;
    }

    return name.stdout.trim() || mergeCommit;
  }

  private async readRecentLog(
    repositoryRoot: string,
    relativeFilePath: string,
    diagnostics: string[]
  ): Promise<string[]> {
    const result = await this.git.run(repositoryRoot, [
      "log",
      "--oneline",
      "--decorate",
      "--max-count=20",
      "--",
      relativeFilePath
    ]);

    if (!result.ok) {
      diagnostics.push(`Unable to read Git log: ${result.error ?? result.stderr}`);
      return [];
    }

    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private async readDiff(
    repositoryRoot: string,
    relativeFilePath: string,
    diagnostics: string[]
  ): Promise<string> {
    const result = await this.git.run(repositoryRoot, ["diff", "--", relativeFilePath]);
    if (!result.ok) {
      diagnostics.push(`Unable to read Git diff: ${result.error ?? result.stderr}`);
      return "";
    }

    return result.stdout;
  }

  private async readBlame(
    repositoryRoot: string,
    relativeFilePath: string,
    conflict: Conflict,
    diagnostics: string[]
  ): Promise<string> {
    const start = Math.max(1, conflict.startLine + 1);
    const end = Math.max(start, conflict.endLine + 1);
    const result = await this.git.run(repositoryRoot, [
      "blame",
      `-L${start},${end}`,
      "--",
      relativeFilePath
    ]);

    if (!result.ok) {
      diagnostics.push(`Unable to read Git blame: ${result.error ?? result.stderr}`);
      return "";
    }

    return result.stdout;
  }

  private async readChangedFiles(repositoryRoot: string, diagnostics: string[]): Promise<string[]> {
    const result = await this.git.run(repositoryRoot, ["status", "--short"]);
    if (!result.ok) {
      diagnostics.push(`Unable to read changed files: ${result.error ?? result.stderr}`);
      return [];
    }

    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private async readOriginRemote(repositoryRoot: string, diagnostics: string[]): Promise<string | undefined> {
    const result = await this.git.run(repositoryRoot, ["remote", "get-url", "origin"]);
    if (!result.ok) {
      diagnostics.push(`Unable to read origin remote: ${result.error ?? result.stderr}`);
      return undefined;
    }

    return result.stdout.trim() || undefined;
  }

  private toGitPath(filePath: string): string {
    return filePath.split(path.sep).join("/");
  }
}
