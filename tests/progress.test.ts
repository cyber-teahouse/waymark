import { describe, expect, it } from "vitest";
import { statsProgress } from "../src/progress.js";

describe("statsProgress（加权完成率展示口径）", () => {
  it("表驱动：progress 优先 / 越界钳制 / 回退完成比 / 空数据 0", () => {
    const cases: { name: string; stats: { progress?: number; total: number; done: number }; want: number }[] =
      [
        { name: "progress 字段优先于节点完成比", stats: { progress: 42, total: 3, done: 1 }, want: 42 },
        { name: "progress 0 也是有效值（不回退）", stats: { progress: 0, total: 3, done: 3 }, want: 0 },
        { name: "progress 越界上界钳制 100", stats: { progress: 500, total: 3, done: 1 }, want: 100 },
        { name: "progress 负值钳制 0", stats: { progress: -5, total: 3, done: 1 }, want: 0 },
        { name: "无 progress 回退 done/total 四舍五入", stats: { total: 3, done: 1 }, want: 33 },
        { name: "无 progress 且无节点为 0", stats: { total: 0, done: 0 }, want: 0 },
      ];
    for (const c of cases) {
      expect(statsProgress(c.stats), c.name).toBe(c.want);
    }
  });

  it("progress 恰为边界 0/100 时原样通过", () => {
    expect(statsProgress({ progress: 100, total: 3, done: 1 })).toBe(100);
    expect(statsProgress({ progress: 0, total: 0, done: 0 })).toBe(0);
  });
});
