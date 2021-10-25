import { DateAge } from "../types/enums/dateAge";
import getAnyTagsQuery from "./getAnyTagsQuery";
import getDateQuery from "./getDateQuery";
import normalizeAll from "./normalizeAll";

const getFilterQuery = (options: {
  tags?: string[];
  age?: DateAge;
}): string[] => {
  const { tags, age } = options;

  if (tags && age) {
    const normalizedTags = normalizeAll(tags);
    const dateQuery = getDateQuery(age);
    return normalizedTags.map((t) => `${t} ${dateQuery}`);
  }

  if (tags) {
    return getAnyTagsQuery(tags);
  }

  if (age) {
    return [getDateQuery(age)];
  }

  return [];
};

export default getFilterQuery;
