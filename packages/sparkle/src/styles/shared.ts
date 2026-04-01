import baseNormalize from "../../../spec-component/src/styles/normalize/normalize.css";
import core from "../styles/core/core.css";
import keyframes from "../styles/keyframes/keyframes.css";
import sparkleNormalize from "../styles/normalize/normalize.css";
import utility from "../styles/utility/utility.css";
import scopeCssToChild from "../utils/scopeCssToChild";
import scopeCssToHost from "../utils/scopeCssToHost";

const scopedUtility = scopeCssToHost(scopeCssToChild(utility, ".root"));
const scopedCore = scopeCssToHost(core);

export default {
  baseNormalize,
  sparkleNormalize,
  keyframes,
  scopedUtility,
  scopedCore,
};
