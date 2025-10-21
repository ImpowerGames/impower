import { filterImage } from "./filterImage";

export const populateFilteredImages = (context: {
  [type: string]: { [name: string]: any };
}): string[] => {
  const circularReferences: string[] = [];
  const filteredImages = context?.["filtered_image"];
  if (filteredImages) {
    for (const filteredImage of Object.values(filteredImages)) {
      const circularReference = filterImage(context, filteredImage);
      if (circularReference) {
        circularReferences.push(circularReference);
      }
    }
  }
  return circularReferences;
};
