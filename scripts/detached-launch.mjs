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
// shares. The wrapper's pid is the root of the tree, so stopping the tree from
// that pid stops the command too, and the wrapper exits with the command's
// exit code.
//
// Every detached launch in agent tooling goes through `spawnDetached`, whatever
// name the call site reaches it by; scripts/windows-hide.test.mjs refuses a
// `detached` option anywhere else.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
export const EXIT_GRACE_MS = 1000;

// `options` takes cwd, env, stdio, shell and linger. The wrapper runs in the
// caller's `cwd` with the caller's `env`, because those are the options the
// wrapper itself was started with, and its inner spawn inherits both; it
// passes its stdio on the same way, so a log file handed to it receives the
// command's output.
//
// `linger` keeps the wrapper alive for EXIT_GRACE_MS after the command exits,
// for a launch that something later stops with `taskkill /T` from the recorded
// pid: that walks a tree children first, and a wrapper that already left on its
// command's heels makes the kill report failure although the tree did stop.
// A caller that waits for its command instead sees the exit without the delay.
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
