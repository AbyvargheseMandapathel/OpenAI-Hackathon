const assert = require("node:assert/strict");
const { test } = require("node:test");

const { PromptBuilder } = require("../dist/ai/PromptBuilder.js");

test("builds a deterministic prompt payload with required sections", () => {
  const builder = new PromptBuilder();
  const payload = builder.build({
    repositoryContext: {
      repositoryRoot: "C:/repo",
      files: [{ path: "package.json", content: "{\"devDependencies\":{\"typescript\":\"^5\"}}" }],
      languages: ["TypeScript"],
      frameworks: ["VS Code Extension"],
      formatters: [],
      linters: ["ESLint"],
      testFrameworks: ["node:test"],
      diagnostics: []
    },
    gitContext: {
      repositoryRoot: "C:/repo",
      currentBranch: "main",
      mergeTarget: "feature/test",
      recentLog: ["abc123 test"],
      diff: "diff --git a/file.ts b/file.ts",
      blame: "abc123 file.ts",
      changedFiles: ["UU file.ts"],
      github: {
        enabled: true,
        repository: {
          id: 1,
          fullName: "owner/repo",
          htmlUrl: "https://github.com/owner/repo",
          defaultBranch: "main"
        },
        pullRequest: {
          number: 7,
          title: "Test PR",
          state: "open",
          headRef: "feature/test",
          baseRef: "main",
          htmlUrl: "https://github.com/owner/repo/pull/7"
        },
        openPullRequests: [],
        diagnostics: []
      },
      diagnostics: []
    },
    documentPath: "C:/repo/file.ts",
    documentText: [
      "function chooseValue() {",
      "<<<<<<< HEAD",
      "return 1;",
      "=======",
      "return 2;",
      ">>>>>>> feature/test",
      "}"
    ].join("\n"),
    conflict: {
      id: "conflict-1",
      startLine: 1,
      endLine: 5,
      currentCode: "return 1;",
      incomingCode: "return 2;",
      branch: "feature/test",
      currentLabel: "HEAD"
    }
  });

  assert.match(payload.prompt, /# Repository Summary/);
  assert.match(payload.prompt, /# Output Schema/);
  assert.equal(payload.sections.conflict.id, "conflict-1");
  assert.equal(payload.sections.userPreferences.length, 0);
});
