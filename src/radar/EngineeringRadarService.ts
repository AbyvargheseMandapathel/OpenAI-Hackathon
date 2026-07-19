import * as path from "node:path";
import { readFile } from "node:fs/promises";

import type {
  EngineeringRadar,
  RadarContributor,
  RadarFileChange,
  RadarLocalFileChange,
  RiskLevel
} from "../models/EngineeringRadar";
import type { RepositoryContext } from "../models/RepositoryContext";
import { GitCommandRunner } from "../git/GitCommandRunner";
import type { RecentFileCommit } from "../git/GitHubContextService";
import type { GitHubContextService } from "../git/GitHubContextService";
import type { GitRepositoryService } from "../git/GitRepositoryService";
import type { Logger } from "../services/Logger";
import type { RepositoryContextService } from "../services/RepositoryContextService";

export interface BuildEngineeringRadarOptions {
  workspacePath: string;
  filePath: string;
}

export class EngineeringRadarService {
  private readonly git = new GitCommandRunner();

  public constructor(
    private readonly logger: Logger,
    private readonly gitRepositoryService: GitRepositoryService,
    private readonly repositoryContextService: RepositoryContextService,
    private readonly gitHubContextService: GitHubContextService
  ) {}

  public async analyze(options: BuildEngineeringRadarOptions): Promise<EngineeringRadar> {
    const repository = await this.gitRepositoryService.detectRepository(options.workspacePath);
    if (!repository.ok) {
      throw new Error(`AI Engineering Radar requires a Git repository: ${repository.error}`);
    }

    const diagnostics: string[] = [];
    const relativeFilePath = this.toGitPath(path.relative(repository.rootPath, options.filePath));
    const repositoryContext = await this.repositoryContextService.collectContext(repository.rootPath);
    const relatedFilePaths = await this.readRelatedFilePaths(repository.rootPath, relativeFilePath);
    const [trackedInHead, workingTreeChange] = await Promise.all([
      this.isTrackedInHead(repository.rootPath, relativeFilePath),
      this.readWorkingTreeChange(repository.rootPath, options.filePath, relativeFilePath)
    ]);

    if (!trackedInHead) {
      diagnostics.push("This file is not committed in HEAD yet; history and ownership are unavailable. Showing working-tree code evidence.");
    }

    const [currentBranch, remoteUrl, recentChanges, recentFileCommits, activeContributors, changedFiles] = await Promise.all([
      this.readCurrentBranch(repository.rootPath, diagnostics),
      this.readOriginRemote(repository.rootPath, diagnostics),
      trackedInHead ? this.readRecentChanges(repository.rootPath, relativeFilePath, diagnostics) : Promise.resolve([]),
      trackedInHead ? this.readRecentFileCommits(repository.rootPath, relativeFilePath, diagnostics) : Promise.resolve([]),
      trackedInHead ? this.readActiveContributors(repository.rootPath, relativeFilePath, diagnostics) : Promise.resolve([]),
      this.readChangedFiles(repository.rootPath, diagnostics)
    ]);
    const github = await this.gitHubContextService.collectContext({
      remoteUrl,
      currentBranch,
      relativeFilePath,
      relatedFilePaths
    });
    const provenance = await this.readFileChangeHistory({
      remoteUrl,
      relativeFilePath,
      recentFileCommits
    });
    const historicalFileChanges = await this.enrichLocalFileChangeHistory(
      repository.rootPath,
      relativeFilePath,
      this.addPullRequestFallbacks(provenance, remoteUrl, currentBranch)
    );
    const fileChangeHistory = workingTreeChange
      ? [workingTreeChange, ...historicalFileChanges]
      : historicalFileChanges;
    const affectedAreas = this.detectAffectedAreas(relativeFilePath, changedFiles, repositoryContext);
    const recommendedTests = this.detectRecommendedTests(relativeFilePath, repositoryContext);
    const riskSignals = this.detectRiskSignals({
      relativeFilePath,
      recentChanges: workingTreeChange ? [workingTreeChange.summary, ...recentChanges] : recentChanges,
      changedFiles,
      affectedAreas,
      activeContributors,
      openPullRequestCount: github?.openPullRequests.length ?? 0
    });
    const riskLevel = this.calculateRiskLevel(riskSignals);
    const recommendedActions = this.buildRecommendedActions({
      riskLevel,
      recentChanges,
      openPullRequestCount: github?.openPullRequests.length ?? 0,
      activeContributors,
      recommendedTests,
      affectedAreas
    });

    this.logger.info(`Built engineering radar for ${relativeFilePath} with risk=${riskLevel}.`);

    return {
      filePath: relativeFilePath,
      repositoryRoot: repository.rootPath,
      currentBranch,
      generatedAt: new Date().toISOString(),
      recentChanges,
      fileChangeHistory,
      openPullRequests: github?.openPullRequests.map((pullRequest) => ({
        number: pullRequest.number,
        title: pullRequest.title,
        state: pullRequest.state,
        headRef: pullRequest.headRef,
        baseRef: pullRequest.baseRef,
        htmlUrl: pullRequest.htmlUrl,
        body: pullRequest.body,
        matchedFiles: pullRequest.matchedFiles,
        fileChanges: pullRequest.changedFileDetails?.map((file) => ({
          pullRequestNumber: pullRequest.number,
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          patchExcerpt: file.patch ? this.truncatePatch(file.patch) : undefined
        }))
      })) ?? [],
      activeContributors,
      changedFiles,
      affectedAreas,
      recommendedTests,
      riskLevel,
      riskSignals,
      recommendedActions,
      diagnostics: [...diagnostics, ...(github?.diagnostics ?? [])]
    };
  }

