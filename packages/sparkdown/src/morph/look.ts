import { filterImage, layeredImageShownKeys, resolveImageAttributes } from "../compiler/utils/filterImage";
import { resolveImageLayers, type ImageLayer } from "../compiler/utils/resolveImageLayers";
import { morphRefsForStruct, shownLook, shownLookStruct, speechMorphsForStruct, type ShownBefore } from "./channel";
import { layeredMorphArtwork, layeredMorphRoot, type LayeredMorphArtwork } from "./layered";
import { morphRestPose } from "./recipe";
import type { MorphProgramChannel, MorphRecipe, MorphRef } from "./types";

type Context = { [type: string]: { [name: string]: any } };

export type LookPick = string | ((layer: ImageLayer) => string | undefined);

export type LookPose = (recipe: MorphRecipe) => Record<string, string>;

export type ShownLayer = ImageLayer & { shown?: true };

export interface LookLayer extends ImageLayer {
  pick?: string;
  refs: MorphRef[];
}

export interface LookFile {
  pick?: string;
  refs: MorphRef[];
  rest?: number;
}

export interface PictureLook {
  struct: any;
  root?: any;
  pick?: string;
  refs: MorphRef[];
  conflict?: "overlap";
  plays: boolean;
  artwork?: LayeredMorphArtwork;
  files: LookFile[];
  layers: LookLayer[];
  rest: ShownLayer[];
  start?: ShownLayer[];
  empty: boolean;
  decisions: (string | undefined)[];
  speech: string[];
}

export interface PictureLookOptions {
  pick?: LookPick;
  startPose?: LookPose;
  from?: { struct: any; pick?: LookPick };
}

const decide = (pick: LookPick | undefined, layer: ImageLayer) => (typeof pick === "function" ? pick(layer) : pick);

