import * as vscode from "vscode";

import { ExplainConflictCommand } from "../commands/ExplainConflictCommand";
import { ResolveConflictCommand } from "../commands/ResolveConflictCommand";
import type { ConflictCommandArgs } from "../models/ConflictCommandArgs";
import type { ConflictDetector } from "../parser/ConflictDetector";

export class ConflictCodeLensProvider implements vscode.CodeLensProvider {
  public constructor(private readonly conflictDetector: ConflictDetector) {}

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const conflicts = this.conflictDetector.detect(document);

    return conflicts.flatMap((conflict) => {
      const range = new vscode.Range(conflict.startLine, 0, conflict.startLine, 0);
      const args: ConflictCommandArgs = {
        documentUri: document.uri.toString(),
        conflictId: conflict.id
      };

      return [
        new vscode.CodeLens(range, {
          title: "Resolve with AI Merge",
          command: ResolveConflictCommand.commandId,
          arguments: [args]
        }),
        new vscode.CodeLens(range, {
          title: "Explain Conflict",
          command: ExplainConflictCommand.commandId,
          arguments: [args]
        })
      ];
    });
  }
}
