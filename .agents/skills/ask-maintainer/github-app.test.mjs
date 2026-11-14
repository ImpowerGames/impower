import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRepos } from "../../repos.mjs";
import { KEY_VARIABLE, KeyError, TOOL_MARK, actorOf, commentAuthor, insideRepository, isMarked, readKey, resolveIdentity, tokenEnv } from "./github-app.mjs";
import { buildRequest, ghTracker, main, markComment, validateRequest } from "./maintainer-request.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.IMPOWER_MAINTAINER_REQUEST_INDEX = mkdtempSync(path.join(tmpdir(), "request-index-"));
const repos = readRepos();
const login = repos.maintainer.login;
const app = { slug: "impower-ask-maintainer", id: 123456, installationId: 9876543 };
const now = new Date("2026-11-13T15:37:00Z");
const scratch = mkdtempSync(path.join(tmpdir(), "github-app-test-"));
console.log(`Scratch directory: ${scratch}`);
const outside = () => false;

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const keyFile = path.join(scratch, "app-key.pem");
writeFileSync(keyFile, privateKey.export({ type: "pkcs1", format: "pem" }));
const env = { [KEY_VARIABLE]: keyFile, GITHUB_TOKEN: "ambient-token", PATH: process.env.PATH };
const token = "ghs_fixtureInstallationToken0000000000";

const decode = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
const tokenServer = (status = 201, reply = { token, expires_at: "2026-11-13T16:37:00Z" }) => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => reply };
  };
  return { calls, fetch };
};

