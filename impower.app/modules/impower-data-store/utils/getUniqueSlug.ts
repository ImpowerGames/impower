const getUniqueSlug = async (
  docId: string,
  slugCollection: "handles" | "slugs",
  slug: string,
  maxLength = 50,
  suffix: number = undefined
): Promise<string> => {
  const suffixString = suffix !== undefined ? suffix.toString() : "";
  const validSlug = slug
    .trim()
    .split(" ")
    .join("_")
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_]/gi, "")
    .slice(0, maxLength - suffixString.length);
  const newSlug = validSlug + suffixString;
  if (!newSlug) {
    return "";
  }
  const DataStoreRead = (await import("../classes/dataStoreRead")).default;
  const slugSnap = await new DataStoreRead(
    ...(slugCollection === "handles"
      ? ["handles", newSlug]
      : slugCollection === "slugs"
      ? ["slugs", newSlug]
      : undefined)
  ).get();
  if (!slugSnap.exists() || slugSnap.id === docId) {
    return newSlug;
  }
  return getUniqueSlug(
    docId,
    slugCollection,
    slug,
    maxLength,
    (suffix || 0) + 1
  );
};

export default getUniqueSlug;
