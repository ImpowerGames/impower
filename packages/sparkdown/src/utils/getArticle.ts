import VOCABULARY from "../constants/VOCABULARY";

const getArticle = (str: string, capitalize?: boolean): string => {
  if (!str[0]) {
    return "";
  }
  const articles = capitalize
    ? VOCABULARY.capitalizedArticles
    : VOCABULARY.lowercaseArticles;
  return VOCABULARY.vowels.includes(str[0])
    ? articles[0] || ""
    : articles[1] || "";
};

export default getArticle;
