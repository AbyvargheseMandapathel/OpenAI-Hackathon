const assert = require("node:assert/strict");
const { test } = require("node:test");

const { ConflictParser } = require("../dist/parser/ConflictParser.js");

test("parses a single Git conflict block", () => {
  const parser = new ConflictParser();
  const conflicts = parser.parse([
    "const value = 1;",
    "<<<<<<< HEAD",
    "return current;",
    "=======",
    "return incoming;",
    ">>>>>>> feature/example",
    "export default value;"
  ].join("\n"));

  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0], {
    id: "conflict-1",
    startLine: 1,
    endLine: 5,
    currentCode: "return current;",
    incomingCode: "return incoming;",
    branch: "feature/example",
    currentLabel: "HEAD"
  });
});

test("ignores incomplete conflict blocks", () => {
  const parser = new ConflictParser();
  const conflicts = parser.parse([
    "<<<<<<< HEAD",
    "return current;",
    "=======",
    "return incoming;"
  ].join("\n"));

  assert.equal(conflicts.length, 0);
});
