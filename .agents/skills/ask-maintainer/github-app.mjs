import { execFileSync } from "node:child_process";
import { createPrivateKey, createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const KEY_VARIABLE = "ASK_MAINTAINER_APP_KEY";
export const TOOL_MARK = "<!-- ask-maintainer: posted by the tool -->";
const API = "https://api.github.com";

export class KeyError extends Error {}

const base64url = (value) => Buffer.from(value).toString("base64url");

export function signJwt(appId, key, now = new Date()) {
  const seconds = Math.floor(now.getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: seconds - 60, exp: seconds + 540, iss: String(appId) }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(key).toString("base64url")}`;
}

function insideWorkTree(file) {
  try {
    return execFileSync("git", ["-C", path.dirname(file), "rev-parse", "--is-inside-work-tree"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim() === "true";
  } catch {
    return false;
  }
}

export function readKey(env = process.env, { inRepository = insideWorkTree } = {}) {
  const file = env[KEY_VARIABLE];
  if (!file) return null;
  const where = `${KEY_VARIABLE} names ${file}`;
  if (!path.isAbsolute(file)) throw new KeyError(`${where}, which is not an absolute path; set ${KEY_VARIABLE} to the absolute path of the App's private key file`);
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new KeyError(`${where}, which cannot be read (${error.code ?? "unreadable"}); save the App's private key there or correct ${KEY_VARIABLE}`);
  }
  if (inRepository(file)) throw new KeyError(`${where}, which is inside a Git work tree; move the key outside every repository and point ${KEY_VARIABLE} at its new place`);
  try {
    const key = createPrivateKey(text);
    if (key.asymmetricKeyType !== "rsa") throw new Error();
    return key;
  } catch {
    throw new KeyError(`${where}, which is not an RSA private key in PEM form; download a new private key from the App's settings and save it there`);
  }
}

const maintainer = (reason) => Object.freeze({ mode: "maintainer", reason });

export async function resolveIdentity({ repo, app, env = process.env, fetch = globalThis.fetch, now = new Date(), inRepository } = {}) {
  const key = readKey(env, { inRepository });
  if (!key) return maintainer(`${KEY_VARIABLE} is not set on this machine`);
  if (!app?.id || !app?.installationId || !app?.slug) return maintainer("the App is not configured in .agents/repos.json (maintainer.app)");
  const [owner, name] = repo.split("/");
  let response;
  try {
    response = await fetch(`${API}/app/installations/${app.installationId}/access_tokens`, {
      method: "POST",
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${signJwt(app.id, key, now)}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ask-maintainer" },
      body: JSON.stringify({ repositories: [name], permissions: { issues: "write" } }),
    });
  } catch (error) {
    return maintainer(`the App's token request did not reach GitHub (${error.cause?.code ?? error.message})`);
  }
  let data = null;
  try {
    data = await response.json();
  } catch {}
  if (!response.ok || typeof data?.token !== "string") return maintainer(`GitHub refused the App's token request for ${owner}/${name} (HTTP ${response.status}${typeof data?.message === "string" ? `: ${data.message}` : ""})`);
  return Object.freeze({ mode: "app", token: data.token, expiresAt: data.expires_at, appId: app.id, login: `${app.slug}[bot]` });
}

export function tokenEnv(identity, env = process.env) {
  if (identity?.mode !== "app") return undefined;
  const { GITHUB_TOKEN, GH_ENTERPRISE_TOKEN, GITHUB_ENTERPRISE_TOKEN, ...rest } = env;
  return { ...rest, GH_TOKEN: identity.token };
}

export function actorOf(user, { maintainerLogin, app }) {
  if (!user?.login) return "other";
  if (app?.slug && user.login === `${app.slug}[bot]`) return "tool";
  if (user.login === maintainerLogin) return "maintainer";
  return "other";
}

export function isMarked(body) {
  return (body ?? "").replace(/\r\n/g, "\n").split("\n").some((line) => line.trim() === TOOL_MARK);
}

export function commentAuthor(comment, who) {
  if (who.app?.id && comment?.performed_via_github_app?.id === who.app.id) return "tool";
  const actor = actorOf(comment?.user, who);
  if (actor === "maintainer" && isMarked(comment.body)) return "tool";
  return actor;
}
