import type {
  GitHubPullRequestFileSummary,
  GitHubPullRequestSummary,
  GitHubRepositorySummary
} from "../models/GitContext";

interface GitHubRepositoryResponse {
  id: number;
  full_name: string;
  html_url: string;
  default_branch?: string;
}

interface GitHubPullRequestResponse {
  number: number;
  title: string;
  state: string;
  html_url: string;
  body?: string;
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
}

interface GitHubPullRequestFileResponse {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface GitHubSearchPullRequestResponse {
  number: number;
  title: string;
  html_url: string;
  body?: string;
}

export interface GitHubClientOptions {
  apiBaseUrl: string;
  token?: string;
}

export class GitHubApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly retryAfterMs: number | undefined,
    message: string
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export class GitHubClient {
  private readonly baseUrl: string;

  public constructor(private readonly options: GitHubClientOptions) {
    this.baseUrl = options.apiBaseUrl.replace(/\/+$/, "");
  }

  public async getRepository(owner: string, repo: string): Promise<GitHubRepositorySummary> {
    const response = await this.request<GitHubRepositoryResponse>(`/repos/${owner}/${repo}`);
    return {
      id: response.id,
      fullName: response.full_name,
      htmlUrl: response.html_url,
      defaultBranch: response.default_branch
    };
  }

  public async listOpenPullRequests(
    owner: string,
    repo: string,
    headBranch?: string
  ): Promise<GitHubPullRequestSummary[]> {
    const params = new URLSearchParams({
      state: "open",
      per_page: "20"
    });
    const response = await this.request<GitHubPullRequestResponse[]>(
      `/repos/${owner}/${repo}/pulls?${params.toString()}`
    );
    const pullRequests = response.map((pullRequest) => this.mapPullRequest(pullRequest));

    if (!headBranch || headBranch === "unknown" || headBranch === "HEAD") {
      return pullRequests;
    }

    return pullRequests.filter((pullRequest) => pullRequest.headRef === headBranch);
  }

  public async listOpenPullRequestsForFile(
    owner: string,
    repo: string,
    relativeFilePath: string
  ): Promise<GitHubPullRequestSummary[]> {
    const query = `repo:${owner}/${repo} is:pr is:open path:${relativeFilePath}`;
    const params = new URLSearchParams({ q: query, per_page: "20" });
    const response = await this.request<{ items: GitHubSearchPullRequestResponse[] }>(
      `/search/issues?${params.toString()}`
    );

    return response.items.map((pullRequest) => ({
      number: pullRequest.number,
      title: pullRequest.title,
      state: "open",
      headRef: "unknown",
      baseRef: "unknown",
      htmlUrl: pullRequest.html_url,
      body: pullRequest.body
    }));
  }

  public async getPullRequest(
    owner: string,
    repo: string,
    number: number
  ): Promise<GitHubPullRequestSummary> {
    const response = await this.request<GitHubPullRequestResponse>(`/repos/${owner}/${repo}/pulls/${number}`);
    return this.mapPullRequest(response);
  }

  public async listPullRequestsForCommit(
    owner: string,
    repo: string,
    sha: string
  ): Promise<GitHubPullRequestSummary[]> {
    const response = await this.request<GitHubPullRequestResponse[]>(
      `/repos/${owner}/${repo}/commits/${sha}/pulls`
    );
    return response.map((pullRequest) => this.mapPullRequest(pullRequest));
  }

  public async listPullRequestFiles(
    owner: string,
    repo: string,
    number: number
  ): Promise<GitHubPullRequestFileSummary[]> {
    const response = await this.request<GitHubPullRequestFileResponse[]>(
      `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`
    );

    return response.map((file) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch
    }));
  }

  private async request<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    if (this.options.token && this.options.token.trim().length > 0) {
      headers.Authorization = `Bearer ${this.options.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      const retryAfterMs = this.readRetryAfterMs(response);
      const rateLimitHint = response.status === 403 && retryAfterMs
        ? `; retry after ${Math.ceil(retryAfterMs / 1000)} seconds`
        : "";
      throw new GitHubApiError(
        response.status,
        retryAfterMs,
        `GitHub API ${response.status} ${response.statusText}${rateLimitHint}`
      );
    }

    return await response.json() as T;
  }

  private mapPullRequest(pullRequest: GitHubPullRequestResponse): GitHubPullRequestSummary {
    return {
      number: pullRequest.number,
      title: pullRequest.title,
      state: pullRequest.state,
      headRef: pullRequest.head.ref,
      baseRef: pullRequest.base.ref,
      htmlUrl: pullRequest.html_url,
      body: pullRequest.body
    };
  }

  private readRetryAfterMs(response: Response): number | undefined {
    const retryAfterSeconds = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return retryAfterSeconds * 1000;
    }

    const resetEpochSeconds = Number.parseInt(response.headers.get("x-ratelimit-reset") ?? "", 10);
    if (!Number.isFinite(resetEpochSeconds) || resetEpochSeconds <= 0) {
      return undefined;
    }

    return Math.max(0, resetEpochSeconds * 1000 - Date.now());
  }
}
