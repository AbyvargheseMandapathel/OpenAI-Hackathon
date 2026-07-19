import { spawn } from "node:child_process";

import * as vscode from "vscode";

import type { MergeResult } from "../models/MergeResult";
import type { PromptPayload } from "../models/PromptPayload";
import type { Logger } from "../services/Logger";
import { MergeResultValidator } from "./MergeResultValidator";

export class AIService {
  private readonly validator = new MergeResultValidator();

  public constructor(private readonly logger: Logger) {}

  public async generateMerge(promptPayload: PromptPayload, cwd: string): Promise<MergeResult> {
    const config = vscode.workspace.getConfiguration("aiMerge");
    const command = this.resolveCommand(config.get<string>("aiCommand", "codex"));
    const args = config.get<string[]>("aiArgs", [
      "exec",
      "--sandbox",
      "read-only",
      "--ask-for-approval",
      "never",
      "--skip-git-repo-check",
      "-"
    ]);
    const timeoutMs = config.get<number>("aiTimeoutMs", 120_000);

    this.logger.info(`Starting AI merge command: ${command} ${args.join(" ")}`);
    const stdout = await this.runCommand(command, args, promptPayload.prompt, cwd, timeoutMs);
    const result = this.validator.parse(stdout);
    this.logger.info(`AI merge result received with confidence ${result.confidence}.`);

    return result;
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
        stdio: ["pipe", "pipe", "pipe"]
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
        reject(new Error(`AI command timed out after ${timeoutMs}ms.`));
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
          reject(new Error(`AI command exited with code ${code ?? "unknown"}: ${stderr.trim()}`));
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
      return new Error(
        `Unable to find AI command "${command}". Set aiMerge.aiCommand to the full path of codex.cmd or restart VS Code after installing Codex CLI.`
      );
    }

    return error;
  }

}
