const getUniqueSlug = async (
  docId: string,
  slugCollection: "handles" | "slugs",
  slug: string,
  suffix?: number
): Promise<string> => {
  const validSlug = slug
    .trim()
    .split(" ")
    .join("_")
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_]/gi, "")
    .slice(0, 50);
  const newSlug =
    suffix !== undefined ? validSlug + suffix.toString() : validSlug;
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
  return getUniqueSlug(docId, slugCollection, slug, (suffix || 0) + 1);
};

export default getUniqueSlug;
