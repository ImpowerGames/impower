import fs from "node:fs";

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
