import { Dispatch } from "react";
import { UserAction } from "./userActions";
import { UserState } from "./userState";

export type UserContextState = [UserState, Dispatch<UserAction>];
