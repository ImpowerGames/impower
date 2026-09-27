import { fileURLToPath } from "node:url";
import fs from "node:fs";

export async function requestExecution(id, { env = process.env, pollMs = 1000 } = {}) {
  const url = env.IMPOWER_REVIEW_EXECUTION_URL, token = env.IMPOWER_REVIEW_EXECUTION_TOKEN;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url ?? "") || !/^[a-f0-9]{64}$/.test(token ?? "")) throw new Error("No launcher execution service was delegated to this reviewer");
  if (id !== undefined && !/^[a-z][a-z0-9-]{0,63}$/.test(id)) throw new Error("Supply one declared operation ID");
  async function request(method, suffix) {
    const response = await fetch(url + suffix, { method, headers: { authorization: `Bearer ${token}` }, redirect: "error" });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? `Execution service HTTP ${response.status}`);
    return value;
  }
  if (id === undefined) return request("GET", "/operations");
  let value = await request("POST", `/operations/${id}`);
  while (value.state === "running") {
    await new Promise(resolve => setTimeout(resolve, pollMs));
    value = await request("GET", `/operations/${id}`);
  }
  return value;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error("Supply at most one declared operation ID");
    const result = await requestExecution(process.argv[2]);
    console.log(JSON.stringify(result, null, 2));
    if (!Array.isArray(result) && !result.passed) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
