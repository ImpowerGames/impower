import { ProjectType } from "../types/enums/projectType";
import getAnySearchQuery from "./getAnySearchQuery";
import pitchQuery from "./pitchQuery";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const pitchSearchQuery = (
  options: {
    sort?: "rank" | "new" | "rating";
    type?: ProjectType;
    nsfw?: boolean;
    search?: string;
    searchTargets?: ("tags" | "name" | "summary")[];
    creator?: string;
  },
  collection: "pitched_projects"
) => {
  const { sort, type, nsfw, search, searchTargets, creator } = options;

  const termsQuery = getAnySearchQuery({
    search,
    searchTargets,
  });

  return pitchQuery({ sort, type, nsfw, termsQuery, creator }, collection);
};

export default pitchSearchQuery;
