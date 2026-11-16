import { existsSync } from "node:fs";
import path from "node:path";

export function compilerFor(project, root) {
  const top = path.resolve(root);
  let dir = path.resolve(top, path.dirname(project));
  for (;;) {
    const tsc = path.join(dir, "node_modules", "typescript", "bin", "tsc");
    if (existsSync(tsc)) return tsc;
    const relative = path.relative(top, dir);
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
      return path.join(top, "node_modules", "typescript", "bin", "tsc");
    }
    dir = path.dirname(dir);
  }
}
