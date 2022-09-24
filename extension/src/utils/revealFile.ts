import * as path from "path";

export function revealFile(p: string) {
  let cmd = "";
  if (process.platform === "win32") {
    cmd = `explorer.exe /select,${p}`;
  } else if (process.platform === "darwin") {
    cmd = `open -r ${p}`;
  } else {
    p = path.parse(p).dir;
    cmd = `open "${p}"`;
  }
  const exec = require("child_process").exec;
  exec(cmd);
}
