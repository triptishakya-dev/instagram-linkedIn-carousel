"use client";

import { useState } from "react";
import { uploadAsset, type AssetRecord } from "@/lib/api-client";
import { blankGoal } from "@/lib/reds/data";
import { DAY, DOW, MONO, inr, iso } from "@/lib/reds/format";
import { toRedsAsset } from "@/lib/reds/map";
import { MAX_PROMPT_CHARS, promptTooLongMessage } from "@/lib/validation/prompt";
import { chip, seg, useReds } from "../store";
import type { Asset, Cadence, Goal, Platform } from "@/lib/reds/types";

const CADS: { k: Cadence; label: string }[] = [
  { k: "daily", label: "Daily" },
  { k: "alternate", label: "Alternate days" },
  { k: "weekly", label: "Weekly" },
  { k: "monthly", label: "Monthly" },
];

const H2: React.CSSProperties = { margin: "0 0 4px", fontSize: 20, fontWeight: 600, lineHeight: 1.35 };
const SUB: React.CSSProperties = { margin: "0 0 14px", fontSize: 12, color: "var(--fg2)" };
const LBL: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--fg2)", marginBottom: 6 };
const INPUT: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--r3)",
  background: "var(--surface)",
  fontSize: 13,
};

/** Projects how many posts a cadence produces across the goal's window. */
function cadenceCount(cad: Cadence, startStr: string, endStr: string | null, weekdays: number[]) {
  const st = new Date(startStr);
  const open = !endStr;
  const end = endStr ? new Date(endStr) : new Date(st.getTime() + 90 * DAY);
  const days = Math.max(1, Math.round((end.getTime() - st.getTime()) / DAY) + 1);
  const wd = Math.max(1, (weekdays || []).length);
  const n =
    cad === "daily" ? days
      : cad === "alternate" ? Math.ceil(days / 2)
        : cad === "weekly" ? Math.max(1, Math.round(days / 7)) * wd
          : Math.max(1, Math.round(days / 30));
  return { n, days, open };
}

export function GoalEditor({ id }: { id: string }) {
  const s = useReds();
  if (s.now == null) return null;
  return <GoalEditorInner id={id} now={s.now} />;
}

