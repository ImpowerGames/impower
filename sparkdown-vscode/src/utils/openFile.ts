export function openFile(p: string) {
  let cmd = "xdg-open";
  switch (process.platform) {
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
  exec(`${cmd} "${p}"`);
}
