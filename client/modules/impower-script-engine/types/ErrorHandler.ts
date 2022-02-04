import { ErrorType } from "./ErrorType";

export type ErrorHandler = (message: string, type: ErrorType) => void;
