import { UserContextState } from "../types/userContextState";
import createUnauthenticatedUserState from "./createUnauthenticatedUserState";

const createUnauthenticatedUserContextState = (): UserContextState => [
  createUnauthenticatedUserState(),
  (): void => null,
];

export default createUnauthenticatedUserContextState;