try {
  {
    const server = tokenServer();
    const identity = await resolveIdentity({ repo: "ImpowerGames/impower-internal", app, env, fetch: server.fetch, now, inRepository: outside });
    assert.equal(server.calls.length, 1);
    const [{ url, init }] = server.calls;
    assert.equal(url, `https://api.github.com/app/installations/${app.installationId}/access_tokens`);
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), { repositories: ["impower-internal"], permissions: { issues: "write" } });
    const jwt = /^Bearer (.+)$/.exec(init.headers.Authorization)[1];
    const [header, payload, signature] = jwt.split(".");
    assert.deepEqual(decode(header), { alg: "RS256", typ: "JWT" });
    const claims = decode(payload);
    const seconds = Math.floor(now.getTime() / 1000);
    assert.deepEqual(claims, { iat: seconds - 60, exp: seconds + 540, iss: String(app.id) });
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${payload}`);
    assert.ok(verifier.verify(publicKey, Buffer.from(signature, "base64url")), "the token request is signed with the App's key");
    assert.deepEqual(identity, { mode: "app", token, expiresAt: "2026-11-13T16:37:00Z", appId: app.id, login: `${app.slug}[bot]` });
    console.log("ok: the tool signs a ten-minute RS256 token request with the App's key and asks for issues write on the tickets repository only");

    const runs = [];
    const gh = ghTracker("acme/tickets", (args, options = {}) => {
      runs.push({ args, env: options.env, cwd: options.cwd });
      if (args[0] === "issue" && args[1] === "create") return "https://github.com/acme/tickets/issues/77\n";
      return "[]";
    }, identity);
    gh.create({ title: "t", bodyFile: "f", labels: ["l"], assignee: login, attach: [], cwd: "/pictures" });
    gh.addAssignee(77, login);
    gh.blockedBy(5);
    gh.comment({ number: 77, bodyFile: "f", attach: [] });
    assert.equal(runs.length, 4);
    for (const run of runs) {
      assert.equal(run.env?.GH_TOKEN, token, `${run.args.slice(0, 3).join(" ")} runs with the App's token`);
      assert.equal(run.env.GITHUB_TOKEN, undefined, "an ambient GITHUB_TOKEN is not passed on");
    }
    assert.equal(runs[0].cwd, "/pictures");
    const plain = [];
    ghTracker("acme/tickets", (args, options = {}) => (plain.push(options), "[]")).blockedBy(5);
    assert.equal(plain[0].env, undefined, "without the App, gh runs with the maintainer's own login");
    assert.equal(tokenEnv({ mode: "maintainer", reason: "r" }), undefined);
    console.log("ok: with the App's token, every gh call the tool makes, the dependency calls included, runs as the App");

    const checked = validateRequest(JSON.parse(readFileSync(path.join(here, "fixtures", "task.json"), "utf8")), { pictures: () => ({ path: path.join(scratch, "x.png"), width: 840 }) });
    const asApp = buildRequest(checked, { now, timeZone: "UTC", identity });
    assert.ok(!/through your GitHub account/.test(asApp.body), "a request filed as the App carries no fallback line");
    assert.ok(isMarked(asApp.body));
    assert.ok(!asApp.body.includes(token) && !asApp.body.includes(readFileSync(keyFile, "utf8").split("\n")[1]), "neither the token nor the key reaches the body");
    const lines = [];
    const tracker = { repo: "acme/tickets", open: () => [], all: () => [] };
    assert.equal(main(["list"], { repos, identity, tracker, out: (line) => lines.push(line), now }), 0);
    assert.equal(main(["identity"], { repos, identity, tracker, out: (line) => lines.push(line), now }), 0);
    assert.equal(lines.at(-1), `Acting as the GitHub App ${app.slug}[bot].`);
    assert.ok(!lines.join("\n").includes(token), "the token is never printed");
  }

  {
    const unset = await resolveIdentity({ repo: "ImpowerGames/impower-internal", app, env: { PATH: process.env.PATH }, fetch: () => assert.fail("no key, no request") });
    assert.deepEqual(unset, { mode: "maintainer", reason: `${KEY_VARIABLE} is not set on this machine` });
    const unconfigured = await resolveIdentity({ repo: "ImpowerGames/impower-internal", app: { slug: null, id: null, installationId: null }, env, fetch: () => assert.fail("no App, no request"), inRepository: outside });
    assert.match(unconfigured.reason, /the App is not configured in \.agents\/repos\.json/);
    const refused = await resolveIdentity({ repo: "ImpowerGames/impower-internal", app, env, fetch: tokenServer(401, { message: "A JSON web token could not be decoded" }).fetch, now, inRepository: outside });
    assert.deepEqual(refused, { mode: "maintainer", reason: "GitHub refused the App's token request for ImpowerGames/impower-internal (HTTP 401: A JSON web token could not be decoded)" });
    const offline = await resolveIdentity({ repo: "ImpowerGames/impower-internal", app, env, fetch: async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }); }, now, inRepository: outside });
    assert.match(offline.reason, /did not reach GitHub \(ENOTFOUND\)/);

    const checked = validateRequest(JSON.parse(readFileSync(path.join(here, "fixtures", "task.json"), "utf8")), { pictures: () => ({ path: path.join(scratch, "x.png"), width: 840 }) });
    const asMaintainer = buildRequest(checked, { now, timeZone: "UTC", identity: unset });
    assert.match(asMaintainer.body, /\n_Filed by an agent through your GitHub account, because the tool's GitHub App could not be used on this machine: GitHub shows you as the author and sends you no alert for it\._\n\n<!-- ask-maintainer: posted by the tool -->\n/);
    const tagged = buildRequest(validateRequest({ ...JSON.parse(readFileSync(path.join(here, "fixtures", "task.json"), "utf8")), tickets: undefined }, { pictures: () => ({ path: path.join(scratch, "x.png"), width: 840 }), tag: true }), { tag: true, identity: unset });
    assert.match(tagged.body, /\n_Posted by the ask-maintainer tool through your GitHub account, not by you\._\n\n<!-- ask-maintainer: posted by the tool -->\n/);
    assert.equal(markComment("Withdrawn.", unset), `Withdrawn.\n\n_Posted by the ask-maintainer tool through your GitHub account, not by you._\n\n${TOOL_MARK}\n`);
    assert.equal(markComment("Withdrawn.", { mode: "app" }), `Withdrawn.\n\n${TOOL_MARK}\n`);
    const lines = [];
    assert.equal(main(["identity"], { repos, identity: unset, tracker: {}, out: (line) => lines.push(line), now }), 0);
    assert.deepEqual(lines, [`Acting through the maintainer's own account, so GitHub sends them no alert: ${KEY_VARIABLE} is not set on this machine.`]);
    console.log("ok: without the key, with no App configured, or when GitHub refuses or cannot be reached, the tool falls back to the maintainer's login, says so and that GitHub sends no alert, and marks its own comments");
  }

  {
    const missing = path.join(scratch, "absent.pem");
    const secret = "SECRET-KEY-CONTENTS-must-not-leak";
    const garbled = path.join(scratch, "garbled.pem");
    writeFileSync(garbled, `-----BEGIN RSA PRIVATE KEY-----\n${secret}\n-----END RSA PRIVATE KEY-----\n`);
    const pem = readFileSync(keyFile, "utf8");
    const refusal = (file, pattern, options = { inRepository: outside }, extra = {}) => {
      let caught;
      try {
        readKey({ ...extra, [KEY_VARIABLE]: file }, options);
      } catch (error) {
        caught = error;
      }
      assert.ok(caught instanceof KeyError, `${file.slice(0, 80)}: a key error, not ${caught}`);
      assert.ok(caught.message.includes(KEY_VARIABLE), "the error names the variable");
      assert.ok(!caught.message.includes(secret), "the error never quotes the key");
      assert.ok(!pem.split("\n").slice(1, -2).some((line) => line && caught.message.includes(line)), "the error never quotes a line of the key");
      assert.match(caught.message, pattern);
      return caught.message;
    };
    refusal(missing, /cannot be read \(ENOENT\)/);
    refusal(garbled, /is not an RSA private key in PEM form/);
    refusal("app-key.pem", /does not hold an absolute path/);
    assert.ok(!refusal(pem, /does not hold an absolute path; set it to the absolute path of the App's private key file, never to the key itself/).includes(pem), "a key pasted into the variable is not echoed");
    const repo = path.join(scratch, "a-repository");
    mkdirSync(repo);
    execFileSync("git", ["init", "-q", repo], { windowsHide: true });
    const inside = path.join(repo, "app-key.pem");
    writeFileSync(inside, pem);
    mkdirSync(path.join(repo, ".git", "keys"));
    const inGitDir = path.join(repo, ".git", "keys", "app-key.pem");
    writeFileSync(inGitDir, pem);
    console.log(`Scratch repository: ${repo}`);
    refusal(inside, /lies inside a Git repository/, {});
    refusal(inGitDir, /lies inside a Git repository/, {});
    refusal(inside, /lies inside a Git repository/, {}, { GIT_DIR: path.join(scratch, "no-such-git-dir"), GIT_CEILING_DIRECTORIES: scratch, PATH: process.env.PATH });
    const link = path.join(scratch, "linked-key.pem");
    let linked = true;
    try {
      symlinkSync(inside, link, "file");
    } catch (error) {
      if (error.code !== "EPERM") throw error;
      linked = false;
      console.log("skip: this account cannot create a file symlink (EPERM); the symlinked-key case runs where it can");
    }
    if (linked) refusal(link, /lies inside a Git repository/, {});
    const failing = (status, stderr, code) => () => {
      throw Object.assign(new Error("Command failed"), { status, stderr, code });
    };
    assert.throws(() => insideRepository(scratch, { run: failing(128, "fatal: detected dubious ownership in repository") }), (error) => error instanceof KeyError && /git exited with status 128.; the key is not used/.test(error.message));
    assert.throws(() => insideRepository(scratch, { run: failing(undefined, "", "ENOENT") }), (error) => error instanceof KeyError && /git did not run: ENOENT./.test(error.message));
    assert.equal(insideRepository(scratch, { run: failing(128, "fatal: not a git repository (or any of the parent directories): .git") }), false);
    const asked = [];
    const notRepository = (dir) => (asked.push(dir), false);
    assert.equal(readKey({ [KEY_VARIABLE]: keyFile }, { inRepository: notRepository }).asymmetricKeyType, "rsa", "a key outside every repository is read");
    assert.deepEqual(asked, [path.dirname(keyFile)], "the key's directory is the one checked");
    await assert.rejects(resolveIdentity({ repo: "ImpowerGames/impower-internal", app, env: { [KEY_VARIABLE]: garbled }, fetch: () => assert.fail("a bad key makes no request"), inRepository: outside }), (error) => error instanceof KeyError && !error.message.includes(secret));
    console.log("ok: a relative, pasted, unreadable, garbled or in-repository key (in the work tree, in .git, through a symlink, or under a misrouted GIT_DIR) is an error that names the variable and never the key; a repository check that cannot run refuses the key");
  }

  {
    const who = { maintainerLogin: login, app };
    const comment = (user, body = "B", extra = {}) => ({ user: user && { login: user }, body, ...extra });
    assert.equal(commentAuthor(comment(`${app.slug}[bot]`), who), "tool");
    assert.equal(commentAuthor(comment("someone[bot]", "x", { performed_via_github_app: { id: app.id } }), who), "tool");
    assert.equal(commentAuthor(comment(login, "B, the hollow pin."), who), "maintainer");
    assert.equal(commentAuthor(comment("a-collaborator"), who), "other");
    assert.equal(commentAuthor(comment(null), who), "other");
    assert.equal(actorOf({ login: `${app.slug}[bot]` }, who), "tool", "a close by the App is the tool's own");
    assert.equal(actorOf({ login }, who), "maintainer", "a close by the maintainer's login is the maintainer's");
    console.log("ok: with the App, a comment or close by the App is the tool's and one by the maintainer's login is the maintainer's");

    const fallback = { maintainerLogin: login, app: { slug: null, id: null, installationId: null } };
    const posted = markComment("Withdrawn by the ask-maintainer tool.", { mode: "maintainer", reason: "r" });
    assert.equal(commentAuthor(comment(login, posted), fallback), "tool");
    assert.equal(commentAuthor(comment(login, posted.replace(/\n/g, "\r\n")), fallback), "tool");
    assert.equal(commentAuthor(comment(login, "B"), fallback), "maintainer");
    assert.equal(commentAuthor(comment(login, `I'd go with B. The tool writes ${TOOL_MARK} on its own comments.`), fallback), "maintainer", "the mark counts only on a line of its own");
    assert.equal(commentAuthor(comment(login, posted), who), "tool", "a comment posted from a machine without the key is the tool's even where the App exists");
    console.log("ok: in the fallback only the maintainer's unmarked comments are the maintainer's");
  }

  {
    const file = path.join(scratch, "repos.json");
    const raw = JSON.parse(readFileSync(path.join(here, "..", "..", "repos.json"), "utf8"));
    const withApp = (value) => {
      writeFileSync(file, JSON.stringify({ ...raw, maintainer: { ...raw.maintainer, app: value } }));
      return () => readRepos(file);
    };
    assert.deepEqual(withApp(app)().maintainer.app, app);
    assert.deepEqual(withApp({ slug: null, id: null, installationId: null })().maintainer.app, { slug: null, id: null, installationId: null });
    assert.throws(withApp(undefined), /"maintainer\.app"/);
    assert.throws(withApp({ ...app, installationId: null }), /"maintainer\.app"/);
    assert.throws(withApp({ ...app, id: "123" }), /"maintainer\.app\.id"/);
    assert.throws(withApp({ ...app, slug: "Not A Slug" }), /"maintainer\.app\.slug"/);
    console.log("ok: .agents/repos.json names the App's slug, id and installation id, all null until it exists, and refuses a partial entry");
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
