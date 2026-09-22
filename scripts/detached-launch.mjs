// Starts a process that outlives the command that launched it, without a
// visible window on Windows.
//
// Agent tooling runs each command under a runner that stops the command's
// process tree when it returns, so servers and durable test runs are started
// with `detached: true`. On Windows that flag gives the child no console, and
// Windows ignores `windowsHide` for it: the child itself shows nothing, but the
// first console program it starts without `windowsHide` of its own (the
// `node` behind `npm.cmd`, or a vitest worker) opens a visible console window
// that takes keyboard focus. So on Windows the detached process is a small
// hidden node wrapper, and the wrapper starts the real command undetached with
// `windowsHide: true`, which gives it a hidden console that every descendant
// shares. The wrapper exits with the command's exit code a second after the
// command does; its pid is the root of the tree, so stopping the tree from
// that pid stops the command too.
//
// Every detached launch in agent tooling goes through `spawnDetached`, and
// scripts/windows-hide.test.mjs refuses `detached: true` anywhere else.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
const EXIT_GRACE_MS = 1000;

// `options` takes cwd, env, stdio and shell; the wrapper passes its own stdio
// on to the command, so a log file handed to it receives the command's output.
export function spawnDetached(command, args, { shell = false, ...options } = {}, io = { spawn, platform: process.platform }) {
  if (io.platform !== "win32") return io.spawn(command, args, { ...options, shell, windowsHide: true, detached: true });
  return io.spawn(process.execPath, [self, JSON.stringify({ command, args, shell })], { ...options, windowsHide: true, detached: true });
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked.toLowerCase() === self.toLowerCase()) {
  const { command, args, shell } = JSON.parse(process.argv[2]);
  const child = spawn(command, args, { stdio: "inherit", shell, windowsHide: true });
  child.on("error", (error) => {
    console.error(`detached-launch: ${error.message}`);
    process.exit(1);
  });
  // `taskkill /T` stops a tree children first. The wrapper outlives its command
  // by a moment so the kill still finds it; a wrapper already gone makes
  // taskkill report failure though the whole tree stopped.
  child.on("exit", (code) => setTimeout(() => process.exit(code ?? 1), EXIT_GRACE_MS));
}
