const assert = require("node:assert/strict");
const { test } = require("node:test");

const { EngineeringRadarService } = require("../dist/radar/EngineeringRadarService.js");

const logger = {
  info() {},
  warn() {},
  error() {}
};

const repositoryContext = {
  repositoryRoot: "C:/repo",
  files: [],
  languages: ["TypeScript"],
  frameworks: ["React"],
  formatters: [],
  linters: [],
  testFrameworks: ["Vitest"],
  diagnostics: []
};

test("detects affected areas and recommended tests for payment service files", () => {
  const service = new EngineeringRadarService(logger, {}, {}, {});

  assert.deepEqual(
    service.detectAffectedAreas("src/payment/payment.service.ts", ["M src/api/routes.ts"], repositoryContext),
    ["Payments and billing", "API and service boundaries", "React"]
  );
  assert.deepEqual(
    service.detectRecommendedTests("src/payment/payment.service.ts", repositoryContext),
    ["Vitest", "billing/payment test suite", "API integration tests"]
  );
});

test("calculates high risk from multiple risk signals", () => {
  const service = new EngineeringRadarService(logger, {}, {}, {});
  const signals = service.detectRiskSignals({
    relativeFilePath: "src/billing/payment.service.ts",
    recentChanges: Array.from({ length: 8 }, (_, index) => `commit-${index}`),
    changedFiles: Array.from({ length: 10 }, (_, index) => `M file-${index}.ts`),
    affectedAreas: ["Payments and billing", "API and service boundaries", "Dependencies"],
    activeContributors: [
      { name: "Alice", lines: 10 },
      { name: "John", lines: 8 },
      { name: "Mina", lines: 6 },
      { name: "Dev", lines: 4 }
    ],
    openPullRequestCount: 1
  });

  assert.equal(service.calculateRiskLevel(signals), "HIGH");
});

test("detects collaboration and realtime sync area", () => {
  const service = new EngineeringRadarService(logger, {}, {}, {});

  assert.deepEqual(
    service.detectAffectedAreas("excalidraw-app/collab/Collab.tsx", [], {
      ...repositoryContext,
      frameworks: []
    }),
    ["Collaboration and realtime sync"]
  );
});

test("explains an initial commit using local diff evidence", () => {
  const service = new EngineeringRadarService(logger, {}, {}, {});
  const reason = service.inferChangeReason(
    {
      sha: "abc123",
      author: "Aby",
      date: "2026-07-19",
      summary: "First commit",
      pullRequests: [],
      fileChanges: []
    },
    {
      status: "added",
      additions: 42,
      deletions: 0,
      changes: 42,
      symbols: ["EngineeringRadarService"],
      removedSymbols: [],
      commitFiles: ["src/radar/EngineeringRadarService.ts"],
      symbolReferences: []
    }
  );

  assert.match(reason, /repository baseline/i);
  assert.match(reason, /EngineeringRadarService/);
});

test("describes codebase impact from changed files and symbol references", () => {
  const service = new EngineeringRadarService(logger, {}, {}, {});
  const impact = service.inferCodebaseImpact({
    status: "added",
    additions: 42,
    deletions: 0,
    changes: 42,
    symbols: ["EngineeringRadarService"],
    removedSymbols: [],
    commitFiles: ["src/radar/EngineeringRadarService.ts", "src/extension.ts"],
    symbolReferences: [{ symbol: "EngineeringRadarService", files: ["src/extension.ts"] }]
  });

  assert.match(impact, /EngineeringRadarService is used by src\/extension\.ts/);
  assert.match(impact, /extension wiring/i);
});
