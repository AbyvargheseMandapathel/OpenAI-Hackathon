import type * as vscode from "vscode";

export class Logger implements vscode.Disposable {
  public constructor(private readonly outputChannel: vscode.OutputChannel) {}

  public info(message: string): void {
    this.write("INFO", message);
  }

  public warn(message: string): void {
    this.write("WARN", message);
  }

  public error(message: string, error?: unknown): void {
    const details = error ? ` ${this.formatError(error)}` : "";
    this.write("ERROR", `${message}${details}`);
  }

  public show(): void {
    this.outputChannel.show(true);
  }

  public dispose(): void {
    this.outputChannel.dispose();
  }

  private write(level: "INFO" | "WARN" | "ERROR", message: string): void {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] [${level}] ${message}`);
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }

    return String(error);
  }
}
