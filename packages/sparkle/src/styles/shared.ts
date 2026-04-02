import baseNormalize from "../../../spec-component/src/styles/normalize/normalize.css";
import { scopeSelectorsToTag } from "../../../spec-component/src/utils/scopeSelectorsToTag";
import LIGHT_DOM_COMPONENTS from "../constants/LIGHT_DOM_COMPONENTS";
import sparkleCore from "../styles/core/core.css";
import sparkleKeyframes from "../styles/keyframes/keyframes.css";
import sparkleNormalize from "../styles/normalize/normalize.css";
import utility from "../styles/utility/utility.css";
import scopeCssToChild from "../utils/scopeCssToChild";
import scopeCssToHost from "../utils/scopeCssToHost";

const shadowRootScopedUtility = scopeCssToHost(
  scopeCssToChild(utility, ".root"),
);

const tagScopedUtility = scopeSelectorsToTag(
  utility,
  `:is(${LIGHT_DOM_COMPONENTS.join(",")})`,
);

export default {
  baseNormalize,
  sparkleNormalize,
  sparkleKeyframes,
  shadowRootScopedUtility,
  tagScopedUtility,
  sparkleCore,
};
