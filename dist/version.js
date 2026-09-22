import fs from "node:fs";
import { fileURLToPath } from "node:url";
/** 从包根 package.json 读取版本号（编译后位于 dist/，与 src/ 同为包根下一级，相对路径一致）。
 *  读取失败（如打包环境未包含 package.json）时回退占位版本，保证 CLI/MCP 可启动。 */
export function getVersion() {
    try {
        const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (typeof pkg.version === "string" && pkg.version)
            return pkg.version;
    }
    catch {
        // 无 package.json 可读的极端环境
    }
    return "0.0.0-dev";
}
