import { createDynamicData, DynamicData } from "../generics/dynamicData";

export const createVectorConfig = (
  x: number,
  y: number,
  z?: number,
  w?: number
): Vector2Config | Vector3Config | Vector4Config => {
  if (w !== undefined) {
    return {
      x: createDynamicData(x),
      y: createDynamicData(y),
      z: createDynamicData(z),
      w: createDynamicData(w),
    };
  }
  if (z !== undefined) {
    return {
      x: createDynamicData(x),
      y: createDynamicData(y),
      z: createDynamicData(z),
    };
  }
  return {
    x: createDynamicData(x),
    y: createDynamicData(y),
  };
};

export interface Vector2Config {
  x?: DynamicData<number>;
  y?: DynamicData<number>;
}

export const isVector2Config = (obj: unknown): obj is Vector2Config => {
  if (!obj) {
    return false;
  }
  const vector2Config = obj as Vector2Config;
  return vector2Config.x !== undefined && vector2Config.y !== undefined;
};

export const createVector2Config = (
  obj?: Partial<Vector2Config>
): Vector2Config => ({
  x: createDynamicData(0),
  y: createDynamicData(0),
  ...obj,
});

export interface Vector3Config {
  x?: DynamicData<number>;
  y?: DynamicData<number>;
  z?: DynamicData<number>;
}

export const isVector3Config = (obj: unknown): obj is Vector3Config => {
  if (!obj) {
    return false;
  }
  const vector3Config = obj as Vector3Config;
  return (
    vector3Config.x !== undefined &&
    vector3Config.y !== undefined &&
    vector3Config.z !== undefined
  );
};

export const createVector3Config = (
  obj?: Partial<Vector3Config>
): Vector3Config => ({
  x: createDynamicData(0),
  y: createDynamicData(0),
  z: createDynamicData(0),
  ...obj,
});

export interface Vector4Config {
  x?: DynamicData<number>;
  y?: DynamicData<number>;
  z?: DynamicData<number>;
  w?: DynamicData<number>;
}

export const isVector4Config = (obj: unknown): obj is Vector4Config => {
  if (!obj) {
    return false;
  }
  const vector4Config = obj as Vector4Config;
  return (
    vector4Config.x !== undefined &&
    vector4Config.y !== undefined &&
    vector4Config.z !== undefined &&
    vector4Config.w !== undefined
  );
};

export const createVector4Config = (
  obj?: Partial<Vector4Config>
): Vector4Config => ({
  x: createDynamicData(0),
  y: createDynamicData(0),
  z: createDynamicData(0),
  w: createDynamicData(0),
  ...obj,
});
