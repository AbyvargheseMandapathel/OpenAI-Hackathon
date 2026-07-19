const assert = require("node:assert/strict");
const { test } = require("node:test");

const { VerificationService } = require("../dist/verification/VerificationService.js");

const logger = {
  info() {},
  warn() {},
  error() {}
};

test("plans npm verification commands from package scripts", () => {
  const service = new VerificationService(logger);
  const commands = service.planCommands({
    repositoryRoot: "C:/repo",
    files: [
      {
        path: "package.json",
        content: JSON.stringify({
          scripts: {
            "format:check": "prettier --check .",
            lint: "eslint src",
            compile: "tsc -p ./",
            test: "node --test"
          }
        })
      }
    ],
    languages: ["TypeScript"],
    frameworks: [],
    formatters: ["Prettier"],
    linters: ["ESLint"],
    testFrameworks: ["node:test"],
    diagnostics: []
  });

  assert.equal(commands.formatting.command.endsWith("npm.cmd") || commands.formatting.command === "npm", true);
  assert.deepEqual(commands.lint.args, ["run", "lint"]);
  assert.deepEqual(commands.build.args, ["run", "compile"]);
  assert.deepEqual(commands.tests.args, ["run", "test"]);
});
