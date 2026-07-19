import * as vscode from "vscode";

import type { GitHubAuthService } from "../git/GitHubAuthService";
import type { Logger } from "../services/Logger";

export class GitHubSignOutCommand {
  public static readonly commandId = "aiMerge.githubSignOut";

  public constructor(
    private readonly logger: Logger,
    private readonly authService: GitHubAuthService
  ) {}

  public async execute(): Promise<void> {
    await this.authService.signOut();
    this.logger.info("GitHub sign-out completed.");
    await vscode.window.showInformationMessage("GitHub signed out.");
  }
}
