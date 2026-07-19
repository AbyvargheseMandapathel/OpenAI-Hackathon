import * as vscode from "vscode";

import type { RadarChatService } from "../ai/RadarChatService";
import type { GitHubAuthService, GitHubConnectionStatus } from "../git/GitHubAuthService";
import type { EngineeringRadar, RiskLevel } from "../models/EngineeringRadar";
import type { Logger } from "../services/Logger";

export class RadarWebviewService {
  public constructor(
    private readonly logger: Logger,
    private readonly radarChatService: RadarChatService,
    private readonly gitHubAuthService: GitHubAuthService
  ) {}

  public async show(
    radar: EngineeringRadar,
    refresh?: () => Promise<EngineeringRadar>
  ): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      "aiEngineeringRadar",
      "AI Engineering Radar",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    let currentRadar = radar;
    const render = async (): Promise<void> => {
      const connectionStatus = await this.gitHubAuthService.getConnectionStatus();
      panel.webview.html = this.renderHtml(panel.webview, currentRadar, connectionStatus);
    };

    await render();
    panel.webview.onDidReceiveMessage(
      async (message: unknown) => {
        const refreshedRadar = await this.handleMessage(panel.webview, currentRadar, message, refresh);
        if (refreshedRadar) {
          currentRadar = refreshedRadar;
          await render();
        }
      },
      undefined,
      []
    );
  }

  private renderHtml(
    webview: vscode.Webview,
    radar: EngineeringRadar,
    connectionStatus: GitHubConnectionStatus
  ): string {
    const nonce = this.createNonce();
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Engineering Radar</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }

    body {
      margin: 0;
      padding: 20px;
    }

    header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 14px;
    }

    h1 {
      margin: 0 0 6px;
      font-size: 20px;
      font-weight: 650;
    }

    h2 {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 650;
    }

    .meta {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.5;
    }

    .risk {
      min-width: 96px;
      height: 34px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      letter-spacing: 0;
      border: 1px solid var(--vscode-panel-border);
    }

    .risk-low {
      background: rgba(46, 160, 67, 0.22);
      color: var(--vscode-testing-iconPassed);
    }

    .risk-medium {
      background: rgba(187, 128, 9, 0.22);
      color: var(--vscode-charts-yellow);
    }

    .risk-high {
      background: rgba(248, 81, 73, 0.22);
      color: var(--vscode-errorForeground);
    }

    .connection {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      grid-column: 1 / -1;
    }

    .connection-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .connection-status {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.5;
    }

    main {
      display: grid;
      grid-template-columns: repeat(2, minmax(240px, 1fr));
      gap: 14px;
      margin-top: 16px;
    }

    section {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 14px;
      min-width: 0;
    }

    ul {
      margin: 0;
      padding-left: 20px;
    }

    li {
      margin: 7px 0;
      line-height: 1.45;
    }

    a {
      color: var(--vscode-textLink-foreground);
    }

    .wide {
      grid-column: 1 / -1;
    }

    .pr-card {
      margin-top: 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 10px;
      background: var(--vscode-sideBar-background);
    }

    .intent {
      margin-top: 6px;
      line-height: 1.45;
    }

    .change-metrics {
      margin-top: 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.5;
    }

    .patch {
      display: block;
      max-height: 220px;
      overflow: auto;
      margin-top: 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 8px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      white-space: pre;
    }

    .chat-box {
      grid-column: 1 / -1;
      display: grid;
      gap: 10px;
    }

    textarea {
      box-sizing: border-box;
      width: 100%;
      min-height: 82px;
      resize: vertical;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    button {
      justify-self: start;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font: inherit;
      min-height: 30px;
      padding: 4px 12px;
    }

    .chat-answer {
      min-height: 48px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 10px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      white-space: pre-wrap;
      line-height: 1.5;
    }

    @media (max-width: 820px) {
      header {
        flex-direction: column;
      }

      main {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>AI Engineering Radar</h1>
      <div class="meta">${this.escapeHtml(radar.filePath)}</div>
      <div class="meta">Branch ${this.escapeHtml(radar.currentBranch)} &middot; ${this.escapeHtml(radar.generatedAt)}</div>
    </div>
    <div class="risk ${this.riskClass(radar.riskLevel)}">${this.escapeHtml(radar.riskLevel)}</div>
  </header>
  <main>
    ${this.renderGitHubConnection(connectionStatus)}
    ${this.renderListSection("Recent Changes", radar.recentChanges)}
    ${this.renderFileChangeHistory(radar)}
    ${this.renderPullRequests(radar)}
    ${this.renderContributors(radar)}
    ${this.renderListSection("Affected Areas", radar.affectedAreas)}
    ${this.renderListSection("Recommended Tests", radar.recommendedTests)}
    ${this.renderListSection("Risk Signals", radar.riskSignals)}
    ${this.renderListSection("Recommended Actions", radar.recommendedActions, "wide")}
    ${this.renderChatSection()}
    ${this.renderListSection("Diagnostics", radar.diagnostics, "wide")}
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const question = document.getElementById("radar-question");
    const askButton = document.getElementById("radar-ask");
    const answer = document.getElementById("radar-answer");
    const prAnalysisButtons = document.querySelectorAll(".pr-file-analyze");
    const githubButton = document.getElementById("radar-github-connect");
    const refreshButton = document.getElementById("radar-refresh");

    askButton.addEventListener("click", () => {
      const text = question.value.trim();
      if (!text) {
        answer.textContent = "Ask a question first.";
        return;
      }

      askButton.disabled = true;
      answer.textContent = "Thinking...";
      vscode.postMessage({ type: "askRadar", question: text });
    });

    if (githubButton) {
      githubButton.addEventListener("click", () => {
        githubButton.disabled = true;
        const action = githubButton.dataset.action || "connectGitHub";
        githubButton.textContent = action === "configureGitHubOAuth" ? "Opening settings..." : "Connecting...";
        vscode.postMessage({ type: action });
      });
    }

    if (refreshButton) {
      refreshButton.addEventListener("click", () => {
        refreshButton.disabled = true;
        refreshButton.textContent = "Refreshing...";
        vscode.postMessage({ type: "refreshRadar" });
      });
    }

    prAnalysisButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const number = Number(button.dataset.prNumber);
        const fileIndex = Number(button.dataset.fileIndex);
        if (!Number.isInteger(number) || !Number.isInteger(fileIndex)) {
          return;
        }
        button.disabled = true;
        button.textContent = "Analyzing...";
        const result = document.getElementById("pr-analysis-" + number + "-" + fileIndex);
        if (result) {
          result.textContent = "Reading the PR description and changed code...";
        }
        vscode.postMessage({ type: "analyzePullRequestFile", number, fileIndex });
      });
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type === "radarAnswer") {
        askButton.disabled = false;
        answer.textContent = message.answer;
      }
      if (message.type === "radarError") {
        askButton.disabled = false;
        answer.textContent = message.error;
      }
      if (message.type === "pullRequestFileAnalysis") {
        const result = document.getElementById("pr-analysis-" + message.number + "-" + message.fileIndex);
        if (result) {
          result.textContent = message.answer;
        }
        const button = document.querySelector(".pr-file-analyze[data-pr-number=\"" + message.number + "\"][data-file-index=\"" + message.fileIndex + "\"]");
        if (button) {
          button.disabled = false;
          button.textContent = "Refresh AI Brief";
        }
      }
    });
  </script>
