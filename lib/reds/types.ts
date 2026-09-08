export type Platform = "instagram" | "linkedin";

export type PostState =
  | "draft"
  | "queued"
  | "generating"
  | "ready"
  | "scheduled"
  | "published"
  | "failed";

export type AssetKind = "image" | "logo" | "video" | "document";

export type Cadence = "daily" | "alternate" | "weekly" | "monthly";

export type ModelRole = "caption" | "slides" | "both";

export interface Model {
  id: string;
  label: string;
  provider: string;
  apiModelId?: string | null;
  role: ModelRole;
  inputPricePerMTokInr: number;
  outputPricePerMTokInr: number;
  maxTokens: number;
  temperature: number;
  enabled: boolean;
  keyLast4?: string;
}

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  tags: string[];
  usedInPostIds: string[];
  uploadedBy: string;
  uploadedAt: string;
  tint: string;
  previewUrl?: string;
}

export interface GoalSchedule {
  cadence: Cadence;
  time: string;
  weekdays: number[];
  monthDay: number;
}

export interface Goal {
  id: string;
  name: string;
  platforms: Platform[];
  brandLogoAssetId: string;
  captionPrompt: string;
  imagePrompt: string;
  startDate: string;
  endDate: string | null;
  schedule: GoalSchedule;
  referenceAssetIds: string[];
  imageAssetIds: string[];
  modelId: string;
  status: "active" | "paused" | "ended";
  createdAt: string;
  updatedAt: string;
}

export type SlideLayout = "cover" | "statement" | "split" | "list" | "cta";

export interface Slide {
  index: number;
  assetId: string;
  headline: string;
  body: string;
  layout: SlideLayout;
  /**
   * Signed URL for the rendered image, when one exists.
   *
   * Generated slides are real objects in S3; hand-composed ones have no image
   * yet, so views fall back to the placeholder tint when this is absent.
   */
  previewUrl?: string;
  width?: number;
  height?: number;
}

export interface Version {
  id: string;
  label: string;
  scope: string;
  createdAt: string;
  modelId: string;
  tokens: number;
  cost: number;
  note: string;
  headline: string;
  body: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostInr: number;
  generationMs: number;
  modelId: string;
  runs: number;
}

export interface Post {
  id: string;
  goalId: string;
  /**
   * The generation run that produced this post, when one did.
   *
   * A post is written per platform: one run targeting Instagram and LinkedIn
   * produces two rows, each with its own caption and its own media, and this
   * id is the only thing that pairs them. The detail view needs the pair to
   * show what each platform is actually getting, so the id has to survive the
   * trip to the client. Null for a post composed by hand.
   */
  generationRunId: string | null;
  platforms: Platform[];
  slides: Slide[];
  caption: string;
  hashtags: string[];
  state: PostState;
  scheduledFor: string | null;
  publishedAt: string | null;
  usage: Usage;
  versions: Version[];
  createdAt: string;
  updatedAt: string;
}

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  pct: number;
  state: "uploading" | "done" | "failed" | "duplicate";
  file: File;
}

export interface Toast {
  id: string;
  text: string;
  undo?: (() => void) | null;
}

export interface ConfirmSpec {
  title: string;
  body: string;
  items?: { label: string }[];
  actionLabel?: string;
  hasAction?: boolean;
  border?: string;
  bg?: string;
  fg?: string;
  run?: () => void;
}

export interface PickerSpec {
  kind: "any" | "logo" | "image";
  field: "brandLogoAssetId" | "referenceAssetIds" | "imageAssetIds";
  multi: boolean;
}

export interface NewModelDraft {
  /**
   * Set when the draft is editing an existing row rather than creating one.
   *
   * One draft type and one modal serve both: the Add flow leaves this unset
   * and POSTs, the Edit flow fills it from the card and PUTs. A second
   * near-identical modal would drift from this one field by field.
   */
  id?: string;
  label: string;
  provider: string;
  apiModelId: string;
  key: string;
  role: ModelRole;
  maxTokens: number;
  temperature: number;
  inPrice: number;
  outPrice: number;
  enabled: boolean;
}
