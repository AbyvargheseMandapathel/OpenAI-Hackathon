import * as vscode from "vscode";

import type { ConflictCommandArgs } from "../models/ConflictCommandArgs";
import type { ConflictDetector } from "../parser/ConflictDetector";
import type { Logger } from "../services/Logger";

export class ExplainConflictCommand {
  public static readonly commandId = "aiMerge.explainConflict";

  public constructor(
    private readonly logger: Logger,
    private readonly conflictDetector: ConflictDetector
  ) {}

  public async execute(args?: unknown): Promise<void> {
    const conflictArgs = this.parseArgs(args);
    if (!conflictArgs) {
      const message = "Select a conflict CodeLens action to explain a specific conflict.";
      this.logger.warn(message);
      await vscode.window.showWarningMessage(message);
      return;
    }

    const conflict = this.conflictDetector.getConflict(conflictArgs.documentUri, conflictArgs.conflictId);
    if (!conflict) {
      const message = "That conflict is no longer available. Reopen or edit the file to refresh conflict detection.";
      this.logger.warn(message);
      await vscode.window.showWarningMessage(message);
      return;
    }

    const explanation = [
      `Conflict ${conflict.id}`,
      `Lines: ${conflict.startLine + 1}-${conflict.endLine + 1}`,
      `Current side: ${conflict.currentLabel}`,
      `Incoming side: ${conflict.branch}`,
      `Current lines: ${this.countLines(conflict.currentCode)}`,
      `Incoming lines: ${this.countLines(conflict.incomingCode)}`
    ].join("\n");

    this.logger.info(`Explained conflict ${conflict.id}.`);
    await vscode.window.showInformationMessage(explanation, { modal: true });
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

  private countLines(value: string): number {
    if (value.length === 0) {
      return 0;
    }

    return value.split(/\r?\n/).length;
  }
}
