import getArticle from "./getArticle";

const prefixWithArticle = (str: string, capitalize?: boolean): string => {
  const article = getArticle(str, capitalize);
  if (!article) {
    return str;
  }
  return `${article} ${str}`;
};

export default prefixWithArticle;
