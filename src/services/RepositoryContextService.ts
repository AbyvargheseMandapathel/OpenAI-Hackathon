import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { RepositoryContext, RepositoryContextFile } from "../models/RepositoryContext";
import type { Logger } from "./Logger";

const CONTEXT_FILES = [
  "README.md",
  "package.json",
  "Cargo.toml",
  "requirements.txt",
  "composer.json",
  "go.mod",
  "pom.xml"
] as const;

const MAX_CONTEXT_FILE_BYTES = 64 * 1024;

export class RepositoryContextService {
  public constructor(private readonly logger: Logger) {}

  public async collectContext(repositoryRoot: string): Promise<RepositoryContext> {
    const diagnostics: string[] = [];
    const files = await this.readContextFiles(repositoryRoot, diagnostics);
    const packageJson = this.parsePackageJson(files, diagnostics);

    const context: RepositoryContext = {
      repositoryRoot,
      files,
      languages: this.detectLanguages(files, packageJson),
      frameworks: this.detectFrameworks(files, packageJson),
      formatters: this.detectFormatters(files, packageJson),
      linters: this.detectLinters(files, packageJson),
      testFrameworks: this.detectTestFrameworks(files, packageJson),
      diagnostics
    };

    this.logger.info(
      `Collected repository context: ${files.length} files, languages=${context.languages.join(", ") || "unknown"}.`
    );

    return context;
  }

  private async readContextFiles(
    repositoryRoot: string,
    diagnostics: string[]
  ): Promise<RepositoryContextFile[]> {
    const files = await Promise.all(
      CONTEXT_FILES.map(async (filePath) => this.readContextFile(repositoryRoot, filePath, diagnostics))
    );

    return files.filter((file): file is RepositoryContextFile => file !== undefined);
  }

  private async readContextFile(
    repositoryRoot: string,
    filePath: string,
    diagnostics: string[]
  ): Promise<RepositoryContextFile | undefined> {
    const absolutePath = path.join(repositoryRoot, filePath);

    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        return undefined;
      }

      if (stat.size > MAX_CONTEXT_FILE_BYTES) {
        diagnostics.push(`${filePath} skipped because it is larger than ${MAX_CONTEXT_FILE_BYTES} bytes.`);
        return undefined;
      }

