# AI Engineering Radar

AI Engineering Radar is a VS Code extension that gives developers engineering context before they start implementing. Instead of waiting for conflicts, regressions, or review comments, it analyzes the active file and surfaces recent changes, relevant pull requests, active contributors, affected areas, recommended tests, risk signals, and next actions.

The original project began as **AI Merge Engineer**, a merge-conflict assistant. That foundation is still valuable and remains available, but the product has pivoted toward a broader and more differentiated workflow:

> Help developers understand what they need to know before writing code.

## Hackathon Pitch

AI Engineering Radar is a lightweight AI staff-engineer companion inside VS Code. A developer selects a tracked source file and runs **AI Radar: Analyze Current File**. Radar combines local Git history, contributors, working-tree status, and optional GitHub pull-request context into a focused engineering brief: what changed, why it changed, where the risk is, and what to review or test next.

The goal is simple: make the relevant context visible before the code changes.

## Built with Codex & GPT-5.6

This hackathon prototype was developed with **Codex, powered by GPT-5.6**, as an engineering collaborator. Codex was used to iterate on the extension's TypeScript implementation, shape the engineering-context workflow, refine prompts and UI copy, and help validate the project through its compile, lint, and test commands.

The product also integrates with the **Codex CLI** at runtime. When configured, the Radar Agent sends a bounded, read-only prompt containing the current file's Git, pull-request, contributor, risk, and test context. Codex then returns practical follow-up guidance—such as what to review, which tests to run, or how a pull-request file change relates to the active file. The same configurable CLI integration supports the legacy merge-conflict proposal flow.

This separation is intentional: local Git and GitHub signals provide the evidence; Codex/GPT-5.6 turns that evidence into concise, developer-specific guidance. The extension never requires Codex for its deterministic radar analysis, and the CLI command, arguments, and timeout remain configurable in VS Code settings.

## Judge Quick Start

The intended hackathon experience uses Codex. GitHub authentication is **not** required: the demo works with the local Git history of any public repository.

1. Install the packaged extension. In VS Code, run **Extensions: Install from VSIX...** and select `ai-engineering-radar-1.0.5.vsix` from this project. Reload VS Code when prompted.
2. Install and connect the Codex CLI in a terminal:

   ```powershell
   npm.cmd install -g @openai/codex
   codex login
   codex --version
   ```

   The extension uses `codex` by default (or `codex.cmd` on Windows). No API key needs to be entered in the extension.
3. Open any local Git repository you want Radar to analyze—no GitHub sign-in is needed. This can be a project you already have on your machine; cloning a public repository is simply an easy way to get realistic Git history for the demo. For example:

   ```powershell
   git clone https://github.com/microsoft/vscode-extension-samples.git
   code .\vscode-extension-samples
   ```

4. Open a tracked source file, then run **AI Radar: Analyze Current File** from the Command Palette.
5. In the Radar panel, use **Chat With Radar Agent** and ask, for example: *What should I check before changing this file?* The extension passes the local engineering context to Codex and displays its review guidance.

For the core demo, do not use **AI Radar: Connect GitHub**. That optional sign-in enriches GitHub API capacity but is not needed for local Git analysis or Codex-powered Radar Agent guidance.

## Product Vision

AI Engineering Radar acts like a lightweight AI staff engineer inside VS Code. When a developer opens a file, the extension should help answer:

- What changed recently?
- Which pull requests are relevant?
- Who has been working in this area?
- Which APIs, services, or database areas may be affected?
- Which tests should be run?
- Which files or areas look high risk?
- What should the developer read before making changes?

## Current Experience

Run:

```txt
AI Radar: Analyze Current File
```

The extension opens an **AI Engineering Radar** panel with:

- Recent Changes
- Why This Changed
- Open Pull Requests
- Active Contributors
- Affected Areas
- Recommended Tests
- Risk Signals
- Recommended Actions
- Chat With Radar Agent
- Diagnostics

The panel also includes a **Connect GitHub** button. It uses GitHub's OAuth device flow, stores the resulting token only in VS Code Secret Storage, enables GitHub context for the workspace, and provides a **Refresh Radar** action after connection.

The status bar also exposes:

```txt
AI Radar
```

## Example Output

For a file such as `payment.service.ts`, the radar may show:

```txt
Engineering Context

Recent Changes
- Payment API updated
- Billing service refactored
- Tax calculation changed

Open Pull Requests
- #241 Stripe Subscription Support
- #245 Payment Validation Improvements

Active Contributors
- Alice
- John

Risk Level
HIGH

Recommended Actions
- Review recent commits touching this file.
- Review open pull requests on the current branch.
- Check impact across Payments and billing, API and service boundaries.
- Run billing/payment test suite.
```

## Implemented Features

- Analyzes the active file in a Git repository.
- Reads recent file history with Git.
- Maps recent file commits to GitHub pull requests when available.
- Shows PR title/body context and file-level additions, deletions, status, and patch excerpts.
- Reads active contributors from `git blame`.
- Reads working tree changes from `git status`.
- Detects affected engineering areas from file paths and changed files.
- Recommends test areas from project context and file path signals.
- Calculates a simple risk level: `LOW`, `MEDIUM`, or `HIGH`.
- Shows results in a dedicated VS Code webview.
- Shows automatic alerts when the opened or edited file appears risky.
- Provides an in-panel Radar Agent chat for follow-up questions and suggested next steps.
- Provides on-demand AI analysis of an individual changed file in a relevant pull request.
- Supports optional GitHub OAuth device flow.
- Uses GitHub REST API context for repository and pull request awareness.
- Preserves the original merge-conflict assistant:
  - conflict marker detection
  - CodeLens actions
  - conflict explanation
  - Codex CLI merge proposal
  - proposal review UI
  - safe apply after approval

## Not Yet Implemented

- AI-generated radar summaries.
- Cross-file dependency graph analysis.
- API schema and database migration diffing.
- Pull request relevance beyond branch matching.
- Continuous background radar updates.
- Merge history and analytics.
- Marketplace publishing and distribution setup.

## Requirements

- VS Code `1.92.0` or newer
- Node.js
- npm
- Git
- Codex CLI, signed in with `codex login`, for the intended Radar Agent experience
- Optional: GitHub OAuth app for GitHub context

Install dependencies:

```powershell
npm.cmd install
```

Compile:

```powershell
npm.cmd run compile
```

Run checks:

```powershell
npm.cmd run check
npm.cmd test
```

## Running The Extension

Open this extension project:

```powershell
cd C:\Users\ABY\Desktop\project\hackathon
code .
```

Build:

```powershell
npm.cmd run compile
```

Launch the Extension Development Host:

```txt
F5
```

In the Extension Development Host:

1. Open a Git repository.
2. Open any tracked source file.
3. Run:

```txt
AI Radar: Analyze Current File
```

The radar panel should open beside the editor.

Automatic alerts are enabled by default. When you open or edit a file that crosses the configured risk threshold, VS Code shows a warning with an **Open Radar** action.

Example alert:

```txt
You are editing src/payment/payment.service.ts. Radar risk is HIGH: File has changed frequently in recent history.
```

The **Why This Changed** section explains recent file changes by combining local Git commits with GitHub PR metadata. When GitHub can associate a commit with a PR, Radar shows the PR number, title, body excerpt, file status, additions, deletions, and a patch excerpt.

PR cards also include a short deterministic intent line, such as:

```txt
What this PR appears to do: Optimize payment API; likely optimizes API behavior or latency.
Active file impact: modified, +18 -7, 25 total file changes.
```

Use **Chat With Radar Agent** to ask follow-up questions such as:

```txt
What should I check before changing this file?
Which PR should I read first?
What tests should I run before committing?
Is this safe to refactor now?
```

## GitHub Setup

GitHub is optional. Enable it when you want repository and pull request context. Installing the VSIX and cloning an application repository are separate steps: install Radar once, then open whichever local project you want it to inspect.

### Public Repositories: No Sign-In Required

For a public GitHub repository, OAuth is not required. Enable GitHub context in VS Code Settings JSON:

```json
{
  "aiMerge.github.enabled": true
}
```

Radar sends unauthenticated GitHub API requests and infers `owner/repository` from the workspace `origin` remote. This is enough to discover public pull requests and repository metadata.

For example, an origin of `https://github.com/excalidraw/excalidraw.git` is automatically detected as `excalidraw/excalidraw`.

### When To Connect GitHub

