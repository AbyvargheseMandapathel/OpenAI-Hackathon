# AI Merge Engineer

AI Merge Engineer is a VS Code extension that helps developers resolve Git merge conflicts with an AI-assisted workflow. It detects conflict markers in open files, gathers local Git and repository context, optionally enriches the prompt with GitHub pull request context, asks Codex CLI for a structured merge proposal, shows the proposal for review, and applies it only after user approval.

The project is built for a hackathon-style demo, but the architecture is intentionally modular so the same foundation can grow into a production extension.

## What It Does

- Detects Git conflict markers in open files.
- Shows CodeLens actions above each conflict:
  - `Resolve with AI Merge`
  - `Explain Conflict`
- Extracts current and incoming conflict blocks with line numbers and branch labels.
- Collects local Git context:
  - current branch
  - merge target hints
  - recent file log
  - diff
  - blame
  - changed files
  - repository root
- Detects repository context from common project files:
  - `README.md`
  - `package.json`
  - `Cargo.toml`
  - `requirements.txt`
  - `composer.json`
  - `go.mod`
  - `pom.xml`
- Builds deterministic prompts for Codex CLI.
- Calls a configurable local AI command, defaulting to Codex CLI.
- Validates AI output as JSON before showing it.
- Displays a review webview with:
  - Original
  - Incoming
  - AI Merge
  - explanation
  - confidence
  - warnings
- Supports edit, copy, reject, and accept from the review UI.
- Applies accepted proposals by replacing only the selected conflict region.
- Includes a verification engine for formatter, lint, build, and test commands.
- Supports optional GitHub OAuth device flow and GitHub REST API context.

## Current Status

Implemented through the core MVP path:

- Extension foundation
- Conflict detection
- Git context collection
- Repository context detection
- Prompt builder
- Codex CLI integration
- Proposal review webview
- Safe apply flow
- Verification command planner
- GitHub OAuth device flow
- GitHub repository and pull request context

Not implemented yet:

- Automatic self-healing retry loop
- Merge history storage
- Settings UI page
- Analytics side panel
- Predictive future-conflict detection
- Full extension packaging and marketplace release workflow

## Requirements

- Windows, macOS, or Linux
- VS Code `1.92.0` or newer
- Node.js
- npm
- Git
- Codex CLI installed and logged in
- Optional: GitHub OAuth app for GitHub API context

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

## Codex CLI Setup

Install Codex CLI if needed:

```powershell
npm.cmd install -g @openai/codex
```

Log in:

```powershell
codex login
```

Verify it works:

```powershell
codex --version
codex exec --skip-git-repo-check "Return only this JSON: {\"mergedCode\":\"ok\",\"explanation\":\"test\",\"confidence\":1,\"warnings\":[]}"
```

Default extension AI settings:

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

On Windows, if VS Code cannot find `codex`, set the full path:

```json
{
  "aiMerge.aiCommand": "C:\\Users\\ABY\\AppData\\Roaming\\npm\\codex.cmd"
}
```

Find the path with:

```powershell
where.exe codex
where.exe codex.cmd
```

## GitHub Setup

GitHub support is optional. The extension can resolve conflicts using only local Git and Codex CLI. Enable GitHub when you want repository and pull request context included in the AI prompt.

Create a GitHub OAuth app:

1. Open https://github.com/settings/developers
2. Go to **OAuth Apps**
3. Create a new OAuth app
4. Use any local homepage and callback URL, for example:

```txt
Homepage URL: http://localhost
Authorization callback URL: http://localhost
```

5. Enable **Device Flow**
6. Copy the OAuth app **Client ID**

Add settings in the Extension Development Host:

```json
{
  "aiMerge.github.enabled": true,
  "aiMerge.github.webBaseUrl": "https://github.com",
  "aiMerge.github.apiBaseUrl": "https://api.github.com",
  "aiMerge.github.oauthClientId": "YOUR_GITHUB_OAUTH_CLIENT_ID",
  "aiMerge.github.repository": "owner/repository"
}
```

For Excalidraw:

```json
{
  "aiMerge.github.enabled": true,
  "aiMerge.github.repository": "excalidraw/excalidraw"
}
```

Sign in from the command palette:

```txt
AI Merge: GitHub Sign In
```

Sign out:

```txt
AI Merge: GitHub Sign Out
```

Personal access token fallback is also supported:

```json
{
  "aiMerge.github.enabled": true,
  "aiMerge.github.token": "YOUR_GITHUB_TOKEN"
}
```

OAuth is preferred because tokens are stored in VS Code SecretStorage.

## Running The Extension

Open this extension project:

```powershell
cd C:\Users\ABY\Desktop\project\hackathon
code .
```

Build it:

```powershell
npm.cmd run compile
```

Launch the Extension Development Host:

```txt
F5
```

In the Extension Development Host:

1. Open a Git repository.
2. Open a file containing Git conflict markers.
3. Click `Explain Conflict` to verify detection.
4. Click `Resolve with AI Merge`.
5. Review the AI proposal in the webview.
6. Click `Accept` to apply, or `Reject` to leave the file unchanged.

## Demo With Excalidraw

In the Extension Development Host, open your cloned Excalidraw repo.

Create a safe demo conflict:

