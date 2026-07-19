import type { Conflict } from "./Conflict";
import type { GitContext } from "./GitContext";
import type { RepositoryContext } from "./RepositoryContext";

export interface PromptPayload {
  sections: PromptSections;
  prompt: string;
}

export interface PromptSections {
  repositorySummary: string;
  gitHistory: string;
  currentFile: string;
  currentFunction: string;
  conflict: Conflict;
  codingRules: string[];
  userPreferences: string[];
  outputSchema: Record<string, unknown>;
}

export interface BuildPromptOptions {
  repositoryContext: RepositoryContext;
  gitContext: GitContext;
  documentPath: string;
  documentText: string;
  conflict: Conflict;
  userPreferences?: string[];
}
