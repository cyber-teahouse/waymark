import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeSampleProject } from "./helpers.js";
import { scorePaths, scoreTests } from "../src/infer/scorePaths.js";

let root: string;
beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-paths-"));
  await makeSampleProject(root);
});

describe("scorePaths", () => {
  it("full hit on existing glob", () => {
    const c = scorePaths(root, ["src/core/**"]);
    expect(c.score).toBe(1);
    expect(c.ok).toBe(true);
    expect(c.kind).toBe("paths");
  });
  it("partial hit averages across globs", () => {
    const c = scorePaths(root, ["src/auth/**", "src/missing/**"]);
    expect(c.score).toBeCloseTo(0.5);
    expect(c.ok).toBe(false);
  });
  it("ignores node_modules even if glob matches it", () => {
    fs.mkdirSync(path.join(root, "node_modules", "x"), { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules", "x", "f.js"), "hi");
    const c = scorePaths(root, ["node_modules/**"]);
    expect(c.score).toBe(0);
  });
  it("empty file does not count as substantial", () => {
    fs.mkdirSync(path.join(root, "src", "empty"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "empty", "placeholder.ts"), "");
    const c = scorePaths(root, ["src/empty/**"]);
    expect(c.score).toBe(0);
  });
});

describe("scoreTests", () => {
  it("0.5 when tests exist", () => {
    fs.mkdirSync(path.join(root, "tests", "auth"), { recursive: true });
    fs.writeFileSync(path.join(root, "tests", "auth", "login.test.ts"), "it('x', () => {});\n");
    const c = scoreTests(root, ["tests/auth/**"]);
    expect(c.score).toBe(0.5);
  });
  it("0 when missing", () => {
    const c = scoreTests(root, ["tests/none/**"]);
    expect(c.score).toBe(0);
    expect(c.ok).toBe(false);
  });
});
