import { OrderedCollection } from "../types/interfaces/orderedCollection";
import getUniqueName from "./getUniqueName";
import isNameable from "./isNameable";

const addOrderedCollectionData = <T>(
  collection: OrderedCollection<T>,
  defaultValue: T,
  id: string
): OrderedCollection<T> => {
  if (isNameable(defaultValue)) {
    const otherNames = Object.values(collection.data).map((d) =>
      isNameable(d) ? d.name : ""
    );
    defaultValue = {
      ...defaultValue,
      name: getUniqueName(otherNames, defaultValue.name),
    };
  }

  return {
    ...collection,
    order: [...collection.order, id],
    data: { ...collection.data, [id]: defaultValue },
  };
};

export default addOrderedCollectionData;
