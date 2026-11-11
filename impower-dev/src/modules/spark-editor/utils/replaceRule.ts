import { assetTypeOfEnding, endingOf, type AssetEndings, type AssetType } from "./assetTypes";

export type Replacement = { path: string } | { refused: string };

const KINDS: Record<AssetType, string> = {
  image: "an image",
  audio: "a sound",
  video: "a video",
  text: "a text file",
  font: "a font",
  other: "a file of another kind",
};

const leafOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export const replacementOf = (
  target: { path: string; type: AssetType; link?: boolean },
  chosen: string,
  endings: AssetEndings,
): Replacement => {
  if (target.link) {
    return { refused: `${leafOf(target.path)} is a link, so it has no file to replace. Change its address instead.` };
  }
  const chosenType = assetTypeOfEnding(endingOf(chosen), endings);
  if (chosenType !== target.type) {
    return {
      refused: `${leafOf(chosen)} is ${KINDS[chosenType]}, and ${leafOf(target.path)} is ${KINDS[target.type]}. Choose ${KINDS[target.type]} to replace it.`,
    };
  }
  return { path: target.path };
};
