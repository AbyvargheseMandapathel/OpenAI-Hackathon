import * as vscode from "vscode";

import type { Conflict } from "../models/Conflict";
import type { MergeResult } from "../models/MergeResult";
import type { ApplyMergeService } from "../services/ApplyMergeService";
import type { Logger } from "../services/Logger";

export interface ShowMergeProposalOptions {
  documentUri: vscode.Uri;
  conflict: Conflict;
  mergeResult: MergeResult;
}

export class DiffWebviewService {
  public constructor(
    private readonly logger: Logger,
    private readonly applyMergeService: ApplyMergeService
  ) {}

  public showProposal(options: ShowMergeProposalOptions): void {
    const panel = vscode.window.createWebviewPanel(
      "aiMergeProposal",
      "AI Merge Proposal",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    panel.webview.html = this.renderHtml(panel.webview, options);
    panel.webview.onDidReceiveMessage(
      async (message: unknown) => {
        await this.handleMessage(message, options);
      },
      undefined,
      []
    );
  }

  private async handleMessage(message: unknown, options: ShowMergeProposalOptions): Promise<void> {
    if (!message || typeof message !== "object" || !("type" in message)) {
      return;
    }

    const type = (message as { type: unknown }).type;
    if (type === "copy") {
      const mergedCode = this.readMergedCode(message, options.mergeResult.mergedCode);
      await vscode.env.clipboard.writeText(mergedCode);
      await vscode.window.showInformationMessage("AI merge proposal copied.");
      return;
    }

    if (type === "accept") {
      const mergedCode = this.readMergedCode(message, options.mergeResult.mergedCode);
      try {
        await this.applyMergeService.apply({
          documentUri: options.documentUri,
          conflict: options.conflict,
          mergedCode
        });
        await vscode.window.showInformationMessage("AI merge proposal applied.");
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        this.logger.error("Failed to apply AI merge proposal.", error);
        await vscode.window.showErrorMessage(`Failed to apply AI merge proposal: ${details}`);
      }
      return;
    }

    if (type === "reject") {
      this.logger.info(`User rejected proposal for ${options.documentUri.fsPath}:${options.conflict.id}.`);
      await vscode.window.showInformationMessage("AI merge proposal rejected.");
    }
  }

  private readMergedCode(message: unknown, fallback: string): string {
    if (!message || typeof message !== "object" || !("mergedCode" in message)) {
      return fallback;
    }

    const mergedCode = (message as { mergedCode: unknown }).mergedCode;
    return typeof mergedCode === "string" ? mergedCode : fallback;
  }

  private renderHtml(webview: vscode.Webview, options: ShowMergeProposalOptions): string {
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
  <title>AI Merge Proposal</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }

    body {
      margin: 0;
      padding: 16px;
    }

    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 12px;
    }

    h1 {
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 6px;
    }

    .meta {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.5;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }

    button {
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      font: inherit;
      min-height: 30px;
      padding: 4px 10px;
    }

    button.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    main {
      display: grid;
      grid-template-columns: repeat(3, minmax(220px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }

    section {
      min-width: 0;
    }

    h2 {
      font-size: 13px;
      font-weight: 600;
      margin: 0 0 8px;
    }

    pre,
    textarea {
      box-sizing: border-box;
      width: 100%;
      min-height: 360px;
      margin: 0;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 10px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.45;
      overflow: auto;
      white-space: pre;
    }

    textarea {
      resize: vertical;
    }

    .explanation {
      margin-top: 16px;
      border-top: 1px solid var(--vscode-panel-border);
      padding-top: 12px;
      line-height: 1.55;
    }

    @media (max-width: 900px) {
      main {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>AI Merge Proposal</h1>
      <div class="meta">${this.escapeHtml(options.documentUri.fsPath)}</div>
      <div class="meta">Lines ${options.conflict.startLine + 1}-${options.conflict.endLine + 1} · confidence ${options.mergeResult.confidence}</div>
    </div>
    <div class="actions">
      <button class="primary" id="accept">Accept</button>
      <button id="reject">Reject</button>
      <button id="edit">Edit</button>
      <button id="copy">Copy</button>
    </div>
  </header>
  <main>
    <section>
      <h2>Original</h2>
      <pre>${this.escapeHtml(options.conflict.currentCode)}</pre>
    </section>
    <section>
      <h2>Incoming</h2>
      <pre>${this.escapeHtml(options.conflict.incomingCode)}</pre>
    </section>
    <section>
      <h2>AI Merge</h2>
      <textarea id="merged" readonly>${this.escapeHtml(options.mergeResult.mergedCode)}</textarea>
    </section>
  </main>
  <section class="explanation">
    <h2>Explanation</h2>
    <p>${this.escapeHtml(options.mergeResult.explanation)}</p>
    <h2>Warnings</h2>
    <p>${this.escapeHtml(options.mergeResult.warnings.join("\\n") || "None")}</p>
  </section>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const merged = document.getElementById("merged");
    document.getElementById("accept").addEventListener("click", () => {
      vscode.postMessage({ type: "accept", mergedCode: merged.value });
    });
    document.getElementById("reject").addEventListener("click", () => {
      vscode.postMessage({ type: "reject" });
    });
    document.getElementById("edit").addEventListener("click", () => {
      merged.toggleAttribute("readonly");
      merged.focus();
    });
    document.getElementById("copy").addEventListener("click", () => {
      vscode.postMessage({ type: "copy", mergedCode: merged.value });
    });
  </script>
</body>
</html>`;
  }

  private createNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let index = 0; index < 32; index += 1) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return nonce;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
}
