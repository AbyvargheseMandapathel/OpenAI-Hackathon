import * as vscode from "vscode";

import type { GitHubContext } from "../models/GitContext";
import type { Logger } from "../services/Logger";
import type { GitHubAuthService } from "./GitHubAuthService";
import { GitHubClient } from "./GitHubClient";
import { GitHubRepositoryResolver } from "./GitHubRepositoryResolver";

export interface CollectGitHubContextOptions {
  remoteUrl?: string;
  currentBranch: string;
}

export class GitHubContextService {
  private readonly resolver = new GitHubRepositoryResolver();

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

    const diagnostics: string[] = [];
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
        client.listOpenPullRequests(owner, repo, options.currentBranch),
        pullRequestNumber > 0
          ? client.getPullRequest(owner, repo, pullRequestNumber)
          : Promise.resolve(undefined)
      ]);

      this.logger.info(`Collected GitHub context for ${repository.fullName}.`);
      return {
        enabled: true,
        repository,
        pullRequest: explicitPullRequest ?? openPullRequests[0],
        openPullRequests,
        diagnostics
      };
    } catch (error) {
      diagnostics.push(`GitHub API context failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        enabled: true,
        openPullRequests: [],
        diagnostics
      };
    }
  }
}
