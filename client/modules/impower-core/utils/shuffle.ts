import _shuffle from "lodash/shuffle";

const shuffle = <T>(collection: T[] | null | undefined): T[] => {
  return _shuffle(collection);
};

export default shuffle;
