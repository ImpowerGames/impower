import { OrderedCollection } from "../types/interfaces/orderedCollection";
import insertData from "./insertData";
import insertIds from "./insertIds";

const insertOrderedCollectionData = <T>(
  collection: OrderedCollection<T>,
  newData: { [refId: string]: T },
  index?: number
): OrderedCollection<T> => {
  return {
    ...collection,
    order: insertIds(collection.order, Object.keys(newData), index),
    data: insertData(collection.data, newData),
  };
};

export default insertOrderedCollectionData;
