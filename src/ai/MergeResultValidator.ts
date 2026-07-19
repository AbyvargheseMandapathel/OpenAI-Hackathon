import type { MergeResult } from "../models/MergeResult";

export class MergeResultValidator {
  public parse(stdout: string): MergeResult {
    const jsonText = this.extractJson(stdout);
    const parsed = JSON.parse(jsonText) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("AI result must be a JSON object.");
    }

    const candidate = parsed as Partial<MergeResult>;
    if (typeof candidate.mergedCode !== "string") {
      throw new Error("AI result is missing string field mergedCode.");
    }

    if (typeof candidate.explanation !== "string") {
      throw new Error("AI result is missing string field explanation.");
    }

    if (typeof candidate.confidence !== "number" || candidate.confidence < 0 || candidate.confidence > 1) {
      throw new Error("AI result confidence must be a number from 0 to 1.");
    }

    if (!Array.isArray(candidate.warnings) || !candidate.warnings.every((warning) => typeof warning === "string")) {
      throw new Error("AI result warnings must be an array of strings.");
    }

    return {
      mergedCode: candidate.mergedCode,
      explanation: candidate.explanation,
      confidence: candidate.confidence,
      warnings: candidate.warnings
    };
  }

  private extractJson(stdout: string): string {
    const trimmed = stdout.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed;
    }

    const fencedMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return trimmed.slice(start, end + 1);
    }

    throw new Error("AI command did not return a JSON object.");
  }
}
