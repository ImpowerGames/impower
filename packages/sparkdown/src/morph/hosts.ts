// Host adapters: how each host turns a compact reference into an artifact.
// A reference with `src` names an asset service that bakes (the web service
// worker); without one the host reads the artwork itself and bakes in
// process. Either way the request goes through one `MorphBakeService`, so
// coalescing, caching and cancellation behave the same on every host.

import { decodeSVGSource } from "../attributes";
import { hashText } from "./hash";
import { own } from "./own";
import { parseMorphRecipe } from "./recipe";
import type { MorphBakeService, MorphHandle, MorphLoad } from "./service";
import { MORPH_BAKE_FORMAT, type MorphArtifact, type MorphProgramChannel, type MorphRecipe, type MorphRef } from "./types";

export interface MorphHost {
  /** The artifact for `ref`, from cache or freshly baked; release the handle when done. */
  resolve(ref: MorphRef, options?: { signal?: AbortSignal }): Promise<MorphHandle>;
}

/** Artwork text for a reference, and the URI diagnostics belong to. */
export type MorphSourceReader = (
  ref: MorphRef,
  signal: AbortSignal,
) => Promise<{ text: string; uri?: string } | undefined>;

type Context = { [type: string]: { [name: string]: any } };

/**
 * Reads the artwork the program carries inline (`image.data`), as VS Code,
 * the language server and local compiles do.
 */
export const inlineMorphSource = (context: () => Context | undefined): MorphSourceReader => async (ref) => {
  const image = own(context()?.["image"], ref.image);
  const data = image?.data;
  if (typeof data !== "string" || !data) return undefined;
  return { text: decodeSVGSource(data), ...(typeof image.uri === "string" ? { uri: image.uri } : {}) };
};

/**
 * Fetches the artwork from the root image's `src`, for players whose assets
 * are served as files with no baking asset service in front of them.
 */
export const fetchedMorphSource = (
  context: () => Context | undefined,
  fetcher: (url: string, init: { signal: AbortSignal }) => Promise<Response> = (url, init) => fetch(url, init),
): MorphSourceReader => async (ref, signal) => {
  const image = own(context()?.["image"], ref.image);
  const src = image?.src;
  if (typeof src !== "string" || !src) return undefined;
  const response = await fetcher(src, { signal });
  if (!response.ok) return undefined;
  return { text: await response.text(), ...(typeof image.uri === "string" ? { uri: image.uri } : {}) };
};

/** Whether `value` has the shape of an artifact this build can play. */
export function isMorphArtifact(value: unknown): value is MorphArtifact {
  if (!value || typeof value !== "object") return false;
  const a = value as Partial<MorphArtifact>;
  return (
    a.format === MORPH_BAKE_FORMAT &&
    typeof a.key === "string" &&
    (a.status === "live" || a.status === "static") &&
    typeof a.rest === "string" &&
    Array.isArray(a.parts) &&
    Array.isArray(a.segments)
  );
}

export interface MorphHostOptions {
  service: MorphBakeService;
  /** The program's morph channel; read on every request so a new program takes effect. */
  channel: () => MorphProgramChannel | undefined;
  /** Reads artwork for references without `src`. */
  readSource?: MorphSourceReader;
  /** Fetches `src` from the asset service; references with `src` need it. */
  fetch?: (url: string, init: { signal: AbortSignal }) => Promise<Response>;
}

const recipeCache = new Map<string, MorphRecipe | undefined>();
const recipeFor = (text: string): MorphRecipe | undefined => {
  if (!recipeCache.has(text)) {
    if (recipeCache.size >= 64) recipeCache.clear();
    recipeCache.set(text, parseMorphRecipe(text));
  }
  return recipeCache.get(text);
};

/** The host every adapter above plugs into. */
export function createMorphHost(options: MorphHostOptions): MorphHost {
  const load = (ref: MorphRef) => async (signal: AbortSignal): Promise<MorphLoad> => {
    if (ref.src && options.fetch) {
      const response = await options.fetch(ref.src, { signal });
      if (!response.ok) throw new Error(`The asset service answered ${response.status} for ${ref.morph}.`);
      const artifact: unknown = await response.json();
      if (!isMorphArtifact(artifact)) throw new Error(`The asset service's ${ref.morph} artifact is not one this player can read.`);
      return { kind: "artifact", artifact: { ...artifact, key: ref.key } };
    }
    const text = own(options.channel()?.recipes, ref.morph);
    const recipe = text === undefined ? undefined : recipeFor(text);
    if (!recipe) throw new Error(`The program has no recipe for \`${ref.morph}\`.`);
    const source = await options.readSource?.(ref, signal);
    if (!source) throw new Error(`The artwork for \`${ref.image}\` is not available to bake.`);
    let selection: Record<string, string>;
    try {
      selection = JSON.parse(ref.selection);
    } catch {
      selection = {};
    }
    return {
      kind: "bake",
      input: {
        source: source.text,
        selection,
        recipe,
        key: ref.key,
        variant: variantName(options.channel(), ref),
        ...(source.uri === undefined ? {} : { uri: source.uri }),
      },
      source: hashText(source.text),
      ...(source.uri === undefined ? {} : { uri: source.uri }),
    };
  };
  return {
    resolve: (ref, resolveOptions = {}) => options.service.request(ref.key, load(ref), resolveOptions),
  };
}

const variantName = (channel: MorphProgramChannel | undefined, ref: MorphRef): string => {
  for (const [name, refs] of Object.entries(channel?.variants ?? {})) {
    if (refs.some((r) => r.key === ref.key)) return name;
  }
  return ref.image;
};

export type MorphSlotState = "idle" | "pending" | "ready" | "failed";

/**
 * One consumer's view of one reference: static first, the artifact when it
 * is ready, the static render for good when it fails. Changing the reference
 * abandons the old request; a late result for a reference the slot no longer
 * holds is released unseen, so it can never attach to the wrong generation.
 */
export class MorphArtifactSlot {
  state: MorphSlotState = "idle";
  handle?: MorphHandle;
  error?: unknown;
  protected ref?: MorphRef;
  protected controller?: AbortController;

  constructor(
    protected host: MorphHost,
    protected onChange: (slot: MorphArtifactSlot) => void = () => {},
  ) {}

  get artifact(): MorphArtifact | undefined {
    return this.handle?.artifact;
  }

  /** Points the slot at `ref`, or clears it. The same key again changes nothing. */
  set(ref: MorphRef | undefined) {
    if (ref?.key === this.ref?.key) return;
    this.controller?.abort();
    this.controller = undefined;
    this.handle?.release();
    this.handle = undefined;
    this.error = undefined;
    this.ref = ref;
    if (!ref) {
      this.state = "idle";
      this.onChange(this);
      return;
    }
    const controller = new AbortController();
    this.controller = controller;
    this.state = "pending";
    this.onChange(this);
    this.host.resolve(ref, { signal: controller.signal }).then(
      (handle) => {
        if (this.controller !== controller || this.ref?.key !== handle.key) {
          handle.release();
          return;
        }
        this.controller = undefined;
        this.handle = handle;
        this.state = "ready";
        this.onChange(this);
      },
      (error) => {
        if (this.controller !== controller) return;
        this.controller = undefined;
        this.error = error;
        this.state = "failed";
        this.onChange(this);
      },
    );
  }

  dispose() {
    this.set(undefined);
  }
}
