import type { File } from "../compiler/types/File";
import { imageThingsOf, type ImagePicture } from "./imageFileName";
import type { AttributeDiagnostic } from "./types";
import { ATTRIBUTE_ROOT, buildAttributeVocabulary } from "./vocabulary";

const leafOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const hiddenNameOf = (uri: string) => `$raster:${uri}`;

const conflictingDefaults = (
  picture: ImagePicture,
  keys: Map<string, string>,
  diagnostic: AttributeDiagnostic,
  layers: { key: string; default: boolean; groups: string[] }[],
): AttributeDiagnostic[] => {
  const marked = layers.filter((layer) => layer.default && layer.groups.includes(diagnostic.group!));
  const files = marked.map((layer) => keys.get(layer.key)!);
  return marked.map((layer) => ({
    ...diagnostic,
    path: layer.key,
    message: `Picture "${picture.name}" marks more than one default for ${diagnostic.group}: ${files.join(", ")}. Keep ~default on one of them.`,
  }));
};

export const createBesideImageDefinitions = (
  files: readonly File[],
  overridden: (name: string) => boolean,
) => {
  const byUri = new Map<string, File>();
  for (const file of files) if (file.type === "image") byUri.set(file.uri, file);
  const images: Record<string, any> = Object.create(null);
  const layeredImages: Record<string, any> = Object.create(null);
  const diagnostics: { uri: string; message: string }[] = [];
  const layered: string[] = [];
  for (const thing of imageThingsOf(byUri.keys())) {
    for (const picture of thing.pictures) {
      if (!picture.layers.length) continue;
      layered.push(picture.name);
      if (overridden(picture.name)) continue;
      const members = [
        ...(picture.path === undefined ? [] : [{ path: picture.path, layer: "", base: true }]),
        ...picture.layers.map((layer) => ({ ...layer, base: false })),
      ];
      const assets: Record<string, any> = Object.create(null);
      const keys = new Map<string, string>();
      const inputs: { key: string; name: string }[] = [];
      const unnamed: AttributeDiagnostic[] = [];
      for (const member of members) {
        const leaf = leafOf(member.path);
        const key = Object.hasOwn(assets, leaf) ? member.path : leaf;
        const name = hiddenNameOf(member.path);
        images[name] = { ...byUri.get(member.path)!, $type: "image", $name: name };
        assets[key] = { $type: "image", $name: name };
        keys.set(key, leaf);
        inputs.push({ key, name: member.layer });
        if (!member.base && !member.layer) {
          unnamed.push({
            code: "invalid-layer-name",
            severity: "warning",
            path: key,
            layer: "",
            message: `Layer file "${leaf}" has no name after the ~. Name the layer, as in ${picture.name}~blush.png or ${picture.name}~face.happy.png.`,
          });
        }
      }
      const vocabulary = buildAttributeVocabulary(inputs);
      vocabulary.diagnostics.push(...unnamed);
      const layers = vocabulary.layers.map((layer) => ({
        key: layer.key,
        default: layer.parsed.default,
        groups: layer.parsed.conditions.map((condition) => condition.group),
      }));
      vocabulary.diagnostics = vocabulary.diagnostics.flatMap((diagnostic) =>
        diagnostic.code === "conflicting-defaults" && diagnostic.path === ATTRIBUTE_ROOT
          ? conflictingDefaults(picture, keys, diagnostic, layers)
          : [diagnostic],
      );
      vocabulary.defaultsOptional = true;
      layeredImages[picture.name] = {
        $type: "layered_image",
        $name: picture.name,
        uri: members[0]!.path,
        assets,
        attribute_vocabulary: vocabulary,
      };
      if (picture.unnumbered.length) {
        const unnumbered = picture.unnumbered.map(leafOf);
        const example = unnumbered[0]!.replace("~", "~10_");
        for (const uri of picture.unnumbered) {
          diagnostics.push({
            uri,
            message: `Picture "${picture.name}" mixes numbered and unnumbered layers. ${unnumbered.join(", ")} ${unnumbered.length === 1 ? "has" : "have"} no stacking number, so ${unnumbered.length === 1 ? "it stacks" : "they stack"} below the numbered layers. Number every layer, as in ${example}, or none.`,
          });
        }
      }
    }
  }
  return { images, layeredImages, layered, diagnostics };
};
