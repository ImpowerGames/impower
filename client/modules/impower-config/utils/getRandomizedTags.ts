import ConfigCache from "../classes/configCache";
import { getRequiredTagCounts } from "./getRequiredTagCounts";
import { getValidTags } from "./getValidTags";

export const getRandomizedTags = async (
  tagCount: number,
  lockedTags: string[],
  recentlyRandomizedTags?: string[]
): Promise<string[]> => {
  const gameTags = ConfigCache.instance.params?.gameTags;
  if (!gameTags) {
    return [];
  }
  const {
    requiredMechanicCount,
    requiredGenreCount,
    requiredAestheticCount,
    requiredSubjectCount,
  } = getRequiredTagCounts(tagCount);
  const aiMechanicTags = [...gameTags.Mechanics[0], ...gameTags.Mechanics[1]];
  const aiGenreTags = [...gameTags.Genres[0], ...gameTags.Genres[1]];
  const aiAestheticTags = [
    ...gameTags.Aesthetics[0],
    ...gameTags.Aesthetics[1],
  ];
  const aiSubjectTags = [...gameTags.Subjects[0], ...gameTags.Subjects[1]];
  const normalizedMechanicTags = aiMechanicTags.map((tag) => tag.toLowerCase());
  const normalizedGenreTags = aiGenreTags.map((tag) => tag.toLowerCase());
  const normalizedAestheticTags = aiAestheticTags.map((tag) =>
    tag.toLowerCase()
  );
  const normalizedSubjectTags = aiSubjectTags.map((tag) => tag.toLowerCase());
  const lockedMechanicCount = lockedTags.filter((tag) =>
    normalizedMechanicTags.includes(tag)
  ).length;
  const lockedGenreCount = lockedTags.filter((tag) =>
    normalizedGenreTags.includes(tag)
  ).length;
  const lockedAestheticCount = lockedTags.filter((tag) =>
    normalizedAestheticTags.includes(tag)
  ).length;
  const lockedSubjectCount = lockedTags.filter((tag) =>
    normalizedSubjectTags.includes(tag)
  ).length;
  const randomMechanicCount = requiredMechanicCount - lockedMechanicCount;
  const randomGenreCount = requiredGenreCount - lockedGenreCount;
  const randomAestheticCount = requiredAestheticCount - lockedAestheticCount;
  const randomSubjectCount = requiredSubjectCount - lockedSubjectCount;
  const randomOtherTags = [];
  if (requiredMechanicCount < 1) {
    randomOtherTags.push(...normalizedMechanicTags);
  }
  if (requiredGenreCount < 1) {
    randomOtherTags.push(...normalizedGenreTags);
  }
  if (requiredAestheticCount < 1) {
    randomOtherTags.push(...normalizedAestheticTags);
  }
  if (requiredSubjectCount < 1) {
    randomOtherTags.push(...normalizedSubjectTags);
  }
  const validMechanicTags = getValidTags(
    normalizedMechanicTags,
    lockedTags,
    recentlyRandomizedTags
  );
  const validGenreTags = getValidTags(
    normalizedGenreTags,
    lockedTags,
    recentlyRandomizedTags
  );
  const validAestheticTags = getValidTags(
    normalizedAestheticTags,
    lockedTags,
    recentlyRandomizedTags
  );
  const validOtherTags = getValidTags(
    randomOtherTags,
    lockedTags,
    recentlyRandomizedTags
  );
  const validSubjectTags = getValidTags(
    normalizedSubjectTags,
    lockedTags,
    recentlyRandomizedTags
  );
  if (randomMechanicCount > validMechanicTags.length) {
    return undefined;
  }
  if (randomGenreCount > validGenreTags.length) {
    return undefined;
  }
  if (randomAestheticCount > validAestheticTags.length) {
    return undefined;
  }
  if (randomOtherTags.length > validOtherTags.length) {
    return undefined;
  }
  if (randomSubjectCount > validSubjectTags.length) {
    return undefined;
  }
  const sample = (await import("../../impower-core/utils/sample")).default;
  const newRandomizedTags = [
    ...(randomMechanicCount > 0
      ? sample(validMechanicTags, randomMechanicCount)
      : []),
    ...(randomGenreCount > 0 ? sample(validGenreTags, randomGenreCount) : []),
    ...(randomAestheticCount > 0
      ? sample(validAestheticTags, randomAestheticCount)
      : []),
    ...(randomOtherTags.length > 0 ? sample(validOtherTags) : []),
    ...(randomSubjectCount > 0
      ? sample(validSubjectTags, randomSubjectCount)
      : []),
  ];
  return newRandomizedTags;
};
