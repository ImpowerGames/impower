import * as path from "path";
import * as os from "os";

export function revealFile(p: string) {
  const platform = os.platform();
  let cmd = "";
  switch (platform) {
    case "darwin":
      cmd = `open -r ${p}`;
      break;
    case "win32":
      cmd = `explorer.exe /select,${p}`;
      break;
    default: {
      p = path.parse(p).dir;
      cmd = `open "${p}"`;
      break;
    }
  }
  const exec = require("child_process").exec;
  exec(cmd, (err: string) => {
    if (err) {
      console.error(err);
    }
  });
}
