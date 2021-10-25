import { PitchGoal } from "../types/enums/pitchGoal";
import getAnySearchQuery from "./getAnySearchQuery";
import pitchQuery from "./pitchQuery";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const pitchSearchQuery = (
  options: {
    sort: "rank" | "new";
    goal?: PitchGoal;
    nsfw?: boolean;
    search?: string;
    searchTargets?: ("tags" | "name" | "summary")[];
  },
  collection: "pitched_resources" | "pitched_games"
) => {
  const { sort, goal, nsfw, search, searchTargets } = options;

  const termsQuery = getAnySearchQuery({
    search,
    searchTargets,
  });

  return pitchQuery({ sort, goal, nsfw, termsQuery }, collection);
};

export default pitchSearchQuery;
