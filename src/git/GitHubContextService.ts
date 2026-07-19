import * as vscode from "vscode";

import type { GitHubContext } from "../models/GitContext";
import type { RadarFileChange } from "../models/EngineeringRadar";
import type { Logger } from "../services/Logger";
import type { GitHubAuthService } from "./GitHubAuthService";
import { GitHubApiError, GitHubClient } from "./GitHubClient";
import { GitHubRepositoryResolver } from "./GitHubRepositoryResolver";

export interface CollectGitHubContextOptions {
  remoteUrl?: string;
  currentBranch: string;
  relativeFilePath?: string;
}

export interface RecentFileCommit {
  sha: string;
  author: string;
  date: string;
  summary: string;
}

export interface CollectGitHubFileProvenanceOptions {
  remoteUrl?: string;
  relativeFilePath: string;
  commits: RecentFileCommit[];
}

export class GitHubContextService {
  private readonly resolver = new GitHubRepositoryResolver();
  private readonly contextCache = new Map<string, { expiresAt: number; value: GitHubContext }>();
  private readonly provenanceCache = new Map<string, { expiresAt: number; value: RadarFileChange[] }>();
  private rateLimitUntil = 0;

  public constructor(
    private readonly logger: Logger,
    private readonly authService: GitHubAuthService
  ) {}

