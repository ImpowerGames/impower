import { PitchedProjectCollectionPath } from "../../impower-api";
import { PitchGoal } from "../types/enums/pitchGoal";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const pitchQuery = async (
  options: {
    sort: "rank" | "rating" | "new";
    goal?: PitchGoal;
    nsfw?: boolean;
    termsQuery?: string[];
  },
  ...path: PitchedProjectCollectionPath
) => {
  const { sort, goal, nsfw, termsQuery } = options;

  const DataStoreQuery = await (
    await import("../classes/dataStoreQuery")
  ).default;

  let query = new DataStoreQuery(...path);

  query = query.where("delisted", "==", false);

  if (goal) {
    query = query.where("pitchGoal", "==", goal);
  }

  if (!nsfw) {
    query = query.where("nsfw", "==", false);
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
