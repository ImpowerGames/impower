import { getPhrasesSortedByLength } from "../utils/getPhrasesSortedByLength";

const getPersonalizedPhraseTagsMap = (
  phraseTagsMap: { [phrase: string]: string[] },
  additionsMap?: { [phrase: string]: string[] },
  deletionsMap?: { [phrase: string]: string[] }
): {
  [tag: string]: string[];
} => {
  const personalizedTags: { [phrase: string]: string[] } = {};

  const phrases = Object.keys(phraseTagsMap);
  const addedPhrases = additionsMap ? Object.keys(additionsMap) : [];
  const deletedPhrases = deletionsMap
    ? Object.keys(deletionsMap).filter(
        (phrase) => deletionsMap[phrase]?.length === 0
      )
    : [];

  const personalizedPhrases = [...addedPhrases, ...phrases];
  const sortedPersonalizedPhrases = getPhrasesSortedByLength(
    personalizedPhrases.filter((p) => !deletedPhrases.includes(p))
  );

  sortedPersonalizedPhrases.forEach((phrase) => {
    const phraseDeletedTags = deletionsMap?.[phrase];
    const phraseAddedTags = additionsMap?.[phrase] || [];
    const currentTags = phraseTagsMap?.[phrase] || [];
    const blacklistedTags = phraseDeletedTags;
    const associatedTags = [...currentTags, ...phraseAddedTags];
    const tags =
      blacklistedTags && Array.isArray(blacklistedTags)
        ? associatedTags.filter((t) => !blacklistedTags.includes(t))
        : associatedTags;
    if (!personalizedTags[phrase]) {
      personalizedTags[phrase] = [];
    }
    if (tags) {
      personalizedTags[phrase]?.push(...tags);
    }
  });

  return personalizedTags;
};

export default getPersonalizedPhraseTagsMap;
