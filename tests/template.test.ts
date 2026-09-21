import { describe, it, expect } from "vitest";
import { renderHtml, ROOT_DIV_RE } from "../src/render/template.js";

const STUB = '<html><head></head><body><div id="root"></div><script src="x.js"></script></body></html>';

describe("renderHtml", () => {
  it("injects data right after the root div and escapes <", () => {
    const html = renderHtml({ a: "<script>" }, STUB);
    expect(html).toContain('<div id="root"></div><script>window.__WAYMARK_DATA__={"a":"\\u003cscript\\u003e"};</script>');
    expect(html).not.toContain('{"a":"<script>"}');
  });
  it("throws when root div missing", () => {
    expect(() => renderHtml({}, "<html><body></body></html>")).toThrow(/root/);
  });
  it("ROOT_DIV_RE matches minified shape", () => {
    expect(ROOT_DIV_RE.test('<div id="root"></div>')).toBe(true);
  });
});
