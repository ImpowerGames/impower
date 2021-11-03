import { DateAge } from "../types/enums/dateAge";
import { PitchGoal } from "../types/enums/pitchGoal";
import getFilterQuery from "./getFilterQuery";
import pitchQuery from "./pitchQuery";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const pitchFilterQuery = (
  options: {
    sort: "rank" | "rating" | "new";
    goal?: PitchGoal;
    age?: DateAge;
    nsfw?: boolean;
    tags?: string[];
    creator?: string;
  },
  collection: "pitched_resources" | "pitched_games"
) => {
  const { sort, goal, age, nsfw, tags, creator } = options;

  const termsQuery = getFilterQuery({
    tags,
    age,
  });

  return pitchQuery({ sort, goal, nsfw, termsQuery, creator }, collection);
};

export default pitchFilterQuery;
