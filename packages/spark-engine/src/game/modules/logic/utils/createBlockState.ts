import { BlockState } from "../types/BlockState";

const createBlockState = (obj?: Partial<BlockState>): BlockState => ({
  ...(obj || {}),
});

export default createBlockState;
