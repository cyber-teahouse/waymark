export function buildGraph(docs) {
    const ids = docs.map((d) => d.fm.id);
    const idSet = new Set(ids);
    const depsOf = new Map(docs.map((d) => [d.fm.id, d.fm.deps.filter((dep) => idSet.has(dep))]));
    const edges = [];
    for (const d of docs) {
        for (const dep of depsOf.get(d.fm.id))
            edges.push({ from: dep, to: d.fm.id });
    }
    // Kahn 拓扑排序
    const indeg = new Map(ids.map((id) => [id, 0]));
    const dependents = new Map(ids.map((id) => [id, []]));
    for (const e of edges) {
        indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
        dependents.get(e.from).push(e.to);
    }
    const queue = ids.filter((id) => indeg.get(id) === 0);
    const topoOrder = [];
    while (queue.length) {
        const id = queue.shift();
        topoOrder.push(id);
        for (const next of dependents.get(id)) {
            const left = (indeg.get(next) ?? 0) - 1;
            indeg.set(next, left);
            if (left === 0)
                queue.push(next);
        }
    }
    const done = new Set(topoOrder);
    const cycleNodes = ids.filter((id) => !done.has(id));
    // DFS 找第一条环路径（仅在有环时）
    let cyclePath = null;
    if (cycleNodes.length) {
        const color = new Map(ids.map((id) => [id, 0])); // 0白 1灰 2黑
        const stack = [];
        const dfs = (id) => {
            color.set(id, 1);
            stack.push(id);
            for (const dep of depsOf.get(id)) {
                const c = color.get(dep);
                if (c === 1) {
                    const at = stack.indexOf(dep);
                    cyclePath = [...stack.slice(at), dep];
                    return true;
                }
                if (c === 0 && dfs(dep))
                    return true;
            }
            stack.pop();
            color.set(id, 2);
            return false;
        };
        for (const id of cycleNodes) {
            if (color.get(id) === 0 && dfs(id))
                break;
        }
    }
    return { edges, topoOrder, cycleNodes, cyclePath };
}
