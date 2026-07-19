export interface RepositoryContextFile {
  path: string;
  content: string;
}

export interface RepositoryContext {
  repositoryRoot: string;
  files: RepositoryContextFile[];
  languages: string[];
  frameworks: string[];
  formatters: string[];
  linters: string[];
  testFrameworks: string[];
  diagnostics: string[];
}
