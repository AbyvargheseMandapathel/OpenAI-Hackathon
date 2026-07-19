import * as vscode from "vscode";

import type { AIService } from "../ai/AIService";
import type { PromptBuilder } from "../ai/PromptBuilder";
import type { GitContextService } from "../git/GitContextService";
import type { GitRepositoryService } from "../git/GitRepositoryService";
import type { ConflictCommandArgs } from "../models/ConflictCommandArgs";
import type { ConflictDetector } from "../parser/ConflictDetector";
import type { Logger } from "../services/Logger";
import type { RepositoryContextService } from "../services/RepositoryContextService";
import type { DiffWebviewService } from "../ui/DiffWebviewService";
import type { WorkspaceService } from "../services/WorkspaceService";

export class ResolveConflictCommand {
  public static readonly commandId = "aiMerge.resolveConflict";

  public constructor(
    private readonly logger: Logger,
    private readonly workspaceService: WorkspaceService,
    private readonly gitRepositoryService: GitRepositoryService,
    private readonly conflictDetector: ConflictDetector,
    private readonly gitContextService: GitContextService,
    private readonly repositoryContextService: RepositoryContextService,
    private readonly promptBuilder: PromptBuilder,
    private readonly aiService: AIService,
    private readonly diffWebviewService: DiffWebviewService
  ) {}

  public async execute(args?: unknown): Promise<void> {
    this.logger.info("Resolve conflict command invoked.");

    const workspaceFolder = this.workspaceService.getPrimaryWorkspaceFolder();
    if (!workspaceFolder) {
      const message = "Open a workspace folder before resolving merge conflicts.";
      this.logger.warn(message);
      await vscode.window.showWarningMessage(message);
      return;
    }

    const repository = await this.gitRepositoryService.detectRepository(workspaceFolder.uri.fsPath);
    if (!repository.ok) {
      const message = `AI Merge requires a Git repository. ${repository.error}`;
      this.logger.warn(message);
      await vscode.window.showWarningMessage(message);
      return;
    }

    const conflictArgs = this.parseArgs(args);
    if (!conflictArgs) {
      const activeEditor = vscode.window.activeTextEditor;
      const conflicts = activeEditor
        ? this.conflictDetector.detect(activeEditor.document)
        : [];

      const message =
        conflicts.length > 0
          ? `Detected ${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} in the active file. Use the CodeLens action above a conflict to continue.`
          : "No Git conflict markers were detected in the active file.";

      this.logger.info(message);
      await vscode.window.showInformationMessage(message);
      return;
    }

    const conflict = this.conflictDetector.getConflict(conflictArgs.documentUri, conflictArgs.conflictId);
    if (!conflict) {
      const message = "That conflict is no longer available. Reopen or edit the file to refresh conflict detection.";
      this.logger.warn(message);
      await vscode.window.showWarningMessage(message);
      return;
    }

    const documentUri = vscode.Uri.parse(conflictArgs.documentUri);
    const gitContext = await this.gitContextService.collectContext({
      workspacePath: workspaceFolder.uri.fsPath,
      filePath: documentUri.fsPath,
      conflict
    });
    const repositoryContext = await this.repositoryContextService.collectContext(repository.rootPath);
    const document = await vscode.workspace.openTextDocument(documentUri);
    const promptPayload = this.promptBuilder.build({
      repositoryContext,
      gitContext,
      documentPath: documentUri.fsPath,
      documentText: document.getText(),
      conflict
    });
    const mergeResult = await this.aiService.generateMerge(promptPayload, repository.rootPath);
    this.diffWebviewService.showProposal({
      documentUri,
      conflict,
      mergeResult
    });

    const message = [
      `Generated AI merge proposal for ${conflict.id}.`,
      `Branch: ${gitContext.currentBranch}`,
      `Merge target: ${gitContext.mergeTarget ?? "not detected"}`,
      `Confidence: ${mergeResult.confidence}`,
      `Warnings: ${mergeResult.warnings.length}`
    ].join(" ");

    this.logger.info(message);
    await vscode.window.showInformationMessage(message);
  }

  private parseArgs(args: unknown): ConflictCommandArgs | undefined {
    if (!args || typeof args !== "object") {
      return undefined;
    }

    const candidate = args as Partial<ConflictCommandArgs>;
    if (typeof candidate.documentUri !== "string" || typeof candidate.conflictId !== "string") {
      return undefined;
    }

    return {
      documentUri: candidate.documentUri,
      conflictId: candidate.conflictId
    };
  }
}
