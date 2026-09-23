import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getVersion } from "../src/version.js";

describe("getVersion", () => {
  it("reads version from package.json", () => {
    const pkg = JSON.parse(
      fs.readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    ) as { version?: string };
    expect(getVersion()).toBe(pkg.version);
    expect(getVersion()).not.toBe("0.0.0-dev");
  });
});
