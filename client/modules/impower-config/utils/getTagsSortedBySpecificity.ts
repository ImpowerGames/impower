import ConfigCache from "../classes/configCache";

export const getTagsSortedBySpecificity = (tags: string[]): string[] => {
  const projectTags = ConfigCache.instance.params?.projectTags;
  const archetypes = ConfigCache.instance.params?.archetypes || [];
  const moods = Object.values(ConfigCache.instance.params?.moods || []).flatMap(
    (x) => x.flatMap((y) => y)
  );
  const specificMechanics =
    projectTags.Mechanics[0] || projectTags.Mechanics[1];
  const generalMechanics = projectTags.Mechanics.slice(2).flatMap((c) => c);
  const specificGenres = projectTags.Genres[0];
  const generalGenres = projectTags.Genres.slice(1).flatMap((c) => c);
  const specificSubjects = projectTags.Subjects[0];
  const generalSubjects = projectTags.Subjects.slice(1).flatMap((c) => c);
  const specificAesthetics = projectTags.Aesthetics[0];
  const generalAesthetics = projectTags.Aesthetics.slice(1).flatMap((c) => c);
  // Prefer titles that are more relevant to specific subjects, aesthetics, and genres
  const beforeTags = [
    ...moods.filter((t) => tags?.includes(t)),
    ...specificAesthetics.filter((t) => tags?.includes(t)),
    ...specificSubjects.filter((t) => tags?.includes(t)),
    ...specificGenres.filter((t) => tags?.includes(t)),
    ...specificMechanics.filter((t) => tags?.includes(t)),
    ...generalSubjects.filter((t) => tags?.includes(t)),
    ...generalMechanics.filter((t) => tags?.includes(t)),
    ...generalGenres.filter((t) => tags?.includes(t)),
    ...generalAesthetics.filter((t) => tags?.includes(t)),
  ];
  const afterTags = [...archetypes.filter((t) => tags?.includes(t))];
  return Array.from(
    new Set([
      ...beforeTags,
      ...tags.filter((t) => !beforeTags.includes(t) && !afterTags.includes(t)),
      ...afterTags,
    ])
  );
};
