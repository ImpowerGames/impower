import { DateAge } from "../types/enums/dateAge";
import { ProjectType } from "../types/enums/projectType";
import getFilterQuery from "./getFilterQuery";
import pitchQuery from "./pitchQuery";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const pitchFilterQuery = (
  options: {
    sort?: "rank" | "rating" | "new";
    type?: ProjectType;
    age?: DateAge;
    nsfw?: boolean;
    tags?: string[];
    creator?: string;
  },
  collection: "pitched_projects"
) => {
  const { sort, type, age, nsfw, tags, creator } = options;

  const termsQuery = getFilterQuery({
    tags,
    age,
  });

  return pitchQuery({ sort, type, nsfw, termsQuery, creator }, collection);
};

export default pitchFilterQuery;