Use **AI Radar: Connect GitHub** only for private repositories or when you need GitHub's higher authenticated API limit. The extension stores the OAuth token in VS Code Secret Storage. Public repositories continue to work without it, subject to GitHub's lower anonymous API limit.

Set `aiMerge.github.repository` only when the repository cannot be inferred, such as a workspace without an `origin` remote. Set `aiMerge.github.oauthClientId`, `webBaseUrl`, and `apiBaseUrl` only when using your own OAuth app or GitHub Enterprise.

The settings still use the `aiMerge` namespace for compatibility with the original extension. A future cleanup can migrate them to `aiRadar`.

## Codex CLI Setup

Codex CLI is required for the intended hackathon demo: it powers **Chat With Radar Agent** and on-demand pull-request file analysis. It also powers the legacy AI merge proposal flow.

Install:

```powershell
npm.cmd install -g @openai/codex
```

Log in:

```powershell
codex login
```

Verify that VS Code can find it:

```powershell
codex --version
where.exe codex
where.exe codex.cmd
```

There is no separate in-extension Codex login button. Once `codex login` succeeds in a terminal, Radar invokes the CLI automatically when you use **Chat With Radar Agent** or analyze a pull-request file.

Default AI command settings:

```json
{
  "aiMerge.aiCommand": "codex",
  "aiMerge.aiArgs": [
    "exec",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "-"
  ],
  "aiMerge.aiTimeoutMs": 120000
}
```

On Windows, if VS Code cannot find Codex:

```powershell
where.exe codex
where.exe codex.cmd
```

Then set:

```json
{
  "aiMerge.aiCommand": "C:\\Users\\ABY\\AppData\\Roaming\\npm\\codex.cmd"
}
```

## Demo With Excalidraw

Open your local Excalidraw checkout in the Extension Development Host. You only need this checkout because it is the repository being analyzed; you do not need to clone the Radar extension again after installing its VSIX.

Click **Connect GitHub** in the Radar panel if you want live PR context. Excalidraw is inferred automatically from its `origin` remote.

Open a meaningful file, then run:

```txt
AI Radar: Analyze Current File
```

Good demo files are areas with real history and ownership, such as service, package, test, or app files. The radar should show recent commits, contributors, affected areas, recommended tests, and risk level.

## Legacy Merge Conflict Flow

The old merge assistant still works.

Create or open a conflicted file:

```txt
  <<<<<<< HEAD
  current code
  =======
  incoming code
  >>>>>>> feature-branch
```

## Release a VSIX

Run the release checks and create an installable VS Code extension package:

```powershell
npm.cmd run package
```

This creates an `.vsix` file in the project directory. Install it from VS Code using **Extensions: Install from VSIX...**.

For every subsequent build, create a higher-versioned update package with:

```powershell
npm.cmd run release:patch
```

Install the resulting newer VSIX from your normal VS Code window. VS Code recognizes the higher version as an update and offers its normal extension controls, including reload, disable, uninstall, and install-another-version options.

Before publishing to the Visual Studio Marketplace, create a publisher account and make sure the `publisher` field in `package.json` exactly matches that publisher ID. The current value is `abyvargheese` and should be changed if your Marketplace publisher uses a different ID.

Use the CodeLens actions:

```txt
Resolve with AI Merge
Explain Conflict
```

The merge flow:

```txt
ConflictDetector
-> GitContextService
-> RepositoryContextService
-> GitHubContextService
-> PromptBuilder
-> AIService
-> MergeResultValidator
-> DiffWebviewService
-> ApplyMergeService
```

## Architecture

```txt
src/
  radar/
    EngineeringRadarService.ts
  ui/
    RadarWebviewService.ts
    ConflictCodeLensProvider.ts
    DiffWebviewService.ts
    StatusBarService.ts
  commands/
    AnalyzeCurrentFileCommand.ts
    ResolveConflictCommand.ts
    ExplainConflictCommand.ts
    GitHubSignInCommand.ts
    GitHubSignOutCommand.ts
  git/
    GitCommandRunner.ts
    GitContextService.ts
    GitHubAuthService.ts
    GitHubClient.ts
    GitHubContextService.ts
    GitHubRepositoryResolver.ts
    GitRepositoryService.ts
  services/
    ApplyMergeService.ts
    Logger.ts
    RepositoryContextService.ts
    WorkspaceService.ts
  ai/
    AIService.ts
    MergeResultValidator.ts
    PromptBuilder.ts
  parser/
    ConflictDetector.ts
    ConflictParser.ts
  verification/
    VerificationService.ts
  models/
  extension.ts
```

