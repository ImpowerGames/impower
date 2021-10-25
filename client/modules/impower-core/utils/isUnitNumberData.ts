import { UnitNumberData } from "../types/interfaces/unitNumberData";

const isUnitNumberData = (obj: unknown): obj is UnitNumberData => {
  if (!obj) {
    return false;
  }
  const unitNumberData = obj as UnitNumberData;
  return (
    unitNumberData.unit !== undefined && unitNumberData.value !== undefined
  );
};

export default isUnitNumberData;
