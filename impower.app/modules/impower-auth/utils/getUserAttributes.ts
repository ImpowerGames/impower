import { User } from "../types/aliases";
import { UserAttributes } from "../types/interfaces/userAttributes";

const getUserAttributes = (user: User): UserAttributes => {
  if (!user) {
    return {
      uid: null,
      email: null,
      emailVerified: null,
      phoneNumber: null,
      isAnonymous: null,
    };
  }
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    phoneNumber: user.phoneNumber,
    isAnonymous: user.isAnonymous,
  };
};

export default getUserAttributes;
