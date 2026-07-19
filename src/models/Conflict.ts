export interface Conflict {
  id: string;
  startLine: number;
  endLine: number;
  currentCode: string;
  incomingCode: string;
  branch: string;
  currentLabel: string;
}
