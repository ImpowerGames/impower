import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const HOST_TOKENS = read(
  "src/modules/spark-editor/components/preview-route/route-view.css",
);
const ROUTE_LIST = read("../packages/spark-web-player/src/route/route-list.css");
const SAVES = read("../packages/spark-web-player/src/saves/saves.css");

type Specificity = [number, number, number];

const specificityOf = (selector: string): Specificity => {
  const inner = selector.match(/^:is\((.*)\)$/);
  if (inner) {
    return inner[1]!
      .split(",")
      .map((part) => specificityOf(part.trim()))
      .reduce((best, next) => (compare(next, best) > 0 ? next : best));
  }
  const ids = (selector.match(/#[\w-]+/g) ?? []).length;
  const classes = (selector.match(/(\.[\w-]+|\[[^\]]+\]|:(?!is\()[\w-]+)/g) ?? []).length;
  const types = selector
    .replace(/(#[\w-]+|\.[\w-]+|\[[^\]]+\]|:[\w-]+(\([^)]*\))?)/g, " ")
    .split(/[\s>+~]+/)
    .filter(Boolean).length;
  return [ids, classes, types];
};

const compare = (a: Specificity, b: Specificity) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const rootRules = (css: string, token: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , body]) => body!.includes(`${token}:`))
    .map(([, selector]) => selector!.trim());

const tokensRead = (css: string) =>
  new Set([...css.matchAll(/var\((--swp-[\w-]+)/g)].map((match) => match[1]!));

const tokensDefined = (css: string) =>
  new Set([...css.matchAll(/(--swp-[\w-]+)\s*:/g)].map((match) => match[1]!));

const PLAYER_ONLY = new Set(["--swp-route-list-max-height"]);

const SAME_FALLBACK_IN_BOTH = new Set(["--swp-route-code-font-family"]);

describe("the hosted route list's tokens", () => {
  it("are all set by the editor where the list's own stylesheets only read them", () => {
    const shared = ROUTE_LIST + SAVES;
    const defined = tokensDefined(shared);
    const host = tokensDefined(HOST_TOKENS);
    const unset = [...tokensRead(shared)].filter(
      (token) =>
        !defined.has(token) &&
        !host.has(token) &&
        !PLAYER_ONLY.has(token) &&
        !SAME_FALLBACK_IN_BOTH.has(token),
    );
    expect(unset).toEqual([]);
  });

  it("are set by a rule that outranks the list's own defaults, whichever stylesheet arrives last", () => {
    for (const token of [
      "--swp-route-warning-color",
      "--swp-route-popup-background-color",
      "--swp-route-field-background-color",
      "--swp-route-muted-color",
    ]) {
      const [host] = rootRules(HOST_TOKENS, token);
      const defaults = [...rootRules(ROUTE_LIST, token), ...rootRules(SAVES, token)];
      expect(host, token).toBeDefined();
      expect(defaults.length, token).toBeGreaterThan(0);
      for (const selector of defaults) {
        expect(compare(specificityOf(host!), specificityOf(selector)), `${host} over ${selector}`).toBeGreaterThan(0);
      }
    }
  });
});
