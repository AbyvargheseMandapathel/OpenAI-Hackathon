import type {
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
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
}

export interface GitHubClientOptions {
  apiBaseUrl: string;
  token?: string;
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

  public async getPullRequest(
    owner: string,
    repo: string,
    number: number
  ): Promise<GitHubPullRequestSummary> {
    const response = await this.request<GitHubPullRequestResponse>(`/repos/${owner}/${repo}/pulls/${number}`);
    return this.mapPullRequest(response);
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
      headers
    });

    if (!response.ok) {
      throw new Error(`GitHub API ${response.status} ${response.statusText}`);
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
      htmlUrl: pullRequest.html_url
    };
  }
}
