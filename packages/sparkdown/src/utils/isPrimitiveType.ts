import SPARK_PRIMITIVE_TYPES from "../constants/SPARK_PRIMITIVE_TYPES";
import { SparkPrimitiveType } from "../types/SparkPrimitiveType";

const isPrimitiveType = (type: string): type is SparkPrimitiveType => {
  return SPARK_PRIMITIVE_TYPES.includes(type as SparkPrimitiveType);
};

export default isPrimitiveType;