      return {
        path: filePath,
        content: await fs.readFile(absolutePath, "utf8")
      };
    } catch (error) {
      if (this.isNotFound(error)) {
        return undefined;
      }

      diagnostics.push(`Unable to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private parsePackageJson(
    files: RepositoryContextFile[],
    diagnostics: string[]
  ): Record<string, unknown> | undefined {
    const packageJson = files.find((file) => file.path === "package.json");
    if (!packageJson) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(packageJson.content) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }

      diagnostics.push("package.json did not contain an object.");
      return undefined;
    } catch (error) {
      diagnostics.push(`Unable to parse package.json: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private detectLanguages(
    files: RepositoryContextFile[],
    packageJson: Record<string, unknown> | undefined
  ): string[] {
    const languages = new Set<string>();

    if (this.hasFile(files, "package.json")) {
      languages.add(this.hasPackage(packageJson, "typescript") ? "TypeScript" : "JavaScript");
    }

    if (this.hasFile(files, "Cargo.toml")) {
      languages.add("Rust");
    }

    if (this.hasFile(files, "requirements.txt")) {
      languages.add("Python");
    }

    if (this.hasFile(files, "composer.json")) {
      languages.add("PHP");
    }

    if (this.hasFile(files, "go.mod")) {
      languages.add("Go");
    }

    if (this.hasFile(files, "pom.xml")) {
      languages.add("Java");
    }

    return [...languages];
  }

  private detectFrameworks(
    files: RepositoryContextFile[],
    packageJson: Record<string, unknown> | undefined
  ): string[] {
    const frameworks = new Set<string>();

    this.addPackageMatches(packageJson, frameworks, {
      "@angular/core": "Angular",
      "@sveltejs/kit": "SvelteKit",
      "express": "Express",
      "next": "Next.js",
      "react": "React",
      "svelte": "Svelte",
      "vue": "Vue",
      "vscode": "VS Code Extension"
    });

    if (this.hasFile(files, "Cargo.toml")) {
      const cargo = files.find((file) => file.path === "Cargo.toml")?.content ?? "";
      if (cargo.includes("actix-web")) {
        frameworks.add("Actix Web");
      }
      if (cargo.includes("axum")) {
        frameworks.add("Axum");
      }
    }

    if (this.hasFile(files, "pom.xml")) {
      const pom = files.find((file) => file.path === "pom.xml")?.content ?? "";
      if (pom.includes("spring-boot")) {
        frameworks.add("Spring Boot");
      }
    }

    return [...frameworks];
  }

  private detectFormatters(
    files: RepositoryContextFile[],
    packageJson: Record<string, unknown> | undefined
  ): string[] {
    const formatters = new Set<string>();

    this.addPackageMatches(packageJson, formatters, {
      "prettier": "Prettier"
    });

    if (this.hasFile(files, "Cargo.toml")) {
      formatters.add("rustfmt");
    }

    if (this.hasFile(files, "requirements.txt")) {
      const requirements = files.find((file) => file.path === "requirements.txt")?.content ?? "";
      if (/\bblack\b/i.test(requirements)) {
        formatters.add("Black");
      }
    }

    if (this.hasFile(files, "go.mod")) {
      formatters.add("gofmt");
    }

    return [...formatters];
  }

  private detectLinters(
    files: RepositoryContextFile[],
    packageJson: Record<string, unknown> | undefined
  ): string[] {
    const linters = new Set<string>();

    this.addPackageMatches(packageJson, linters, {
      "eslint": "ESLint"
    });

    if (this.hasFile(files, "requirements.txt")) {
      const requirements = files.find((file) => file.path === "requirements.txt")?.content ?? "";
      if (/\bruff\b/i.test(requirements)) {
        linters.add("Ruff");
      }
      if (/\bpylint\b/i.test(requirements)) {
        linters.add("Pylint");
      }
    }

    if (this.hasFile(files, "Cargo.toml")) {
      linters.add("Clippy");
    }

    return [...linters];
  }

  private detectTestFrameworks(
    files: RepositoryContextFile[],
    packageJson: Record<string, unknown> | undefined
  ): string[] {
    const testFrameworks = new Set<string>();

    this.addPackageMatches(packageJson, testFrameworks, {
      "@playwright/test": "Playwright",
      "jest": "Jest",
      "mocha": "Mocha",
      "vitest": "Vitest"
    });

    if (this.hasFile(files, "requirements.txt")) {
      const requirements = files.find((file) => file.path === "requirements.txt")?.content ?? "";
      if (/\bpytest\b/i.test(requirements)) {
        testFrameworks.add("pytest");
      }
    }

    if (this.hasFile(files, "Cargo.toml")) {
      testFrameworks.add("cargo test");
    }

    if (this.hasFile(files, "go.mod")) {
      testFrameworks.add("go test");
    }

    if (this.hasFile(files, "pom.xml")) {
      testFrameworks.add("Maven test");
    }

    return [...testFrameworks];
  }

  private hasFile(files: RepositoryContextFile[], filePath: string): boolean {
    return files.some((file) => file.path === filePath);
  }

  private addPackageMatches(
    packageJson: Record<string, unknown> | undefined,
    target: Set<string>,
    matches: Record<string, string>
  ): void {
    for (const [packageName, displayName] of Object.entries(matches)) {
      if (this.hasPackage(packageJson, packageName)) {
        target.add(displayName);
      }
    }
  }

  private hasPackage(packageJson: Record<string, unknown> | undefined, packageName: string): boolean {
    if (!packageJson) {
      return false;
    }

    return ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].some((key) => {
      const dependencies = packageJson[key];
      return (
        dependencies !== undefined &&
        dependencies !== null &&
        typeof dependencies === "object" &&
        !Array.isArray(dependencies) &&
        packageName in dependencies
      );
    });
  }

  private isNotFound(error: unknown): boolean {
    return (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    );
  }
}
