import * as vscode from "vscode";

import { AnalyzeCurrentFileCommand } from "../commands/AnalyzeCurrentFileCommand";

export class StatusBarService implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  public constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = AnalyzeCurrentFileCommand.commandId;
    this.item.text = "$(radar) AI Radar";
    this.item.tooltip = "Analyze engineering context for the active file";
  }

  public show(): void {
    this.item.show();
  }

  public dispose(): void {
    this.item.dispose();
  }
}
