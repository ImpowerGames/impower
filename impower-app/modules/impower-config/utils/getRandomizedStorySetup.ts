import { getValidTags } from "./getValidTags";

export const getRandomizedStorySetup = async (
  catalysts?: string[],
  personalities?: string[],
  emotions?: string[],
  descriptors?: string[],
  archetypes?: string[],
  recentlyRandomizedCatalysts?: string[],
  recentlyRandomizedMoods?: string[],
  recentlyRandomizedArchetypes?: string[],
  lockedTags?: string[]
): Promise<string[]> => {
  const moods = [...personalities, ...descriptors];
  let validCatalystTags = getValidTags(
    catalysts,
    recentlyRandomizedCatalysts,
    lockedTags
  );
  let validMoodTags = getValidTags(moods, recentlyRandomizedMoods, lockedTags);
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
  if (validMoodTags.length === 0) {
    recentlyRandomizedMoods.length = 0;
    validMoodTags = getValidTags(moods, recentlyRandomizedMoods, lockedTags);
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
    ...sample(validMoodTags, 1),
    ...sample(validArchetypeTags, 1),
  ];
  recentlyRandomizedCatalysts.push(newRandomizedTags[0]);
  recentlyRandomizedMoods.push(newRandomizedTags[1]);
  recentlyRandomizedArchetypes.push(newRandomizedTags[2]);
  return newRandomizedTags;
};
