import escapeURI from "./escapeURI";
import getRootCollection from "./getRootCollection";

const getSearchUrl = (docType: string, ...tags: string[]): string => {
  const encodedTags = tags.map((tag) => escapeURI(tag));
  let url = "/{page}?tag={tag}";
  url = url.replace("{page}", getRootCollection(docType).toLowerCase());
  url = url.replace("{tag}", encodedTags.join(","));
  return url;
};

export default getSearchUrl;
