import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
const EXIT_GRACE_MS = 1000;

export function spawnDetached(command, args, { shell = false, linger = false, ...options } = {}, io = { spawn, platform: process.platform }) {
  if (io.platform !== "win32") return io.spawn(command, args, { ...options, shell, windowsHide: true, detached: true });
  return io.spawn(process.execPath, [self, JSON.stringify({ command, args, shell, linger })], { ...options, windowsHide: true, detached: true });
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked.toLowerCase() === self.toLowerCase()) {
  const { command, args, shell, linger } = JSON.parse(process.argv[2]);
  const child = spawn(command, args, { stdio: "inherit", shell, windowsHide: true });
  child.on("error", (error) => {
    console.error(`detached-launch: ${error.message}`);
    process.exit(1);
  });
  child.on("exit", (code) => {
    if (linger) setTimeout(() => process.exit(code ?? 1), EXIT_GRACE_MS);
    else process.exit(code ?? 1);
  });
}
