import { spawn } from "node:child_process";

import * as vscode from "vscode";

import type { EngineeringRadar } from "../models/EngineeringRadar";
import type { Logger } from "../services/Logger";

export class RadarChatService {
  private static readonly maxQuestionLength = 4_000;
  private static readonly maxResponseLength = 20_000;

  public constructor(private readonly logger: Logger) {}

  public async ask(radar: EngineeringRadar, question: string): Promise<string> {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      throw new Error("Enter a question for Radar Agent.");
    }
    if (trimmedQuestion.length > RadarChatService.maxQuestionLength) {
      throw new Error(`Keep questions under ${RadarChatService.maxQuestionLength} characters.`);
    }

    const config = vscode.workspace.getConfiguration("aiMerge");
    const command = this.resolveCommand(config.get<string>("aiCommand", "codex"));
    const args = config.get<string[]>("aiArgs", [
      "exec",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "-"
    ]);
    const timeoutMs = config.get<number>("aiTimeoutMs", 120_000);
    const prompt = this.buildPrompt(radar, trimmedQuestion);

    this.logger.info(`Starting Radar Agent command: ${command} ${args.join(" ")}`);
    const response = await this.runCommand(command, args, prompt, radar.repositoryRoot, timeoutMs);
    const normalizedResponse = response.trim();
    return normalizedResponse.length > RadarChatService.maxResponseLength
      ? `${normalizedResponse.slice(0, RadarChatService.maxResponseLength)}\n\n[Response truncated]`
      : normalizedResponse || "No suggestion was returned.";
  }

  private buildPrompt(radar: EngineeringRadar, question: string): string {
    return [
      "You are AI Engineering Radar, a senior engineering advisor inside VS Code.",
      "Help the developer decide how to proceed before editing code.",
      "Use the provided radar context. Be specific, practical, and concise.",
      "Do not invent PRs, files, owners, or tests. Clearly say when evidence is missing.",
      "Return markdown with short bullets and concrete next steps.",
      "",
      "# Developer Question",
      question,
      "",
      "# Radar Context",
      JSON.stringify({
        filePath: radar.filePath,
        currentBranch: radar.currentBranch,
        riskLevel: radar.riskLevel,
        recentChanges: radar.recentChanges,
        fileChangeHistory: radar.fileChangeHistory,
        openPullRequests: radar.openPullRequests,
        activeContributors: radar.activeContributors,
        affectedAreas: radar.affectedAreas,
        recommendedTests: radar.recommendedTests,
        riskSignals: radar.riskSignals,
        recommendedActions: radar.recommendedActions,
        diagnostics: radar.diagnostics
      }, null, 2)
    ].join("\n");
  }

  private runCommand(
    command: string,
    args: string[],
    input: string,
    cwd: string,
    timeoutMs: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        shell: process.platform === "win32"
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        child.kill();
        reject(new Error(`Radar Agent timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });

      child.on("error", (error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        reject(this.enhanceSpawnError(error, command));
      });

      child.on("close", (code) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);

        if (code !== 0) {
          reject(new Error(`Radar Agent exited with code ${code ?? "unknown"}: ${stderr.trim()}`));
          return;
        }

        resolve(stdout);
      });

      child.stdin.end(input);
    });
  }

  private resolveCommand(command: string): string {
    if (process.platform === "win32" && command === "codex") {
      return "codex.cmd";
    }

    return command;
  }

  private enhanceSpawnError(error: Error, command: string): Error {
    if ("code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return new Error(`Unable to find Radar Agent command "${command}". Check aiMerge.aiCommand.`);
    }

    return error;
  }
}
