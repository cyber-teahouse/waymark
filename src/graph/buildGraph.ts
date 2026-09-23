import type { PlanDoc } from "../types.js";

export interface GraphEdge {
  from: string;
  to: string;
}

export interface Graph {
  edges: GraphEdge[]; // 仅包含两端都存在的依赖
  topoOrder: string[]; // Kahn 拓扑序（无环节点）
  cycleNodes: string[]; // 参与或被环波及的节点（不在拓扑序中）
  cyclePath: string[] | null; // 首个发现环的路径，如 [A,B,C,A]
}

export function buildGraph(docs: PlanDoc[]): Graph {
  const ids = docs.map((d) => d.fm.id);
  const idSet = new Set(ids);
  const depsOf = new Map<string, string[]>(
    docs.map((d) => [d.fm.id, d.fm.deps.filter((dep) => idSet.has(dep))]),
  );
  const edges: GraphEdge[] = [];
  for (const d of docs) {
    for (const dep of depsOf.get(d.fm.id)!) edges.push({ from: dep, to: d.fm.id });
  }

  // Kahn 拓扑排序
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  const dependents = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    dependents.get(e.from)!.push(e.to);
  }
  const queue = ids.filter((id) => indeg.get(id) === 0);
  const topoOrder: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    topoOrder.push(id);
    for (const next of dependents.get(id)!) {
      const left = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, left);
      if (left === 0) queue.push(next);
    }
  }
  const done = new Set(topoOrder);
  const cycleNodes = ids.filter((id) => !done.has(id));

  // DFS 找第一条环路径（仅在有环时）
  let cyclePath: string[] | null = null;
  if (cycleNodes.length) {
    const color = new Map<string, 0 | 1 | 2>(ids.map((id) => [id, 0 as const])); // 0白 1灰 2黑
    const stack: string[] = [];
    const dfs = (id: string): boolean => {
      color.set(id, 1);
      stack.push(id);
      for (const dep of depsOf.get(id)!) {
        const c = color.get(dep);
        if (c === 1) {
          const at = stack.indexOf(dep);
          cyclePath = [...stack.slice(at), dep];
          return true;
        }
        if (c === 0 && dfs(dep)) return true;
      }
      stack.pop();
      color.set(id, 2);
      return false;
    };
    for (const id of cycleNodes) {
      if (color.get(id) === 0 && dfs(id)) break;
    }
  }

  return { edges, topoOrder, cycleNodes, cyclePath };
}
