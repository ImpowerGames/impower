import { filterImage } from "../compiler/utils/filterImage";
import { resolveImageLayers, type ImageLayer } from "../compiler/utils/resolveImageLayers";
import { morphRefsForStruct, shownLook, shownLookStruct, speechMorphsForStruct } from "./channel";
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

export interface PictureLook {
  struct: any;
  root?: any;
  pick?: string;
  refs: MorphRef[];
  conflict?: "layers" | "overlap";
  plays: boolean;
  artwork?: LayeredMorphArtwork;
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
}

const decide = (pick: LookPick | undefined, layer: ImageLayer) => (typeof pick === "function" ? pick(layer) : pick);

export function resolvePictureLook(
  context: Context | undefined,
  channel: MorphProgramChannel | undefined,
  struct: any,
  options: PictureLookOptions = {},
): PictureLook {
  const { pick, startPose } = options;
  const visible = resolveImageLayers(context, struct);
  const root = layeredMorphRoot(context, struct);
  const artwork = root ? layeredMorphArtwork(context, root) : undefined;
  const picture: ImageLayer = { src: "", struct };
  const children: ImageLayer[] = artwork ? artwork.files.map((file) => ({ src: file.src, struct: file.struct })) : visible;
  const picturePick = decide(pick, picture);
  const decisions = [picturePick, ...visible.map((layer) => decide(pick, layer))];
  if (!context || !channel) {
    const layers = visible.map((layer) => ({ ...layer, refs: [] }));
    return {
      struct,
      ...(root ? { root } : {}),
      ...(picturePick === undefined ? {} : { pick: picturePick }),
      refs: [],
      plays: false,
      ...(artwork ? { artwork } : {}),
      layers,
      rest: visible,
      ...(startPose ? { start: visible } : {}),
      empty: visible.length === 0,
      decisions,
      speech: [],
    };
  }
  const refsOf = (layer: ImageLayer) => (layer.struct ? morphRefsForStruct(context, channel, layer.struct, decide(pick, layer)) : []);
  const layers: LookLayer[] = visible.map((layer) => {
    const layerPick = decide(pick, layer);
    return { ...layer, ...(layerPick === undefined ? {} : { pick: layerPick }), refs: refsOf(layer) };
  });
  const refs = root ? morphRefsForStruct(context, channel, struct, picturePick) : [];
  const conflict =
    refs.length === 0 ? undefined : children.some((child) => refsOf(child).length > 0) ? ("layers" as const) : refs.length > 1 ? ("overlap" as const) : undefined;
  const plays = refs.length === 1 && !conflict && !!artwork;
  const posed = (poseOf: LookPose): ShownLayer[] => {
    if (plays) {
      const look = shownLook(context, channel, struct, poseOf, picturePick);
      if (!look?.attributes.length) return visible;
      const lookStruct =
        struct?.$type === "filtered_image"
          ? { ...struct, attributes: [...(Array.isArray(struct.attributes) ? struct.attributes : []), ...look.attributes] }
          : shownLookStruct(struct, look.attributes);
      return resolveImageLayers(context, lookStruct).map((layer) => ({ ...layer, shown: true as const }));
    }
    return layers.map(({ pick: layerPick, refs: _refs, ...layer }) => {
      const look = layer.struct ? shownLook(context, channel, layer.struct, poseOf, layerPick) : undefined;
      if (!look?.attributes.length) return layer;
      const src = filterImage(context, shownLookStruct(layer.struct, look.attributes)).src;
      return src ? { ...layer, src, shown: true as const } : layer;
    });
  };
  const rest = posed(morphRestPose);
  const speech = new Set<string>();
  for (const candidate of [picture, ...visible]) {
    if (candidate.struct) for (const name of speechMorphsForStruct(context, channel, candidate.struct)) speech.add(name);
  }
  return {
    struct,
    ...(root ? { root } : {}),
    ...(picturePick === undefined ? {} : { pick: picturePick }),
    refs,
    ...(conflict ? { conflict } : {}),
    plays,
    ...(artwork ? { artwork } : {}),
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
