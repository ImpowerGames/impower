import { ProjectType } from "../../impower-data-store";
import ConfigCache from "../classes/configCache";
import { getRequiredTagCounts } from "./getRequiredTagCounts";
import { getValidTags } from "./getValidTags";

export const getRandomizableTags = (
  type?: ProjectType
): {
  mechanics: string[];
  genres: string[];
  aesthetics: string[];
  subjects: string[];
  moods: string[];
  archetypes: string[];
} => {
  const projectTags = ConfigCache.instance.params?.projectTags;
  const moods = Object.values(ConfigCache.instance.params?.moods || []).flatMap(
    (x) => x.flatMap((y) => y)
  );
  const archetypes = ConfigCache.instance.params?.archetypes || [];
  if (!projectTags) {
    return {
      mechanics: [],
      genres: [],
      aesthetics: [],
      subjects: [],
      moods: [],
      archetypes: [],
    };
  }
  const aiMechanicTags =
    type === "game"
      ? [
          ...projectTags.Mechanics[0],
          ...projectTags.Mechanics[1],
          ...projectTags.Mechanics[2],
        ]
      : type === "character"
      ? [
          ...projectTags.Mechanics.flatMap((x) => x).filter(
            (x) => !archetypes.includes(x) && !moods.includes(x)
          ),
        ]
      : [];
  const aiGenreTags =
    type === "character"
      ? [
          ...projectTags.Genres.flatMap((x) => x).filter(
            (x) => !archetypes.includes(x) && !moods.includes(x)
          ),
        ]
      : [...projectTags.Genres[0], ...projectTags.Genres[1]];
  const aiAestheticTags =
    type === "character"
      ? [
          ...projectTags.Aesthetics.flatMap((x) => x).filter(
            (x) => !archetypes.includes(x) && !moods.includes(x)
          ),
        ]
      : [...projectTags.Aesthetics[0], ...projectTags.Aesthetics[1]];
  const aiSubjectTags =
    type === "game"
      ? [...projectTags.Subjects[0], ...projectTags.Subjects[1]]
      : type === "story"
      ? [...projectTags.Mechanics[0], ...projectTags.Subjects.flatMap((x) => x)]
      : type === "character"
      ? [
          ...projectTags.Subjects.flatMap((x) => x).filter(
            (x) => !archetypes.includes(x) && !moods.includes(x)
          ),
        ]
      : [];
  const aiMoodTags = type === "character" ? [...moods] : [];
  const aiArchetypeTags = type === "character" ? [...archetypes] : [];

  return {
    mechanics: aiMechanicTags,
    genres: aiGenreTags,
    aesthetics: aiAestheticTags,
    subjects: aiSubjectTags,
    moods: aiMoodTags,
    archetypes: aiArchetypeTags,
  };
};

export const getRandomizedTags = async (
  tagCount: number,
  recentlyRandomizedTags?: string[],
  lockedTags?: string[],
  type?: ProjectType
): Promise<string[]> => {
  const requiredCounts = getRequiredTagCounts(tagCount, type);
  const randomizableTags = getRandomizableTags(type);
  const randomOtherTags = [];
  const newRandomizedTags = [];
  const sample = (await import("../../impower-core/utils/sample")).default;
  Object.entries(randomizableTags).forEach(([type, tags]) => {
    const requiredCount = requiredCounts[type];
    const lockedCount = lockedTags.filter((tag) => tags.includes(tag)).length;
    const randomCount =
      requiredCount !== null ? requiredCount - lockedCount : null;
    let validTags = getValidTags(tags, recentlyRandomizedTags, lockedTags);
    if (randomCount !== null && randomCount !== undefined) {
      if (randomCount > validTags.length) {
        recentlyRandomizedTags.length = 0;
        validTags = getValidTags(tags, recentlyRandomizedTags, lockedTags);
      }
      if (requiredCount < 1) {
        randomOtherTags.push(...tags);
      }
      if (randomCount > 0) {
        newRandomizedTags.push(...sample(validTags, randomCount));
      }
    }
  });
  let validOtherTags = getValidTags(
    randomOtherTags,
    recentlyRandomizedTags,
    lockedTags
  );
  if (randomOtherTags.length > validOtherTags.length) {
    recentlyRandomizedTags.length = 0;
    validOtherTags = getValidTags(
      randomOtherTags,
      recentlyRandomizedTags,
      lockedTags
    );
  }
  if (randomOtherTags.length > 0) {
    newRandomizedTags.push(...sample(validOtherTags));
  }
  newRandomizedTags.forEach((t) => {
    recentlyRandomizedTags.push(t);
  });
  return newRandomizedTags;
};
