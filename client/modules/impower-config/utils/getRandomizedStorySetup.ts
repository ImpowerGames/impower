import { getValidTags } from "./getValidTags";

export const getRandomizedStorySetup = async (
  catalysts?: string[],
  personalities?: string[],
  archetypes?: string[],
  recentlyRandomizedCatalysts?: string[],
  recentlyRandomizedPersonalities?: string[],
  recentlyRandomizedArchetypes?: string[],
  lockedTags?: string[]
): Promise<string[]> => {
  let validCatalystTags = getValidTags(
    catalysts,
    lockedTags,
    recentlyRandomizedCatalysts
  );
  let validPersonalityTags = getValidTags(
    personalities,
    lockedTags,
    recentlyRandomizedPersonalities
  );
  let validArchetypeTags = getValidTags(
    archetypes,
    lockedTags,
    recentlyRandomizedArchetypes
  );
  if (validCatalystTags.length === 0) {
    recentlyRandomizedCatalysts.length = 0;
    validCatalystTags = getValidTags(
      catalysts,
      lockedTags,
      recentlyRandomizedCatalysts
    );
  }
  if (validPersonalityTags.length === 0) {
    recentlyRandomizedPersonalities.length = 0;
    validPersonalityTags = getValidTags(
      personalities,
      lockedTags,
      recentlyRandomizedPersonalities
    );
  }
  if (validArchetypeTags.length === 0) {
    recentlyRandomizedArchetypes.length = 0;
    validArchetypeTags = getValidTags(
      archetypes,
      lockedTags,
      recentlyRandomizedArchetypes
    );
  }
  const sample = (await import("../../impower-core/utils/sample")).default;
  const newRandomizedTags = [
    ...sample(validCatalystTags, 1),
    ...sample(validPersonalityTags, 1),
    ...sample(validArchetypeTags, 1),
  ];
  return newRandomizedTags;
};