export function resolvePictureLook(
  context: Context | undefined,
  channel: MorphProgramChannel | undefined,
  struct: any,
  options: PictureLookOptions = {},
): PictureLook {
  const { pick, startPose, from } = options;
  const visible = resolveImageLayers(context, struct);
  const root = layeredMorphRoot(context, struct);
  const artwork = root ? layeredMorphArtwork(context, root) : undefined;
  const picture: ImageLayer = { src: "", struct };
  const children: ImageLayer[] = artwork ? artwork.files.map((file) => ({ src: file.src, struct: file.struct })) : visible;
  const picturePick = decide(pick, picture);
  const decisions = [picturePick, ...visible.map((layer) => decide(pick, layer)), ...(artwork ? children.map((child) => decide(pick, child)) : [])];
  if (!context || !channel) {
    const layers = visible.map((layer) => ({ ...layer, refs: [] }));
    return {
      struct,
      ...(root ? { root } : {}),
      ...(picturePick === undefined ? {} : { pick: picturePick }),
      refs: [],
      plays: false,
      ...(artwork ? { artwork } : {}),
      files: artwork ? artwork.files.map(() => ({ refs: [] })) : [],
      layers,
      rest: visible,
      ...(startPose ? { start: visible } : {}),
      empty: visible.length === 0,
      decisions,
      speech: [],
    };
  }
  const before = from === undefined || root ? [] : resolveImageLayers(context, from.struct);
  const rootOf = (layer: any) => resolveImageAttributes(context, layer, { visibility: false }).image;
  const shownBefore = (layer: ImageLayer): ShownBefore => {
    const oldPick = decide(from?.pick, layer);
    return { struct: layer.struct, ...(oldPick === undefined ? {} : { pick: oldPick }) };
  };
  const fromOf = (layer: ImageLayer) => {
    const image = layer.struct ? rootOf(layer.struct) : undefined;
    const old = image ? before.find((entry) => entry.struct && rootOf(entry.struct) === image) : undefined;
    return old ? shownBefore(old) : undefined;
  };
  const pictureFrom = from === undefined ? undefined : shownBefore({ src: "", struct: from.struct });
  const refsOf = (layer: ImageLayer, changes = false) =>
    layer.struct ? morphRefsForStruct(context, channel, layer.struct, decide(pick, layer), changes ? fromOf(layer) : undefined) : [];
  const layers: LookLayer[] = visible.map((layer) => {
    const layerPick = decide(pick, layer);
    return { ...layer, ...(layerPick === undefined ? {} : { pick: layerPick }), refs: refsOf(layer, true) };
  });
  const files: LookFile[] = artwork
    ? children.map((child) => {
        const filePick = decide(pick, child);
        return { ...(filePick === undefined ? {} : { pick: filePick }), refs: refsOf(child) };
      })
    : [];
  const refs = root ? morphRefsForStruct(context, channel, struct, picturePick, pictureFrom) : [];
  const conflict = refs.length > 1 ? ("overlap" as const) : undefined;
  const plays = refs.length === 1 && !!artwork;
  const ownPosed = (layer: ShownLayer, poseOf: LookPose, layerPick: string | undefined): ShownLayer => {
    const look = layer.struct ? shownLook(context, channel, layer.struct, poseOf, layerPick, plays ? undefined : fromOf(layer)) : undefined;
    if (!look?.attributes.length) return layer;
    const src = filterImage(context, shownLookStruct(layer.struct, look.attributes)).src;
    return src ? { ...layer, src, shown: true as const } : layer;
  };
  const pictureLookStruct = (poseOf: LookPose) => {
    const look = shownLook(context, channel, struct, poseOf, picturePick, pictureFrom);
    if (!look?.attributes.length) return undefined;
    return struct?.$type === "filtered_image"
      ? { ...struct, attributes: [...(Array.isArray(struct.attributes) ? struct.attributes : []), ...look.attributes] }
      : shownLookStruct(struct, look.attributes);
  };
  const posed = (poseOf: LookPose): ShownLayer[] => {
    if (plays) {
      const lookStruct = pictureLookStruct(poseOf);
      const shown: ShownLayer[] = lookStruct ? resolveImageLayers(context, lookStruct).map((layer) => ({ ...layer, shown: true as const })) : visible;
      return shown.map((layer) => ownPosed(layer, poseOf, decide(pick, layer)));
    }
    return layers.map(({ pick: layerPick, refs: _refs, ...layer }) => ownPosed(layer, poseOf, layerPick));
  };
  const rest = posed(morphRestPose);
  if (plays && artwork) {
    const fileKeys = new Set(artwork.files.map((file) => file.key));
    const restKeys = (layeredImageShownKeys(context, pictureLookStruct(morphRestPose) ?? struct) ?? []).filter((key) => fileKeys.has(key));
    if (restKeys.length === rest.length) {
      artwork.files.forEach((file, index) => {
        const at = restKeys.indexOf(file.key);
        if (at >= 0) files[index]!.rest = at;
      });
    }
  }
  const speech = new Set<string>();
  const playsPicked = (name: string) => {
    const picked = morphRefsForStruct(context, channel, struct, name);
    return !!artwork && picked.length === 1 && picked[0]!.morphs.includes(name);
  };
  for (const name of speechMorphsForStruct(context, channel, struct)) {
    if (!root || playsPicked(name)) speech.add(name);
  }
  for (const layer of plays ? children : visible) {
    if (layer.struct) for (const name of speechMorphsForStruct(context, channel, layer.struct)) speech.add(name);
  }
  return {
    struct,
    ...(root ? { root } : {}),
    ...(picturePick === undefined ? {} : { pick: picturePick }),
    refs,
    ...(conflict ? { conflict } : {}),
    plays,
    ...(artwork ? { artwork } : {}),
    files,
    layers,
    rest,
    ...(startPose ? { start: startPose === morphRestPose ? rest : posed(startPose) } : {}),
    empty: rest.length === 0,
    decisions,
    speech: [...speech].sort(),
  };
}

export function shownImageLayers(
  context: Context | undefined,
  channel: MorphProgramChannel | undefined,
  struct: any,
  poseOf: LookPose = morphRestPose,
  pick?: LookPick,
): ShownLayer[] {
  if (poseOf === morphRestPose) return resolvePictureLook(context, channel, struct, { ...(pick === undefined ? {} : { pick }) }).rest;
  return resolvePictureLook(context, channel, struct, { ...(pick === undefined ? {} : { pick }), startPose: poseOf }).start!;
}
