export type Platform = "INSTAGRAM" | "LINKEDIN";

export type PostStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PROCESSING"
  | "PUBLISHED"
  | "PARTIALLY_PUBLISHED"
  | "FAILED"
  | "CANCELLED";

export type TargetStatus =
  | "PENDING"
  | "PREPARING"
  | "READY"
  | "PUBLISHING"
  | "VERIFYING"
  | "PUBLISHED"
  | "FAILED"
  | "NEEDS_REVIEW"
  | "SKIPPED";

export type FailureClass =
  | "TRANSIENT"
  | "RATE_LIMIT"
  | "AUTH"
  | "PERMISSION"
  | "MEDIA"
  | "AMBIGUOUS"
  | "PERMANENT";

export type SocialTarget = {
  id: string;
  platform: Platform;
  /** IG handle, LinkedIn member name, or org page name */
  handle: string;
  displayName: string;
  kind: "IG_ACCOUNT" | "LI_MEMBER" | "LI_ORGANIZATION";
  avatarTint: string;
  /** null when the destination is not usable yet (e.g. pending MDP approval) */
  urn: string | null;
  connected: boolean;
  /** why this destination cannot be used, if it cannot */
  blockedReason?: string;
};

export type SocialAccount = {
  id: string;
  platform: Platform;
  label: string;
  /** ISO date. Meta long-lived page tokens have no self-declared expiry. */
  tokenExpiresAt: string | null;
  hasRefreshToken: boolean;
  invalidatedAt: string | null;
  scopes: string[];
  targets: SocialTarget[];
  /** provider quota snapshot shown in the composer */
  quota: {
    label: string;
    used: number;
    limit: number;
    window: string;
    note?: string;
  };
};

export type PostMedia = {
  id: string;
  /** decorative gradient stand-in for the real asset */
  tint: string;
  aspect: "1:1" | "4:5" | "1.91:1";
  fileName: string;
  bytes: number;
  mime: string;
};

export type PublishAttempt = {
  id: string;
  at: string;
  step: string;
  result: "OK" | "RETRY" | "FAIL";
  durationMs: number;
  errorCode?: string;
  failureClass?: FailureClass;
  traceId?: string;
  detail?: string;
};

export type PublishTarget = {
  id: string;
  socialTargetId: string;
  status: TargetStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  lockedUntil: string | null;
  failureClass: FailureClass | null;
  error: string | null;
  providerState: Record<string, string | string[] | null>;
  attempts: PublishAttempt[];
};

export type Post = {
  id: string;
  caption: string;
  status: PostStatus;
  scheduledAt: string;
  timezone: string;
  staleAfterMinutes: number;
  media: PostMedia[];
  targets: PublishTarget[];
};