  public async collectContext(options: CollectGitHubContextOptions): Promise<GitHubContext | undefined> {
    const config = vscode.workspace.getConfiguration("aiMerge.github");
    const enabled = config.get<boolean>("enabled", false);
    if (!enabled) {
      return undefined;
    }

    const cacheKey = `${options.remoteUrl ?? ""}:${options.currentBranch}:${options.relativeFilePath ?? ""}`;
    const cached = this.getCached(this.contextCache, cacheKey);
    if (cached) {
      return cached;
    }

    const diagnostics: string[] = [];
    if (this.isRateLimited()) {
      diagnostics.push(this.rateLimitDiagnostic());
      return { enabled: true, openPullRequests: [], diagnostics };
    }
    const apiBaseUrl = config.get<string>("apiBaseUrl", "https://api.github.com");
    const webBaseUrl = config.get<string>("webBaseUrl", "https://github.com");
    const oauthToken = await this.authService.getAccessToken();
    const personalAccessToken = config.get<string>("token", "");
    const configuredRepository = config.get<string>("repository", "");
    const pullRequestNumber = config.get<number>("pullRequestNumber", 0);
    const inferredRepository = options.remoteUrl
      ? this.resolver.inferRepository(options.remoteUrl, webBaseUrl)
      : undefined;
    const repositoryName = configuredRepository.trim() || inferredRepository;

    if (!repositoryName) {
      diagnostics.push("GitHub repository could not be inferred. Set aiMerge.github.repository as owner/name.");
      return {
        enabled: true,
        openPullRequests: [],
        diagnostics
      };
    }

    const [owner, repo] = repositoryName.split("/");
    if (!owner || !repo) {
      diagnostics.push("GitHub repository must be in owner/name form.");
      return {
        enabled: true,
        openPullRequests: [],
        diagnostics
      };
    }

    const client = new GitHubClient({
      apiBaseUrl,
      token: oauthToken ?? personalAccessToken
    });

    try {
      const [repository, openPullRequests, explicitPullRequest] = await Promise.all([
        client.getRepository(owner, repo),
        options.relativeFilePath
          ? client.listOpenPullRequestsForFile(owner, repo, options.relativeFilePath)
          : client.listOpenPullRequests(owner, repo, options.currentBranch),
        pullRequestNumber > 0
          ? client.getPullRequest(owner, repo, pullRequestNumber)
          : Promise.resolve(undefined)
      ]);

      this.logger.info(`Collected GitHub context for ${repository.fullName}.`);
      const context = {
        enabled: true,
        repository,
        pullRequest: explicitPullRequest ?? openPullRequests[0],
        openPullRequests,
        diagnostics
      };
      this.setCached(this.contextCache, cacheKey, context, 60_000);
      return context;
    } catch (error) {
      this.recordRateLimit(error);
      diagnostics.push(`GitHub API context failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        enabled: true,
        openPullRequests: [],
        diagnostics
      };
    }
  }

  public async collectFileProvenance(
    options: CollectGitHubFileProvenanceOptions
  ): Promise<RadarFileChange[]> {
    const cacheKey = `${options.remoteUrl ?? ""}:${options.relativeFilePath}:${options.commits.map((commit) => commit.sha).join(",")}`;
    const cached = this.getCached(this.provenanceCache, cacheKey);
    if (cached) {
      return cached;
    }

    const connection = await this.createConnection(options.remoteUrl);
    if (!connection || this.isRateLimited()) {
      const fallback = options.commits.map((commit) => ({
        ...commit,
        pullRequests: [],
        fileChanges: []
      }));
      this.setCached(this.provenanceCache, cacheKey, fallback, 60_000);
      return fallback;
    }

    const { client, owner, repo } = connection;
    const changes: RadarFileChange[] = [];

    for (const commit of options.commits.slice(0, 8)) {
      try {
        const pullRequests = await client.listPullRequestsForCommit(owner, repo, commit.sha);
        const fileChanges = (await Promise.all(
          pullRequests.slice(0, 3).map(async (pullRequest) => {
            const files = await client.listPullRequestFiles(owner, repo, pullRequest.number);
            return files
              .filter((file) => file.filename === options.relativeFilePath)
              .map((file) => ({
                pullRequestNumber: pullRequest.number,
                filename: file.filename,
                status: file.status,
                additions: file.additions,
                deletions: file.deletions,
                changes: file.changes,
                patchExcerpt: this.truncatePatch(file.patch)
              }));
          })
        )).flat();

        changes.push({
          ...commit,
          pullRequests,
          fileChanges
        });
      } catch (error) {
        this.recordRateLimit(error);
        this.logger.warn(
          `Unable to collect GitHub provenance for ${commit.sha}: ${error instanceof Error ? error.message : String(error)}`
        );
        changes.push({
          ...commit,
          pullRequests: [],
          fileChanges: []
        });
      }
    }

    this.setCached(this.provenanceCache, cacheKey, changes, 5 * 60_000);
    return changes;
  }

  private async createConnection(remoteUrl?: string): Promise<{
    client: GitHubClient;
    owner: string;
    repo: string;
  } | undefined> {
    const config = vscode.workspace.getConfiguration("aiMerge.github");
    const enabled = config.get<boolean>("enabled", false);
    if (!enabled) {
      return undefined;
    }

    const apiBaseUrl = config.get<string>("apiBaseUrl", "https://api.github.com");
    const webBaseUrl = config.get<string>("webBaseUrl", "https://github.com");
    const oauthToken = await this.authService.getAccessToken();
    const personalAccessToken = config.get<string>("token", "");
    const configuredRepository = config.get<string>("repository", "");
    const inferredRepository = remoteUrl
      ? this.resolver.inferRepository(remoteUrl, webBaseUrl)
      : undefined;
    const repositoryName = configuredRepository.trim() || inferredRepository;
    const [owner, repo] = repositoryName?.split("/") ?? [];

    if (!owner || !repo) {
      return undefined;
    }

    return {
      owner,
      repo,
      client: new GitHubClient({
        apiBaseUrl,
        token: oauthToken ?? personalAccessToken
      })
    };
  }

  private truncatePatch(patch: string | undefined): string | undefined {
    if (!patch) {
      return undefined;
    }

    return patch.length > 1200 ? `${patch.slice(0, 1200)}\n[truncated]` : patch;
  }

  private getCached<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string): T | undefined {
    const entry = cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  private setCached<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string, value: T, ttlMs: number): void {
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  private isRateLimited(): boolean {
    return this.rateLimitUntil > Date.now();
  }

  private recordRateLimit(error: unknown): void {
    if (!(error instanceof GitHubApiError) || error.status !== 403) {
      return;
    }

    const retryAfterMs = error.retryAfterMs ?? 60_000;
    this.rateLimitUntil = Date.now() + Math.min(Math.max(retryAfterMs, 10_000), 5 * 60_000);
  }

  private rateLimitDiagnostic(): string {
    const seconds = Math.max(1, Math.ceil((this.rateLimitUntil - Date.now()) / 1000));
    return `GitHub requests are paused for about ${seconds} seconds after a rate-limit response. Sign in with AI Merge: GitHub Sign In to increase the GitHub API limit.`;
  }
}
