import { serverTimestamp as _serverTimestamp } from "firebase/database";

const timestampServerValue = (): unknown => _serverTimestamp();

export default timestampServerValue;
