import normalizeAll from "./normalizeAll";

const getSearchedTerms = (search: string): string[] => {
  if (!search) {
    return [];
  }
  return normalizeAll(search.trim().split(/\s*[#,]\s*/));
};

export default getSearchedTerms;
