import baseNormalize from "../../../spec-component/src/styles/normalize/normalize.css";
import keyframes from "../styles/keyframes/keyframes.css";
import normalize from "../styles/normalize/normalize.css";
import core from "../styles/utility/core.css";
import utility from "../styles/utility/utility.css";
import scopeCssToHost from "../utils/scopeCssToHost";

const scopedUtility = scopeCssToHost(utility);
const scopedCore = scopeCssToHost(core);

export default [baseNormalize, normalize, keyframes, scopedUtility, scopedCore];
