import type { Conflict } from "../models/Conflict";

interface ConflictDraft {
  startLine: number;
  currentLabel: string;
  currentLines: string[];
  incomingLines: string[];
  separatorLine?: number;
}

type ParserState = "outside" | "current" | "incoming";

export class ConflictParser {
  public parse(text: string): Conflict[] {
    const lines = text.split(/\r?\n/);
    const conflicts: Conflict[] = [];
    let state: ParserState = "outside";
    let draft: ConflictDraft | undefined;

    lines.forEach((line, lineIndex) => {
      if (line.startsWith("<<<<<<<")) {
        state = "current";
        draft = {
          startLine: lineIndex,
          currentLabel: this.readMarkerLabel(line, "<<<<<<<") || "current",
          currentLines: [],
          incomingLines: []
        };
        return;
      }

      if (state === "current" && line.startsWith("=======")) {
        state = "incoming";
        if (draft) {
          draft.separatorLine = lineIndex;
        }
        return;
      }

      if (state === "incoming" && line.startsWith(">>>>>>>")) {
        if (draft?.separatorLine !== undefined) {
          const branch = this.readMarkerLabel(line, ">>>>>>>") || "incoming";
          conflicts.push({
            id: `conflict-${conflicts.length + 1}`,
            startLine: draft.startLine,
            endLine: lineIndex,
            currentCode: draft.currentLines.join("\n"),
            incomingCode: draft.incomingLines.join("\n"),
            branch,
            currentLabel: draft.currentLabel
          });
        }

        state = "outside";
        draft = undefined;
        return;
      }

      if (state === "current") {
        draft?.currentLines.push(line);
        return;
      }

      if (state === "incoming") {
        draft?.incomingLines.push(line);
      }
    });

    return conflicts;
  }

  private readMarkerLabel(line: string, marker: "<<<<<<<" | ">>>>>>>"): string {
    return line.slice(marker.length).trim();
  }
}
