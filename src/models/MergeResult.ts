export interface MergeResult {
  mergedCode: string;
  explanation: string;
  confidence: number;
  warnings: string[];
}
