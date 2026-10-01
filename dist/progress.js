/** 加权完成率的展示口径：stats.progress 优先（含 0–100 钳制，手改数据可能越界），
 *  旧数据（无 progress 字段）回退节点完成比，无节点为 0。status/hub 共用，勿引入任何依赖。 */
export function statsProgress(stats) {
    if (typeof stats.progress === "number") {
        return Math.max(0, Math.min(100, stats.progress));
    }
    return stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
}
