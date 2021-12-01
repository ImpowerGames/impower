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
    recentlyRandomizedCatalysts,
    lockedTags
  );
  let validPersonalityTags = getValidTags(
    personalities,
    recentlyRandomizedPersonalities,
    lockedTags
  );
  let validArchetypeTags = getValidTags(
    archetypes,
    recentlyRandomizedArchetypes,
    lockedTags
  );
  if (validCatalystTags.length === 0) {
    recentlyRandomizedCatalysts.length = 0;
    validCatalystTags = getValidTags(
      catalysts,
      recentlyRandomizedCatalysts,
      lockedTags
    );
  }
  if (validPersonalityTags.length === 0) {
    recentlyRandomizedPersonalities.length = 0;
    validPersonalityTags = getValidTags(
      personalities,
      recentlyRandomizedPersonalities,
      lockedTags
    );
  }
  if (validArchetypeTags.length === 0) {
    recentlyRandomizedArchetypes.length = 0;
    validArchetypeTags = getValidTags(
      archetypes,
      recentlyRandomizedArchetypes,
      lockedTags
    );
  }
  const sample = (await import("../../impower-core/utils/sample")).default;
  const newRandomizedTags = [
    ...sample(validCatalystTags, 1),
    ...sample(validPersonalityTags, 1),
    ...sample(validArchetypeTags, 1),
  ];
  recentlyRandomizedCatalysts.push(newRandomizedTags[0]);
  recentlyRandomizedPersonalities.push(newRandomizedTags[1]);
  recentlyRandomizedArchetypes.push(newRandomizedTags[2]);
  return newRandomizedTags;
};
