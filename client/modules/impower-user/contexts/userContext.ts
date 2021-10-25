import React from "react";
import { UserContextState } from "../types/userContextState";

export const UserContext = React.createContext<UserContextState>(undefined);
