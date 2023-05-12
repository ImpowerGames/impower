import phrases from "../input/phrases.json";
import terms from "../output/terms.json";
import { getCuratedPhrases } from "../utils/getCuratedPhrases";

const randomTestPhrase = process.argv[2] ? process.argv[2] : undefined;

const curatedPhrases = getCuratedPhrases(phrases, terms, randomTestPhrase);

const incompatibleTags = [
  [
    ["love", "marriage"],
    ["family", "raising", "young"],
  ],
  [["coming-of-age", "academia"], ["shooter"]],
];

Object.entries(curatedPhrases).forEach(([phrase, phraseTags]) => {
  let moderatedPhraseTags: string[] = phraseTags;
  incompatibleTags.forEach((lists) => {
    const incompatiblePhraseTags = lists.map((list) =>
      list.filter((incompatibleTag) => phraseTags.includes(incompatibleTag))
    );
    const incompatibleCounts = incompatiblePhraseTags.map(
      (lists) => lists.length
    );
    if (incompatibleCounts.filter((count) => count > 0).length > 1) {
      const mainIncompatibleTags = lists.flatMap((x) => x);
      moderatedPhraseTags = moderatedPhraseTags.filter(
        (t) => !mainIncompatibleTags.includes(t)
      );
    }
  });
  if (phraseTags.length !== moderatedPhraseTags.length) {
    console.log(
      "POSSIBLY INAPPROPRIATE",
      phrase,
      phraseTags.filter((t) => !moderatedPhraseTags.includes(t))
    );
  }
});
