import * as vscode from "vscode";

import { ResolveConflictCommand } from "../commands/ResolveConflictCommand";

export class StatusBarService implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  public constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = ResolveConflictCommand.commandId;
    this.item.text = "$(git-merge) AI Merge";
    this.item.tooltip = "Resolve Git merge conflicts with AI Merge Engineer";
  }

  public show(): void {
    this.item.show();
  }

  public dispose(): void {
    this.item.dispose();
  }
}
