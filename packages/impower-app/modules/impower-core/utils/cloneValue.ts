import _cloneDeep from "lodash/cloneDeep";

const cloneValue = <T>(value: T): T => {
  return _cloneDeep(value);
};

export default cloneValue;
