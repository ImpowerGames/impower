import PRIMITIVE_SCALAR_TYPES from "../constants/PRIMITIVE_SCALAR_TYPES";

const getVariableId = (tok: { type?: string; name?: string }) => {
  return tok.type && PRIMITIVE_SCALAR_TYPES.includes(tok.type)
    ? tok.name || ""
    : [tok.type, tok.name].filter((p) => p).join(".");
};

export default getVariableId;
