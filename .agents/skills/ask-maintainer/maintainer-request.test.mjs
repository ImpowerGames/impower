import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRepos } from "../../repos.mjs";
import {
  RequestRefused,
  buildRequest,
  checkPlacedBody,
  dataLine,
  fileRequest,
  findDuplicate,
  folderPictures,
  formatList,
  ghTracker,
  groupRequests,
  main,
  pictureWidth,
  readDataLine,
  readTemplate,
  tableColumns,
  tagTicket,
  validateRequest,
} from "./maintainer-request.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(path.join(here, "fixtures", name), "utf8").replace(/\r\n/g, "\n");
const request = (name) => JSON.parse(fixture(name));
const repos = readRepos();
const labels = repos.maintainer.labels;
const now = new Date("2026-11-13T15:37:00Z");
const timeZone = "UTC";
const scratch = mkdtempSync(path.join(tmpdir(), "maintainer-request-test-"));
console.log(`Scratch directory: ${scratch}`);

const png = (width) => {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "latin1");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(400, 20);
  return bytes;
};
const pictures = path.join(scratch, "pictures");
const write = (file, bytes) => writeFileSync(path.join(pictures, file), bytes);
mkdirSync(pictures);
for (const file of ["phone.png", "a.png", "b.png", "c.png", "d.png", "e.png", "popup.png", "narrow.png"]) write(file, png(file === "narrow.png" ? 600 : 840));
write("b-list.png", png(1280));
write("not-a-picture.png", Buffer.from("plain text"));
const lookup = folderPictures(pictures);

const refusals = (value, options = {}) => {
  try {
    validateRequest(value, { pictures: lookup, ...options });
  } catch (error) {
    assert.ok(error instanceof RequestRefused, `a refusal, not ${error.stack}`);
    return error.reasons;
  }
  return [];
};
const refusedFor = (label, value, pattern, options) => {
  const reasons = refusals(value, options);
  assert.ok(reasons.some((reason) => pattern.test(reason)), `${label}: expected a refusal matching ${pattern}, got ${JSON.stringify(reasons)}`);
  console.log(`ok: refuses ${label}: ${reasons.find((reason) => pattern.test(reason))}`);
};
const decision = () => request("decision.json");
const task = () => request("task.json");
const edit = (value, change) => {
  change(value);
  return value;
};