function GoalEditorInner({ id, now }: { id: string; now: number }) {
  const s = useReds();
  const [zoneHot, setZoneHot] = useState(false);
  const [dragAsset, setDragAsset] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  const isNew = id === "new";
  const base = isNew ? null : s.goals.find((g) => g.id === id) || s.goals[0];

  // A new goal starts empty even on a direct visit to /goals/new, where no
  // draft was seeded by the "New goal" button.
  const draftMatches = s.goalDraft && (isNew ? s.goalDraft.id === "" : s.goalDraft.id === base?.id);
  const d: Goal = draftMatches ? s.goalDraft! : base ? { ...base } : blankGoal(now);

  const set = (patch: Partial<Goal>) => s.setGoalDraft({ ...d, ...patch });
  const touch = (k: string) => s.setGoalTouched((x) => ({ ...x, [k]: true }));

  const captionPromptBad = (d.captionPrompt || "").length > MAX_PROMPT_CHARS;
  const imagePromptBad = (d.imagePrompt || "").length > MAX_PROMPT_CHARS;
  const promptBad = captionPromptBad || imagePromptBad;

  const nameBad = !d.name || !d.name.trim();
  const nameShow = nameBad && s.goalTouched.name;
  const startStr = String(d.startDate).slice(0, 10);
  const endStr = d.endDate ? String(d.endDate).slice(0, 10) : "";
  const endBad = !!endStr && endStr < startStr;
  const platBad = !d.platforms.length;

  const selectedLogo = s.assets.find((a) => a.id === d.brandLogoAssetId);
  const displayLogoPreview = logoPreviewUrl || selectedLogo?.previewUrl;
  const displayLogoName = selectedLogo
    ? selectedLogo.name
    : logoPreviewUrl
      ? "Brand logo"
      : d.brandLogoAssetId || "No logo selected";

  const displayLogoSub = selectedLogo
    ? `${selectedLogo.width || 1080}×${selectedLogo.height || 1080} · ${selectedLogo.mimeType}`
    : d.brandLogoAssetId
      ? "Selected logo"
      : "Add or select a brand logo";

  const model = s.modelById(d.modelId) || s.models[0];
  const cad = d.schedule.cadence;
  const count = cadenceCount(cad, startStr, endStr || null, d.schedule.weekdays);
  const perPost = model
    ? ((4200 / 1e6) * model.inputPricePerMTokInr + (1800 / 1e6) * model.outputPricePerMTokInr) *
      (d.platforms.length > 1 ? 2 : 1)
    : 0;

  const ratioWarn = (a: Asset) => {
    if (!a.width || !a.height) return "";
    const r = a.width / a.height;
    if (d.platforms.includes("instagram") && Math.abs(r - 0.8) > 0.18) return "Crops at 4:5";
    if (d.platforms.includes("linkedin") && Math.abs(r - 1) > 0.3) return "Crops at 1:1";
    return "";
  };

  const addAssets = (ids: string[]) =>
    set({ imageAssetIds: [...d.imageAssetIds, ...ids.filter((i) => !d.imageAssetIds.includes(i))] });

  const ingest = async (files: FileList | null | undefined) => {
    const arr = Array.from(files || []).slice(0, 8);
    if (!arr.length) return;

    const settled = await Promise.allSettled(
      arr.map((f) => uploadAsset(f, { kind: "IMAGE", tags: ["upload"] })),
    );

    const uploaded = settled
      .filter((r): r is PromiseFulfilledResult<AssetRecord> => r.status === "fulfilled")
      .map((r) => r.value);

    if (uploaded.length) {
      s.setAssets((xs) => [
        ...uploaded.map(toRedsAsset),
        ...xs.filter((x) => !uploaded.some((u) => u.id === x.id)),
      ]);
      addAssets(uploaded.map((u) => u.id));
    }

    const failed = arr.length - uploaded.length;
    s.toast(
      failed
        ? `${uploaded.length} uploaded, ${failed} failed`
        : uploaded.length + (uploaded.length === 1 ? " image added" : " images added"),
    );
  };

  /**
   * The logo is an asset like any other, so it goes through the same
   * presign -> S3 -> row pipeline. The goal then stores the asset id, which
   * survives a reload; the previous version kept a tmp key and a blob URL,
   * neither of which outlived the tab.
   */
  const uploadLogoToS3 = async (file: File) => {
    const preview = URL.createObjectURL(file);
    setLogoPreviewUrl(preview);
    setLogoUploading(true);

    try {
      const asset = await uploadAsset(file, { kind: "LOGO", tags: ["logo"] });
      s.setAssets((xs) => [toRedsAsset(asset), ...xs.filter((x) => x.id !== asset.id)]);
      set({ brandLogoAssetId: asset.id });
      setLogoPreviewUrl(asset.previewUrl ?? preview);
      s.toast("Logo uploaded to S3");
    } catch (err) {
      setLogoPreviewUrl(null);
      s.toast(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      URL.revokeObjectURL(preview);
      setLogoUploading(false);
    }
  };

  const saveDisabled = nameBad || endBad || platBad || promptBad || saving || logoUploading;
  const saveTitle = nameBad
    ? "Add a goal name to save."
    : platBad
      ? "Pick at least one platform to save."
      : endBad
        ? "Fix the window — the end date is before the start."
        : imagePromptBad
          ? promptTooLongMessage("Image prompt")
          : captionPromptBad
            ? promptTooLongMessage("Caption prompt")
            : `Saves ${count.n} scheduled posts at ${d.schedule.time} IST.`;

  const prompts = [
    {
      label: "Caption prompt",
      help: "Instructions for post copy and hashtags. Variables: {goalName}, {brandVoice}, {assetTags}.",
      value: d.captionPrompt,
      over: captionPromptBad,
      set: (v: string) => set({ captionPrompt: v }),
      tips: "Name the constraint first. Ask for one number, not three. Cap the hashtag count in the prompt itself — the model over-tags when left open.",
    },
    {
      label: "Image prompt",
      help: "Drives layout and typography of composed slides using the selected assets. It does not generate imagery.",
      value: d.imagePrompt,
      over: imagePromptBad,
      set: (v: string) => set({ imagePrompt: v }),
      tips: "Say how many slides, which layout per position, and where the asset sits. Reference the type steps by size so headlines stay inside the safe area.",
    },
  ];

  const platforms: { k: Platform; label: string; meta: string }[] = [
    { k: "instagram", label: "Instagram", meta: "4:5, up to 10 slides" },
    { k: "linkedin", label: "LinkedIn", meta: "1.91:1 or 1:1, up to 20 slides" },
  ];

  const save = async () => {
    if (saveDisabled) { touch("name"); return; }
    try {
      setSaving(true);
      const endpoint = isNew ? "/api/goals" : `/api/goals/${base!.id}`;
      const method = isNew ? "POST" : "PUT";

      const payload = {
        name: d.name,
        platforms: d.platforms.map((p) => p.toUpperCase()),
        brandLogoAssetId: d.brandLogoAssetId || null,
        captionPrompt: d.captionPrompt || null,
        imagePrompt: d.imagePrompt || null,
        startDate: d.startDate,
        endDate: d.endDate || null,
        schedule: d.schedule,
        referenceAssetIds: d.referenceAssetIds,
        imageAssetIds: d.imageAssetIds,
        modelId: d.modelId || null,
        status: (d.status || "ACTIVE").toUpperCase(),
      };

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || "Failed to save goal.");
      }

      const savedGoal = await res.json();
      const formattedSavedGoal: Goal = {
        id: savedGoal.id,
        name: savedGoal.name,
        platforms: (savedGoal.platforms || []).map((p: string) => p.toLowerCase() as Platform),
        brandLogoAssetId: savedGoal.brandLogoAssetId || "",
        captionPrompt: savedGoal.captionPrompt || "",
        imagePrompt: savedGoal.imagePrompt || "",
        startDate: savedGoal.startDate,
        endDate: savedGoal.endDate,
        schedule: savedGoal.schedule || d.schedule,
        referenceAssetIds: savedGoal.referenceAssetIds || [],
        imageAssetIds: savedGoal.imageAssetIds || [],
        modelId: savedGoal.modelId || "",
        status: (savedGoal.status || "ACTIVE").toLowerCase() as Goal["status"],
        createdAt: savedGoal.createdAt,
        updatedAt: savedGoal.updatedAt,
      };

      if (isNew) {
        s.setGoals((gs) => [formattedSavedGoal, ...gs]);
      } else {
        s.setGoals((gs) => gs.map((g) => (g.id === base!.id ? formattedSavedGoal : g)));
      }

      s.setGoalDraft(null);
      s.setGoalTouched({});
      s.toast("Goal saved to database");
      s.go("/goals");
    } catch (err: any) {
      s.toast(err.message || "Failed to save goal");
    } finally {
      setSaving(false);
    }
  };

  const [logoModalOpen, setLogoModalOpen] = useState(false);

  return (
    <>
      {logoModalOpen ? (
        <div role="dialog" aria-label="Add Brand Logo" style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(33,33,33,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r5)", boxShadow: "var(--shadow)", width: "min(560px, 94vw)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Add Brand Logo</h2>
              <span style={{ flex: "1 1 auto" }} />
              <button type="button" onClick={() => setLogoModalOpen(false)} style={{ border: 0, background: "transparent", color: "var(--fg2)", fontSize: 14, cursor: "pointer" }}>
                ✕
              </button>
            </div>

            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
              {/* S3 File Upload Option */}
              <div style={{ padding: 16, border: "2px dashed var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)", textAlign: "center" }}>
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500 }}>Upload logo file directly to AWS S3</p>
                <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--fg2)" }}>Supports PNG, JPG, or WEBP up to 25MB.</p>
                <label style={{ display: "inline-block", padding: "8px 16px", border: "1px solid var(--green-line)", borderRadius: "var(--r3)", background: "var(--green)", color: "var(--on-green)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {logoUploading ? "Uploading to S3..." : "Choose File to Upload"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        await uploadLogoToS3(f);
                        setLogoModalOpen(false);
                      }
                    }}
                  />
                </label>
              </div>

              {/* Select Existing Logo Option */}
              <div>
                <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--fg2)" }}>Or select from asset library</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, maxHeight: 180, overflowY: "auto" }}>
                  {s.assets.filter((a) => a.kind === "logo" || a.kind === "image").map((a) => {
                    const isSelected = d.brandLogoAssetId === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          set({ brandLogoAssetId: a.id });
                          setLogoPreviewUrl(a.previewUrl || null);
                          setLogoModalOpen(false);
                          s.toast("Selected " + a.name);
                        }}
                        style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8, border: `1px solid ${isSelected ? "var(--green-line)" : "var(--border)"}`, borderRadius: "var(--r3)", background: isSelected ? "var(--green-tint)" : "var(--surface)", textAlign: "left", cursor: "pointer" }}
                      >
                        <span aria-hidden style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: "var(--r2)", background: a.tint, overflow: "hidden" }}>
                          {a.previewUrl ? <img src={a.previewUrl} alt={a.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                      </button>
                    );
                  })}
                  {s.assets.filter((a) => a.kind === "logo" || a.kind === "image").length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--fg2)", margin: 0, gridColumn: "1 / -1" }}>No logo assets in library yet. Upload one above!</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 18px", borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
              <button type="button" onClick={() => setLogoModalOpen(false)} style={{ padding: "7px 14px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 13 }}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ maxWidth: 1040, width: "100%", display: "flex", flexDirection: "column", gap: 34, paddingBottom: 24 }}>
        {/* ---- identity section (2 columns on desktop) ---- */}
        <section>
          <h2 style={H2}>Identity</h2>
          <p style={SUB}>Name the standing intent, not the individual post.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, alignItems: "start" }}>
            <div>
              <label style={LBL}>Goal name</label>
              <input
                value={d.name}
                onChange={(e) => set({ name: e.target.value })}
                onBlur={() => touch("name")}
                aria-invalid={nameBad}
                placeholder="e.g. Weekly Tech Insights"
                style={{ width: "100%", padding: "9px 11px", border: `1px solid ${nameShow ? "var(--red)" : "var(--border)"}`, borderRadius: "var(--r3)", background: "var(--surface)", fontSize: 14 }}
              />
              {nameShow ? (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--red)" }}>
                  A goal needs a name — it labels every post it produces.
                </p>
              ) : null}
            </div>

            <div>
              <label style={LBL}>Brand logo</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)" }}>
                {displayLogoPreview ? (
                  <img src={displayLogoPreview} alt="Logo preview" style={{ width: 40, height: 40, borderRadius: "var(--r2)", objectFit: "cover" }} />
                ) : (
                  <span aria-hidden style={{ width: 40, height: 40, borderRadius: "var(--r2)", border: "1px solid var(--border-strong)", background: selectedLogo?.tint || "var(--n100)" }} />
                )}
                <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {logoUploading ? "Uploading to AWS S3..." : displayLogoName}
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--fg2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {displayLogoSub}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setLogoModalOpen(true)}
                  style={{ padding: "6px 14px", border: "1px solid var(--green-line)", borderRadius: "var(--r3)", background: "var(--green)", color: "var(--on-green)", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Add Logo
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ---- prompts section (2 columns on desktop) ---- */}
        <section>
          <h2 style={H2}>Prompts</h2>
          <p style={SUB}>Two prompts, two jobs. Neither one generates imagery.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24, alignItems: "start" }}>
            {prompts.map((p) => (
              <div key={p.label}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{p.label}</label>
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--fg2)" }}>{p.help}</p>
                <textarea
                  value={p.value}
                  onChange={(e) => p.set(e.target.value)}
                  rows={5}
                  aria-label={p.label}
                  aria-invalid={p.over}
                  style={{ width: "100%", padding: 10, border: `1px solid ${p.over ? "var(--red-br)" : "var(--border)"}`, borderRadius: "var(--r3)", background: "var(--surface2)", color: "var(--fg)", fontFamily: MONO, fontSize: 12, lineHeight: 1.5, resize: "vertical" }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
                  {/* The ceiling is shown alongside the count, so a long brief
                      hits a visible budget rather than a rejection on save. */}
                  <span style={{ fontFamily: MONO, fontSize: 11, color: p.over ? "var(--red)" : "var(--fg3)" }}>
                    {p.value.length.toLocaleString("en-US")} / {MAX_PROMPT_CHARS.toLocaleString("en-US")} characters
                  </span>
                  <span style={{ flex: "1 1 auto" }} />
                  <details>
                    <summary style={{ fontSize: 12, color: "var(--green-text)", cursor: "pointer" }}>Prompt tips</summary>
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--fg2)", lineHeight: 1.5 }}>{p.tips}</p>
                  </details>
                </div>
                {p.over ? (
                  <p role="alert" style={{ margin: "6px 0 0", fontSize: 12, color: "var(--red)" }}>
                    {promptTooLongMessage(p.label)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {/* ---- platforms & model section (2 columns on desktop) ---- */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24, alignItems: "start" }}>
          {/* Platforms */}
          <section>
            <h2 style={{ ...H2, marginBottom: 14 }}>Platforms</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {platforms.map((p) => {
                const on = d.platforms.includes(p.k);
                return (
                  <label key={p.k} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, border: `1px solid ${on ? "var(--green-line)" : "var(--border)"}`, borderRadius: "var(--r3)", background: on ? "var(--green-tint)" : "var(--surface)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => set({ platforms: on ? d.platforms.filter((x) => x !== p.k) : [...d.platforms, p.k] })}
                      style={{ accentColor: "var(--green-line)" }}
                    />
                    <span style={{ flex: "1 1 auto" }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>{p.label}</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--fg2)" }}>{p.meta}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {platBad ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--red)" }}>Pick at least one platform.</p> : null}
          </section>

          {/* Model selection */}
          <section>
            <h2 style={{ ...H2, marginBottom: 14 }}>Model</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)" }}>
              <label style={LBL}>AI Generation Model</label>
              <select value={d.modelId} onChange={(e) => set({ modelId: e.target.value })} aria-label="Model" style={{ ...INPUT, width: "100%" }}>
                <option value="">Select a model</option>
                {s.models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              {s.models.length === 0 ? (
                <button
                  type="button"
                  onClick={() => s.go("/accounts")}
                  style={{ border: 0, background: "transparent", padding: 0, fontSize: 13, color: "var(--green-text)", textAlign: "left" }}
                >
                  No models configured — add one in Accounts
                </button>
              ) : (
                <span style={{ fontSize: 12, color: "var(--fg2)" }}>
                  Estimated cost: {inr(perPost)} per post{d.platforms.length > 1 ? " across both platforms" : ""}
                </span>
              )}
            </div>
          </section>
        </div>

        {/* ---- window & schedule section (2 columns on desktop) ---- */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24, alignItems: "start" }}>
          {/* Window */}
          <section>
            <h2 style={{ ...H2, marginBottom: 14 }}>Window</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={LBL}>Start date</label>
                  <input type="date" value={startStr} onChange={(e) => set({ startDate: e.target.value })} style={{ ...INPUT, width: "100%" }} />
                </div>
                <div>
                  <label style={LBL}>End date</label>
                  <input
                    type="date"
                    value={endStr}
                    onChange={(e) => set({ endDate: e.target.value })}
                    disabled={!endStr}
                    style={{ ...INPUT, width: "100%", border: `1px solid ${endBad ? "var(--red)" : "var(--border)"}`, opacity: endStr ? 1 : 0.5 }}
                  />
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--fg2)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!endStr}
                  onChange={() => set({ endDate: endStr ? null : iso(new Date(startStr).getTime() + 60 * DAY) })}
                  style={{ accentColor: "var(--green-line)" }}
                />
                Runs until paused (no end date)
              </label>
              {endBad ? <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--red)" }}>The end date falls before the start date.</p> : null}

              <div style={{ padding: "12px 14px", border: "1px solid var(--green-tint2)", borderRadius: "var(--r3)", background: "var(--green-tint)" }}>
                <span style={{ fontSize: 24, lineHeight: 1.35, fontWeight: 500, color: "var(--green-text)", fontVariantNumeric: "tabular-nums" }}>
                  {count.n} {count.n === 1 ? "post" : "posts"}
                </span>
                <span style={{ display: "block", fontSize: 12, color: "var(--fg2)", marginTop: 2 }}>
                  {count.open
                    ? "over the next 90 days at this cadence — runs until paused"
                    : `across the ${count.days}-day window at this cadence`}
                </span>
              </div>
            </div>
          </section>

          {/* Schedule */}
          <section>
            <h2 style={{ ...H2, marginBottom: 14 }}>Schedule</h2>
            <label style={LBL}>Cadence</label>
            <div role="group" aria-label="Cadence" style={{ display: "flex", gap: 2, padding: 2, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)" }}>
              {CADS.map((c) => {
                const on = cad === c.k;
                const t = seg(on);
                return (
                  <button key={c.k} type="button" aria-pressed={on} onClick={() => set({ schedule: { ...d.schedule, cadence: c.k } })} style={{ flex: "1 1 0", border: 0, borderRadius: "var(--r2)", padding: "6px 8px", fontSize: 12, background: t.bg, color: t.fg, cursor: "pointer" }}>
                    {c.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 14, marginTop: 16 }}>
              <div>
                <label style={LBL}>Time (IST)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="time" value={d.schedule.time} onChange={(e) => set({ schedule: { ...d.schedule, time: e.target.value } })} style={INPUT} />
                  <span style={{ fontSize: 12, color: "var(--fg2)" }}>UTC+5:30</span>
                </div>
              </div>
              {cad === "alternate" ? (
                <div>
                  <label style={LBL}>Starting date</label>
                  <input type="date" value={startStr} onChange={(e) => set({ startDate: e.target.value })} style={INPUT} />
                </div>
              ) : null}
            </div>

            {cad === "weekly" ? (
              <div style={{ marginTop: 16 }}>
                <label style={LBL}>Weekdays</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {DOW.map((w, i) => {
                    const on = (d.schedule.weekdays || []).includes(i);
                    const c = chip(on);
                    return (
                      <button
                        key={w}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ schedule: { ...d.schedule, weekdays: on ? d.schedule.weekdays.filter((x) => x !== i) : [...(d.schedule.weekdays || []), i] } })}
                        style={{ width: 44, padding: "6px 0", border: `1px solid ${c.br}`, borderRadius: "var(--r3)", background: c.bg, color: c.fg, fontSize: 12, cursor: "pointer" }}
                      >
                        {w}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {cad === "monthly" ? (
              <div style={{ marginTop: 16 }}>
                <label style={LBL}>Day of month</label>
                <select
                  value={String(d.schedule.monthDay || 1)}
                  onChange={(e) => set({ schedule: { ...d.schedule, monthDay: Number(e.target.value) } })}
                  aria-label="Day of month"
                  style={INPUT}
                >
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i} value={String(i + 1)}>{i + 1}</option>
                  ))}
                </select>
                {(d.schedule.monthDay || 1) > 28 ? (
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--amber)" }}>
                    Months without day {d.schedule.monthDay} run on their last day instead.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
        {/* ---- reference assets ---- */}
        <section>
          <h2 style={H2}>Reference assets</h2>
          <p style={SUB}>
            {d.referenceAssetIds.length} {d.referenceAssetIds.length === 1 ? "reference" : "references"} — style and tone references. Never placed into a slide.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {d.referenceAssetIds.map((rid) => {
              const a = s.assetById(rid);
              return (
                <div key={rid} style={{ position: "relative" }}>
                  <span aria-hidden style={{ display: "flex", alignItems: "flex-end", width: 74, height: 74, padding: 5, border: "1px solid var(--border-strong)", borderRadius: "var(--r3)", background: a?.tint || "var(--n100)", fontFamily: MONO, fontSize: 9, color: "var(--fg3)", overflow: "hidden" }}>
                    {a ? a.name.slice(0, 12) : rid}
                  </span>
                  <button
                    type="button"
                    aria-label={"Remove " + (a?.name || rid)}
                    onClick={() => set({ referenceAssetIds: d.referenceAssetIds.filter((x) => x !== rid) })}
                    style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--fg3)", fontSize: 11, lineHeight: 1, padding: 0, cursor: "pointer" }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => { s.setGoalDraft(d); s.setPicker({ kind: "any", field: "referenceAssetIds", multi: true }); }}
              style={{ width: 74, height: 74, border: "1px dashed var(--border-strong)", borderRadius: "var(--r3)", background: "transparent", color: "var(--fg3)", fontSize: 12, cursor: "pointer" }}
            >
              Add
            </button>
          </div>
        </section>

        {/* ---- slide images ---- */}
        <section>
          <h2 style={H2}>Slide images</h2>
          <p style={SUB}>Order maps to slide order. Drag to reorder.</p>
          <div
            onDragOver={(e) => { e.preventDefault(); if (!zoneHot) setZoneHot(true); }}
            onDragLeave={() => setZoneHot(false)}
            onDrop={(e) => { e.preventDefault(); setZoneHot(false); ingest(e.dataTransfer?.files); }}
            style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: 20, border: `1px dashed ${zoneHot ? "var(--green-line)" : "var(--border-strong)"}`, borderRadius: "var(--r4)", background: zoneHot ? "var(--green-tint)" : "transparent" }}
          >
            <span style={{ fontSize: 13, color: "var(--fg2)" }}>Drop images here, or</span>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", fontSize: 12, color: "var(--fg2)", cursor: "pointer" }}>
                Browse files
                <input type="file" multiple accept="image/*" onChange={(e) => ingest(e.target.files)} style={{ display: "none" }} />
              </label>
              <button
                type="button"
                onClick={() => { s.setGoalDraft(d); s.setPicker({ kind: "image", field: "imageAssetIds", multi: true }); }}
                style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 12, cursor: "pointer" }}
              >
                Choose from library
              </button>
            </div>
          </div>

          <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {d.imageAssetIds.map((aid, i) => {
              const a = s.assetById(aid) || ({ name: aid, tint: "var(--n100)", width: 0, height: 0 } as Asset);
              const warn = a.width ? ratioWarn(a) : "";
              return (
                <li
                  key={aid}
                  draggable
                  onDragStart={() => setDragAsset(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragAsset == null || dragAsset === i) return;
                    const arr = d.imageAssetIds.slice();
                    const [m] = arr.splice(dragAsset, 1);
                    arr.splice(i, 0, m);
                    setDragAsset(null);
                    set({ imageAssetIds: arr });
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: 8, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)" }}
                >
                  <span aria-hidden style={{ color: "var(--fg3)", fontSize: 12, cursor: "grab" }}>≡</span>
                  <span aria-hidden style={{ width: 40, height: 40, borderRadius: "var(--r2)", border: "1px solid var(--border-strong)", background: a.tint }} />
                  <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--fg2)", fontFamily: MONO }}>
                      {a.width ? `${a.width}×${a.height}` : "—"}
                    </span>
                  </span>
                  {warn ? (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--amber-bg)", color: "var(--amber)", border: "1px solid var(--amber-br)", whiteSpace: "nowrap" }}>
                      {warn}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={"Remove " + a.name}
                    onClick={() => set({ imageAssetIds: d.imageAssetIds.filter((x) => x !== aid) })}
                    style={{ border: "1px solid var(--border)", borderRadius: "var(--r2)", background: "var(--surface)", color: "var(--fg3)", fontSize: 11, padding: "3px 8px", cursor: "pointer" }}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div style={{ position: "sticky", bottom: 0, display: "flex", alignItems: "center", gap: 12, maxWidth: 1040, width: "100%", padding: "14px 0", background: "var(--bg)", borderTop: "1px solid var(--border)", zIndex: 10 }}>
        <button
          type="button"
          onClick={() => { s.setGoalDraft(null); s.setGoalTouched({}); s.go("/goals"); }}
          style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 13, cursor: "pointer" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          title={saveTitle}
          aria-disabled={saveDisabled}
          style={{ padding: "8px 20px", border: 0, borderRadius: "var(--r3)", background: "var(--green)", color: "var(--on-green)", fontSize: 13, fontWeight: 600, opacity: saveDisabled ? 0.5 : 1, cursor: saveDisabled ? "not-allowed" : "pointer" }}
        >
          {saving ? "Saving..." : "Save goal"}
        </button>
        <span style={{ fontSize: 12, color: "var(--fg2)" }}>{saveTitle}</span>
      </div>
    </>
  );
}
