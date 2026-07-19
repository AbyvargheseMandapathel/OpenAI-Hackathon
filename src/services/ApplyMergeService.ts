import * as vscode from "vscode";

import type { Conflict } from "../models/Conflict";
import type { Logger } from "./Logger";

export interface ApplyMergeOptions {
  documentUri: vscode.Uri;
  conflict: Conflict;
  mergedCode: string;
}

export class ApplyMergeService {
  public constructor(private readonly logger: Logger) {}

  public async apply(options: ApplyMergeOptions): Promise<void> {
    this.validateMergedCode(options.mergedCode);

    const document = await vscode.workspace.openTextDocument(options.documentUri);
    const start = new vscode.Position(options.conflict.startLine, 0);
    const endLine = document.lineAt(options.conflict.endLine);
    const end = new vscode.Position(options.conflict.endLine, endLine.text.length);
    const range = new vscode.Range(start, end);
    const edit = new vscode.WorkspaceEdit();

    edit.replace(options.documentUri, range, options.mergedCode);

    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      throw new Error("VS Code rejected the merge edit.");
    }

    const editedDocument = await vscode.workspace.openTextDocument(options.documentUri);
    await editedDocument.save();
    await vscode.commands.executeCommand("git.refresh");

    this.logger.info(`Applied AI merge proposal to ${options.documentUri.fsPath}:${options.conflict.id}.`);
  }

  private validateMergedCode(mergedCode: string): void {
    if (this.containsConflictMarker(mergedCode)) {
      throw new Error("Refusing to apply merged code because it still contains conflict markers.");
    }
  }

  private containsConflictMarker(value: string): boolean {
    return /^(<<<<<<<|=======|>>>>>>>)\s?/m.test(value);
  }
}
