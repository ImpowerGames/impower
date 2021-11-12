export enum ReportReason {
  Spam = "spam", // It is spam
  Unattributed = "unattributed", // It uses assets without required attribution
  Infrigement = "infrigement", // It infringes copyright or trademark rights
  Harrassment = "harrassment", // It abuses or harasses someone
  Misinformation = "misinformation", // It spreads misinformation
  PrivacyViolation = "privacy_violation", // It violates someone's privacy
  IllegalTransaction = "illegal_transaction", // It is a transaction for prohibited goods or services
  SelfHarm = "self_harm", // Someone is considering suicide or self-harm
  UntaggedNSFWContent = "untagged_nsfw_content", // It contains mature or explicit content but is not tagged appropriately
  InvoluntaryPornography = "involuntary_pornography", // It's involuntary pornography
}