```powershell
git switch -c ai-merge-demo-a
"export const mergeDemoValue = 'from branch A';" | Out-File -Encoding utf8 ai-merge-demo.ts
git add ai-merge-demo.ts
git commit -m "Add demo value from branch A"

git switch -
git switch -c ai-merge-demo-b
"export const mergeDemoValue = 'from branch B';" | Out-File -Encoding utf8 ai-merge-demo.ts
git add ai-merge-demo.ts
git commit -m "Add demo value from branch B"

git merge ai-merge-demo-a
```

Open `ai-merge-demo.ts`. You should see CodeLens actions above the conflict.

Use:

```txt
Explain Conflict
Resolve with AI Merge
```

For large repositories such as Excalidraw, avoid running the full test suite during the first demo. Focus on conflict detection, context gathering, Codex proposal generation, review, and apply.

## Expected AI Output

The configured AI command must return JSON matching this schema:

```json
{
  "mergedCode": "string",
  "explanation": "string",
  "confidence": 0.9,
  "warnings": ["string"]
}
```

The extension validates this shape before opening the proposal webview.

## Architecture

```txt
src/
  ai/
    AIService.ts
    MergeResultValidator.ts
    PromptBuilder.ts
  commands/
    ExplainConflictCommand.ts
    GitHubSignInCommand.ts
    GitHubSignOutCommand.ts
    ResolveConflictCommand.ts
  git/
    GitCommandRunner.ts
    GitContextService.ts
    GitHubAuthService.ts
    GitHubClient.ts
    GitHubContextService.ts
    GitHubRepositoryResolver.ts
    GitRepositoryService.ts
  models/
  parser/
    ConflictDetector.ts
    ConflictParser.ts
  services/
    ApplyMergeService.ts
    Logger.ts
    RepositoryContextService.ts
    WorkspaceService.ts
  ui/
    ConflictCodeLensProvider.ts
    DiffWebviewService.ts
    StatusBarService.ts
  verification/
    VerificationService.ts
  extension.ts
```

Core flow:

```txt
CodeLens
-> ConflictDetector
-> GitContextService
-> RepositoryContextService
-> GitHubContextService
-> PromptBuilder
-> AIService
-> MergeResultValidator
-> DiffWebviewService
-> ApplyMergeService
```

## Commands

| Command | Purpose |
| --- | --- |
| `AI Merge: Resolve Conflict` | Build context, call Codex CLI, and show a proposal |
| `AI Merge: Explain Conflict` | Show parsed conflict details |
| `AI Merge: GitHub Sign In` | Start GitHub OAuth device flow |
| `AI Merge: GitHub Sign Out` | Remove stored GitHub OAuth token |

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `aiMerge.aiCommand` | `codex` | AI command executable |
| `aiMerge.aiArgs` | `["exec", "--sandbox", "read-only", "--skip-git-repo-check", "-"]` | Arguments passed to the AI command |
| `aiMerge.aiTimeoutMs` | `120000` | AI command timeout |
| `aiMerge.github.enabled` | `false` | Enable GitHub API context |
| `aiMerge.github.webBaseUrl` | `https://github.com` | GitHub web URL |
| `aiMerge.github.apiBaseUrl` | `https://api.github.com` | GitHub REST API URL |
| `aiMerge.github.oauthClientId` | empty | GitHub OAuth app client ID |
| `aiMerge.github.oauthScopes` | `["repo", "read:user"]` | OAuth scopes |
| `aiMerge.github.repository` | empty | Repository in `owner/name` form |
| `aiMerge.github.pullRequestNumber` | `0` | Optional pull request number |
| `aiMerge.github.token` | empty | Personal access token fallback |

## Troubleshooting

### `spawn codex ENOENT`

VS Code cannot find Codex CLI.

Fix:

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

Restart VS Code after changing PATH or installing Codex CLI.

### `spawn EINVAL`

Usually a Windows process-launch issue. Use the latest project build and restart the Extension Development Host. The extension runs commands through the Windows shell to handle `.cmd` shims.

### `unexpected argument '--ask-for-approval'`

Your Codex CLI version does not support that flag. Remove it from settings:

```json
{
  "aiMerge.aiArgs": [
    "exec",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "-"
  ]
}
```

### Command Not Found In VS Code

Run the command inside the **Extension Development Host**, not the normal VS Code window.

From the extension project window:

```txt
F5
```

Then use the command palette in the new window.

### No CodeLens Appears

Make sure the file contains all three conflict markers:

```txt
<<<<<<< HEAD
current code
=======
incoming code
>>>>>>> feature-branch
```

Open the conflicted file in the Extension Development Host.

## Development Scripts

```powershell
npm.cmd install
npm.cmd run compile
npm.cmd run watch
npm.cmd run check
npm.cmd test
```

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

## Safety Model

AI Merge Engineer does not apply AI output automatically. It:

1. Parses the selected conflict.
2. Builds context.
3. Requests a JSON proposal.
4. Validates the proposal.
5. Shows a review UI.
6. Applies only after the user clicks `Accept`.
7. Replaces only the selected conflict region.
8. Rejects merged output that still contains conflict markers.

## Roadmap

- Add a self-healing retry loop for failed verification.
- Run verification safely in a temporary worktree.
- Add merge history and metrics.
- Add a dedicated settings UI.
- Add analytics side panel.
- Add predictive conflict detection for future branch conflicts.
- Package as `.vsix`.
- Add integration tests with fixture repositories.

## License

This project is currently a local hackathon prototype. Add a license before publishing or distributing.
