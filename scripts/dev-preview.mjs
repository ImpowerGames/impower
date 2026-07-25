// One-command launcher for the live editor + game-preview player dev servers.
//
//   npm run web:dev               # same-origin (default)
//   npm run web:dev:same-origin
//   npm run web:dev:cross-origin
//
// The editor (impower-dev) and player (sparkdown-player-app) are two separate
// Vite dev servers that talk over a postMessage/MessageChannel handshake. Wiring
// them by hand is a footgun: the editor needs to know the player's real port,
// the player needs to know the editor's origin to reply, and each editor needs a
// unique HMR_PORT — get any of these wrong (or collide with another worktree's
// servers) and the Game Preview silently stays BLACK. This script removes the
// footgun: it grabs free ports, derives every cross-referencing env var
// consistently for the chosen mode, launches both, waits for readiness, and
// prints the URL. It never collides with other running worktrees because every
// port is chosen free at launch time.
//
// Env overrides (optional): EDITOR_PORT, PLAYER_PORT, HMR_PORT force specific
// ports instead of auto-picking free ones.

import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IS_WIN = process.platform === "win32";

// Ask the OS for a free TCP port by binding to :0 and reading the assignment.
// There's an unavoidable tiny TOCTOU window between close() and the child
// binding; we pass --strictPort to the player and pick the editor port last to
// keep it small. Good enough for a dev launcher.
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function pickPort(envName) {
  const forced = process.env[envName];
  if (forced) return Number(forced);
  return findFreePort();
}

// Poll an http URL until it answers (any status) or we give up.
async function waitForHttp(url, { timeoutMs = 180_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { redirect: "manual" });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return false;
}

// Stream a child's output with a short prefix so both servers' logs interleave
// readably in one terminal.
function pipePrefixed(child, label) {
  const prefix = `[${label}] `;
  for (const stream of [child.stdout, child.stderr]) {
    let buf = "";
    stream?.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(prefix + line + "\n");
    });
  }
}

const children = [];

function spawnServer(label, cwd, args, env) {
  // `shell: true` is required on Windows so `npm` resolves to `npm.cmd` (Node 23
  // refuses to spawn a `.cmd` directly) and is harmless on POSIX. Our args are
  // all simple tokens (no spaces/quoting), so shell word-splitting is safe.
  const child = spawn("npm", args, {
    cwd: join(ROOT, cwd),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    windowsHide: true,
  });
  pipePrefixed(child, label);
  child.on("exit", (code) => {
    process.stdout.write(`[${label}] exited (code ${code})\n`);
    shutdown(code ?? 0);
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.pid == null || child.killed) continue;
    if (IS_WIN) {
      // npm.cmd spawns a node grandchild (vite/tsx) that a plain kill orphans —
      // taskkill /T tears down the whole tree.
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      try {
        child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// Preview mode:
//   same-origin  — the editor reverse-proxies the player under its OWN origin at
//                  /__player/, so the live game DOM is reachable from the editor
//                  page (window.__preview, devtools). Default.
//   cross-origin — the editor embeds the player as a separate-origin iframe.
// Both wire up identically from the user's side; they differ only in env. The
// handshake works in both because the player learns the editor's origin
// dynamically on localhost (sparkdown-player-app/src/main.ts).
function parseMode() {
  const i = process.argv.indexOf("--mode");
  const mode = i >= 0 ? process.argv[i + 1] : "same-origin";
  if (mode !== "same-origin" && mode !== "cross-origin") {
    process.stderr.write(
      `Unknown --mode "${mode}" (expected "same-origin" or "cross-origin").\n`,
    );
    process.exit(1);
  }
  return mode;
}

async function main() {
  const mode = parseMode();
  const editorPort = await pickPort("EDITOR_PORT");
  const playerPort = await pickPort("PLAYER_PORT");
  const hmrPort = await pickPort("HMR_PORT");

  const editorOrigin = `http://localhost:${editorPort}`;
  const playerOrigin = `http://localhost:${playerPort}`;

  process.stdout.write(
    `\nLaunching live preview (${mode}):\n` +
      `  editor  ${editorOrigin}  (HMR ${hmrPort})\n` +
      `  player  ${playerOrigin}\n\n`,
  );

  // Player. Both modes pass VITE_SPARKDOWN_EDITOR_ORIGIN so its handshake replies
  // target the editor precisely (the localhost relaxation in main.ts is the
  // safety net for hand-launches, not a substitute here).
  if (mode === "same-origin") {
    // Served under base "/__player/"; the editor proxies to it. The vite config
    // reads SPARKDOWN_PLAYER_PORT (and pins hmr.clientPort to it); --strictPort
    // makes a stolen port fail loudly instead of silently drifting.
    spawnServer("player", "sparkdown-player-app", ["run", "dev", "--", "--strictPort"], {
      VITE_SAME_ORIGIN_PREVIEW: "1",
      SPARKDOWN_PLAYER_PORT: String(playerPort),
      VITE_SPARKDOWN_EDITOR_ORIGIN: editorOrigin,
    });
  } else {
    spawnServer("player", "sparkdown-player-app", ["run", "dev", "--", "--port", String(playerPort), "--strictPort"], {
      VITE_SPARKDOWN_EDITOR_ORIGIN: editorOrigin,
    });
  }

  // Editor.
  if (mode === "same-origin") {
    spawnServer("editor", "impower-dev", ["run", "dev"], {
      PORT: String(editorPort),
      HMR_PORT: String(hmrPort),
      VITE_SAME_ORIGIN_PREVIEW: "1",
      SPARKDOWN_PLAYER_DEV_ORIGIN: playerOrigin,
      VITE_SPARKDOWN_EDITOR_ORIGIN: editorOrigin,
    });
  } else {
    spawnServer("editor", "impower-dev", ["run", "dev"], {
      PORT: String(editorPort),
      HMR_PORT: String(hmrPort),
      VITE_SPARKDOWN_PLAYER_ORIGIN: playerOrigin,
      VITE_SPARKDOWN_EDITOR_ORIGIN: editorOrigin,
    });
  }

  const ready = await waitForHttp(editorOrigin + "/");
  if (ready) {
    process.stdout.write(
      `\n  ✓ Live preview ready → ${editorOrigin}\n` +
        `    mode: ${mode}` +
        (mode === "same-origin"
          ? " (game DOM reachable via window.__preview)\n"
          : "\n") +
        `    (Ctrl+C stops both servers.)\n\n`,
    );
  } else {
    process.stdout.write(
      `\n  ! Editor did not become ready within the timeout — check the logs above.\n\n`,
    );
  }
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  shutdown(1);
});
