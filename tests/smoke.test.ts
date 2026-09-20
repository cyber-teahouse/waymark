import { describe, it, expect } from "vitest";
import { hello } from "../src/smoke.js";

describe("smoke", () => {
  it("works", () => {
    expect(hello()).toBe("planflow");
  });
});
