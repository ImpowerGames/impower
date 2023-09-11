import baseNormalize from "../../../spec-component/src/styles/normalize/normalize.css";
import core from "../styles/core/core.css";
import keyframes from "../styles/keyframes/keyframes.css";
import normalize from "../styles/normalize/normalize.css";
import scopeCssToHost from "../utils/scopeCssToHost";

const scopedCore = scopeCssToHost(core);

export default [baseNormalize, normalize, keyframes, scopedCore];
