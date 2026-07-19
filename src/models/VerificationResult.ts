export type VerificationStatus = "passed" | "failed" | "skipped";

export interface VerificationStepResult {
  name: "formatting" | "lint" | "build" | "tests";
  status: VerificationStatus;
  command?: string;
  output: string;
  durationMs: number;
}

export interface VerificationResult {
  formatting: VerificationStepResult;
  lint: VerificationStepResult;
  build: VerificationStepResult;
  tests: VerificationStepResult;
  errors: string[];
  durationMs: number;
}
