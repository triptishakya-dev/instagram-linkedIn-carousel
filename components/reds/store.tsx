"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { EMPTY_WORKSPACE, STATES } from "@/lib/reds/data";
import { iso } from "@/lib/reds/format";
import type {
  Asset,
  ConfirmSpec,
  Goal,
  Model,
  ModelRole,
  NewModelDraft,
  PickerSpec,
  Post,
  PostState,
  Toast,
  UploadItem,
} from "@/lib/reds/types";

export type Theme = "light" | "dark" | "system";
export type Density = "compact" | "comfortable";
export type SortSpec = { col: string; dir: "asc" | "desc" };

export interface Settings {
  wsName: string;
  timezone: string;
  dateFormat: string;
  currency: string;
  igRatio: string;
  liRatio: string;
  igSlides: number;
  liSlides: number;
  firstComment: boolean;
  logoId: string | null;
  captionPrompt: string;
  imagePrompt: string;
  defCaptionModel: string;
  defSlideModel: string;
  defScope: string;
  bulkThreshold: number;
  notif: Record<string, [boolean, boolean]>;
}

export interface TeamMember {
  name: string;
  email: string;
  role: string;
}

interface Store {
  // ---- data ----
  goals: Goal[];
  setGoals: React.Dispatch<React.SetStateAction<Goal[]>>;
  posts: Post[];
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  assets: Asset[];
  setAssets: React.Dispatch<React.SetStateAction<Asset[]>>;
  models: Model[];
  setModels: React.Dispatch<React.SetStateAction<Model[]>>;

  assetById: (id: string) => Asset | undefined;
  goalById: (id: string) => Goal | undefined;
  modelById: (id: string) => Model | undefined;
  patchPost: (id: string, patch: Partial<Post>) => void;
  postsForGoal: (id: string) => Post[];

  // ---- prefs ----
  theme: Theme;
  setTheme: (t: Theme) => void;
  collapsed: boolean;
  toggleSidebar: () => void;
  density: Density;
  setDensity: (d: Density) => void;

  // ---- posts table (shared with calendar) ----
  filterStates: PostState[];
  setFilterStates: React.Dispatch<React.SetStateAction<PostState[]>>;
  filterGoal: string;
  setFilterGoal: (g: string) => void;
  sort: SortSpec[];
  setSort: React.Dispatch<React.SetStateAction<SortSpec[]>>;
  groupBy: string;
  setGroupBy: (g: string) => void;
  closedGroups: Record<string, boolean>;
  setClosedGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  pageSize: number;
  setPageSize: (n: number) => void;
  cols: Record<string, boolean>;
  setCols: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  sel: Record<string, boolean>;
  setSel: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  lastSel: string | null;
  setLastSel: (id: string | null) => void;

  // ---- overlays ----
  palette: boolean;
  setPalette: (v: boolean) => void;
  q: string;
  setQ: (v: string) => void;
  sheet: boolean;
  setSheet: (v: boolean) => void;
  confirm: ConfirmSpec | null;
  ask: (c: ConfirmSpec | null) => void;
  picker: PickerSpec | null;
  setPicker: (p: PickerSpec | null) => void;
  drawerId: string | null;
  setDrawerId: (id: string | null) => void;
  newModel: NewModelDraft | null;
  setNewModel: React.Dispatch<React.SetStateAction<NewModelDraft | null>>;
  uploadModal: boolean;
  setUploadModal: (v: boolean) => void;
  uploads: UploadItem[];
  setUploads: React.Dispatch<React.SetStateAction<UploadItem[]>>;

  toasts: Toast[];
  toast: (text: string, undo?: (() => void) | null) => void;

  // ---- goal editor draft ----
  goalDraft: Goal | null;
  setGoalDraft: React.Dispatch<React.SetStateAction<Goal | null>>;
  goalTouched: Record<string, boolean>;
  setGoalTouched: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;

  // ---- settings ----
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  team: TeamMember[];
  setTeam: React.Dispatch<React.SetStateAction<TeamMember[]>>;

  budgetCap: number;
  setBudgetCap: (n: number) => void;

  // ---- viewport ----
  vw: number;

  /**
   * Client clock, captured once on mount. Null during prerender and the first
   * render pass, so date-dependent views can hold off rather than emit markup
   * the browser would disagree with on hydration.
   */
  now: number | null;

  // ---- navigation ----
  go: (href: string) => void;

  // ---- derived ----
  filtered: () => Post[];
}

const Ctx = createContext<Store | null>(null);

export function useReds(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("useReds must be used inside <RedsProvider>");
  return v;
}

