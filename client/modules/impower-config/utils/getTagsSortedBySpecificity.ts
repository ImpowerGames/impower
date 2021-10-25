import ConfigCache from "../classes/configCache";

export const getTagsSortedBySpecificity = (tags: string[]): string[] => {
  const gameTags = ConfigCache.instance.params?.gameTags;
  const specificMechanics = gameTags.Mechanics[0];
  const generalMechanics = gameTags.Mechanics.slice(1).flatMap((c) => c);
  const specificGenres = gameTags.Genres[0];
  const generalGenres = gameTags.Genres.slice(1).flatMap((c) => c);
  const specificSubjects = gameTags.Subjects[0];
  const generalSubjects = gameTags.Subjects.slice(1).flatMap((c) => c);
  const specificAesthetics = gameTags.Aesthetics[0];
  const generalAesthetics = gameTags.Aesthetics.slice(1).flatMap((c) => c);
  // Prefer titles that are more relevant to specific subjects, aesthetics, and genres
  return [
    ...specificAesthetics.filter((t) => tags?.includes(t)),
    ...specificSubjects.filter((t) => tags?.includes(t)),
    ...specificGenres.filter((t) => tags?.includes(t)),
    ...specificMechanics.filter((t) => tags?.includes(t)),
    ...generalSubjects.filter((t) => tags?.includes(t)),
    ...generalMechanics.filter((t) => tags?.includes(t)),
    ...generalGenres.filter((t) => tags?.includes(t)),
    ...generalAesthetics.filter((t) => tags?.includes(t)),
  ];
};