try {
  assert.equal(pictureWidth(path.join(pictures, "b-list.png")), 1280);
  assert.throws(() => pictureWidth(path.join(pictures, "not-a-picture.png")), /not a PNG, JPEG, GIF or WebP/);
  {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x90, 0x03, 0x48, 0x03, 0x01, 0x22, 0x00]);
    write("photo.jpg", jpeg);
    assert.equal(pictureWidth(path.join(pictures, "photo.jpg")), 840);
    const gif = Buffer.from("GIF89a\x48\x03\x90\x01", "latin1");
    write("anim.gif", gif);
    assert.equal(pictureWidth(path.join(pictures, "anim.gif")), 840);
    const webp = (chunk, fill) => {
      const bytes = Buffer.alloc(40);
      bytes.write("RIFF", 0, "latin1");
      bytes.write("WEBP", 8, "latin1");
      bytes.write(chunk, 12, "latin1");
      fill(bytes);
      return bytes;
    };
    write("extended.webp", webp("VP8X", (b) => b.writeUIntLE(839, 24, 3)));
    write("lossless.webp", webp("VP8L", (b) => {
      b[20] = 0x2f;
      b.writeUInt16LE(839 | 0xc000, 21);
    }));
    write("lossy.webp", webp("VP8 ", (b) => b.writeUInt16LE(840 | 0xc000, 26)));
    for (const file of ["extended.webp", "lossless.webp", "lossy.webp"]) assert.equal(pictureWidth(path.join(pictures, file)), 840, file);
  }
  console.log("ok: reads the pixel width of PNG, JPEG, GIF and WebP (extended, lossless and lossy) pictures and refuses a file that is none of them");

  {
    const template = readTemplate("decision");
    assert.deepEqual(template.headings, ["The short version", "What you're looking at", "The options", "Side by side", "Why <letter>"]);
    assert.match(template.answer, /^\*\*To answer:\*\* close this issue with a comment/);
    const taskTemplate = readTemplate("task");
    assert.deepEqual(taskTemplate.headings, ["What to do", "Why only you", "Steps", "What to expect", "What it holds up"]);
    assert.match(taskTemplate.answer, /^\*\*When it's done:\*\* close this issue as completed/);
    const drifted = path.join(scratch, "drifted.md");
    writeFileSync(drifted, "## Only one\n\n**To answer:** x\n");
    assert.throws(() => readTemplate("decision", drifted), /expected 5 section headings, found 1/);
    console.log("ok: the templates hold the section headings and the answer instructions the tool reads");
  }

  {
    const checked = validateRequest(decision(), { pictures: lookup });
    const built = buildRequest(checked, { now, timeZone });
    assert.equal(built.title, "What should mark a choice the preview picked by itself? (#2271)");
    assert.equal(built.body, fixture("decision-body.md"));
    const sections = built.body.split("\n").filter((line) => line.startsWith("## ")).map((line) => line.slice(3));
    assert.deepEqual(sections, ["The short version", "What you're looking at", "The options", "Side by side", "Why B"]);
    const order = ["> [!IMPORTANT]", "- **Recommended:**", "- **Parked until you answer:**", "- **Carrying on meanwhile:**", "- **Asked by:**", "## The short version", "## What you're looking at", "## The options", "## Side by side", "## Why B", "**To answer:**", "<!-- maintainer-request"].map((mark) => built.body.indexOf(mark));
    assert.ok(order.every((at, i) => at !== -1 && (i === 0 || at > order[i - 1])), `the body follows the design's order: ${order}`);
    const options = built.body.split("\n### ").slice(1);
    assert.equal(options.length, 5);
    for (const option of options) assert.match(option, /- \*\*Pros:\*\* .+\n- \*\*Cons:\*\* .+\n- \*\*To undo later:\*\* .+/);
    assert.equal(built.body.trimEnd().split("\n").at(-1), dataLine(built.data));
    assert.deepEqual(readDataLine(built.body), { kind: "decision", options: ["A", "B", "C", "D", "E"], recommended: "B", fallback: { option: "B", at: "2026-11-13T17:37:00.000Z" }, blocks: [2271], owner: "orchestrate-issues #977" });
    assert.deepEqual(built.pictures.map((picture) => picture.file), ["phone.png", "a.png", "b.png", "b-list.png", "c.png", "d.png", "e.png"]);
    console.log("ok: a five-option decision builds the fixture body: sections in order, Pros and Cons on every option, the answer instructions and the hidden data line last");
  }

  {
    const checked = validateRequest(task(), { pictures: lookup });
    const built = buildRequest(checked, { now, timeZone });
    assert.equal(built.title, "Test the route strip on your phone (#2271, #2272)");
    assert.equal(built.body, fixture("task-body.md"));
    const sections = built.body.split("\n").filter((line) => line.startsWith("## ")).map((line) => line.slice(3));
    assert.deepEqual(sections, readTemplate("task").headings);
    assert.match(built.body, /\*\*When it's done:\*\* close this issue as completed/);
    assert.deepEqual(readDataLine(built.body), { kind: "task", blocks: [2271, 2272], owner: "orchestrate-issues #1655" });
    console.log("ok: a task builds the fixture body: sections in the template's order, the answer instructions and the hidden data line");
  }

  {
    const waiting = edit(decision(), (r) => {
      delete r.fallback;
      r.waits = "Only you can say which mark reads right.";
    });
    const built = buildRequest(validateRequest(waiting, { pictures: lookup }), { now, timeZone });
    assert.match(built.body, /^> \*\*This one waits for you,\*\* however long it takes: Only you can say which mark reads right\.$/m);
    assert.equal(readDataLine(built.body).waits, "Only you can say which mark reads right.");
    assert.equal(readDataLine(built.body).fallback, undefined);
    const never = edit(decision(), (r) => {
      delete r.fallback;
      r.alwaysWaits = "waives-check";
    });
    const neverBuilt = buildRequest(validateRequest(never, { pictures: lookup }), { now, timeZone });
    assert.equal(readDataLine(neverBuilt.body).alwaysWaits, "waives-check");
    assert.match(neverBuilt.body, /This one waits for you,\*\* however long it takes: the choice waives a failed check/);
    const late = buildRequest(validateRequest(edit(decision(), (r) => (r.fallback.waitMinutes = 1440)), { pictures: lookup }), { now, timeZone });
    assert.match(late.body, /If you don't answer by 15:37 tomorrow, I'll go ahead with B/);
    const quoted = buildRequest(validateRequest(edit(decision(), (r) => (r.owner = "session <x> & y")), { pictures: lookup }), { now, timeZone });
    assert.doesNotMatch(dataLine(readDataLine(quoted.body)).slice(4, -4), /[<>]/);
    assert.equal(readDataLine(quoted.body).owner, "session <x> & y");
    console.log("ok: a waiting request says so with its reason, a never-fallback kind records itself, and a 24-hour wait reads as tomorrow");
  }

  refusedFor("a missing question", edit(decision(), (r) => delete r.question), /The question is missing/);
  refusedFor("a question of two sentences", edit(decision(), (r) => (r.question = "The mark is unclear. What should it be?")), /more than one sentence/);
  refusedFor("fewer than two options", edit(decision(), (r) => (r.options = r.options.slice(0, 1))), /two to five options, not 1/);
  refusedFor("more than five options", edit(decision(), (r) => r.options.push({ ...r.options[0], name: "Sixth" })), /two to five options, not 6/);
  refusedFor("an option with no picture and no example", edit(decision(), (r) => {
    r.showsOnScreen = false;
    delete r.options[2].pictures;
  }), /Option C has no picture and no example/);
  refusedFor("an option with no Pros", edit(decision(), (r) => delete r.options[1].pros), /Option B has no Pros/);
  refusedFor("an option with no Cons", edit(decision(), (r) => (r.options[3].cons = " ")), /Option D has no Cons/);
  refusedFor("an option with no undo cost", edit(decision(), (r) => delete r.options[4].undo), /Option E has no undo cost/);
  refusedFor("an option with only an example when the difference shows on screen", edit(decision(), (r) => {
    delete r.options[0].pictures;
    r.options[0].example = "The icon stays as it is.";
  }), /Option A has no picture, but the request says the difference shows on screen/);
  refusedFor("first pictures of different pixel widths", edit(decision(), (r) => (r.options[2].pictures[0].file = "narrow.png")), /first pictures differ in width \(A 840px, B 840px, C 600px/);
  refusedFor("first pictures shown at different widths", edit(decision(), (r) => (r.options[1].pictures[0].width = 300)), /first pictures are shown at different widths/);
  refusedFor("no recommendation", edit(decision(), (r) => delete r.recommendation), /There is no recommendation/);
  refusedFor("a recommendation with no reason", edit(decision(), (r) => delete r.recommendation.reason), /The recommendation has no reason/);
  refusedFor("a recommendation naming no option", edit(decision(), (r) => (r.recommendation.option = "F")), /The recommendation names no option/);
  refusedFor("neither a fallback nor a reason it waits", edit(decision(), (r) => delete r.fallback), /names neither a fallback .* nor a reason it waits/);
  refusedFor("a fallback wait under 30 minutes", edit(decision(), (r) => (r.fallback.waitMinutes = 20)), /30 minutes to 24 hours/);
  refusedFor("a fallback wait over 24 hours", edit(decision(), (r) => (r.fallback.waitMinutes = 1441)), /30 minutes to 24 hours/);
  refusedFor("a fallback on a choice that deletes work", edit(decision(), (r) => (r.alwaysWaits = "deletes-work")), /names a fallback, but it deletes or overwrites work .* always wait/);
  refusedFor("a fallback on a choice that leaves the repository", edit(decision(), (r) => (r.alwaysWaits = "leaves-repository")), /names a fallback, but it publishes, sends or spends/);
  refusedFor("a fallback on a choice that waives a failed check", edit(decision(), (r) => (r.alwaysWaits = "waives-check")), /names a fallback, but it waives a failed check/);
  refusedFor("a comparison wider than four columns", edit(decision(), (r) => (r.comparison = "| a | b | c | d | e |\n| - | - | - | - | - |")), /table of 5 columns/);
  refusedFor("a five-column table written without outer pipes", edit(decision(), (r) => (r.comparison = "Option | Shape | Pinning | Phone | Cost\n--- | --- | --- | --- | ---\nA | list | no | yes | none")), /table of 5 columns/);
  assert.equal(tableColumns("a | b | c | d\n:-- | --- | :-: | --:"), 4);
  assert.equal(tableColumns("- a list\n- with a dash\n\n---\n\nand a thematic break"), 0);
  assert.deepEqual(refusals(edit(decision(), (r) => (r.comparison = "Option | A | B | C\n--- | --- | --- | ---\nx | 1 | 2 | 3"))), []);
  refusedFor("a five-column table inside a blockquote", edit(decision(), (r) => (r.comparison = "> Option | Shape | Pinning | Phone | Cost\n> --- | --- | --- | --- | ---\n> A | list | no | yes | none")), /table of 5 columns/);
  refusedFor("a five-column table inside a list item", edit(decision(), (r) => (r.comparison = "1. Compared:\n\n   | a | b | c | d | e |\n   | - | - | - | - | - |")), /table of 5 columns/);
  assert.equal(tableColumns("> > | a | b |\n> > |---|---|"), 2);
  assert.equal(tableColumns("- item\n  - a | b | c | d | e\n    --- | --- | --- | --- | ---"), 5);
  assert.equal(tableColumns("> ---\n> quoted thematic break"), 0);
  refusedFor("a five-column table whose delimiter cells are single dashes", edit(decision(), (r) => (r.comparison = "Option | Shape | Pinning | Phone | Cost\n- | - | - | - | -\nA | list | no | yes | none")), /table of 5 columns/);
  assert.equal(tableColumns("> a | b | c | d | e\n> - | - | - | - | -"), 5);
  assert.equal(tableColumns("- a | b | c\n  - | - | -"), 3);
  assert.equal(tableColumns("- a list item\n- another"), 0);
  refusedFor("picture markup typed into text", edit(decision(), (r) => (r.shortVersion = 'See <img src="./a.png">.')), /holds picture markup/);
  refusedFor("an HTML comment marker in text", edit(decision(), (r) => (r.meanwhile = "nothing -->")), /HTML comment marker/);
  refusedFor("a picture missing from the folder", edit(decision(), (r) => (r.options[0].pictures[0].file = "missing.png")), /missing\.png is not a file in the pictures folder/);
  refusedFor("a picture name with a space", edit(decision(), (r) => (r.options[0].pictures[0].file = "phone screenshot.png")), /phone screenshot\.png must be named with letters, digits/);
  refusedFor("a picture name with a Markdown-significant character", edit(decision(), (r) => (r.options[0].pictures[0].file = "a(1).png")), /must be named with letters, digits/);
  refusedFor("a picture outside the folder", edit(decision(), (r) => (r.options[0].pictures[0].file = "../a.png")), /a path inside the pictures folder/);
  refusedFor("a misspelled field", edit(decision(), (r) => (r.options[0].pro = "x")), /unknown field "pro"/);
  refusedFor("a missing ticket list", edit(decision(), (r) => delete r.tickets), /"tickets" must list/);
  refusedFor("a task with no action", edit(task(), (r) => delete r.action), /The task has no action/);
  refusedFor("a task with no reason only the maintainer can do it", edit(task(), (r) => (r.why = "")), /no reason only the maintainer can do it/);
  refusedFor("a task with no steps", edit(task(), (r) => (r.steps = [])), /The task has no steps/);
  refusedFor("a decision tagged onto a ticket", decision(), /Only a task can be tagged/, { tag: true });
  {
    const reasons = refusals(edit(decision(), (r) => {
      delete r.question;
      delete r.options[1].cons;
      delete r.recommendation;
    }));
    assert.equal(reasons.length, 3, `every reason is reported at once: ${JSON.stringify(reasons)}`);
    console.log("ok: every refusal reason is reported in one pass");
  }

  {
    const hosted = (n) => `https://github.com/user-attachments/assets/0000000${n}`;
    const placed = `<img src="${hosted(1)}" width="420" alt="x">\n\n${dataLine({ kind: "task", blocks: [1], owner: "o" })}\n`;
    assert.deepEqual(checkPlacedBody(placed, [hosted(1)]), []);
    const relative = checkPlacedBody(`<img src="./a.png" width="420" alt="x">\n\n${dataLine({ kind: "task" })}\n`, []);
    assert.ok(relative.some((problem) => /relative path \.\/a\.png/.test(problem)), JSON.stringify(relative));
    const appended = checkPlacedBody(`${placed}\n![a.png](${hosted(2)})\n`, [hosted(1)]);
    assert.ok(appended.some((problem) => /did not place was appended/.test(problem)), JSON.stringify(appended));
    const asWhen2285 = checkPlacedBody(`<img src="./a.png" width="420" alt="x">\n\n${dataLine({ kind: "decision" })}\n\n![a.png](${hosted(3)})\n`, []);
    assert.ok(asWhen2285.some((problem) => /relative path/.test(problem)) && asWhen2285.some((problem) => /appended/.test(problem)), JSON.stringify(asWhen2285));
    console.log("ok: the read-back check fails on a relative picture path and on an appended picture, as gh left them when the sample request was filed");
  }

  function fakeTracker({ open = {}, failUpload = null, appendOnWrite = false, existing = {}, type = "Task", fail = {}, competitor = null, rivalTag = false, existingComments = [] } = {}) {
    const issues = new Map(Object.entries(existing).map(([n, issue]) => [Number(n), { labels: [], assignees: [], state: "open", id: Number(n) * 10, ...issue, number: Number(n) }]));
    const comments = new Map(existingComments.map((comment) => [comment.id, structuredClone(comment)]));
    const blocked = new Map();
    const calls = [];
    const counts = {};
    let next = 9000;
    const host = (body, attach) => {
      let text = body;
      for (const file of attach) {
        if (file === failUpload) continue;
        const url = `https://github.com/user-attachments/assets/${Buffer.from(file).toString("hex")}`;
        const reference = new RegExp(`(!\\[[^\\]]*\\]\\()${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\))`, "g");
        if (reference.test(text)) text = text.replace(reference, `$1${url}$2`);
        else text += `\n\n![${file}](${url})`;
      }
      return text;
    };
    const methods = {
      open: (label) => {
        calls.push(["open", label]);
        const filed = [...issues.values()].filter((issue) => issue.state === "open" && issue.labels.some((l) => l.name === label));
        return [...(open[label] ?? []), ...structuredClone(filed)];
      },
      issue: (n) => {
        const issue = issues.get(n);
        if (!issue) throw new Error(`no issue ${n}`);
        return structuredClone(issue);
      },
      parent: () => null,
      create: ({ title, bodyFile, labels: names, assignee, attach }) => {
        calls.push(["create", title, names, assignee, attach]);
        const add = (body) => {
          const number = next++;
          issues.set(number, { number, id: number * 10, title, body, type: type === null ? null : { name: type }, labels: names.map((name) => ({ name })), assignees: [{ login: assignee }], milestone: null, state: "open", html_url: `https://github.com/acme/tickets/issues/${number}` });
          return number;
        };
        const body = host(readFileSync(bodyFile, "utf8"), attach);
        if (competitor === "before") add(body);
        const number = add(body);
        if (competitor === "after") add(body);
        return failUpload ? { number, uploadError: `upload of ${failUpload} failed` } : { number };
      },
      editBody: (n, bodyFile) => {
        calls.push(["editBody", n]);
        issues.get(n).body = readFileSync(bodyFile, "utf8") + (appendOnWrite ? "\n![late.png](https://github.com/user-attachments/assets/late)\n" : "");
      },
      close: (n, reason) => {
        calls.push(["close", n, reason]);
        issues.get(n).state = "closed";
      },
      addLabel: (n, label) => {
        calls.push(["addLabel", n, label]);
        issues.get(n).labels.push({ name: label });
      },
      removeLabel: (n, label) => {
        calls.push(["removeLabel", n, label]);
        issues.get(n).labels = issues.get(n).labels.filter((l) => l.name !== label);
      },
      addAssignee: (n, login) => {
        calls.push(["addAssignee", n, login]);
        issues.get(n).assignees.push({ login });
      },
      removeAssignee: (n, login) => {
        calls.push(["removeAssignee", n, login]);
        issues.get(n).assignees = issues.get(n).assignees.filter((a) => a.login !== login);
      },
      comment: ({ number, bodyFile, attach }) => {
        calls.push(["comment", number, attach]);
        if (rivalTag) {
          const rival = 7000 + comments.size;
          comments.set(rival, { id: rival, issue: number, body: `rival\n\n${dataLine({ kind: "task", tagged: true, blocks: [], owner: "rival" })}\n` });
          if (rivalTag === "finished") issues.get(number).labels.push({ name: labels.task });
        }
        const id = 7000 + comments.size;
        comments.set(id, { id, issue: number, body: host(readFileSync(bodyFile, "utf8"), attach) });
        return { id };
      },
      readComment: (id) => structuredClone(comments.get(id)),
      comments: (n) => structuredClone([...comments.values()].filter((comment) => comment.issue === n)),
      editComment: (id, bodyFile) => {
        calls.push(["editComment", id]);
        comments.get(id).body = readFileSync(bodyFile, "utf8");
      },
      deleteComment: (id) => {
        calls.push(["deleteComment", id]);
        comments.delete(id);
      },
      blockedBy: (n) => (blocked.get(n) ?? []).map((id) => ({ number: id / 10 })),
      addBlockedBy: (n, id) => {
        calls.push(["addBlockedBy", n, id]);
        blocked.set(n, [...(blocked.get(n) ?? []), id]);
      },
      removeBlockedBy: (n, id) => {
        calls.push(["removeBlockedBy", n, id]);
        blocked.set(n, (blocked.get(n) ?? []).filter((other) => other !== id));
      },
    };
    const wrapped = Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, (...args) => {
      counts[name] = (counts[name] ?? 0) + 1;
      if (fail[name] === counts[name]) {
        calls.push(["threw", name]);
        throw new Error(`${name}: network down`);
      }
      return method(...args);
    }]));
    return { repo: "acme/tickets", calls, issues, commentStore: comments, blocked, ...wrapped };
  }

  const decisionFile = path.join(scratch, "decision.json");
  writeFileSync(decisionFile, JSON.stringify(decision()));

  {
    const tracker = fakeTracker();
    const result = fileRequest(decision(), { pictures, tracker, repos, now, timeZone });
    const issue = tracker.issues.get(result.number);
    const create = tracker.calls.find((call) => call[0] === "create");
    assert.deepEqual(create.slice(2), [[labels.decision], repos.maintainer.login, ["./phone.png", "./a.png", "./b.png", "./b-list.png", "./c.png", "./d.png", "./e.png"]]);
    assert.equal(issue.type.name, "Task");
    assert.equal(issue.milestone, null);
    assert.equal(result.pictures, 7);
    assert.doesNotMatch(issue.body, /src="\.\//);
    assert.equal((issue.body.match(/<img src="https:\/\/github\.com\/user-attachments\/assets\//g) ?? []).length, 7);
    assert.match(issue.body, /<img src="https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f]+" width="640" alt="Route list with an outlined pin on the Auto row">/);
    assert.deepEqual(checkPlacedBody(issue.body, [...issue.body.matchAll(/src="([^"]+)"/g)].map((m) => m[1])), []);
    assert.deepEqual(tracker.calls.filter((call) => call[0] === "addBlockedBy"), [["addBlockedBy", 2271, result.number * 10]]);
    assert.deepEqual(result.blocked, [2271]);
    assert.ok(!tracker.calls.some((call) => call[0] === "close"));
    console.log(`ok: filing creates one typed, labelled, assigned issue, puts all ${result.pictures} hosted pictures in place at their widths, and blocks the ticket`);
  }

  {
    const tracker = fakeTracker();
    const repeated = edit(decision(), (r) => (r.options[1].pictures[1].file = "a.png"));
    const result = fileRequest(repeated, { pictures, tracker, repos, now, timeZone });
    const issue = tracker.issues.get(result.number);
    const create = tracker.calls.find((call) => call[0] === "create");
    assert.deepEqual(create[4], ["./phone.png", "./a.png", "./b.png", "./c.png", "./d.png", "./e.png"]);
    const hostedA = `https://github.com/user-attachments/assets/${Buffer.from("./a.png").toString("hex")}`;
    assert.equal(issue.body.split(`<img src="${hostedA}"`).length - 1, 2);
    assert.doesNotMatch(issue.body, /src="\.\//);
    console.log("ok: a picture used twice is uploaded once and its hosted address is written at both places");
  }

  {
    const tracker = fakeTracker();
    const result = fileRequest(task(), { pictures, tracker, repos, now, timeZone });
    assert.deepEqual(tracker.calls.find((call) => call[0] === "create")[2], [labels.task]);
    assert.deepEqual(result.blocked, [2271, 2272]);
    console.log("ok: filing a task labels it as a task and blocks both tickets");
  }

  {
    const tracker = fakeTracker({ failUpload: "./c.png" });
    assert.throws(() => fileRequest(decision(), { pictures, tracker, repos, now, timeZone }), (error) => /\.\/c\.png was not uploaded: the body still holds its relative path/.test(error.message) && /closed #9000 as not planned/.test(error.message));
    assert.ok(tracker.calls.some((call) => call[0] === "close" && call[2] === "not_planned"));
    assert.ok(!tracker.calls.some((call) => call[0] === "addBlockedBy"));
    console.log("ok: filing fails, withdraws the request and links nothing when a picture's relative path is left after upload");
  }

  {
    const tracker = fakeTracker({ appendOnWrite: true });
    assert.throws(() => fileRequest(decision(), { pictures, tracker, repos, now, timeZone }), /a picture the request did not place was appended: https:\/\/github\.com\/user-attachments\/assets\/late/);
    assert.ok(tracker.calls.some((call) => call[0] === "close"));
    console.log("ok: filing fails and withdraws the request when an appended picture is left in the body");
  }

  for (const [label, type] of [["Bug", "Bug"], ["no type", null]]) {
    const tracker = fakeTracker({ type });
    assert.throws(() => fileRequest(decision(), { pictures, tracker, repos, now, timeZone }), (error) => new RegExp(`type is ${type ?? "unset"}, not Task`).test(error.message) && /closed #9000 as not planned/.test(error.message));
    assert.equal(tracker.issues.get(9000).state, "closed");
    assert.ok(!tracker.calls.some((call) => call[0] === "addBlockedBy"));
    console.log(`ok: an issue read back with ${label} instead of the Task type fails the filing and is withdrawn`);
  }

  for (const [method, call] of [["issue", 1], ["editBody", 1], ["parent", 1], ["issue", 3]]) {
    const tracker = fakeTracker({ fail: { [method]: call } });
    assert.throws(() => fileRequest(decision(), { pictures, tracker, repos, now, timeZone }), (error) => new RegExp(`${method}: network down`).test(error.message) && /closed #9000 as not planned/.test(error.message) && /file the request again/.test(error.message));
    assert.equal(tracker.issues.get(9000).state, "closed", `${method} call ${call}`);
    const retry = fileRequest(decision(), { pictures, tracker, repos, now, timeZone });
    assert.equal(retry.number, 9001, "the withdrawn request does not block a retry as a duplicate");
    console.log(`ok: a ${method} error after the issue exists (call ${call}) withdraws the request, and the same request files again`);
  }

  {
    const tracker = fakeTracker({ fail: { addBlockedBy: 2 } });
    assert.throws(() => fileRequest(task(), { pictures, tracker, repos, now, timeZone }), (error) => /addBlockedBy: network down/.test(error.message) && /removed the dependency of #2271 on #9000/.test(error.message) && /closed #9000 as not planned/.test(error.message));
    assert.deepEqual(tracker.blocked.get(2271), []);
    assert.deepEqual(tracker.blocked.get(2272) ?? [], []);
    assert.equal(tracker.issues.get(9000).state, "closed");
    console.log("ok: an error while linking the second ticket removes the first ticket's dependency and withdraws the request");
  }

  {
    const tracker = fakeTracker({ fail: { addBlockedBy: 1 }, existing: { 2240: { title: "Draw the title art", body: "Body.", html_url: "https://github.com/acme/tickets/issues/2240" } } });
    assert.throws(() => tagTicket(2240, task(), { pictures, tracker, repos }), (error) => /Tagging acme\/tickets#2240 failed/.test(error.message) && /deleted the task comment 7000/.test(error.message) && /removed the label maintainer: task/.test(error.message) && /unassigned/.test(error.message));
    const ticket = tracker.issues.get(2240);
    assert.equal(tracker.commentStore.size, 0);
    assert.deepEqual(ticket.labels, []);
    assert.deepEqual(ticket.assignees, []);
    console.log("ok: a failed tag deletes its comment and removes the label and assignee it added");
  }

  {
    const tracker = fakeTracker({ existing: { 2240: { title: "Draw the title art", body: "Body.", html_url: "https://github.com/acme/tickets/issues/2240", assignees: [{ login: repos.maintainer.login }] } } });
    const result = tagTicket(2240, task(), { pictures, tracker, repos });
    assert.deepEqual(result.blocked, [2271, 2272]);
    assert.deepEqual(tracker.blocked.get(2271), [22400]);
    assert.deepEqual(tracker.blocked.get(2272), [22400]);
    assert.ok(!tracker.calls.some((call) => call[0] === "addAssignee"), "an already assigned maintainer is not assigned twice");
    assert.deepEqual(readDataLine(tracker.commentStore.get(result.comment).body).blocks, [2271, 2272]);
    assert.throws(() => tagTicket(2271, task(), { pictures, tracker, repos }), /no issue 2271/);
    const self = fakeTracker({ existing: { 2271: { title: "x", body: "y" } } });
    assert.throws(() => tagTicket(2271, task(), { pictures, tracker: self, repos }), /#2271 cannot hold itself up/);
    console.log("ok: tag blocks each ticket the task names on the tagged ticket, and refuses a ticket that would hold itself up");
  }

  {
    const runs = [];
    const run = (args, options = {}) => {
      runs.push({ args, cwd: options.cwd });
      if (args[0] === "issue" && args[1] === "create") return "https://github.com/acme/tickets/issues/77\n";
      if (args.includes("repos/acme/tickets/issues/5/parent")) throw Object.assign(new Error("Command failed"), { stderr: "gh: No parent issue found (HTTP 404)" });
      return "null";
    };
    const gh = ghTracker("acme/tickets", run);
    assert.deepEqual(gh.create({ title: "Q? (#1)", bodyFile: "/x/staged.md", labels: [labels.decision], assignee: repos.maintainer.login, attach: ["./a.png", "./b.png"], cwd: "/pictures" }), { number: 77 });
    assert.deepEqual(runs[0].args, ["issue", "create", "-R", "acme/tickets", "--title", "Q? (#1)", "--body-file", "/x/staged.md", "--type", "Task", "--assignee", repos.maintainer.login, "--label", labels.decision, "--attach", "./a.png", "--attach", "./b.png"]);
    assert.equal(runs[0].cwd, "/pictures");
    assert.equal(gh.parent(5), null);
    const partial = ghTracker("acme/tickets", () => {
      throw Object.assign(new Error("Command failed"), { stdout: "https://github.com/acme/tickets/issues/78\n", stderr: "upload of b.png failed" });
    });
    assert.deepEqual(partial.create({ title: "t", bodyFile: "f", labels: ["l"], assignee: "a", attach: ["./b.png"], cwd: "." }), { number: 78, uploadError: "upload of b.png failed" });
    gh.removeLabel(5, labels.task);
    assert.deepEqual(runs.at(-1).args, ["api", "-X", "DELETE", "repos/acme/tickets/issues/5/labels/maintainer%3A%20task"]);
    gh.removeBlockedBy(5, 990);
    assert.deepEqual(runs.at(-1).args, ["api", "-X", "DELETE", "repos/acme/tickets/issues/5/dependencies/blocked_by/990"]);
    console.log("ok: the gh adapter creates the issue in one typed call with its label, assignee and attachments from the pictures folder, and reads a missing parent as none");
  }

  {
    const tracker = fakeTracker({ competitor: "before" });
    assert.throws(() => fileRequest(task(), { pictures, tracker, repos, now, timeZone }), (error) => /filed at the same time already asks this about the same ticket: #9000/.test(error.message) && /closed #9001 as not planned/.test(error.message) && /Use #9000 instead\./.test(error.message));
    assert.equal(tracker.issues.get(9000).state, "open");
    assert.equal(tracker.issues.get(9001).state, "closed");
    assert.ok(!tracker.calls.some((call) => call[0] === "addBlockedBy"), "the withdrawn duplicate links nothing");
    const kept = fakeTracker({ competitor: "after" });
    const result = fileRequest(task(), { pictures, tracker: kept, repos, now, timeZone });
    assert.equal(result.number, 9000, "the earliest of two overlapping filings stands");
    assert.deepEqual(kept.blocked.get(2271), [90000]);
    console.log("ok: of two overlapping filings of one request, the earliest stands and the later withdraws itself before linking, naming the earlier");
  }

  {
    const existing = { 2240: { title: "Draw the title art", body: "Body.", html_url: "https://github.com/acme/tickets/issues/2240" } };
    const tracker = fakeTracker({ rivalTag: true, existing });
    assert.throws(() => tagTicket(2240, task(), { pictures, tracker, repos }), (error) => /tagged at the same time by comment 7000/.test(error.message) && /deleted the task comment 7001/.test(error.message));
    assert.deepEqual([...tracker.commentStore.keys()], [7000]);
    assert.ok(!tracker.calls.some((call) => call[0] === "addLabel"));
    const finished = fakeTracker({ rivalTag: "finished", existing });
    assert.throws(() => tagTicket(2240, task(), { pictures, tracker: finished, repos }), /tagged at the same time by comment 7000/);
    assert.deepEqual([...finished.commentStore.keys()], [7000]);
    assert.deepEqual(finished.issues.get(2240).labels.map((l) => l.name), [labels.task], "the withdrawn tag leaves the earlier tag's label in place");
    assert.ok(!finished.calls.some((call) => call[0] === "removeLabel"));
    const old = fakeTracker({ existing, existingComments: [{ id: 6000, issue: 2240, body: `old\n\n${dataLine({ kind: "task", tagged: true, blocks: [], owner: "o" })}\n` }] });
    assert.throws(() => tagTicket(2240, task(), { pictures, tracker: old, repos }), /#2240 already has a maintainer task comment \(6000\); if its tag was removed on purpose, delete that comment and tag again/);
    assert.ok(!old.calls.some((call) => call[0] === "comment"), "a standing task comment refuses the tag before anything is posted");
    console.log("ok: of two overlapping tags of one ticket, the earlier comment stands, even when its tag finished first, and the later tag deletes only its own comment; a standing task comment refuses a new tag");
  }

  {
    const existing = { number: 4242, title: "What should mark a choice the preview picked by itself? (#2271)", html_url: "https://github.com/acme/tickets/issues/4242", body: `x\n\n${dataLine({ kind: "decision", options: ["A", "B"], recommended: "B", blocks: [2271], owner: "o" })}\n` };
    const tracker = fakeTracker({ open: { [labels.decision]: [existing] } });
    assert.throws(() => fileRequest(decision(), { pictures, tracker, repos, now, timeZone }), (error) => error instanceof RequestRefused && /already asks this about the same ticket: #4242 What should mark/.test(error.message));
    assert.ok(!tracker.calls.some((call) => call[0] === "create"));
    assert.equal(findDuplicate(validateRequest(edit(decision(), (r) => (r.tickets = [9])), { pictures: lookup }), [existing]), null, "the same question about another ticket is not a duplicate");
    assert.equal(findDuplicate(validateRequest(edit(decision(), (r) => (r.question = "Should the mark go?")), { pictures: lookup }), [existing]), null, "another question about the same ticket is not a duplicate");
    assert.equal(findDuplicate(validateRequest(edit(decision(), (r) => (r.question = "what should mark a choice the preview picked by itself")), { pictures: lookup }), [existing]).number, 4242, "case and closing punctuation do not hide a duplicate");
    console.log("ok: a duplicate open request is refused by number before anything is created; another ticket or question is not a duplicate");
  }

  {
    const tracker = fakeTracker();
    const lines = [];
    assert.equal(main(["file", decisionFile, pictures, "--dry-run"], { tracker, repos, out: (line) => lines.push(line), now }), 0);
    assert.match(lines[0], /^Dry run: the request is complete/);
    assert.ok(!tracker.calls.some((call) => call[0] === "create"));
    const errors = console.error;
    console.error = () => {};
    try {
      assert.equal(main(["file"], { tracker, repos, out: () => {} }), 2);
      assert.equal(main(["tag", "x", decisionFile], { tracker, repos, out: () => {} }), 2);
    } finally {
      console.error = errors;
    }
    console.log("ok: --dry-run validates and checks duplicates without filing; a malformed command prints the usage");
  }

  {
    const tracker = fakeTracker({ existing: { 2240: { title: "Draw the title art", body: "Body.", html_url: "https://github.com/acme/tickets/issues/2240" } } });
    const tagged = edit(task(), (r) => delete r.tickets);
    const result = tagTicket(2240, tagged, { pictures, tracker, repos });
    assert.ok(!tracker.calls.some((call) => call[0] === "create"), "tag creates no issue");
    const ticket = tracker.issues.get(2240);
    assert.ok(ticket.labels.some((l) => l.name === labels.task));
    assert.ok(ticket.assignees.some((a) => a.login === repos.maintainer.login));
    assert.equal(tracker.commentStore.size, 1);
    const comment = tracker.commentStore.get(result.comment).body;
    assert.match(comment, /## What to do\n\nTest the route strip on your phone\./);
    assert.match(comment, /- \*\*Parked until it's done:\*\* Nothing beyond this ticket\./);
    assert.match(comment, /<img src="https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f]+" width="300"/);
    assert.equal(readDataLine(comment).tagged, true);
    assert.throws(() => tagTicket(2240, tagged, { pictures, tracker, repos }), /already tagged maintainer: task/);
    console.log("ok: tag adds the label, the assignee and one comment with the task's fields and pictures, creates no issue, and refuses a second tag");
  }

  {
    const at = (hours) => new Date(now.getTime() - hours * 3600 * 1000).toISOString();
    const issue = (number, title, hours, data, extra = []) => ({ number, title, created_at: at(hours), html_url: `https://github.com/acme/tickets/issues/${number}`, body: data ? `b\n\n${dataLine(data)}\n` : "Tagged.", labels: extra });
    const late = issue(3, "Went ahead? (#7)", 30, { kind: "decision", fallback: { option: "A", at: at(1) } });
    const groups = groupRequests({
      decisions: [issue(1, "Which? (#5)", 1, { kind: "decision", fallback: { option: "B", at: new Date(now.getTime() + 3600 * 1000).toISOString() } }), issue(2, "Waits? (#6)", 3, { kind: "decision", waits: "w" }), late],
      tasks: [issue(4, "Draw the art (#8)", 50, { kind: "task" }), issue(5, "Tagged ticket", 2, null)],
      decidedWithoutYou: [late],
    });
    assert.deepEqual(groups.decisions.map((i) => i.number), [2, 1]);
    assert.deepEqual(groups.tasks.map((i) => i.number), [4, 5]);
    assert.deepEqual(groups.decidedWithoutYou.map((i) => i.number), [3]);
    const text = formatList(groups, { now, timeZone });
    assert.match(text, /^Decisions \(2\)\n  #2 Waits\? \(#6\)\n    https:\/\/github\.com\/acme\/tickets\/issues\/2 · open 3h 0m · waits for you\n  #1 Which\? \(#5\)\n    .* · open 1h 0m · falls back at 16:37 today to B$/m);
    assert.match(text, /Tasks \(2\)\n  #4 Draw the art \(#8\)\n    .* · open 2d · no clock/);
    assert.match(text, /Went ahead without you \(1\)\n  #3 Went ahead\? \(#7\)\n    .* · open 30h 0m · went ahead with A/);
    assert.match(formatList(groupRequests({ decisions: [], tasks: [], decidedWithoutYou: [] }), { now, timeZone }), /^Decisions \(0\)\n  None/);
    console.log("ok: list prints decisions, tasks and went-ahead-without-you requests in their groups, oldest first, with links, ages and fallback times");
  }

  {
    const file = path.join(scratch, "repos.json");
    const bad = (label, maintainer, field) => {
      writeFileSync(file, JSON.stringify({ ...repos, maintainer }));
      assert.throws(() => readRepos(file), (error) => error.message.includes(`"${field}"`), label);
    };
    bad("a missing maintainer", undefined, "maintainer");
    bad("a login that is not a GitHub login", { ...repos.maintainer, login: "not a login" }, "maintainer.login");
    bad("a missing label", { ...repos.maintainer, labels: { ...repos.maintainer.labels, task: undefined } }, "maintainer.labels.task");
    bad("two labels with one name", { ...repos.maintainer, labels: { ...repos.maintainer.labels, task: repos.maintainer.labels.decision } }, "maintainer.labels");
    assert.deepEqual(Object.keys(labels), ["decision", "task", "decidedWithoutYou"]);
    console.log("ok: .agents/repos.json names the maintainer's login and the three labels, and the loader refuses a malformed entry");
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
