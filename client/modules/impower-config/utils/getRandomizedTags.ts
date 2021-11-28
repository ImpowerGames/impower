import { ProjectType } from "../../impower-data-store";
import ConfigCache from "../classes/configCache";
import { getRequiredTagCounts } from "./getRequiredTagCounts";
import { getValidTags } from "./getValidTags";

export const getRandomizableTags = (
  type?: ProjectType
): {
  Mechanics: string[];
  Genres: string[];
  Aesthetics: string[];
  Subjects: string[];
} => {
  const projectTags = ConfigCache.instance.params?.projectTags;
  if (!projectTags) {
    return {
      Mechanics: [],
      Genres: [],
      Aesthetics: [],
      Subjects: [],
    };
  }
  const aiMechanicTags =
    type === "game"
      ? [
          ...projectTags.Mechanics[0],
          ...projectTags.Mechanics[1],
          ...projectTags.Mechanics[2],
        ]
      : [];
  const aiGenreTags = [...projectTags.Genres[0], ...projectTags.Genres[1]];
  const aiAestheticTags = [
    ...projectTags.Aesthetics[0],
    ...projectTags.Aesthetics[1],
  ];
  const aiSubjectTags =
    type === "game"
      ? [...projectTags.Subjects[0], ...projectTags.Subjects[1]]
      : type === "story"
      ? [
          ...projectTags.Mechanics[0],
          ...projectTags.Subjects[0],
          ...projectTags.Subjects[1],
        ]
      : [];

  return {
    Mechanics: aiMechanicTags.map((tag) => tag.toLowerCase()),
    Genres: aiGenreTags.map((tag) => tag.toLowerCase()),
    Aesthetics: aiAestheticTags.map((tag) => tag.toLowerCase()),
    Subjects: aiSubjectTags.map((tag) => tag.toLowerCase()),
  };
};

export const getRandomizedTags = async (
  tagCount: number,
  recentlyRandomizedTags?: string[],
  lockedTags?: string[],
  type?: ProjectType
): Promise<string[]> => {
  const {
    requiredMechanicCount,
    requiredGenreCount,
    requiredAestheticCount,
    requiredSubjectCount,
  } = getRequiredTagCounts(tagCount, type);
  const randomizableTags = getRandomizableTags(type);
  const lockedMechanicCount = lockedTags.filter((tag) =>
    randomizableTags.Mechanics.includes(tag)
  ).length;
  const lockedGenreCount = lockedTags.filter((tag) =>
    randomizableTags.Genres.includes(tag)
  ).length;
  const lockedAestheticCount = lockedTags.filter((tag) =>
    randomizableTags.Aesthetics.includes(tag)
  ).length;
  const lockedSubjectCount = lockedTags.filter((tag) =>
    randomizableTags.Subjects.includes(tag)
  ).length;
  const randomMechanicCount =
    requiredMechanicCount !== null
      ? requiredMechanicCount - lockedMechanicCount
      : null;
  const randomGenreCount =
    requiredGenreCount !== null ? requiredGenreCount - lockedGenreCount : null;
  const randomAestheticCount =
    requiredAestheticCount !== null
      ? requiredAestheticCount - lockedAestheticCount
      : null;
  const randomSubjectCount =
    requiredSubjectCount !== null
      ? requiredSubjectCount - lockedSubjectCount
      : null;
  const randomOtherTags = [];
  if (requiredMechanicCount < 1) {
    randomOtherTags.push(...randomizableTags.Mechanics);
  }
  if (requiredGenreCount < 1) {
    randomOtherTags.push(...randomizableTags.Genres);
  }
  if (requiredAestheticCount < 1) {
    randomOtherTags.push(...randomizableTags.Aesthetics);
  }
  if (requiredSubjectCount < 1) {
    randomOtherTags.push(...randomizableTags.Subjects);
  }
  const validMechanicTags = getValidTags(
    randomizableTags.Mechanics,
    recentlyRandomizedTags,
    lockedTags
  );
  const validGenreTags = getValidTags(
    randomizableTags.Genres,
    recentlyRandomizedTags,
    lockedTags
  );
  const validAestheticTags = getValidTags(
    randomizableTags.Aesthetics,
    recentlyRandomizedTags,
    lockedTags
  );
  const validSubjectTags = getValidTags(
    randomizableTags.Subjects,
    recentlyRandomizedTags,
    lockedTags
  );
  const validOtherTags = getValidTags(
    randomOtherTags,
    recentlyRandomizedTags,
    lockedTags
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
  if (randomSubjectCount > validSubjectTags.length) {
    return undefined;
  }
  if (randomOtherTags.length > validOtherTags.length) {
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
