import { PitchGoal } from "../types/enums/pitchGoal";
import getAnySearchQuery from "./getAnySearchQuery";
import pitchQuery from "./pitchQuery";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const pitchSearchQuery = (
  options: {
    sort?: "rank" | "new" | "rating";
    goal?: PitchGoal;
    nsfw?: boolean;
    search?: string;
    searchTargets?: ("tags" | "name" | "summary")[];
    creator?: string;
  },
  collection: "pitched_projects"
) => {
  const { sort, goal, nsfw, search, searchTargets, creator } = options;

  const termsQuery = getAnySearchQuery({
    search,
    searchTargets,
  });

  return pitchQuery({ sort, goal, nsfw, termsQuery, creator }, collection);
};

export default pitchSearchQuery;
