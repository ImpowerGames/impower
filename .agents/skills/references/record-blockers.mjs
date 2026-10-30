import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ticketsRepo } from "../../repos.mjs";

export function statedBlockers(body) {
  const numbers = [];
  let fence = null;
  const paragraphs = [[]];
  const blockStart = /^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+|>\s*|\|)/;
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    const mark = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (mark) {
      if (!fence) fence = mark[1];
      else if (mark[1][0] === fence[0] && mark[1].length >= fence.length && line.trim() === mark[1]) fence = null;
      paragraphs.push([]);
      continue;
    }
    if (fence) continue;
    const marker = blockStart.exec(line);
    if (line.trim() === "") paragraphs.push([]);
    else if (marker) paragraphs.push([line.slice(marker[0].length).trim()]);
    else paragraphs.at(-1).push(line.trim());
  }
  for (const lines of paragraphs) {
    const text = lines.join(" ").replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, (span) => " ".repeat(span.length));
    const pattern = /(?<=^\s*|[.!?:]\s+)Blocked by\b/g;
    let match;
    while ((match = pattern.exec(text))) {
      let depth = 0;
      let end = text.length;
      for (let i = match.index; i < text.length; i++) {
        const char = text[i];
        if (char === "(") depth++;
        else if (char === ")") depth = Math.max(0, depth - 1);
        else if (char === "." && depth === 0 && (i + 1 === text.length || /[\sA-Z]/.test(text[i + 1]))) {
          end = i;
          break;
        }
      }
      for (const ref of text.slice(match.index, end).matchAll(/(?<![\w/])#([1-9]\d*)\b/g)) {
        const number = Number(ref[1]);
        if (!numbers.includes(number)) numbers.push(number);
      }
      pattern.lastIndex = end;
    }
  }
  return numbers;
}

export function recordBlockers(number, client, { dryRun = false } = {}) {
  const stated = statedBlockers(client.body(number));
  if (stated.includes(number)) throw new Error(`#${number} states itself as a blocker; correct the body first`);
  const before = client.blockedBy(number).map((issue) => issue.number);
  const missing = stated.filter((n) => !before.includes(n));
  if (!dryRun) for (const blocker of missing) client.add(number, client.id(blocker));
  const after = dryRun ? before : client.blockedBy(number).map((issue) => issue.number);
  const absent = dryRun ? [] : stated.filter((n) => !after.includes(n));
  const unstated = after.filter((n) => !stated.includes(n));
  return { number, stated, added: dryRun ? [] : missing, pending: dryRun ? missing : [], after, absent, unstated };
}

export function describe(result, repo) {
  const list = (numbers) => (numbers.length ? numbers.map((n) => `#${n}`).join(", ") : "none");
  const lines = [`${repo ?? ""}#${result.number}: stated ${list(result.stated)}; blocked-by read back ${list(result.after)}`];
  if (result.added.length) lines.push(`  added ${list(result.added)}`);
  if (result.pending.length) lines.push(`  would add ${list(result.pending)} (dry run)`);
  if (result.unstated.length) lines.push(`  not stated in the body, left alone: ${list(result.unstated)}`);
  if (result.absent.length) lines.push(`  still missing after posting: ${list(result.absent)}`);
  return lines.join("\n");
}

export function ghClient(repo = ticketsRepo(), run = (args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, windowsHide: true })) {
  const gh = (args) => JSON.parse(run(args) || "null");
  return {
    repo,
    body: (n) => gh(["api", `repos/${repo}/issues/${n}`]).body ?? "",
    id: (n) => gh(["api", `repos/${repo}/issues/${n}`]).id,
    blockedBy: (n) => gh(["api", `repos/${repo}/issues/${n}/dependencies/blocked_by`, "--paginate", "--slurp"]).flat(),
    add: (n, id) => gh(["api", "-X", "POST", `repos/${repo}/issues/${n}/dependencies/blocked_by`, "-F", `issue_id=${id}`]),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const numbers = args.filter((a) => a !== "--dry-run").map((a) => a.replace(/^#/, ""));
  if (!numbers.length || numbers.some((a) => !/^[1-9]\d*$/.test(a))) {
    console.error("Usage: node .agents/skills/references/record-blockers.mjs <issue> [<issue> ...] [--dry-run]");
    process.exit(2);
  }
  const client = ghClient();
  let failed = false;
  for (const n of numbers) {
    const result = recordBlockers(Number(n), client, { dryRun });
    console.log(describe(result, client.repo));
    if (result.absent.length) failed = true;
  }
  process.exit(failed ? 1 : 0);
}
