import { readFileSync } from "node:fs";
import path from "node:path";

const lf = (text) => String(text ?? "").replace(/\r\n/g, "\n");

function rows(text) {
  const out = [];
  for (const line of lf(text).split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      continue;
    }
  }
  return out;
}

const blockText = (content) => {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    if (typeof block === "string") return [block];
    if (typeof block?.text === "string") return [block.text];
    if (block?.type === "tool_result") return blockText(block.content);
    return [];
  });
};

function claudeMessages(entries, file) {
  const messages = [];
  for (const entry of entries) {
    const at = entry.timestamp ?? null;
    const session = entry.sessionId ?? path.basename(file, ".jsonl");
    const content = entry.message?.content;
    if (entry.type === "assistant") {
      for (const text of blockText((Array.isArray(content) ? content : [content]).filter((block) => typeof block === "string" || block?.type === "text"))) messages.push({ source: "assistant", text, at, session });
      continue;
    }
    if (entry.type !== "user") continue;
    const blocks = Array.isArray(content) ? content : [content];
    const results = blocks.filter((block) => block?.type === "tool_result");
    for (const text of blockText(results)) messages.push({ source: "tool", text, at, session });
    const typed = blocks.filter((block) => typeof block === "string" || block?.type === "text");
    const human = entry.turnOrigin === "human" && !entry.isMeta && !entry.isCompactSummary && !entry.toolUseResult && !results.length;
    for (const text of blockText(typed)) {
      const injected = /^\s*<system-reminder>/.test(text);
      messages.push({ source: entry.toolUseResult ? "tool" : human && !injected ? "maintainer" : "other", text, at, session });
    }
  }
  return messages;
}

function codexMessages(entries, file) {
  const meta = entries.find((entry) => entry.type === "session_meta")?.payload ?? {};
  const session = meta.id ?? meta.session_id ?? path.basename(file, ".jsonl");
  const messages = [];
  for (const entry of entries) {
    const item = entry.payload ?? {};
    const at = entry.timestamp ?? null;
    if (entry.type !== "response_item") continue;
    if (item.type === "message") {
      const content = Array.isArray(item.content) ? item.content : [];
      const provenance = item.internal_chat_message_metadata_passthrough?.content_item_metadata ?? [];
      content.forEach((block, index) => {
        if (typeof block?.text !== "string") return;
        const source = item.role === "assistant" ? "assistant" : item.role === "user" && provenance[index]?.provenance?.type === "user" ? "maintainer" : "other";
        messages.push({ source, text: block.text, at, session });
      });
    } else if (/_output$/.test(item.type ?? "")) {
      const output = typeof item.output === "string" ? item.output : JSON.stringify(item.output ?? "");
      messages.push({ source: "tool", text: output, at, session });
    }
  }
  return messages;
}

export function transcriptMessages(text, file = "transcript.jsonl") {
  const entries = rows(text);
  if (entries.some((entry) => entry.type === "session_meta" || entry.type === "response_item")) return { runner: "codex", messages: codexMessages(entries, file) };
  if (entries.some((entry) => entry.type === "user" || entry.type === "assistant")) return { runner: "claude-code", messages: claudeMessages(entries, file) };
  return { runner: null, messages: [] };
}

export function findRun(haystack, needle) {
  const text = lf(haystack);
  const word = /[\p{L}\p{N}_]/u;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    const before = at > 0 ? text[at - 1] : "";
    const after = text[at + needle.length] ?? "";
    const startsWord = word.test(needle[0]);
    const endsWord = word.test(needle.at(-1));
    if ((!startsWord || !word.test(before)) && (!endsWord || !word.test(after))) return at;
  }
  return -1;
}

export function findTypedWords(words, transcriptFile, { read = (file) => readFileSync(file, "utf8") } = {}) {
  const quoted = lf(words).trim();
  if (!quoted) return { ok: false, reason: "the quoted words are empty" };
  const { runner, messages } = transcriptMessages(read(transcriptFile), transcriptFile);
  if (!runner) return { ok: false, reason: `${transcriptFile} is not a Claude Code or Codex session transcript` };
  const hit = messages.find((message) => message.source === "maintainer" && findRun(message.text, quoted) !== -1);
  if (hit) return { ok: true, runner, session: hit.session, at: hit.at, words: quoted };
  const elsewhere = [...new Set(messages.filter((message) => findRun(message.text, quoted) !== -1).map((message) => message.source))];
  const where = { assistant: "an assistant message", tool: "tool output", other: "a message the maintainer did not type (an injected, scheduled or relayed one)" };
  if (elsewhere.length) return { ok: false, runner, reason: `the words appear only in ${elsewhere.map((source) => where[source]).join(" and ")}, never in a message the maintainer typed` };
  return { ok: false, runner, reason: "no message the maintainer typed in this transcript holds the words as one unbroken run; quote them exactly as typed, never a paraphrase" };
}
