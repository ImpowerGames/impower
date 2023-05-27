import {
  PitchedProjectContributionDocumentPath,
  PitchedProjectDocumentPath,
} from "../../impower-api";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const notesQuery = async (
  options: {
    nsfw?: boolean;
    creator?: string;
  },
  ...path:
    | PitchedProjectDocumentPath
    | PitchedProjectContributionDocumentPath
    | [undefined]
) => {
  const { nsfw, creator } = options;

  const DataStoreQuery = await (
    await import("../classes/dataStoreQuery")
  ).default;
  let query = new DataStoreQuery(...path, "notes");

  query = query.where("delisted", "==", false);

  if (!nsfw) {
    query = query.where("nsfw", "==", false);
  }

  if (creator) {
    query = query.where("_createdBy", "==", creator);
  }

  return query;
};

export default notesQuery;
