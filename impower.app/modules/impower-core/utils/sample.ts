import _sampleSize from "lodash/sampleSize";

const sample = <T>(collection: T[] | null | undefined, n?: number): T[] => {
  return _sampleSize(collection, n);
};

export default sample;
