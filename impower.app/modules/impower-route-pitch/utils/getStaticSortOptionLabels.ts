export const getStaticSortOptionLabels = (): {
  [sort in "new" | "old"]: string;
} => ({
  new: "Newest",
  old: "Oldest",
});

export default getStaticSortOptionLabels;