Radar flow:

```txt
AI Radar: Analyze Current File
-> EngineeringRadarService
-> GitCommandRunner
-> RepositoryContextService
-> GitHubContextService
-> RadarWebviewService
```

## Commands

| Command | Purpose |
| --- | --- |
| `AI Radar: Analyze Current File` | Show engineering context for the active file |
| `AI Merge: Resolve Conflict` | Legacy AI merge proposal flow |
| `AI Merge: Explain Conflict` | Explain parsed conflict details |
| `AI Merge: GitHub Sign In` | Start GitHub OAuth device flow |
| `AI Merge: GitHub Sign Out` | Remove stored GitHub token |

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `aiMerge.github.enabled` | `false` | Enable GitHub API context |
| `aiMerge.github.webBaseUrl` | `https://github.com` | GitHub web URL |
| `aiMerge.github.apiBaseUrl` | `https://api.github.com` | GitHub REST API URL |
| `aiMerge.github.oauthClientId` | bundled GitHub.com Client ID | OAuth app client ID; override for your own OAuth app or Enterprise |
| `aiMerge.github.oauthScopes` | `["repo", "read:user"]` | OAuth scopes |
| `aiMerge.github.repository` | empty | Optional repository override; inferred from `origin` by default |
| `aiMerge.github.pullRequestNumber` | `0` | Optional pull request number |
| `aiMerge.github.token` | empty | Personal access token fallback |
| `aiMerge.aiCommand` | `codex` | Legacy merge AI command executable |
| `aiMerge.aiArgs` | `["exec", "--sandbox", "read-only", "--skip-git-repo-check", "-"]` | Legacy merge AI command args |
| `aiMerge.aiTimeoutMs` | `120000` | Legacy merge AI timeout |
| `aiRadar.alerts.enabled` | `true` | Enable automatic open/edit risk alerts |
| `aiRadar.alerts.riskThreshold` | `MEDIUM` | Minimum risk level for automatic alerts |
| `aiRadar.alerts.debounceMs` | `3000` | Delay before analyzing after edits |

## Troubleshooting

### Command Not Found

Run commands inside the **Extension Development Host**, not the normal VS Code window.

From the extension project window:

```txt
F5
```

Then use the command palette in the new window.

### Radar Requires A Git Repository

Open a folder that is inside a Git repo. The radar depends on Git history, blame, and status. A downloaded ZIP can be opened, but it has no `.git` history unless you initialize or clone it, so commit, branch, contributor, and automatic GitHub-repository context will be unavailable.

### No GitHub Pull Requests Show Up

For public repositories, set `"aiMerge.github.enabled": true` in Settings JSON; no sign-in is required. For private repositories or higher API limits, click **Connect GitHub**. Radar infers the repository from the workspace `origin` remote. Set `aiMerge.github.repository` only when the remote is unavailable or not a GitHub remote.

### Codex Launch Errors

Codex powers the interactive Radar Agent and the legacy merge flow. The deterministic radar can still collect local Git context without it, but the intended demo requires Codex.

If Codex cannot be found:

```powershell
where.exe codex
where.exe codex.cmd
```

Then configure the full path:

```json
{
  "aiMerge.aiCommand": "C:\\Users\\ABY\\AppData\\Roaming\\npm\\codex.cmd"
}
```

If your Codex CLI rejects `--ask-for-approval`, remove that flag from `aiMerge.aiArgs`.

## Tests

Current tests cover:

- conflict parser
- AI merge result validation
- prompt builder
- GitHub repository inference
- verification command planning

Run:

```powershell
npm.cmd test
```

## Roadmap

- Add AI-generated radar summaries.
- Rank relevant pull requests by touched files and ownership.
- Detect APIs changed from TypeScript exports and routes.
- Detect database changes from migrations and schema files.
- Add dependency graph and service impact analysis.
- Add continuous file-open radar refresh.
- Move settings from `aiMerge` namespace to `aiRadar`.
- Package as `.vsix`.
- Add integration tests with fixture repositories.

## License

This project is currently a local hackathon prototype. Add a license before publishing or distributing.
