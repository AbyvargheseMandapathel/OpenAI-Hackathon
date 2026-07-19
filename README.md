# AI Merge Engineer

VS Code extension for detecting and resolving Git merge conflicts with an AI-assisted workflow.

## Phase 1

- Registers `AI Merge: Resolve Conflict`
- Adds a status bar entry
- Creates an output channel
- Detects the active workspace
- Detects whether the workspace is inside a Git repository
- Logs initialization and command activity

## Phase 2

- Parses Git conflict marker blocks in open files
- Extracts current/incoming code, line numbers, and branch label
- Shows CodeLens actions above each conflict:
  - `Resolve with AI Merge`
  - `Explain Conflict`
- Provides parser tests with Node's built-in test runner

## Phase 3

- Collects structured Git context for a selected conflict
- Reads repository root, current branch, merge target hints, recent file log, file diff, line blame, and changed files
- Returns diagnostics instead of failing the entire context collection when optional Git data is unavailable

## Phase 4

- Reads standard repository context files such as `README.md`, `package.json`, `Cargo.toml`, `requirements.txt`, `composer.json`, `go.mod`, and `pom.xml`
- Detects likely languages, frameworks, formatters, linters, and test frameworks

## Phase 5

- Builds deterministic AI merge prompts from conflict, Git, repository, current-file, and current-function context
- Includes coding rules, user preferences, and a strict JSON output schema
- Trims repository file content to avoid unnecessary prompt payload size

## Phase 6

- Executes a configurable local AI command, defaulting to `codex exec`
- Sends the prompt through stdin
- Validates AI output as a typed merge result with `mergedCode`, `explanation`, `confidence`, and `warnings`

## Phase 7

- Shows a webview with Original, Incoming, and AI Merge columns
- Displays explanation, confidence, and warnings
- Supports Accept, Reject, Edit, and Copy actions for proposal review

## Phase 8

- Applies an accepted proposal by replacing only the selected conflict marker region
- Refuses to apply merged text that still contains conflict markers
- Saves the document and refreshes VS Code's Git view

## Phase 9

- Plans and runs formatter, lint, build, and test commands from detected repository context
- Supports npm scripts plus Rust, Go, Python, and Maven defaults
- Returns structured pass, fail, or skipped results with diagnostics

## GitHub API

- Optional GitHub REST API context is available through `aiMerge.github.enabled`
- Sign in with `AI Merge: GitHub Sign In` after setting `aiMerge.github.oauthClientId`
- OAuth uses GitHub's device flow and stores tokens in VS Code SecretStorage
- Personal access token fallback is still supported through `aiMerge.github.token`

## Development

```powershell
npm.cmd install
npm.cmd run compile
npm.cmd test
```
