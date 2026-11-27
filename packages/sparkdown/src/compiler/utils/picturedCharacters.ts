import { getImageOwner } from "./getImageOwner";

export const PICTURE_OWNER_TYPES = ["image", "layered_image", "filtered_image", "graphic"];

export const picturedCharacters = (
  context: { [type: string]: { [name: string]: any } } | undefined,
): Set<string> => {
  const owners = new Set<string>();
  for (const type of PICTURE_OWNER_TYPES) {
    for (const picture of Object.keys(context?.[type] ?? {})) {
      const owner = getImageOwner(context, picture);
      if (owner) {
        owners.add(owner);
      }
    }
  }
  return owners;
};
