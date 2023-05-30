import { PitchedProjectCollectionPath } from "../../impower-api";
import { ProjectType } from "../types/enums/projectType";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const pitchQuery = async (
  options: {
    sort: "rank" | "rating" | "new";
    type?: ProjectType;
    nsfw?: boolean;
    termsQuery?: string[];
    creator?: string;
  },
  ...path: PitchedProjectCollectionPath
) => {
  const { sort, type, nsfw, termsQuery, creator } = options;

  const DataStoreQuery = await (
    await import("../classes/dataStoreQuery")
  ).default;

  let query = new DataStoreQuery(...path);

  query = query.where("delisted", "==", false);

  if (type) {
    query = query.where("projectType", "==", type);
  }

  if (nsfw !== undefined && nsfw !== null && !nsfw) {
    query = query.where("nsfw", "==", false);
  }

  if (creator) {
    query = query.where("_createdBy", "==", creator);
  }

  if (sort === "rank") {
    if (termsQuery?.length > 0) {
      query = query.where("terms", "array-contains-any", termsQuery);
    }
    query = query.orderBy("rank", "desc");
  }

  if (sort === "new") {
    if (termsQuery?.length > 0) {
      query = query.where("terms", "array-contains-any", termsQuery);
    }
    query = query.orderBy("_createdAt", "desc");
  }

  if (sort === "rating") {
    if (termsQuery?.length > 0) {
      query = query.where("terms", "array-contains-any", termsQuery);
    }
    query = query.orderBy("rating", "desc");
  }

  return query;
};

export default pitchQuery;
