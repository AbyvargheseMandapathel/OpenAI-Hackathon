import * as vscode from "vscode";

import type { Logger } from "./Logger";

export class WorkspaceService {
  public constructor(private readonly logger: Logger) {}

  public getPrimaryWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }

    if (workspaceFolders.length > 1) {
      this.logger.info(
        `Multiple workspace folders detected. Using ${workspaceFolders[0]?.uri.fsPath ?? "the first folder"}.`
      );
    }

    return workspaceFolders[0];
  }
}