</body>
</html>`;
  }

  private async handleMessage(
    webview: vscode.Webview,
    radar: EngineeringRadar,
    message: unknown,
    refresh: (() => Promise<EngineeringRadar>) | undefined
  ): Promise<EngineeringRadar | undefined> {
    if (!message || typeof message !== "object" || !("type" in message)) {
      return undefined;
    }

    const candidate = message as { type?: unknown; question?: unknown; number?: unknown; fileIndex?: unknown };
    if (candidate.type === "connectGitHub") {
      try {
        await this.gitHubAuthService.signIn();
        return radar;
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        this.logger.error("GitHub sign-in failed from Radar.", error);
        await webview.postMessage({ type: "radarError", error: `GitHub sign-in failed: ${details}` });
        return undefined;
      }
    }

    if (candidate.type === "configureGitHubOAuth") {
      await vscode.commands.executeCommand("workbench.action.openSettings", "aiMerge.github.oauthClientId");
      return undefined;
    }

    if (candidate.type === "refreshRadar" && refresh) {
      try {
        return await refresh();
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        this.logger.error("Radar refresh failed.", error);
        await webview.postMessage({ type: "radarError", error: `Radar refresh failed: ${details}` });
        return undefined;
      }
    }

    if (
      candidate.type === "analyzePullRequestFile"
      && typeof candidate.number === "number"
      && typeof candidate.fileIndex === "number"
    ) {
      const pullRequest = radar.openPullRequests.find((item) => item.number === candidate.number);
      const fileChange = pullRequest?.fileChanges?.[candidate.fileIndex];
      if (!pullRequest || !fileChange) {
        return undefined;
      }

      try {
        const answer = await this.radarChatService.analyzePullRequestFile(radar, pullRequest, fileChange);
        await webview.postMessage({
          type: "pullRequestFileAnalysis",
          number: pullRequest.number,
          fileIndex: candidate.fileIndex,
          answer
        });
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        this.logger.error(`PR file analysis failed for #${pullRequest.number}.`, error);
        await webview.postMessage({ type: "radarError", error: `PR file analysis failed: ${details}` });
      }
      return undefined;
    }

    if (candidate.type !== "askRadar" || typeof candidate.question !== "string") {
      return undefined;
    }

    try {
      const answer = await this.radarChatService.ask(radar, candidate.question);
      await webview.postMessage({
        type: "radarAnswer",
        answer
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      this.logger.error("Radar Agent chat failed.", error);
      await webview.postMessage({
        type: "radarError",
        error: `Radar Agent failed: ${details}`
      });
    }

    return undefined;
  }

  private renderGitHubConnection(status: GitHubConnectionStatus): string {
    if (status.kind === "oauth") {
      return `<section class="connection"><div><h2>GitHub Connection</h2><div class="connection-status">GitHub OAuth connected. Repository context is ${status.enabled ? "enabled" : "disabled"}.</div></div><div class="connection-actions"><button id="radar-refresh">Refresh Radar</button></div></section>`;
    }

    if (status.kind === "personalToken") {
      return `<section class="connection"><div><h2>GitHub Connection</h2><div class="connection-status">Personal access token connected. OAuth is recommended for team distribution.</div></div><div class="connection-actions"><button id="radar-refresh">Refresh Radar</button></div></section>`;
    }

    if (status.kind === "notConfigured") {
      return `<section class="connection"><div><h2>GitHub Connection</h2><div class="connection-status">Add your GitHub OAuth Client ID in settings to connect securely.</div></div><div class="connection-actions"><button id="radar-github-connect" data-action="configureGitHubOAuth">Configure OAuth</button></div></section>`;
    }

    return `<section class="connection"><div><h2>GitHub Connection</h2><div class="connection-status">Connect GitHub to unlock higher API limits and richer pull-request context.</div></div><div class="connection-actions"><button id="radar-github-connect">Connect GitHub</button></div></section>`;
  }

  private renderPullRequests(radar: EngineeringRadar): string {
    if (radar.openPullRequests.length === 0) {
      return this.renderListSection("Open Pull Requests For This File", []);
    }

    const items = radar.openPullRequests
      .map((pullRequest) => `<li>${this.renderPullRequestCard(pullRequest, [])}</li>`)
      .join("");

    return `<section><h2>Open Pull Requests For This File</h2><ul>${items}</ul></section>`;
  }

  private renderChatSection(): string {
    return `<section class="chat-box">
      <h2>Chat With Radar Agent</h2>
      <div class="meta">Ask what to read, what to test, whether this change is risky, or which PR to inspect before coding.</div>
      <textarea id="radar-question" placeholder="Example: What should I check before changing this file?"></textarea>
      <button id="radar-ask">Ask Radar Agent</button>
      <div id="radar-answer" class="chat-answer">Suggestions will appear here.</div>
    </section>`;
  }

  private renderFileChangeHistory(radar: EngineeringRadar): string {
    if (radar.fileChangeHistory.length === 0) {
      return this.renderListSection("Why This Changed", [], "wide");
    }

    const items = radar.fileChangeHistory
      .map((change) => {
        const prs = change.pullRequests.length > 0
          ? change.pullRequests.map((pullRequest) => {
              const relatedFileChanges = change.fileChanges.filter(
                (fileChange) => fileChange.pullRequestNumber === pullRequest.number
              );
              return this.renderPullRequestCard(pullRequest, relatedFileChanges);
            }).join("")
          : "No associated PR found";
        const fileChanges = change.fileChanges.length > 0
          ? change.fileChanges.map((fileChange) => {
              const patch = fileChange.patchExcerpt
                ? `<code class="patch">${this.escapeHtml(fileChange.patchExcerpt)}</code>`
                : "";
              return `<div class="meta">PR #${fileChange.pullRequestNumber}: ${this.escapeHtml(fileChange.status)} &middot; +${fileChange.additions} -${fileChange.deletions} &middot; ${fileChange.changes} changes</div>${patch}`;
            }).join("")
          : this.renderLocalFileChange(change.localFileChange);
        const likelyReason = change.likelyReason
          ? `<div class="intent"><strong>Why this likely changed:</strong> ${this.escapeHtml(change.likelyReason)}</div>`
          : "";
        const codebaseImpact = change.codebaseImpact
          ? `<div class="intent"><strong>Codebase impact:</strong> ${this.escapeHtml(change.codebaseImpact)}</div>`
          : "";

        return `<li><strong>${this.escapeHtml(change.summary)}</strong><br><span class="meta">${this.escapeHtml(change.sha.slice(0, 8))} &middot; ${this.escapeHtml(change.author)} &middot; ${this.escapeHtml(change.date)}</span><br>${likelyReason}${codebaseImpact}${prs}${fileChanges}</li>`;
      })
      .join("");

    return `<section class="wide"><h2>Why This Changed</h2><ul>${items}</ul></section>`;
  }

  private renderPullRequestCard(
    pullRequest: EngineeringRadar["openPullRequests"][number],
    fileChanges: EngineeringRadar["fileChangeHistory"][number]["fileChanges"]
  ): string {
    const fileSummary = fileChanges.length > 0
      ? fileChanges.map((fileChange) => `${fileChange.status}, +${fileChange.additions} -${fileChange.deletions}, ${fileChange.changes} total file changes`).join("; ")
      : "No file-level diff for the active file was found in this PR.";
    const bodyContext = pullRequest.body
      ? `<div class="meta">${this.escapeHtml(this.extractBodySummary(pullRequest.body))}</div>`
      : "<div class=\"meta\">No PR description was supplied.</div>";
    const prFileChanges = pullRequest.fileChanges ?? [];
    const fileEvidence = prFileChanges.length > 0
      ? prFileChanges.map((file, index) => `<div class="change-metrics"><strong>${this.escapeHtml(file.filename)}</strong>: ${this.escapeHtml(file.status)}, +${file.additions} -${file.deletions}<br><button class="pr-file-analyze" data-pr-number="${pullRequest.number}" data-file-index="${index}">Analyze This File Change</button><div id="pr-analysis-${pullRequest.number}-${index}" class="chat-answer">File-level AI analysis is available on demand.</div></div>`).join("")
      : "<div class=\"change-metrics\">No changed-file metadata was returned for this PR.</div>";

    return `<div class="pr-card">
      ${this.renderPullRequestLink(pullRequest.htmlUrl, pullRequest.number)}
      <strong>${this.escapeHtml(pullRequest.title)}</strong>
      <div class="meta">${this.escapeHtml(pullRequest.headRef)} -> ${this.escapeHtml(pullRequest.baseRef)} &middot; ${this.escapeHtml(pullRequest.state)}</div>
      ${pullRequest.matchedFiles && pullRequest.matchedFiles.length > 0 ? `<div class="meta">Relevant because it changes: ${this.escapeHtml(pullRequest.matchedFiles.join(", "))}</div>` : ""}
      ${bodyContext}
      ${fileEvidence}
      <div class="change-metrics"><strong>Active file impact:</strong> ${this.escapeHtml(fileSummary)}</div>
    </div>`;
  }

  private renderLocalFileChange(
    localFileChange: EngineeringRadar["fileChangeHistory"][number]["localFileChange"]
  ): string {
    if (!localFileChange) {
      return "<div class=\"meta\">No file diff metadata available for this commit.</div>";
    }

    const symbols = localFileChange.symbols.length > 0
      ? `<div class="meta">Changed symbols: ${this.escapeHtml(localFileChange.symbols.join(", "))}</div>`
      : "";
    const removedSymbols = localFileChange.removedSymbols.length > 0
      ? `<div class="meta">Removed symbols: ${this.escapeHtml(localFileChange.removedSymbols.join(", "))}</div>`
      : "";
    const commitFiles = localFileChange.commitFiles.length > 0
      ? `<div class="meta">Files in commit: ${this.escapeHtml(localFileChange.commitFiles.slice(0, 6).join(", "))}</div>`
      : "";
    const patch = localFileChange.patchExcerpt
      ? `<code class="patch">${this.escapeHtml(localFileChange.patchExcerpt)}</code>`
      : "";
    return `<div class="meta">Local file diff: ${this.escapeHtml(localFileChange.status)} &middot; +${localFileChange.additions} -${localFileChange.deletions} &middot; ${localFileChange.changes} changes</div>${symbols}${removedSymbols}${commitFiles}${patch}`;
  }

  private renderContributors(radar: EngineeringRadar): string {
    if (radar.activeContributors.length === 0) {
      return this.renderListSection("Active Contributors", []);
    }

    const items = radar.activeContributors
      .map((contributor) => `<li>${this.escapeHtml(contributor.name)} <span class="meta">${contributor.lines} blamed lines</span></li>`)
      .join("");

    return `<section><h2>Active Contributors</h2><ul>${items}</ul></section>`;
  }

  private renderListSection(title: string, values: string[], className = ""): string {
    const items = values.length > 0
      ? values.map((value) => `<li>${this.escapeHtml(value)}</li>`).join("")
      : "<li>None detected</li>";

    return `<section class="${className}"><h2>${this.escapeHtml(title)}</h2><ul>${items}</ul></section>`;
  }

  private riskClass(riskLevel: RiskLevel): string {
    return `risk-${riskLevel.toLowerCase()}`;
  }

  private extractBodySummary(body: string): string {
    const meaningfulLine = body
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").trim())
      .find((line) => line.length > 0 && !/^<!--/.test(line));

    return meaningfulLine ? this.truncate(meaningfulLine, 240) : "";
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  private escapeAttribute(value: string): string {
    return this.escapeHtml(value).replaceAll("`", "&#96;");
  }

  private renderPullRequestLink(url: string, number: number): string {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" && parsed.hostname.endsWith("github.com")) {
        return `<a href="${this.escapeAttribute(parsed.toString())}">#${number}</a>`;
      }
    } catch {
      // Render an inert label when the remote or API provides an invalid URL.
    }

    return `<span>#${number}</span>`;
  }

  private truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }

  private createNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let index = 0; index < 32; index += 1) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return nonce;
  }
}
