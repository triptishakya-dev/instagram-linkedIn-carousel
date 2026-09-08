import type { Asset, Goal, Model, Post, PostState } from "./types";

export const STATES: Record<PostState, { l: string; t: "n" | "g" | "gs" | "r" }> = {
  draft: { l: "Draft", t: "n" },
  queued: { l: "Queued", t: "n" },
  generating: { l: "Generating", t: "g" },
  ready: { l: "Ready for review", t: "g" },
  scheduled: { l: "Scheduled", t: "n" },
  published: { l: "Published", t: "gs" },
  failed: { l: "Failed", t: "r" },
};

export const PILL: Record<"n" | "g" | "gs" | "r", { bg: string; fg: string; br: string }> = {
  n: { bg: "var(--n100)", fg: "var(--fg2)", br: "var(--border)" },
  g: { bg: "var(--green-tint)", fg: "var(--green-text)", br: "var(--green-tint2)" },
  gs: { bg: "var(--green-tint2)", fg: "var(--green-text)", br: "var(--green-tint2)" },
  r: { bg: "var(--red-bg)", fg: "var(--red)", br: "var(--red-br)" },
};

export const NAV = [
  { k: "overview", label: "Overview", href: "/", d: "M4 13h6v7H4zM14 4h6v16h-6z" },
  { k: "goals", label: "Goals", href: "/goals", d: "M12 5a7 7 0 100 14 7 7 0 000-14M12 9a3 3 0 100 6 3 3 0 000-6" },
  { k: "posts", label: "Posts", href: "/posts", d: "M5 6h14M5 12h14M5 18h9" },
  { k: "assets", label: "Assets", href: "/assets", d: "M4 6h16v12H4zM4 15l5-4 4 3 3-2 4 3" },
  { k: "calendar", label: "Calendar", href: "/calendar", d: "M4 7h16v13H4zM4 11h16M8 4v3M16 4v3" },
  { k: "accounts", label: "Accounts", href: "/accounts", d: "M12 8a3 3 0 100 6 3 3 0 000-6M5 20c1.6-3.4 4-5 7-5s5.4 1.6 7 5" },
  { k: "usage", label: "Usage", href: "/usage", d: "M4 19l5-6 4 3 7-9" },
  { k: "settings", label: "Settings", href: "/settings", d: "M12 9a3 3 0 100 6 3 3 0 000-6M12 3v3M12 18v3M4 12h3M17 12h3" },
  { k: "logs", label: "Logs", href: "/logs", d: "M5 4h9l5 5v11H5zM14 4v5h5M8 13h8M8 17h5" },
];

/** Placeholder swatches for assets that have no rendered thumbnail yet. */
export const TINTS = [
  "var(--k100)", "var(--k200)", "var(--w100)",
  "var(--w200)", "var(--k300)", "var(--green-tint)",
];

export interface Workspace {
  goals: Goal[];
  posts: Post[];
  assets: Asset[];
  models: Model[];
}

/** A new workspace starts empty — content arrives from goals, uploads and runs. */
export const EMPTY_WORKSPACE: Workspace = {
  goals: [],
  posts: [],
  assets: [],
  models: [],
};

/** Template for a goal the user has not filled in yet. */
export function blankGoal(now: number): Goal {
  return {
    id: "",
    name: "",
    platforms: [],
    brandLogoAssetId: "",
    captionPrompt: "",
    imagePrompt: "",
    startDate: new Date(now).toISOString(),
    endDate: null,
    schedule: { cadence: "weekly", time: "09:30", weekdays: [], monthDay: 1 },
    referenceAssetIds: [],
    imageAssetIds: [],
    modelId: "",
    status: "active",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
}
