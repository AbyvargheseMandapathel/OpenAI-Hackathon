export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RadarContributor {
  name: string;
  lines: number;
}

export interface RadarPullRequest {
  number: number;
  title: string;
  state: string;
  headRef: string;
  baseRef: string;
  htmlUrl: string;
  body?: string;
  matchedFiles?: string[];
  fileChanges?: RadarPullRequestFileChange[];
}

export interface RadarFileChange {
  sha: string;
  author: string;
  date: string;
  summary: string;
  pullRequests: RadarPullRequest[];
  fileChanges: RadarPullRequestFileChange[];
  localFileChange?: RadarLocalFileChange;
  likelyReason?: string;
  codebaseImpact?: string;
}

export interface RadarLocalFileChange {
  status: "added" | "modified" | "deleted" | "unknown";
  additions: number;
  deletions: number;
  changes: number;
  symbols: string[];
  removedSymbols: string[];
  commitFiles: string[];
  symbolReferences: RadarSymbolReference[];
  patchExcerpt?: string;
}

export interface RadarSymbolReference {
  symbol: string;
  files: string[];
}

export interface RadarPullRequestFileChange {
  pullRequestNumber: number;
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patchExcerpt?: string;
}

export interface EngineeringRadar {
  filePath: string;
  repositoryRoot: string;
  currentBranch: string;
  generatedAt: string;
  recentChanges: string[];
  fileChangeHistory: RadarFileChange[];
  openPullRequests: RadarPullRequest[];
  activeContributors: RadarContributor[];
  changedFiles: string[];
  affectedAreas: string[];
  recommendedTests: string[];
  riskLevel: RiskLevel;
  riskSignals: string[];
  recommendedActions: string[];
  diagnostics: string[];
}
