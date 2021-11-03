import { ContributionType } from "..";
import { PitchedProjectDocumentPath } from "../../impower-api";
import { QuerySort } from "../types/enums/querySort";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const contributionsQuery = async (
  options: {
    filter?: ContributionType;
    sort: QuerySort;
    nsfw?: boolean;
    creator?: string;
  },
  ...path: PitchedProjectDocumentPath | [undefined]
) => {
  const { filter, sort, nsfw, creator } = options;

  const DataStoreQuery = await (
    await import("../classes/dataStoreQuery")
  ).default;
  let query = new DataStoreQuery(...path, "contributions");

  query = query.where("delisted", "==", false);

  if (!nsfw) {
    query = query.where("nsfw", "==", false);
  }

  if (filter) {
    query = query.where("contributionType", "==", filter);
  }

  if (creator) {
    query = query.where("_createdBy", "==", creator);
  }

  if (sort === "new") {
    query = query.orderBy("_createdAt", "desc");
  }

  if (sort === "rating") {
    query = query.orderBy("rating", "desc");
  }

  return query;
};

export default contributionsQuery;