const PREFS_KEY = "reds:prefs";

export function RedsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [goals, setGoals] = useState<Goal[]>(EMPTY_WORKSPACE.goals);
  const [posts, setPosts] = useState<Post[]>(EMPTY_WORKSPACE.posts);
  const [assets, setAssets] = useState<Asset[]>(EMPTY_WORKSPACE.assets);
  const [models, setModels] = useState<Model[]>(EMPTY_WORKSPACE.models);

  const [theme, setThemeRaw] = useState<Theme>("system");
  const [collapsed, setCollapsed] = useState(false);
  const [density, setDensityRaw] = useState<Density>("compact");

  const [filterStates, setFilterStates] = useState<PostState[]>([]);
  const [filterGoal, setFilterGoal] = useState("all");
  const [sort, setSort] = useState<SortSpec[]>([{ col: "scheduled", dir: "asc" }]);
  const [groupBy, setGroupBy] = useState("none");
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [cols, setCols] = useState<Record<string, boolean>>({
    carousel: true, id: true, goal: true, platforms: true, state: true, scheduled: true,
    tokens: true, cost: true, gen: true, runs: true, updated: true,
  });
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [lastSel, setLastSel] = useState<string | null>(null);

  const [palette, setPalette] = useState(false);
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [picker, setPicker] = useState<PickerSpec | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [newModel, setNewModel] = useState<NewModelDraft | null>(null);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [goalDraft, setGoalDraft] = useState<Goal | null>(null);
  const [goalTouched, setGoalTouched] = useState<Record<string, boolean>>({});

  const [budgetCap, setBudgetCap] = useState(4200000);
  const [vw, setVw] = useState(1440);
  const [now, setNow] = useState<number | null>(null);

  const [settings, setSettings] = useState<Settings>({
    wsName: "",
    timezone: "Asia/Kolkata (IST)",
    dateFormat: "DD MMM YYYY",
    currency: "INR (₹)",
    igRatio: "4:5",
    liRatio: "1:1",
    igSlides: 8,
    liSlides: 6,
    firstComment: true,
    logoId: null,
    captionPrompt: "",
    imagePrompt: "",
    defCaptionModel: "mdl-haiku",
    defSlideModel: "mdl-sonnet",
    defScope: "slide",
    bulkThreshold: 2000,
    notif: {
      failed: [true, true],
      published: [false, true],
      budget: [true, true],
      expiry: [true, false],
    },
  });

  const [team, setTeam] = useState<TeamMember[]>([]);

  // ---- theme ----
  const mqRef = useRef<MediaQueryList | null>(null);

  const applyTheme = useCallback((t: Theme) => {
    const mq = mqRef.current;
    const dark = t === "dark" || (t === "system" && !!mq && mq.matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }, []);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeRaw(t);
      applyTheme(t);
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: t, collapsed, density }));
      } catch {
        /* in-memory only */
      }
    },
    [applyTheme, collapsed, density],
  );

  const persist = useCallback((patch: { theme?: Theme; collapsed?: boolean; density?: Density }) => {
    try {
      const cur = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ...cur, ...patch }));
    } catch {
      /* in-memory only */
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      persist({ collapsed: !c });
      return !c;
    });
  }, [persist]);

  const setDensity = useCallback(
    (d: Density) => {
      setDensityRaw(d);
      persist({ density: d });
    },
    [persist],
  );

  useEffect(() => {
    mqRef.current = window.matchMedia("(prefers-color-scheme: dark)");
    let restored: Theme = "system";
    try {
      const v = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      if (v && typeof v === "object") {
        restored = v.theme || "system";
        // Hydrating persisted prefs is a one-shot read from an external store;
        // it cannot happen during render because localStorage is client-only,
        // and the values are identical on every subsequent render.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setThemeRaw(restored);
        setCollapsed(!!v.collapsed);
        setDensityRaw(v.density || "compact");
      }
    } catch {
      /* in-memory only */
    }
    applyTheme(restored);

    const onMq = () => applyTheme(restored);
    mqRef.current.addEventListener("change", onMq);
    return () => mqRef.current?.removeEventListener("change", onMq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- viewport + shortcuts ----
  useEffect(() => {
    setNow(Date.now());
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
      if (e.key === "Escape") {
        setPalette(false);
        setSheet(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // ---- initial API data fetch ----
  useEffect(() => {
    fetch("/api/goals")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.goals && Array.isArray(data.goals)) {
          setGoals(
            data.goals.map((g: any) => ({
              id: g.id,
              name: g.name,
              platforms: (g.platforms || []).map((p: string) => p.toLowerCase()),
              brandLogoAssetId: g.brandLogoAssetId || "",
              captionPrompt: g.captionPrompt || "",
              imagePrompt: g.imagePrompt || "",
              startDate: g.startDate,
              endDate: g.endDate,
              schedule: g.schedule || { cadence: "weekly", time: "09:30", weekdays: [], monthDay: 1 },
              referenceAssetIds: g.referenceAssetIds || [],
              imageAssetIds: g.imageAssetIds || [],
              modelId: g.modelId || "",
              status: (g.status || "ACTIVE").toLowerCase(),
              createdAt: g.createdAt,
              updatedAt: g.updatedAt,
            })),
          );
        }
      })
      .catch(() => {});

    fetch("/api/models")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.models && Array.isArray(data.models)) {
          setModels(
            data.models.map((m: any) => ({
              id: m.id,
              label: m.label,
              provider: m.provider,
              role: (m.role || "BOTH").toLowerCase() as ModelRole,
              inputPricePerMTokInr: m.inputPricePerMTokInr,
              outputPricePerMTokInr: m.outputPricePerMTokInr,
              maxTokens: m.maxTokens,
              temperature: m.temperature,
              enabled: m.enabled,
              keyLast4: m.keyLast4 || undefined,
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  // ---- toasts ----
  const toast = useCallback((text: string, undo?: (() => void) | null) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, undo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);

  // ---- lookups ----
  const assetById = useCallback((id: string) => assets.find((a) => a.id === id), [assets]);
  const goalById = useCallback((id: string) => goals.find((g) => g.id === id), [goals]);
  const modelById = useCallback((id: string) => models.find((m) => m.id === id), [models]);

  const patchPost = useCallback((id: string, patch: Partial<Post>) => {
    setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: iso(Date.now()) } : p)));
  }, []);

  const postsForGoal = useCallback((id: string) => posts.filter((p) => p.goalId === id), [posts]);

  const filtered = useCallback(
    () =>
      posts.filter(
        (p) =>
          (!filterStates.length || filterStates.includes(p.state)) &&
          (filterGoal === "all" || p.goalId === filterGoal),
      ),
    [posts, filterStates, filterGoal],
  );

  const go = useCallback(
    (href: string) => {
      setPalette(false);
      setSheet(false);
      setQ("");
      router.push(href);
    },
    [router],
  );

  const ask = useCallback((c: ConfirmSpec | null) => setConfirm(c), []);

  const value = useMemo<Store>(
    () => ({
      goals, setGoals, posts, setPosts, assets, setAssets, models, setModels,
      assetById, goalById, modelById, patchPost, postsForGoal,
      theme, setTheme, collapsed, toggleSidebar, density, setDensity,
      filterStates, setFilterStates, filterGoal, setFilterGoal,
      sort, setSort, groupBy, setGroupBy, closedGroups, setClosedGroups,
      page, setPage, pageSize, setPageSize, cols, setCols, sel, setSel, lastSel, setLastSel,
      palette, setPalette, q, setQ, sheet, setSheet,
      confirm, ask, picker, setPicker, drawerId, setDrawerId,
      newModel, setNewModel, uploadModal, setUploadModal, uploads, setUploads,
      toasts, toast,
      goalDraft, setGoalDraft, goalTouched, setGoalTouched,
      settings, setSettings, team, setTeam,
      budgetCap, setBudgetCap, vw, now, go, filtered,
    }),
    [
      goals, posts, assets, models, assetById, goalById, modelById, patchPost, postsForGoal,
      theme, setTheme, collapsed, toggleSidebar, density, setDensity,
      filterStates, filterGoal, sort, groupBy, closedGroups,
      page, pageSize, cols, sel, lastSel,
      palette, q, sheet, confirm, ask, picker, drawerId,
      newModel, uploadModal, uploads, toasts, toast,
      goalDraft, goalTouched, settings, team, budgetCap, vw, now, go, filtered,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Shared visual helpers, lifted from the brief so every view tints identically.
export const seg = (on: boolean) => ({
  bg: on ? "var(--surface)" : "transparent",
  fg: on ? "var(--fg)" : "var(--fg3)",
});

export const chip = (on: boolean) => ({
  bg: on ? "var(--green-tint)" : "transparent",
  fg: on ? "var(--green-text)" : "var(--fg2)",
  br: on ? "var(--green-line)" : "var(--border)",
});

export const stateLabel = (s: PostState) => STATES[s].l;

/** Attribution for files uploaded in this session — there is no auth layer yet. */
export const CURRENT_USER = "You";

export function useNow(): number | null {
  return useReds().now;
}
