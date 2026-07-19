import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Logger } from "../services/Logger";

const execFileAsync = promisify(execFile);

export type GitRepositoryDetection =
  | {
      ok: true;
      rootPath: string;
    }
  | {
      ok: false;
      error: string;
    };

export class GitRepositoryService {
  public constructor(private readonly logger: Logger) {}

  public async detectRepository(cwd: string): Promise<GitRepositoryDetection> {
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        windowsHide: true
      });

      const rootPath = stdout.trim();
      if (!rootPath) {
        return { ok: false, error: "Git returned an empty repository root." };
      }

      return { ok: true, rootPath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Git repository detection failed: ${message}`);
      return { ok: false, error: message };
    }
  }
}
