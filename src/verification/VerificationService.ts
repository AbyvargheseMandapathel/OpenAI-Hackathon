import { spawn } from "node:child_process";

import type { RepositoryContext } from "../models/RepositoryContext";
import type { VerificationResult, VerificationStepResult } from "../models/VerificationResult";
import type { Logger } from "../services/Logger";

type VerificationStepName = VerificationStepResult["name"];

interface VerificationCommand {
  name: VerificationStepName;
  command: string;
  args: string[];
}

const DEFAULT_TIMEOUT_MS = 120_000;

export class VerificationService {
  public constructor(private readonly logger: Logger) {}

  public async verify(repositoryContext: RepositoryContext): Promise<VerificationResult> {
    const startedAt = Date.now();
    const errors: string[] = [];
    const commands = this.planCommands(repositoryContext);

    const formatting = await this.runStep(repositoryContext.repositoryRoot, "formatting", commands.formatting, errors);
    const lint = await this.runStep(repositoryContext.repositoryRoot, "lint", commands.lint, errors);
    const build = await this.runStep(repositoryContext.repositoryRoot, "build", commands.build, errors);
    const tests = await this.runStep(repositoryContext.repositoryRoot, "tests", commands.tests, errors);

    return {
      formatting,
      lint,
      build,
      tests,
      errors,
      durationMs: Date.now() - startedAt
    };
  }

  public planCommands(repositoryContext: RepositoryContext): Partial<Record<VerificationStepName, VerificationCommand>> {
    const packageJson = this.readPackageJson(repositoryContext);
    const scripts = this.readPackageScripts(packageJson);

    if (packageJson) {
      return {
        formatting: this.npmScriptCommand("format:check", scripts) ?? this.npmScriptCommand("format", scripts),
        lint: this.npmScriptCommand("lint", scripts),
        build: this.npmScriptCommand("compile", scripts) ?? this.npmScriptCommand("build", scripts),
        tests: this.npmScriptCommand("test", scripts)
      };
    }

    if (repositoryContext.languages.includes("Rust")) {
      return {
        formatting: { name: "formatting", command: "cargo", args: ["fmt", "--check"] },
        lint: { name: "lint", command: "cargo", args: ["clippy", "--", "-D", "warnings"] },
        build: { name: "build", command: "cargo", args: ["build"] },
        tests: { name: "tests", command: "cargo", args: ["test"] }
      };
    }

    if (repositoryContext.languages.includes("Go")) {
      return {
        formatting: { name: "formatting", command: "gofmt", args: ["-w", "."] },
        build: { name: "build", command: "go", args: ["test", "./...", "-run", "^$"] },
        tests: { name: "tests", command: "go", args: ["test", "./..."] }
      };
    }

    if (repositoryContext.languages.includes("Python")) {
      return {
        formatting: { name: "formatting", command: "python", args: ["-m", "black", "--check", "."] },
        lint: { name: "lint", command: "python", args: ["-m", "ruff", "check", "."] },
        tests: { name: "tests", command: "python", args: ["-m", "pytest"] }
      };
    }

    if (repositoryContext.languages.includes("Java")) {
      return {
        build: { name: "build", command: "mvn", args: ["compile"] },
        tests: { name: "tests", command: "mvn", args: ["test"] }
      };
    }

    return {};
  }

  private async runStep(
    cwd: string,
    name: VerificationStepName,
    command: VerificationCommand | undefined,
    errors: string[]
  ): Promise<VerificationStepResult> {
    if (!command) {
      return {
        name,
        status: "skipped",
        output: "No verification command detected.",
        durationMs: 0
      };
    }

    const startedAt = Date.now();
    this.logger.info(`Running verification step ${name}: ${command.command} ${command.args.join(" ")}`);

    try {
      const output = await this.runCommand(cwd, command.command, command.args);
      return {
        name,
        status: "passed",
        command: this.renderCommand(command),
        output,
        durationMs: Date.now() - startedAt
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${name}: ${message}`);

      return {
        name,
        status: "failed",
        command: this.renderCommand(command),
        output: message,
        durationMs: Date.now() - startedAt
      };
    }
  }

  private runCommand(cwd: string, command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false
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
        reject(new Error(`Timed out after ${DEFAULT_TIMEOUT_MS}ms.`));
      }, DEFAULT_TIMEOUT_MS);

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
        reject(error);
      });

      child.on("close", (code) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);

        const output = [stdout.trim(), stderr.trim()].filter((value) => value.length > 0).join("\n");
        if (code !== 0) {
          reject(new Error(output || `Command exited with code ${code ?? "unknown"}.`));
          return;
        }

        resolve(output);
      });
    });
  }

  private npmScriptCommand(scriptName: string, scripts: Record<string, unknown>): VerificationCommand | undefined {
    if (!(scriptName in scripts)) {
      return undefined;
    }

    const name = this.mapScriptToStep(scriptName);
    return {
      name,
      command: process.platform === "win32" ? "npm.cmd" : "npm",
      args: ["run", scriptName]
    };
  }

  private mapScriptToStep(scriptName: string): VerificationStepName {
    if (scriptName.startsWith("format")) {
      return "formatting";
    }

    if (scriptName === "lint") {
      return "lint";
    }

    if (scriptName === "test") {
      return "tests";
    }

    return "build";
  }

  private readPackageScripts(packageJson: Record<string, unknown> | undefined): Record<string, unknown> {
    const scripts = packageJson?.scripts;
    if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
      return {};
    }

    return scripts as Record<string, unknown>;
  }

  private readPackageJson(repositoryContext: RepositoryContext): Record<string, unknown> | undefined {
    const packageFile = repositoryContext.files.find((file) => file.path === "package.json");
    if (!packageFile) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(packageFile.content) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : undefined;
    } catch {
      return undefined;
    }
  }

  private renderCommand(command: VerificationCommand): string {
    return [command.command, ...command.args].join(" ");
  }
}
