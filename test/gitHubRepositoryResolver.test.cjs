const assert = require("node:assert/strict");
const { test } = require("node:test");

const { GitHubRepositoryResolver } = require("../dist/git/GitHubRepositoryResolver.js");

test("infers GitHub repository from HTTPS remote", () => {
  const resolver = new GitHubRepositoryResolver();

  assert.equal(
    resolver.inferRepository("https://github.com/openai/codex.git", "https://github.com"),
    "openai/codex"
  );
});

test("infers GitHub repository from SSH remote", () => {
  const resolver = new GitHubRepositoryResolver();

  assert.equal(
    resolver.inferRepository("git@github.com:openai/codex.git", "https://github.com"),
    "openai/codex"
  );
});

test("ignores remotes from a different web host", () => {
  const resolver = new GitHubRepositoryResolver();

  assert.equal(
    resolver.inferRepository("https://example.com/openai/codex.git", "https://github.com"),
    undefined
  );
});
