import { increment as _increment } from "firebase/database";

const incrementServerValue = (n: number): unknown => _increment(n);

export default incrementServerValue;