  private async readCurrentBranch(repositoryRoot: string, diagnostics: string[]): Promise<string> {
    const result = await this.git.run(repositoryRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!result.ok) {
      diagnostics.push(`Unable to read current branch: ${result.error ?? result.stderr}`);
      return "unknown";
    }

    return result.stdout.trim() || "unknown";
  }

  private async isTrackedInHead(repositoryRoot: string, relativeFilePath: string): Promise<boolean> {
    const result = await this.git.run(repositoryRoot, ["ls-tree", "-r", "--name-only", "HEAD", "--", relativeFilePath]);
    return result.ok && this.nonEmptyLines(result.stdout).includes(relativeFilePath);
  }

  private async readRelatedFilePaths(repositoryRoot: string, relativeFilePath: string): Promise<string[]> {
    const symbol = path.basename(relativeFilePath).replace(/\.[^.]+$/, "");
    if (symbol.length < 3) {
      return [relativeFilePath];
    }

    const result = await this.git.run(repositoryRoot, ["grep", "-l", "-w", symbol, "HEAD", "--"]);
    if (!result.ok) {
      return [relativeFilePath];
    }

    const related = this.nonEmptyLines(result.stdout)
      .map((line) => line.replace(/^HEAD:/, ""))
      .filter((file) => file !== relativeFilePath)
      .slice(0, 20);
    return [relativeFilePath, ...related];
  }

