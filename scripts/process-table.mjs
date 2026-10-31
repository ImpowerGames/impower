import fs from "node:fs";
import { spawn } from "node:child_process";

export function windowsProcessTable() {
  const script = "Get-CimInstance Win32_Process | ForEach-Object { '{0} {1} {2}' -f $_.ProcessId, $_.ParentProcessId, $(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().Ticks } else { '-' }) }";
  return new Promise((resolve, reject) => {
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", (code) => {
      const rows = out.split(/\r?\n/).filter(Boolean).map((line) => {
        const [pid, ppid, start] = line.trim().split(" ");
        return { pid: Number(pid), ppid: Number(ppid), start: /^\d+$/.test(start ?? "") ? start : null };
      });
      if (code !== 0 || !rows.length || rows.some((row) => !Number.isSafeInteger(row.pid) || !Number.isSafeInteger(row.ppid))) reject(new Error(`the process census failed (exit ${code})`));
      else resolve(rows);
    });
  });
}

export function treeSurvivors(before, after, root) {
  const rootRow = before.find((row) => row.pid === root);
  if (!rootRow) return null;
  const key = (row) => `${row.pid}:${row.start}`;
  const notAfter = (a, b) => a.start === null || b.start === null || BigInt(a.start) <= BigInt(b.start);
  const rows = [...before, ...after];
  const byPid = new Map();
  for (const row of rows) byPid.set(row.pid, [...(byPid.get(row.pid) ?? []), row]);
  const parentOf = (row) => {
    let parent = null;
    for (const other of byPid.get(row.ppid) ?? []) {
      if (key(other) === key(row) || !notAfter(other, row)) continue;
      if (!parent || (parent.start !== null && other.start !== null && BigInt(other.start) > BigInt(parent.start))) parent = other;
    }
    return parent;
  };
  const tree = new Set([key(rootRow)]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const row of rows) {
      if (tree.has(key(row))) continue;
      const parent = parentOf(row);
      if (!parent || !tree.has(key(parent))) continue;
      tree.add(key(row));
      grew = true;
    }
  }
  const memberPids = new Set([...tree].map((member) => Number(member.split(":")[0])));
  return after.filter((row) => tree.has(key(row)) || (memberPids.has(row.pid) && (row.start === null || tree.has(`${row.pid}:null`))));
}

export function linuxProcesses({ io = fs, uid = process.getuid?.() } = {}) {
  const rows = [];
  for (const name of io.readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const owner = io.statSync(`/proc/${name}`).uid;
      let stat;
      try { stat = io.readFileSync(`/proc/${name}/stat`, "utf8"); }
      catch (error) {
        if ((error.code === "EACCES" || error.code === "EPERM") && owner !== uid) {
          rows.push({ pid: Number(name), uid: owner, unreadable: true });
          continue;
        }
        throw error;
      }
      const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
      rows.push({ pid: Number(name), parent: Number(fields[1]), group: Number(fields[2]), session: Number(fields[3]), state: fields[0], start: fields[19], uid: owner });
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ESRCH") throw error;
    }
  }
  return rows;
}
