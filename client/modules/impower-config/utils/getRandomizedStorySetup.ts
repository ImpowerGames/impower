import ConfigCache from "../classes/configCache";
import { getValidTags } from "./getValidTags";

export const getRandomizedStorySetup = async (
  recentlyRandomizedTags?: string[],
  lockedTags?: string[]
): Promise<string[]> => {
  const catalysts = ConfigCache.instance.params?.catalysts || [];
  const personalities =
    ConfigCache.instance.params?.moods?.personality?.flatMap((x) => x) || [];
  const archetypes = ConfigCache.instance.params?.archetypes || [];
  const validCatalystTags = getValidTags(
    catalysts,
    lockedTags,
    recentlyRandomizedTags
  );
  const validPersonalityTags = getValidTags(
    personalities,
    lockedTags,
    recentlyRandomizedTags
  );
  const validArchetypeTags = getValidTags(
    archetypes,
    lockedTags,
    recentlyRandomizedTags
  );
  if (validCatalystTags.length === 0) {
    return undefined;
  }
  if (validPersonalityTags.length === 0) {
    return undefined;
  }
  if (validArchetypeTags.length === 0) {
    return undefined;
  }
  const sample = (await import("../../impower-core/utils/sample")).default;
  const newRandomizedTags = [
    ...sample(validCatalystTags, 1),
    ...sample(validPersonalityTags, 1),
    ...sample(validArchetypeTags, 1),
  ];
  return newRandomizedTags;
};
