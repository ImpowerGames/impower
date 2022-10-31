import * as os from "os";

export function openFile(p: string) {
  const platform = os.platform();
  let cmd = "xdg-open";
  switch (platform) {
    case "darwin":
      cmd = "open";
      break;
    case "win32":
      cmd = "";
      break;
    default:
      cmd = "xdg-open";
  }
  const exec = require("child_process").exec;
  exec(`${cmd} "${p}"`, (err: string) => {
    if (err) {
      console.error(err);
    }
  });
}
