import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

export class GitCommandRunner {
  public async run(cwd: string, args: string[]): Promise<GitCommandResult> {
    try {
      const { stdout, stderr } = await execFileAsync("git", args, {
        cwd,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      });

      return {
        ok: true,
        stdout,
        stderr
      };
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
      };

      return {
        ok: false,
        stdout: nodeError.stdout ?? "",
        stderr: nodeError.stderr ?? "",
        error: nodeError.message
      };
    }
  }
}
