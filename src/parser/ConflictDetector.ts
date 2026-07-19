import type * as vscode from "vscode";

import type { Conflict } from "../models/Conflict";
import type { Logger } from "../services/Logger";
import { ConflictParser } from "./ConflictParser";

export class ConflictDetector {
  private readonly parser = new ConflictParser();
  private readonly conflictsByDocument = new Map<string, Conflict[]>();

  public constructor(private readonly logger: Logger) {}

  public detect(document: vscode.TextDocument): Conflict[] {
    const conflicts = this.parser.parse(document.getText());
    const documentKey = document.uri.toString();
    this.conflictsByDocument.set(documentKey, conflicts);

    if (conflicts.length > 0) {
      this.logger.info(
        `Detected ${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} in ${document.uri.fsPath}.`
      );
    }

    return conflicts;
  }

  public getConflict(documentUri: string, conflictId: string): Conflict | undefined {
    return this.conflictsByDocument
      .get(documentUri)
      ?.find((conflict) => conflict.id === conflictId);
  }
}
