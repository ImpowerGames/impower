import { UpdateData } from "../types/aliases";
import getToday from "./getToday";

const getLocalDocumentCreateMetadata = (): UpdateData<unknown> => {
  return {
    _createdAt: new Date().toJSON(),
    _updatedAt: new Date().toJSON(),
    _updates: {
      [`${getToday()}`]: 1,
    },
  };
};

export default getLocalDocumentCreateMetadata;
