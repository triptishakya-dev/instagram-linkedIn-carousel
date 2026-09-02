import type { Post, SocialAccount, SocialTarget } from "./types";

/**
 * Everything here is static fixture data — this is a UI-only build.
 * `NOW` is frozen so server and client render identical relative times.
 */
export const NOW = "2026-08-29T11:20:00.000Z";
export const USER_TZ = "Asia/Kolkata";

export const accounts: SocialAccount[] = [
  {
    id: "acc_meta_1",
    platform: "INSTAGRAM",
    label: "Meta — Rubenius Studio",
    tokenExpiresAt: null,
    hasRefreshToken: false,
    invalidatedAt: null,
    scopes: [
      "instagram_business_basic",
      "instagram_business_content_publish",
      "pages_show_list",
      "pages_read_engagement",
    ],
    quota: {
      label: "Content publishing limit",
      used: 23,
      limit: 100,
      window: "rolling 24h",
      note: "Read live from GET /{ig-id}/content_publishing_limit — never hardcoded.",
    },
    targets: [
      {
        id: "tgt_ig_main",
        platform: "INSTAGRAM",
        kind: "IG_ACCOUNT",
        handle: "@rubenius.studio",
        displayName: "Rubenius Studio",
        avatarTint: "#d6296f",
        urn: "17841400000000001",
        connected: true,
      },
      {
        id: "tgt_ig_labs",
        platform: "INSTAGRAM",
        kind: "IG_ACCOUNT",
        handle: "@rubenius.labs",
        displayName: "Rubenius Labs",
        avatarTint: "#f0803c",
        urn: null,
        connected: false,
        blockedReason:
          "Linked Page requires Page Publishing Authorization. Publishing fails until PPA completes.",
      },
    ],
  },
  {
    id: "acc_li_1",
    platform: "LINKEDIN",
    label: "LinkedIn — Ansuman Dash",
    tokenExpiresAt: "2026-09-11T09:00:00.000Z",
    hasRefreshToken: false,
    invalidatedAt: null,
    scopes: ["w_member_social", "openid", "profile", "email"],
    quota: {
      label: "Member API budget",
      used: 61,
      limit: 100,
      window: "per day, per member",
      note: "A 20-image MultiImage post costs ~41 calls. Two large posts nearly exhaust the day.",
    },
    targets: [
      {
        id: "tgt_li_member",
        platform: "LINKEDIN",
        kind: "LI_MEMBER",
        handle: "in/ansuman-dash",
        displayName: "Ansuman Dash",
        avatarTint: "#0a66c2",
        urn: "urn:li:person:8f2Kd0",
        connected: true,
      },
      {
        id: "tgt_li_org",
        platform: "LINKEDIN",
        kind: "LI_ORGANIZATION",
        handle: "company/rubenius",
        displayName: "Rubenius (Page)",
        avatarTint: "#3f7ea8",
        urn: null,
        connected: false,
        blockedReason:
          "Needs w_organization_social via the Marketing Developer Platform. Application submitted 2026-08-04 — weeks to months, no expedited path.",
      },
    ],
  },
];

export const socialTargets: SocialTarget[] = accounts.flatMap((a) => a.targets);

export function targetById(id: string): SocialTarget | undefined {
  return socialTargets.find((t) => t.id === id);
}

export function accountForTarget(id: string): SocialAccount | undefined {
  return accounts.find((a) => a.targets.some((t) => t.id === id));
}

