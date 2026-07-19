import * as vscode from "vscode";

import type { GitHubAuthService } from "../git/GitHubAuthService";
import type { Logger } from "../services/Logger";

export class GitHubSignInCommand {
  public static readonly commandId = "aiMerge.githubSignIn";

  public constructor(
    private readonly logger: Logger,
    private readonly authService: GitHubAuthService
  ) {}

  public async execute(): Promise<void> {
    try {
      await this.authService.signIn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("GitHub sign-in failed.", error);
      await vscode.window.showErrorMessage(`GitHub sign-in failed: ${message}`);
    }
  }
}
