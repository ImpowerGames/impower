import { filterImage } from "./filterImage";
import { profile } from "./profile";

export const populateFilteredImages = (context: {
  [type: string]: { [name: string]: any };
}): string[] => {
  const circularReferences: string[] = [];
  profile("start", "populateFilteredImages");
  const filteredImages = context?.["filtered_image"];
  if (filteredImages) {
    for (const filteredImage of Object.values(filteredImages)) {
      const circularReference = filterImage(context, filteredImage);
      if (circularReference) {
        circularReferences.push(circularReference);
      }
    }
  }
  profile("end", "populateFilteredImages");
  return circularReferences;
};
