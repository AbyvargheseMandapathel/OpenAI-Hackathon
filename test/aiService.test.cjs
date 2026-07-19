const assert = require("node:assert/strict");
const { test } = require("node:test");

const { MergeResultValidator } = require("../dist/ai/MergeResultValidator.js");

test("parses and validates merge result JSON from command output", () => {
  const validator = new MergeResultValidator();
  const result = validator.parse([
    "Some command prelude",
    "```json",
    "{\"mergedCode\":\"return 1;\",\"explanation\":\"Kept value.\",\"confidence\":0.9,\"warnings\":[]}",
    "```"
  ].join("\n"));

  assert.deepEqual(result, {
    mergedCode: "return 1;",
    explanation: "Kept value.",
    confidence: 0.9,
    warnings: []
  });
});

test("rejects invalid confidence values", () => {
  const validator = new MergeResultValidator();

  assert.throws(
    () => validator.parse("{\"mergedCode\":\"x\",\"explanation\":\"x\",\"confidence\":2,\"warnings\":[]}"),
    /confidence/
  );
});
