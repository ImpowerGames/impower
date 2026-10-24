// The asset service's side of the protocol: a variant's filtered-image URL
// with `morph=<recipe>&key=<identity>` added answers with the baked artifact
// (JSON), or with its rest render (`morph_output=rest`, SVG). The web service
// worker and the dev server's mirror both call this, so a served artifact is
// the same one an in-process host would bake.

import {
  parseImageFilterParam,
  readSvgSource,
  serializeImageFilterParam,
  type FilteredSvgCache,
  type FilteredSvgFile,
} from "../filters/filteredSvg";
import { filterSVG } from "../compiler/utils/filterSVG";
import { hashText } from "./hash";
import { parseMorphRecipe } from "./recipe";
import type { MorphBakeService } from "./service";
import { MORPH_BAKE_FORMAT, type MorphArtifact, type MorphRecipe } from "./types";

/**
 * Artifacts a persistent cache keeps. Cache Storage lists entries oldest
 * first, so the oldest go past this. A starting bound, like the service's.
 */
export const MORPH_ARTIFACT_CACHE_ENTRIES = 256;

export interface MorphAssetRequest {
  selection: Record<string, string>;
  canonicalSelection: string;
  recipe: MorphRecipe;
  recipeText: string;
  /** The reference's identity, written onto the served artifact. */
  key: string;
  output: "artifact" | "rest";
}

/**
 * Reads a morph request from a URL's query, `undefined` when it is not one
 * and `"invalid"` when it is one this build cannot read.
 */
export function parseMorphAssetRequest(params: URLSearchParams): MorphAssetRequest | "invalid" | undefined {
  const recipeText = params.get("morph");
  if (recipeText === null) return undefined;
  const recipe = parseMorphRecipe(recipeText);
  const selection = parseImageFilterParam(params.get("attributes") ?? "{}");
  const canonicalSelection = selection ? serializeImageFilterParam(selection) : undefined;
  const key = params.get("key") ?? "";
  if (!recipe || !selection || canonicalSelection === undefined || !key) return "invalid";
  return {
    selection,
    canonicalSelection,
    recipe,
    recipeText,
    key,
    output: params.get("morph_output") === "rest" ? "rest" : "artifact",
  };
}

const respond = (body: string, type: string, status = 200) =>
  new Response(body, {
    status,
    headers: new Headers({
      "Content-Type": type,
      "Cache-Control": status === 200 ? "max-age=31536000, immutable" : "no-store",
    }),
  });

const output = (artifact: MorphArtifact, request: MorphAssetRequest) =>
  request.output === "rest"
    ? respond(artifact.rest, "image/svg+xml")
    : respond(JSON.stringify({ ...artifact, key: request.key }), "application/json");

/**
 * The response for one morph request on one file. The cache key is the
 * content itself (the file's digest, the canonical selection, the recipe and
 * the bake format), never the request URL, so a renamed reference or a stale
 * cache-buster cannot reach a different artifact. Cache Storage failures cost
 * the hit and nothing else; a bake that throws answers the rest render with
 * the plain filtered SVG and the artifact with an error status, both of which
 * leave the consumer on its static render.
 */
export async function serveMorphAsset(options: {
  service: MorphBakeService;
  cache?: FilteredSvgCache;
  path: string;
  file: FilteredSvgFile;
  request: MorphAssetRequest;
  uri?: string;
  keyPrefix?: string;
}): Promise<Response> {
  const { service, cache, path, file, request } = options;
  let source: { text: string; digest: string };
  try {
    source = await readSvgSource(file);
  } catch {
    return respond(JSON.stringify({ error: "The artwork could not be read." }), "application/json", 404);
  }
  const identity = hashText(JSON.stringify([MORPH_BAKE_FORMAT, source.digest, request.canonicalSelection, request.recipeText]));
  // One consumer is a file, a selection and a morph: a new signature or a new
  // recipe for it supersedes the last, while another morph playing on the
  // same variant keeps its own entry.
  const variantPrefix = `${options.keyPrefix ?? ""}${path}?morph=${hashText(JSON.stringify([request.canonicalSelection, request.recipe.name]))}&`;
  const cacheKey = `${variantPrefix}recipe=${hashText(request.recipeText)}&sig=${file.lastModified}-${file.size}&content=${source.digest}&bf=${MORPH_BAKE_FORMAT}`;
  try {
    const cached = await cache?.match(cacheKey);
    if (cached) {
      const artifact = (await cached.json()) as MorphArtifact;
      return output(artifact, request);
    }
  } catch {
    // An unreadable cache is a miss.
  }
  let handle;
  try {
    handle = await service.request(identity, async () => ({
      kind: "bake",
      input: {
        source: source.text,
        selection: request.selection,
        recipe: request.recipe,
        key: identity,
        ...(options.uri === undefined ? {} : { uri: options.uri }),
      },
      source: source.digest,
      ...(options.uri === undefined ? {} : { uri: options.uri }),
    }));
  } catch {
    if (request.output === "rest") return respond(filterSVG(source.text, request.selection), "image/svg+xml");
    return respond(JSON.stringify({ error: "The morph could not be baked." }), "application/json", 500);
  }
  const artifact = handle.artifact;
  handle.release();
  if (cache) {
    void (async () => {
      try {
        await cache.put(cacheKey, respond(JSON.stringify(artifact), "application/json"));
        // Older signatures and recipes of this consumer are superseded by the
        // new one; past the bound, the oldest entries go too.
        const keys = await cache.keys();
        const superseded = keys.filter((req) => req.url.includes(variantPrefix) && !req.url.endsWith(cacheKey));
        const rest = keys.filter((req) => !superseded.includes(req));
        const overflow = rest.slice(0, Math.max(0, rest.length - MORPH_ARTIFACT_CACHE_ENTRIES)).filter((req) => !req.url.endsWith(cacheKey));
        await Promise.all([...superseded, ...overflow].map((req) => cache.delete(req.url)));
      } catch {
        // Housekeeping only.
      }
    })();
  }
  return output(artifact, request);
}
