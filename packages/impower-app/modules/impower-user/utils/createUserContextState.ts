import { UserContextState } from "../types/userContextState";
import createUserState from "./createUserState";

const createUserContextState = (): UserContextState => [
  createUserState(),
  (): void => null,
];

export default createUserContextState;
