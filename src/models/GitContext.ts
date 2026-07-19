export interface GitContext {
  repositoryRoot: string;
  currentBranch: string;
  mergeTarget?: string;
  remoteUrl?: string;
  recentLog: string[];
  diff: string;
  blame: string;
  changedFiles: string[];
  github?: GitHubContext;
  diagnostics: string[];
}

export interface GitHubContext {
  enabled: boolean;
  repository?: GitHubRepositorySummary;
  pullRequest?: GitHubPullRequestSummary;
  openPullRequests: GitHubPullRequestSummary[];
  diagnostics: string[];
}

export interface GitHubRepositorySummary {
  id: number;
  fullName: string;
  htmlUrl: string;
  defaultBranch?: string;
}

export interface GitHubPullRequestSummary {
  number: number;
  title: string;
  state: string;
  headRef: string;
  baseRef: string;
  htmlUrl: string;
  body?: string;
}

export interface GitHubPullRequestFileSummary {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}
