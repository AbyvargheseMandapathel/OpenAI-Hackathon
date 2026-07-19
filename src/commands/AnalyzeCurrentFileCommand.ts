import * as vscode from "vscode";

import type { EngineeringRadarService } from "../radar/EngineeringRadarService";
import type { Logger } from "../services/Logger";
import type { RadarWebviewService } from "../ui/RadarWebviewService";
import type { WorkspaceService } from "../services/WorkspaceService";

export class AnalyzeCurrentFileCommand {
  public static readonly commandId = "aiRadar.analyzeCurrentFile";

  public constructor(
    private readonly logger: Logger,
    private readonly workspaceService: WorkspaceService,
    private readonly engineeringRadarService: EngineeringRadarService,
    private readonly radarWebviewService: RadarWebviewService
  ) {}

  public async execute(): Promise<void> {
    const workspaceFolder = this.workspaceService.getPrimaryWorkspaceFolder();
    if (!workspaceFolder) {
      const message = "Open a workspace folder before running AI Engineering Radar.";
      this.logger.warn(message);
      await vscode.window.showWarningMessage(message);
      return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || activeEditor.document.uri.scheme !== "file") {
      const message = "Open a repository file before running AI Engineering Radar.";
      this.logger.warn(message);
      await vscode.window.showWarningMessage(message);
      return;
    }

    try {
      const analyze = async () => this.engineeringRadarService.analyze({
        workspacePath: workspaceFolder.uri.fsPath,
        filePath: activeEditor.document.uri.fsPath
      });
      await this.radarWebviewService.show(await analyze(), analyze);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      this.logger.error("AI Engineering Radar failed.", error);
      await vscode.window.showErrorMessage(`AI Engineering Radar failed: ${details}`);
    }
  }
}
