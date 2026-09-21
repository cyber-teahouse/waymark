/** vite 构建产物中的挂载点 div（HTML 压缩会剥注释，故不用注释当占位符）。 */
export const ROOT_DIV_RE = /<div id="root"><\/div>/;

export function renderHtml(workflow: unknown, bundleHtml: string): string {
  if (!ROOT_DIV_RE.test(bundleHtml)) {
    throw new Error('bundle 缺少挂载点 <div id="root"></div>，请用 npm run build:web 重新构建');
  }
  // `<` 防止 </script> 提前闭合标签；`>` 一并转义防止 `-->`/XML 上下文异常
  const inject = `<script>window.__WAYMARK_DATA__=${JSON.stringify(workflow).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")};</script>`;
  return bundleHtml.replace(ROOT_DIV_RE, match => `${match}${inject}`);
}
