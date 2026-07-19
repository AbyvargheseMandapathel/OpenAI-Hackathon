import * as vscode from "vscode";

import type { EngineeringRadar, RiskLevel } from "../models/EngineeringRadar";
import type { Logger } from "../services/Logger";
import type { WorkspaceService } from "../services/WorkspaceService";
import type { RadarWebviewService } from "../ui/RadarWebviewService";
import type { EngineeringRadarService } from "./EngineeringRadarService";

const RISK_ORDER: Record<RiskLevel, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3
};

export class RadarAlertService implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly alertedKeys = new Set<string>();
  private pendingTimer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly logger: Logger,
    private readonly workspaceService: WorkspaceService,
    private readonly engineeringRadarService: EngineeringRadarService,
    private readonly radarWebviewService: RadarWebviewService
  ) {}

  public start(): void {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.schedule(editor, "open");
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document.uri.toString() === event.document.uri.toString()) {
          this.schedule(editor, "edit");
        }
      })
    );

    this.schedule(vscode.window.activeTextEditor, "open");
  }

  public dispose(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
    }

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private schedule(editor: vscode.TextEditor | undefined, reason: "open" | "edit"): void {
    if (!this.isEnabled() || !editor || editor.document.uri.scheme !== "file") {
      return;
    }

    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
    }

    const delayMs = reason === "edit"
      ? this.getDebounceMs()
      : Math.min(this.getDebounceMs(), 750);
    this.pendingTimer = setTimeout(() => {
      void this.analyzeAndAlert(editor, reason);
    }, delayMs);
  }

  private async analyzeAndAlert(editor: vscode.TextEditor, reason: "open" | "edit"): Promise<void> {
    const workspaceFolder = this.workspaceService.getPrimaryWorkspaceFolder();
    if (!workspaceFolder) {
      return;
    }

    try {
      const radar = await this.engineeringRadarService.analyze({
        workspacePath: workspaceFolder.uri.fsPath,
        filePath: editor.document.uri.fsPath
      });

      if (!this.shouldAlert(radar)) {
        return;
      }

      const alertKey = `${editor.document.uri.toString()}:${radar.riskLevel}:${radar.riskSignals.join("|")}`;
      if (this.alertedKeys.has(alertKey)) {
        return;
      }
      this.alertedKeys.add(alertKey);

      const action = await vscode.window.showWarningMessage(
        this.buildAlertMessage(radar, reason),
        "Open Radar",
        "Dismiss"
      );

      if (action === "Open Radar") {
        await this.radarWebviewService.show(radar);
      }
    } catch (error) {
      this.logger.warn(`Radar alert analysis skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private shouldAlert(radar: EngineeringRadar): boolean {
    const threshold = this.getRiskThreshold();
    return RISK_ORDER[radar.riskLevel] >= RISK_ORDER[threshold] && radar.riskSignals.length > 0;
  }

  private buildAlertMessage(radar: EngineeringRadar, reason: "open" | "edit"): string {
    const trigger = reason === "edit" ? "You are editing" : "You opened";
    const signal = radar.riskSignals[0] ?? "engineering risk detected";
    return `${trigger} ${radar.filePath}. Radar risk is ${radar.riskLevel}: ${signal}`;
  }

  private isEnabled(): boolean {
    return vscode.workspace.getConfiguration("aiRadar").get<boolean>("alerts.enabled", true);
  }

  private getDebounceMs(): number {
    return vscode.workspace.getConfiguration("aiRadar").get<number>("alerts.debounceMs", 3000);
  }

  private getRiskThreshold(): RiskLevel {
    const configured = vscode.workspace.getConfiguration("aiRadar").get<string>("alerts.riskThreshold", "MEDIUM");
    return configured === "LOW" || configured === "MEDIUM" || configured === "HIGH"
      ? configured
      : "MEDIUM";
  }
}