  private async readWorkingTreeChange(
    repositoryRoot: string,
    absoluteFilePath: string,
    relativeFilePath: string
  ): Promise<RadarFileChange | undefined> {
    const statusResult = await this.git.run(repositoryRoot, ["status", "--short", "--", relativeFilePath]);
    const statusLine = this.nonEmptyLines(statusResult.stdout)[0];
    if (!statusLine) {
      return undefined;
    }

    const isUntracked = statusLine.startsWith("??");
    let additions = 0;
    let deletions = 0;
    let patch = "";

    if (isUntracked) {
      try {
        const source = await readFile(absoluteFilePath, "utf8");
        additions = source.split(/\r?\n/).length;
        patch = source.split(/\r?\n/).map((line) => `+${line}`).join("\n");
      } catch (error) {
        this.logger.warn(`Unable to read untracked file ${relativeFilePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      const [statsResult, patchResult] = await Promise.all([
        this.git.run(repositoryRoot, ["diff", "HEAD", "--numstat", "--", relativeFilePath]),
        this.git.run(repositoryRoot, ["diff", "HEAD", "--unified=1", "--", relativeFilePath])
      ]);
      const [additionsRaw = "0", deletionsRaw = "0"] = this.nonEmptyLines(statsResult.stdout)[0]?.split("\t") ?? [];
      additions = this.parseNumstatValue(additionsRaw);
      deletions = this.parseNumstatValue(deletionsRaw);
      patch = patchResult.stdout;
    }

    const localFileChange: RadarLocalFileChange = {
      status: isUntracked ? "added" : "modified",
      additions,
      deletions,
      changes: additions + deletions,
      symbols: this.extractChangedSymbols(patch, "+"),
      removedSymbols: this.extractChangedSymbols(patch, "-"),
      commitFiles: [relativeFilePath],
      symbolReferences: [],
      patchExcerpt: this.truncatePatch(patch)
    };
    const summary = isUntracked ? "Uncommitted new file" : "Uncommitted local changes";
    const change: RadarFileChange = {
      sha: "WORKTREE",
      author: "Local workspace",
      date: new Date().toISOString().slice(0, 10),
      summary,
      pullRequests: [],
      fileChanges: [],
      localFileChange,
      likelyReason: isUntracked
        ? "This file has not been committed yet, so there is no historical author or PR intent to report."
        : "This code differs from HEAD and has not been committed, so the final PR intent is not known yet.",
      codebaseImpact: this.inferCodebaseImpact(localFileChange)
    };
    return change;
  }

  private async readOriginRemote(repositoryRoot: string, diagnostics: string[]): Promise<string | undefined> {
    const result = await this.git.run(repositoryRoot, ["remote", "get-url", "origin"]);
    if (!result.ok) {
      diagnostics.push(`Unable to read origin remote: ${result.error ?? result.stderr}`);
      return undefined;
    }

    return result.stdout.trim() || undefined;
  }

  private async readRecentChanges(
    repositoryRoot: string,
    relativeFilePath: string,
    diagnostics: string[]
  ): Promise<string[]> {
    const result = await this.git.run(repositoryRoot, [
      "log",
      "--oneline",
      "--decorate",
      "--max-count=12",
      "--",
      relativeFilePath
    ]);

    if (!result.ok) {
      diagnostics.push(`Unable to read recent file changes: ${result.error ?? result.stderr}`);
      return [];
    }

    return this.nonEmptyLines(result.stdout);
  }

  private async readActiveContributors(
    repositoryRoot: string,
    relativeFilePath: string,
    diagnostics: string[]
  ): Promise<RadarContributor[]> {
    const result = await this.git.run(repositoryRoot, ["blame", "--line-porcelain", "--", relativeFilePath]);
    if (!result.ok) {
      diagnostics.push(`Unable to read active contributors: ${result.error ?? result.stderr}`);
      return [];
    }

    const counts = new Map<string, number>();
    for (const line of this.nonEmptyLines(result.stdout)) {
      if (!line.startsWith("author ")) {
        continue;
      }

      const name = line.slice("author ".length).trim();
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([name, lines]) => ({ name, lines }))
      .sort((left, right) => right.lines - left.lines)
      .slice(0, 5);
  }

  private async readRecentFileCommits(
    repositoryRoot: string,
    relativeFilePath: string,
    diagnostics: string[]
  ): Promise<RecentFileCommit[]> {
    const result = await this.git.run(repositoryRoot, [
      "log",
      "--format=%H%x1f%an%x1f%ad%x1f%s",
      "--date=short",
      "--max-count=8",
      "--",
      relativeFilePath
    ]);

    if (!result.ok) {
      diagnostics.push(`Unable to read recent file commit metadata: ${result.error ?? result.stderr}`);
      return [];
    }

    return this.nonEmptyLines(result.stdout)
      .map((line) => {
        const [sha, author, date, summary] = line.split("\u001f");
        return sha && author && date && summary
          ? {
              sha,
              author,
              date,
              summary
            }
          : undefined;
      })
      .filter((commit): commit is RecentFileCommit => commit !== undefined);
  }

  private async readFileChangeHistory(options: {
    remoteUrl?: string;
    relativeFilePath: string;
    recentFileCommits: RecentFileCommit[];
  }): Promise<RadarFileChange[]> {
    const provenance = await this.gitHubContextService.collectFileProvenance({
      remoteUrl: options.remoteUrl,
      relativeFilePath: options.relativeFilePath,
      commits: options.recentFileCommits
    });

    if (provenance.length > 0) {
      return provenance;
    }

    return options.recentFileCommits.map((commit) => ({
      ...commit,
      pullRequests: [],
      fileChanges: []
    }));
  }

  private addPullRequestFallbacks(
    fileChangeHistory: RadarFileChange[],
    remoteUrl: string | undefined,
    currentBranch: string
  ): RadarFileChange[] {
    const repositoryUrl = this.githubRepositoryUrlFromRemote(remoteUrl);

    return fileChangeHistory.map((change) => {
      if (change.pullRequests.length > 0) {
        return change;
      }

      const pullRequestNumber = this.pullRequestNumberFromSummary(change.summary);
      if (!pullRequestNumber || !repositoryUrl) {
        return change;
      }

      return {
        ...change,
        pullRequests: [
          {
            number: pullRequestNumber,
            title: change.summary.replace(/\s*\(#\d+\)\s*$/, ""),
            state: "unknown",
            headRef: "unknown",
            baseRef: currentBranch,
            htmlUrl: `${repositoryUrl}/pull/${pullRequestNumber}`
          }
        ]
      };
    });
  }

  private async enrichLocalFileChangeHistory(
    repositoryRoot: string,
    relativeFilePath: string,
    history: RadarFileChange[]
  ): Promise<RadarFileChange[]> {
    return await Promise.all(history.map(async (change) => {
      const localFileChange = await this.readLocalFileChange(repositoryRoot, relativeFilePath, change.sha);
      return {
        ...change,
        localFileChange,
        likelyReason: this.inferChangeReason(change, localFileChange),
        codebaseImpact: this.inferCodebaseImpact(localFileChange)
      };
    }));
  }

  private async readLocalFileChange(
    repositoryRoot: string,
    relativeFilePath: string,
    sha: string
  ): Promise<RadarLocalFileChange | undefined> {
    const [statsResult, patchResult, filesResult] = await Promise.all([
      this.git.run(repositoryRoot, ["show", "--format=", "--numstat", sha, "--", relativeFilePath]),
      this.git.run(repositoryRoot, ["show", "--format=", "--unified=1", sha, "--", relativeFilePath]),
      this.git.run(repositoryRoot, ["show", "--format=", "--name-only", sha])
    ]);

    if (!statsResult.ok) {
      this.logger.warn(`Unable to read local commit metadata for ${sha}: ${statsResult.error ?? statsResult.stderr}`);
      return undefined;
    }

    const [additionsRaw = "0", deletionsRaw = "0"] = this.nonEmptyLines(statsResult.stdout)[0]?.split("\t") ?? [];
    const additions = this.parseNumstatValue(additionsRaw);
    const deletions = this.parseNumstatValue(deletionsRaw);
    const patchExcerpt = patchResult.ok ? this.truncatePatch(patchResult.stdout) : undefined;
    const symbols = this.extractChangedSymbols(patchResult.ok ? patchResult.stdout : "", "+");
    const removedSymbols = this.extractChangedSymbols(patchResult.ok ? patchResult.stdout : "", "-");
    const status = additions > 0 && deletions === 0
      ? "added"
      : additions === 0 && deletions > 0
        ? "deleted"
        : additions > 0 || deletions > 0
          ? "modified"
          : "unknown";

    return {
      status,
      additions,
      deletions,
      changes: additions + deletions,
      symbols,
      removedSymbols,
      commitFiles: filesResult.ok ? this.nonEmptyLines(filesResult.stdout).slice(0, 12) : [],
      symbolReferences: await this.readSymbolReferences(repositoryRoot, sha, relativeFilePath, symbols),
      patchExcerpt
    };
  }

  public inferChangeReason(change: RadarFileChange, localFileChange?: RadarLocalFileChange): string {
    const isInitialCommit = /^(initial|first) commit\b/i.test(change.summary.trim());
    const symbols = localFileChange?.symbols ?? [];
    const symbolText = symbols.length > 0 ? ` It introduces or updates ${symbols.join(", ")}.` : "";

    if (isInitialCommit) {
      return `This is the repository baseline for this file. No PR description is available; the explanation is inferred from the local diff.${symbolText}`;
    }

    if (!localFileChange) {
      return "No PR description or local file diff was available, so the original reason could not be determined.";
    }

    if (localFileChange.status === "added") {
      return `This commit likely adds new behavior or setup to this file.${symbolText}`;
    }

    if (localFileChange.status === "deleted") {
      return `This commit likely removes obsolete behavior or consolidates it elsewhere.${symbolText}`;
    }

    if (localFileChange.status === "modified") {
      return `This commit likely changes existing behavior in this file.${symbolText}`;
    }

    return "The commit touched this file, but Git did not provide enough local diff metadata to infer the reason.";
  }

  private parseNumstatValue(value: string): number {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  public inferCodebaseImpact(localFileChange?: RadarLocalFileChange): string {
    if (!localFileChange) {
      return "Codebase impact could not be determined because the local commit diff is unavailable.";
    }

    const fragments: string[] = [];
    if (localFileChange.symbols.length > 0) {
      fragments.push(`Adds ${localFileChange.symbols.join(", ")} in this file`);
    }
    if (localFileChange.removedSymbols.length > 0) {
      fragments.push(`removes ${localFileChange.removedSymbols.join(", ")}`);
    }
    if (fragments.length === 0) {
      fragments.push(`Changes ${localFileChange.additions} added and ${localFileChange.deletions} removed lines in this file`);
    }

    const referenceImpact = localFileChange.symbolReferences
      .filter((reference) => reference.files.length > 0)
      .map((reference) => `${reference.symbol} is used by ${reference.files.join(", ")}`);
    if (referenceImpact.length > 0) {
      fragments.push(referenceImpact.join("; "));
    }

    const relatedFiles = localFileChange.commitFiles.slice(0, 5);
    if (relatedFiles.length > 1) {
      fragments.push(`The same commit also changes ${relatedFiles.slice(1).join(", ")}`);
    }
    if (localFileChange.commitFiles.some((file) => /(^|\/)extension\.[cm]?[jt]s$/i.test(file))) {
      fragments.push("The commit updates extension wiring, exposing this behavior through VS Code activation or commands");
    }

    return `${fragments.join(". ")}.`;
  }

  private async readSymbolReferences(
    repositoryRoot: string,
    sha: string,
    relativeFilePath: string,
    symbols: string[]
  ): Promise<RadarLocalFileChange["symbolReferences"]> {
    return await Promise.all(symbols.slice(0, 4).map(async (symbol) => {
      const result = await this.git.run(repositoryRoot, ["grep", "-l", "-w", symbol, sha, "--"]);
      const files = result.ok
        ? this.nonEmptyLines(result.stdout)
          .map((line) => line.replace(`${sha}:`, ""))
          .filter((file) => file !== relativeFilePath)
          .slice(0, 3)
        : [];
      return { symbol, files };
    }));
  }

  private extractChangedSymbols(patch: string, marker: "+" | "-"): string[] {
    const symbols = new Set<string>();
    const declaration = new RegExp(`^\\${marker}\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function|class|interface|type|const|let|var)\\s+([A-Za-z_$][\\w$]*)`);

    for (const line of patch.split(/\r?\n/)) {
      if (!line.startsWith(marker) || line.startsWith(marker.repeat(3))) {
        continue;
      }

      const match = declaration.exec(line);
      if (match?.[1]) {
        symbols.add(match[1]);
      }
    }

    return [...symbols].slice(0, 6);
  }

  private truncatePatch(patch: string): string | undefined {
    const nonEmpty = patch.trim();
    if (!nonEmpty) {
      return undefined;
    }

    return nonEmpty.length > 1200 ? `${nonEmpty.slice(0, 1200)}\n[truncated]` : nonEmpty;
  }

  private pullRequestNumberFromSummary(summary: string): number | undefined {
    const match = /\(#(?<number>\d+)\)/.exec(summary);
    const number = match?.groups?.number;
    return number ? Number.parseInt(number, 10) : undefined;
  }

  private githubRepositoryUrlFromRemote(remoteUrl: string | undefined): string | undefined {
    if (!remoteUrl) {
      return undefined;
    }

    try {
      const parsed = new URL(remoteUrl);
      if (parsed.hostname !== "github.com") {
        return undefined;
      }

      const repoPath = parsed.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
      return repoPath ? `https://github.com/${repoPath}` : undefined;
    } catch {
      const match = /^git@github\.com:(?<repo>.+?)(?:\.git)?$/.exec(remoteUrl);
      const repo = match?.groups?.repo;
      return repo ? `https://github.com/${repo}` : undefined;
    }
  }

  private async readChangedFiles(repositoryRoot: string, diagnostics: string[]): Promise<string[]> {
    const result = await this.git.run(repositoryRoot, ["status", "--short"]);
    if (!result.ok) {
      diagnostics.push(`Unable to read changed files: ${result.error ?? result.stderr}`);
      return [];
    }

    return this.nonEmptyLines(result.stdout);
  }

  public detectAffectedAreas(
    relativeFilePath: string,
    changedFiles: string[],
    repositoryContext: RepositoryContext
  ): string[] {
    const signals = new Set<string>();
    const haystack = [relativeFilePath, ...changedFiles].join("\n").toLowerCase();

    if (/payment|billing|stripe|checkout|invoice/.test(haystack)) {
      signals.add("Payments and billing");
    }

    if (/auth|session|token|permission|security/.test(haystack)) {
      signals.add("Authentication and security");
    }

    if (/migration|schema|database|db|sql|prisma/.test(haystack)) {
      signals.add("Database and migrations");
    }

    if (/api|route|controller|endpoint|service/.test(haystack)) {
      signals.add("API and service boundaries");
    }

    if (/collab|room|socket|sync|reconciliation|server updates/.test(haystack)) {
      signals.add("Collaboration and realtime sync");
    }

    if (/package\.json|yarn\.lock|package-lock\.json|pnpm-lock/.test(haystack)) {
      signals.add("Dependencies");
    }

    for (const framework of repositoryContext.frameworks) {
      signals.add(framework);
    }

    return [...signals];
  }

  public detectRecommendedTests(relativeFilePath: string, repositoryContext: RepositoryContext): string[] {
    const tests = new Set<string>();
    const lowerPath = relativeFilePath.toLowerCase();

    for (const framework of repositoryContext.testFrameworks) {
      tests.add(framework);
    }

    if (/payment|billing|stripe|checkout/.test(lowerPath)) {
      tests.add("billing/payment test suite");
    }

    if (/auth|session|permission/.test(lowerPath)) {
      tests.add("authentication and authorization tests");
    }

    if (/api|route|service/.test(lowerPath)) {
      tests.add("API integration tests");
    }

    if (tests.size === 0) {
      tests.add("nearest unit tests for this file");
    }

    return [...tests];
  }

  public detectRiskSignals(options: {
    relativeFilePath: string;
    recentChanges: string[];
    changedFiles: string[];
    affectedAreas: string[];
    activeContributors: RadarContributor[];
    openPullRequestCount: number;
  }): string[] {
    const signals: string[] = [];
    const lowerPath = options.relativeFilePath.toLowerCase();

    if (options.recentChanges.length >= 8) {
      signals.push("File has changed frequently in recent history.");
    }

    if (options.openPullRequestCount > 0) {
      signals.push(`There are ${options.openPullRequestCount} open pull request(s) that mention or change this file.`);
    }

    if (options.changedFiles.length >= 10) {
      signals.push(`The working tree has ${options.changedFiles.length} changed files, so this edit may be part of a larger unfinished change.`);
    }

    if (options.activeContributors.length >= 4) {
      signals.push("Multiple contributors recently touched this file.");
    }

    if (/payment|billing|auth|security|migration|schema|database/.test(lowerPath)) {
      signals.push("File path matches a historically high-risk engineering area.");
    }

    if (options.affectedAreas.length >= 3) {
      signals.push(`This file and the current working tree touch multiple areas: ${options.affectedAreas.join(", ")}.`);
    }

    return signals;
  }

  public calculateRiskLevel(riskSignals: string[]): RiskLevel {
    if (riskSignals.length >= 4) {
      return "HIGH";
    }

    if (riskSignals.length >= 2) {
      return "MEDIUM";
    }

    return "LOW";
  }

  private buildRecommendedActions(options: {
    riskLevel: RiskLevel;
    recentChanges: string[];
    openPullRequestCount: number;
    activeContributors: RadarContributor[];
    recommendedTests: string[];
    affectedAreas: string[];
  }): string[] {
    const actions: string[] = [];

    if (options.recentChanges.length > 0) {
      actions.push("Review the recent commits touching this file before editing.");
    }

    if (options.openPullRequestCount > 0) {
      actions.push("Review open pull requests on the current branch for overlapping work.");
    }

    if (options.activeContributors.length > 0) {
      actions.push(`Ask ${options.activeContributors[0]?.name ?? "the top contributor"} for context if the intent is unclear.`);
    }

    if (options.affectedAreas.length > 0) {
      actions.push(`Check impact across: ${options.affectedAreas.join(", ")}.`);
    }

    if (options.recommendedTests.length > 0) {
      actions.push(`Run: ${options.recommendedTests.join(", ")}.`);
    }

    if (options.riskLevel === "HIGH") {
      actions.push("Make a smaller first change or split the work before committing.");
    }

    return actions.length > 0 ? actions : ["Read the file and nearest tests before implementation."];
  }

  private nonEmptyLines(value: string): string[] {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private toGitPath(filePath: string): string {
    return filePath.split(path.sep).join("/");
  }
}
