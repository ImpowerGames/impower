import { BlockState } from "../types/BlockState";

const createBlockState = (obj?: Partial<BlockState>): BlockState => ({
  executingIndex: 0,
  previousIndex: 0,
  executedBy: "",
  commandJumpStack: [],
  ...(obj || {}),
});

export default createBlockState;