export const posts: Post[] = [
  {
    id: "post_9f2c",
    caption:
      "Six weeks of studio process, compressed into one carousel. Swipe for the parts that did not make the final cut. →",
    status: "PARTIALLY_PUBLISHED",
    scheduledAt: "2026-08-29T04:30:00.000Z",
    timezone: USER_TZ,
    staleAfterMinutes: 30,
    media: [
      { id: "m1", tint: "#d6296f", aspect: "4:5", fileName: "process-01.jpg", bytes: 1842112, mime: "image/jpeg" },
      { id: "m2", tint: "#7c5cf0", aspect: "4:5", fileName: "process-02.jpg", bytes: 1611004, mime: "image/jpeg" },
      { id: "m3", tint: "#0a9c8a", aspect: "4:5", fileName: "process-03.jpg", bytes: 1930884, mime: "image/jpeg" },
      { id: "m4", tint: "#e08a2b", aspect: "4:5", fileName: "process-04.jpg", bytes: 1402330, mime: "image/jpeg" },
    ],
    targets: [
      {
        id: "pt_9f2c_ig",
        socialTargetId: "tgt_ig_main",
        status: "PUBLISHED",
        attemptCount: 1,
        maxAttempts: 5,
        nextAttemptAt: null,
        lockedUntil: null,
        failureClass: null,
        error: null,
        providerState: {
          childContainerIds: ["1789004", "1789005", "1789006", "1789007"],
          parentContainerId: "1789012",
          mediaId: "17998221340012",
        },
        attempts: [
          {
            id: "at1",
            at: "2026-08-29T04:31:02.000Z",
            step: "PENDING->PREPARING",
            result: "OK",
            durationMs: 4310,
            detail: "4 child containers created",
            traceId: "fbtrace AeXk2f01",
          },
          {
            id: "at2",
            at: "2026-08-29T04:32:04.000Z",
            step: "PREPARING->READY",
            result: "OK",
            durationMs: 8820,
            detail: "all children FINISHED, parent container 1789012",
            traceId: "fbtrace AeXk2f02",
          },
          {
            id: "at3",
            at: "2026-08-29T04:33:01.000Z",
            step: "READY->PUBLISHED",
            result: "OK",
            durationMs: 2190,
            detail: "media_publish creation_id=1789012",
            traceId: "fbtrace AeXk2f03",
          },
        ],
      },
      {
        id: "pt_9f2c_li",
        socialTargetId: "tgt_li_member",
        status: "NEEDS_REVIEW",
        attemptCount: 1,
        maxAttempts: 5,
        nextAttemptAt: null,
        lockedUntil: null,
        failureClass: "AMBIGUOUS",
        error:
          "Timeout during POST /rest/posts. The create call may have landed. w_member_social is write-only, so the post cannot be read back to confirm.",
        providerState: {
          imageUrns: [
            "urn:li:image:D4E10AQ001",
            "urn:li:image:D4E10AQ002",
            "urn:li:image:D4E10AQ003",
            "urn:li:image:D4E10AQ004",
          ],
          postUrn: null,
        },
        attempts: [
          {
            id: "at4",
            at: "2026-08-29T04:31:10.000Z",
            step: "PENDING->READY",
            result: "OK",
            durationMs: 21440,
            detail: "4 images initialized and streamed one at a time",
            traceId: "x-li-uuid 7c1a-40",
          },
          {
            id: "at5",
            at: "2026-08-29T04:33:40.000Z",
            step: "READY->VERIFYING",
            result: "FAIL",
            durationMs: 30000,
            errorCode: "ETIMEDOUT",
            failureClass: "AMBIGUOUS",
            detail:
              "No response. Not retried — re-creating risks a duplicate on a professional profile.",
            traceId: "x-li-uuid 7c1a-41",
          },
        ],
      },
    ],
  },
  {
    id: "post_b031",
    caption:
      "Shipping notes for v2.4 — the scheduler now advances one state transition per tick instead of trying to publish inside a single request.",
    status: "PROCESSING",
    scheduledAt: "2026-08-29T11:15:00.000Z",
    timezone: USER_TZ,
    staleAfterMinutes: 30,
    media: [
      { id: "m5", tint: "#5b4bd6", aspect: "1:1", fileName: "release-hero.jpg", bytes: 998220, mime: "image/jpeg" },
      { id: "m6", tint: "#2b8ae0", aspect: "1:1", fileName: "release-diagram.jpg", bytes: 1120900, mime: "image/jpeg" },
    ],
    targets: [
      {
        id: "pt_b031_ig",
        socialTargetId: "tgt_ig_main",
        status: "PREPARING",
        attemptCount: 1,
        maxAttempts: 5,
        nextAttemptAt: null,
        lockedUntil: "2026-08-29T11:25:00.000Z",
        failureClass: null,
        error: null,
        providerState: { childContainerIds: ["1790221", "1790222"], parentContainerId: null },
        attempts: [
          {
            id: "at6",
            at: "2026-08-29T11:16:00.000Z",
            step: "PENDING->PREPARING",
            result: "OK",
            durationMs: 3980,
            detail: "2 child containers created",
            traceId: "fbtrace AeXk2f09",
          },
          {
            id: "at7",
            at: "2026-08-29T11:17:00.000Z",
            step: "PREPARING",
            result: "RETRY",
            durationMs: 1220,
            detail: "child 1790222 status_code=IN_PROGRESS — poll again next tick",
          },
        ],
      },
      {
        id: "pt_b031_li",
        socialTargetId: "tgt_li_member",
        status: "READY",
        attemptCount: 1,
        maxAttempts: 5,
        nextAttemptAt: null,
        lockedUntil: null,
        failureClass: null,
        error: null,
        providerState: {
          imageUrns: ["urn:li:image:D4E10AQ088", "urn:li:image:D4E10AQ089"],
          postUrn: null,
        },
        attempts: [
          {
            id: "at8",
            at: "2026-08-29T11:16:20.000Z",
            step: "PENDING->READY",
            result: "OK",
            durationMs: 9110,
            detail: "2 images initialized and streamed",
          },
        ],
      },
    ],
  },
  {
    id: "post_c58a",
    caption:
      "Ten frames from the Kolkata shoot. The first frame sets the crop for the whole carousel — everything here is 4:5 on purpose.",
    status: "FAILED",
    scheduledAt: "2026-08-28T13:00:00.000Z",
    timezone: USER_TZ,
    staleAfterMinutes: 45,
    media: Array.from({ length: 10 }, (_, i) => ({
      id: `m7_${i}`,
      tint: ["#d6296f", "#e08a2b", "#0a9c8a", "#5b4bd6", "#2b8ae0"][i % 5],
      aspect: "4:5" as const,
      fileName: `kolkata-${String(i + 1).padStart(2, "0")}.jpg`,
      bytes: 1500000 + i * 40000,
      mime: "image/jpeg",
    })),
    targets: [
      {
        id: "pt_c58a_ig",
        socialTargetId: "tgt_ig_main",
        status: "FAILED",
        attemptCount: 3,
        maxAttempts: 5,
        nextAttemptAt: null,
        lockedUntil: null,
        failureClass: "RATE_LIMIT",
        error:
          "Subcode 2207042 — 24-hour publishing cap reached. Flat wait, never exponential: calling again before the window clears extends it.",
        providerState: { childContainerIds: [], parentContainerId: null },
        attempts: [
          {
            id: "at9",
            at: "2026-08-28T13:01:00.000Z",
            step: "PENDING",
            result: "FAIL",
            durationMs: 810,
            errorCode: "4 / 2207042",
            failureClass: "RATE_LIMIT",
            detail: "content_publishing_limit exhausted",
            traceId: "fbtrace AeXk2f44",
          },
          {
            id: "at10",
            at: "2026-08-28T14:01:00.000Z",
            step: "PENDING",
            result: "FAIL",
            durationMs: 760,
            errorCode: "4 / 2207042",
            failureClass: "RATE_LIMIT",
            detail: "still capped — flat 60m wait, no exponential backoff",
            traceId: "fbtrace AeXk2f51",
          },
          {
            id: "at11",
            at: "2026-08-28T15:01:00.000Z",
            step: "PENDING",
            result: "FAIL",
            durationMs: 790,
            errorCode: "4 / 2207042",
            failureClass: "RATE_LIMIT",
            detail: "past staleAfterMinutes — not published late",
            traceId: "fbtrace AeXk2f58",
          },
        ],
      },
      {
        id: "pt_c58a_li",
        socialTargetId: "tgt_li_member",
        status: "SKIPPED",
        attemptCount: 0,
        maxAttempts: 5,
        nextAttemptAt: null,
        lockedUntil: null,
        failureClass: null,
        error: "Target not selected at compose time.",
        providerState: {},
        attempts: [],
      },
    ],
  },
  {
    id: "post_d12e",
    caption:
      "What a scheduling product actually owes you: an honest “we are not sure this went through” instead of a silent double post.",
    status: "PUBLISHED",
    scheduledAt: "2026-08-27T09:30:00.000Z",
    timezone: USER_TZ,
    staleAfterMinutes: 30,
    media: [
      { id: "m8", tint: "#0a9c8a", aspect: "1:1", fileName: "honest-ui.jpg", bytes: 720400, mime: "image/jpeg" },
    ],
    targets: [
      {
        id: "pt_d12e_ig",
        socialTargetId: "tgt_ig_main",
        status: "PUBLISHED",
        attemptCount: 1,
        maxAttempts: 5,
        nextAttemptAt: null,
        lockedUntil: null,
        failureClass: null,
        error: null,
        providerState: { mediaId: "17998221339001" },
        attempts: [
          {
            id: "at12",
            at: "2026-08-27T09:30:40.000Z",
            step: "PENDING->READY",
            result: "OK",
            durationMs: 5120,
            detail: "single image — no is_carousel_item, no parent container",
          },
          { id: "at13", at: "2026-08-27T09:31:20.000Z", step: "READY->PUBLISHED", result: "OK", durationMs: 1980 },
        ],
      },
      {
        id: "pt_d12e_li",
        socialTargetId: "tgt_li_member",
        status: "PUBLISHED",
        attemptCount: 1,
        maxAttempts: 5,
        nextAttemptAt: null,
        lockedUntil: null,
        failureClass: null,
        error: null,
        providerState: {
          imageUrns: ["urn:li:image:D4E10AQ044"],
          postUrn: "urn:li:share:7233190000012",
        },
        attempts: [
          { id: "at14", at: "2026-08-27T09:30:50.000Z", step: "PENDING->READY", result: "OK", durationMs: 6040 },
          {
            id: "at15",
            at: "2026-08-27T09:31:30.000Z",
            step: "READY->PUBLISHED",
            result: "OK",
            durationMs: 2410,
            detail: "201 with x-restli-id: urn:li:share:7233190000012",
          },
        ],
      },
    ],
  },
  {
    id: "post_a713",
    caption:
      "Field notes: LinkedIn does not have a swipeable carousel. What you get is a 2–20 image grid, and pretending otherwise in the composer is how users end up surprised.",
    status: "SCHEDULED",
    scheduledAt: "2026-08-30T04:00:00.000Z",
    timezone: USER_TZ,
    staleAfterMinutes: 30,
    media: [
      { id: "m9", tint: "#2b8ae0", aspect: "1:1", fileName: "grid-01.jpg", bytes: 880120, mime: "image/jpeg" },
      { id: "m10", tint: "#5b4bd6", aspect: "1:1", fileName: "grid-02.jpg", bytes: 910330, mime: "image/jpeg" },
      { id: "m11", tint: "#d6296f", aspect: "1:1", fileName: "grid-03.jpg", bytes: 855900, mime: "image/jpeg" },
      { id: "m12", tint: "#e08a2b", aspect: "1:1", fileName: "grid-04.jpg", bytes: 902770, mime: "image/jpeg" },
      { id: "m13", tint: "#0a9c8a", aspect: "1:1", fileName: "grid-05.jpg", bytes: 869540, mime: "image/jpeg" },
    ],
    targets: [
      { id: "pt_a713_ig", socialTargetId: "tgt_ig_main", status: "PENDING", attemptCount: 0, maxAttempts: 5, nextAttemptAt: null, lockedUntil: null, failureClass: null, error: null, providerState: {}, attempts: [] },
      { id: "pt_a713_li", socialTargetId: "tgt_li_member", status: "PENDING", attemptCount: 0, maxAttempts: 5, nextAttemptAt: null, lockedUntil: null, failureClass: null, error: null, providerState: {}, attempts: [] },
    ],
  },
  {
    id: "post_f440",
    caption:
      "Monday reminder that a 09:00 post picked up at 09:47 is sometimes worse than no post at all. staleAfterMinutes exists for exactly this.",
    status: "SCHEDULED",
    scheduledAt: "2026-08-31T03:30:00.000Z",
    timezone: USER_TZ,
    staleAfterMinutes: 20,
    media: [
      { id: "m14", tint: "#7c5cf0", aspect: "1:1", fileName: "monday.jpg", bytes: 640200, mime: "image/jpeg" },
    ],
    targets: [
      { id: "pt_f440_li", socialTargetId: "tgt_li_member", status: "PENDING", attemptCount: 0, maxAttempts: 5, nextAttemptAt: null, lockedUntil: null, failureClass: null, error: null, providerState: {}, attempts: [] },
    ],
  },
  {
    id: "post_g881",
    caption:
      "Three shots from the September lookbook. Instagram only — the crop story does not survive a LinkedIn grid.",
    status: "SCHEDULED",
    scheduledAt: "2026-09-02T05:45:00.000Z",
    timezone: USER_TZ,
    staleAfterMinutes: 30,
    media: [
      { id: "m15", tint: "#e0642b", aspect: "4:5", fileName: "look-01.jpg", bytes: 1320000, mime: "image/jpeg" },
      { id: "m16", tint: "#c0397a", aspect: "4:5", fileName: "look-02.jpg", bytes: 1290100, mime: "image/jpeg" },
      { id: "m17", tint: "#8a4bd6", aspect: "4:5", fileName: "look-03.jpg", bytes: 1355600, mime: "image/jpeg" },
    ],
    targets: [
      { id: "pt_g881_ig", socialTargetId: "tgt_ig_main", status: "PENDING", attemptCount: 0, maxAttempts: 5, nextAttemptAt: null, lockedUntil: null, failureClass: null, error: null, providerState: {}, attempts: [] },
    ],
  },
  {
    id: "post_h204",
    caption:
      "Draft — quarterly retro thread, still deciding whether the second image earns its place.",
    status: "DRAFT",
    scheduledAt: "2026-09-05T06:00:00.000Z",
    timezone: USER_TZ,
    staleAfterMinutes: 30,
    media: [
      { id: "m18", tint: "#4a8ad6", aspect: "1.91:1", fileName: "retro-wide.jpg", bytes: 1040000, mime: "image/jpeg" },
    ],
    targets: [
      { id: "pt_h204_li", socialTargetId: "tgt_li_member", status: "PENDING", attemptCount: 0, maxAttempts: 5, nextAttemptAt: null, lockedUntil: null, failureClass: null, error: null, providerState: {}, attempts: [] },
    ],
  },
];

export function postById(id: string): Post | undefined {
  return posts.find((p) => p.id === id);
}
