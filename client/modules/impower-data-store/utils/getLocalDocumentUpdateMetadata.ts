import { DataDocument } from "../../impower-core";
import { UpdateData } from "../types/aliases";
import getToday from "./getToday";

const getLocalDocumentUpdateMetadata = <T extends DataDocument>(
  doc?: T
): UpdateData<unknown> => {
  const currentUpdateCount = doc?._updates?.[getToday().toString()] as number;
  return {
    _updatedAt: new Date().toJSON(),
    _updates: {
      [`${getToday()}`]: (currentUpdateCount || 0) + 1,
    },
  };
};

export default getLocalDocumentUpdateMetadata;
