import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export async function requestExecution(id, { env = process.env, pollMs = 1000, request: editorRequest } = {}) {
  const url = env.IMPOWER_REVIEW_EXECUTION_URL, token = env.IMPOWER_REVIEW_EXECUTION_TOKEN;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url ?? "") || !/^[a-f0-9]{64}$/.test(token ?? "")) throw new Error("No launcher execution service was delegated to this reviewer");
  if (id !== undefined && !/^[a-z][a-z0-9-]{0,63}$/.test(id)) throw new Error("Supply one declared operation ID");
  if (editorRequest !== undefined && (!id || !/^[a-z][a-z0-9-]{0,63}$/.test(editorRequest?.requestId ?? ""))) throw new Error("Editor requests need an operation ID and requestId");
  async function request(method, suffix, body) {
    const response = await fetch(url + suffix, { method, headers: { authorization: `Bearer ${token}` }, body, redirect: "error" });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? `Execution service HTTP ${response.status}`);
    return value;
  }
  if (id === undefined) return request("GET", "/operations");
  const suffix = `/operations/${id}` + (editorRequest ? `/requests/${editorRequest.requestId}` : "");
  let value = await request("POST", suffix, editorRequest ? JSON.stringify(editorRequest) : undefined);
  while (value.state === "running") {
    await new Promise(resolve => setTimeout(resolve, pollMs));
    value = await request("GET", suffix);
  }
  return value;
}

export function saveScreenshots(result, directory = process.cwd()) {
  if (!result.screenshots) return result;
  return { ...result, screenshots: result.screenshots.map(shot => {
    if (!/^image-[0-4]\.png$/.test(shot.name) || typeof shot.base64 !== "string" || shot.base64.length > 12 * 1024 * 1024) throw new Error("Invalid screenshot response");
    const file = path.resolve(directory, `editor-${randomUUID()}-${shot.name}`);
    fs.writeFileSync(file, Buffer.from(shot.base64, "base64"), { flag: "wx" });
    return { name: shot.name, path: file };
  }) };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 4) throw new Error("Supply an operation ID and optional editor request JSON file");
    const file = process.argv[3];
    if (file && fs.statSync(file).size > 128 * 1024) throw new Error("Editor request file exceeds 128 KiB");
    const result = saveScreenshots(await requestExecution(process.argv[2], { request: file ? JSON.parse(fs.readFileSync(file, "utf8")) : undefined }));
    console.log(JSON.stringify(result, null, 2));
    if (!Array.isArray(result) && !result.passed) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
