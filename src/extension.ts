import * as vscode from "vscode";

import { AnalyzeCurrentFileCommand } from "./commands/AnalyzeCurrentFileCommand";
import { ExplainConflictCommand } from "./commands/ExplainConflictCommand";
import { GitHubSignInCommand } from "./commands/GitHubSignInCommand";
import { GitHubSignOutCommand } from "./commands/GitHubSignOutCommand";
import { ResolveConflictCommand } from "./commands/ResolveConflictCommand";
import { AIService } from "./ai/AIService";
import { PromptBuilder } from "./ai/PromptBuilder";
import { RadarChatService } from "./ai/RadarChatService";
import { GitContextService } from "./git/GitContextService";
import { GitHubAuthService } from "./git/GitHubAuthService";
import { GitHubContextService } from "./git/GitHubContextService";
import { ConflictCodeLensProvider } from "./ui/ConflictCodeLensProvider";
import { DiffWebviewService } from "./ui/DiffWebviewService";
import { ConflictDetector } from "./parser/ConflictDetector";
import { GitRepositoryService } from "./git/GitRepositoryService";
import { Logger } from "./services/Logger";
import { ApplyMergeService } from "./services/ApplyMergeService";
import { RepositoryContextService } from "./services/RepositoryContextService";
import { EngineeringRadarService } from "./radar/EngineeringRadarService";
import { RadarAlertService } from "./radar/RadarAlertService";
import { RadarWebviewService } from "./ui/RadarWebviewService";
import { StatusBarService } from "./ui/StatusBarService";
import { WorkspaceService } from "./services/WorkspaceService";

let logger: Logger | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger = new Logger(vscode.window.createOutputChannel("AI Engineering Radar"));
  context.subscriptions.push(logger);

  logger.info("Activating AI Engineering Radar.");

  const workspaceService = new WorkspaceService(logger);
  const gitRepositoryService = new GitRepositoryService(logger);
  const gitHubAuthService = new GitHubAuthService(context, logger);
  const gitHubContextService = new GitHubContextService(logger, gitHubAuthService);
  const gitContextService = new GitContextService(logger, gitRepositoryService, gitHubContextService);
  const repositoryContextService = new RepositoryContextService(logger);
  const engineeringRadarService = new EngineeringRadarService(
    logger,
    gitRepositoryService,
    repositoryContextService,
    gitHubContextService
  );
  const radarChatService = new RadarChatService(logger);
  const radarWebviewService = new RadarWebviewService(logger, radarChatService, gitHubAuthService);
  const radarAlertService = new RadarAlertService(
    logger,
    workspaceService,
    engineeringRadarService,
    radarWebviewService
  );
  const promptBuilder = new PromptBuilder();
  const aiService = new AIService(logger);
  const applyMergeService = new ApplyMergeService(logger);
  const diffWebviewService = new DiffWebviewService(logger, applyMergeService);
  const conflictDetector = new ConflictDetector(logger);
  const statusBarService = new StatusBarService();
  context.subscriptions.push(statusBarService, radarAlertService);

  const resolveConflictCommand = new ResolveConflictCommand(
    logger,
    workspaceService,
    gitRepositoryService,
    conflictDetector,
    gitContextService,
    repositoryContextService,
    promptBuilder,
    aiService,
    diffWebviewService
  );
  const explainConflictCommand = new ExplainConflictCommand(logger, conflictDetector);
  const analyzeCurrentFileCommand = new AnalyzeCurrentFileCommand(
    logger,
    workspaceService,
    engineeringRadarService,
    radarWebviewService
  );
  const gitHubSignInCommand = new GitHubSignInCommand(logger, gitHubAuthService);
  const gitHubSignOutCommand = new GitHubSignOutCommand(logger, gitHubAuthService);
  const conflictCodeLensProvider = new ConflictCodeLensProvider(conflictDetector);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      AnalyzeCurrentFileCommand.commandId,
      async () => analyzeCurrentFileCommand.execute()
    ),
    vscode.commands.registerCommand(
      ResolveConflictCommand.commandId,
      async (args?: unknown) => resolveConflictCommand.execute(args)
    ),
    vscode.commands.registerCommand(
      ExplainConflictCommand.commandId,
      async (args?: unknown) => explainConflictCommand.execute(args)
    ),
    vscode.commands.registerCommand(
      GitHubSignInCommand.commandId,
      async () => gitHubSignInCommand.execute()
    ),
    vscode.commands.registerCommand(
      "aiRadar.githubSignIn",
      async () => gitHubSignInCommand.execute()
    ),
    vscode.commands.registerCommand(
      GitHubSignOutCommand.commandId,
      async () => gitHubSignOutCommand.execute()
    ),
    vscode.languages.registerCodeLensProvider(
      { scheme: "file" },
      conflictCodeLensProvider
    )
  );

  statusBarService.show();
  radarAlertService.start();

  await logWorkspaceState(workspaceService, gitRepositoryService);

  logger.info("AI Engineering Radar initialized.");
}

export function deactivate(): void {
  logger?.info("AI Engineering Radar deactivated.");
}

async function logWorkspaceState(
  workspaceService: WorkspaceService,
  gitRepositoryService: GitRepositoryService
): Promise<void> {
  const workspaceFolder = workspaceService.getPrimaryWorkspaceFolder();

  if (!workspaceFolder) {
    logger?.warn("No workspace folder is open.");
    return;
  }

  logger?.info(`Workspace detected: ${workspaceFolder.uri.fsPath}`);

  const repository = await gitRepositoryService.detectRepository(workspaceFolder.uri.fsPath);
  if (repository.ok) {
    logger?.info(`Git repository detected: ${repository.rootPath}`);
    return;
  }

  logger?.warn(`Git repository not detected: ${repository.error}`);
}
