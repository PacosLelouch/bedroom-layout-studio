"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive, ArrowLeft, Box, Check, ChevronRight, FileCheck2, ImageIcon,
  Layers3, Maximize2, Rotate3D, Ruler, ShieldCheck,
} from "lucide-react";
import { AssetReviewViewport } from "@/components/asset-review-viewport";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { GENERATED_ASSETS } from "@/lib/bedroom/generated/registry";
import { DIMENSION_SOURCE_LABELS, type DimensionSourceType, type ModelFitReport, type ReviewViewId } from "@/lib/bedroom/generated/types";
import type { Dimensions3D } from "@/lib/bedroom/types";

const VIEW_LABELS: Record<ReviewViewId, string> = {
  reference: "参考",
  front: "正面",
  right: "右侧",
  rear: "背面",
  left: "左侧",
  top: "顶部",
  perspective: "透视",
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function AssetReviewPage() {
  const [assetId, setAssetId] = useState(() => {
    const requested = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("asset");
    return requested && GENERATED_ASSETS.some((entry) => entry.manifest.id === requested)
      ? requested
      : GENERATED_ASSETS[0]?.manifest.id ?? "";
  });
  const asset = GENERATED_ASSETS.find((entry) => entry.manifest.id === assetId) ?? GENERATED_ASSETS[0];
  const [view, setView] = useState<ReviewViewId>(() => asset?.manifest.reviewViews[0] ?? "reference");
  const [dimensions, setDimensions] = useState<Dimensions3D>(() => asset?.manifest.dimensions ?? { width: 0, depth: 0, height: 0 });
  const [sourceType, setSourceType] = useState<DimensionSourceType>(() => asset?.manifest.dimensionSource?.type ?? "user-provided");
  const [sourceNote, setSourceNote] = useState(() => asset?.manifest.dimensionSource?.note ?? "");
  const [report, setReport] = useState<ModelFitReport | null>(null);
  const [hierarchy, setHierarchy] = useState<string[]>([]);
  const [filter, setFilter] = useState<"active" | "archived" | "all">("active");
  const [writable, setWritable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  useEffect(() => {
    if (!asset) return;
    window.history.replaceState(null, "", `${window.location.pathname}?asset=${encodeURIComponent(asset.manifest.id)}`);
  }, [asset]);

  useEffect(() => {
    let active = true;
    fetch(`${basePath}/__asset-review/capabilities`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((value) => { if (active) setWritable(value.writable === true); })
      .catch(() => { if (active) setWritable(false); });
    return () => { active = false; };
  }, []);

  const selectAsset = (nextId: string) => {
    const next = GENERATED_ASSETS.find((entry) => entry.manifest.id === nextId);
    if (!next) return;
    setAssetId(nextId);
    setDimensions(next.manifest.dimensions ?? { width: 0, depth: 0, height: 0 });
    setSourceType(next.manifest.dimensionSource?.type ?? "user-provided");
    setSourceNote(next.manifest.dimensionSource?.note ?? "");
    setView(next.manifest.reviewViews[0] ?? "reference");
    setReport(null);
    setHierarchy([]);
  };

  const visibleAssets = useMemo(() => GENERATED_ASSETS.filter((entry) => {
    if (filter === "all") return true;
    if (filter === "archived") return entry.effectiveStatus === "archived";
    return entry.effectiveStatus !== "archived";
  }), [filter]);
  const completeDimensions = dimensions.width > 0 && dimensions.depth > 0 && dimensions.height > 0;
  const canApprove = Boolean(
    completeDimensions && sourceNote.trim() && asset?.manifest.qualityEvidence.length && report?.aspectCompatible,
  );
  const displayDimensions = completeDimensions ? dimensions : null;
  const onInspect = useCallback((nextReport: ModelFitReport, nodes: string[]) => {
    setReport(nextReport);
    setHierarchy(nodes);
  }, []);

  const decide = async (status: "candidate" | "approved" | "archived") => {
    setSaving(true);
    setDecisionError(null);
    try {
      const response = await fetch(`${basePath}/__asset-review/decision`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-asset-review-intent": "local-write" },
        body: JSON.stringify({
          assetId: asset.manifest.id,
          status,
          factoryHash: asset.factoryHash,
          dimensions,
          dimensionSource: { type: sourceType, note: sourceNote },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "无法保存检视决定。");
      window.setTimeout(() => window.location.reload(), 180);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "无法保存检视决定。");
      setSaving(false);
    }
  };

  if (!asset) {
    return <main className="asset-review-empty"><Box size={36} /><h1>暂无候选资产</h1><p>使用 img2threejs skill 生成资产后，它会出现在这里。</p><Button asChild><Link href="/">返回布局工作台</Link></Button></main>;
  }

  return (
    <main className="asset-review-shell">
      <header className="review-topbar">
        <Link href="/" className="review-back"><ArrowLeft size={16} /> 返回布局工作台</Link>
        <div className="review-title"><span className="review-brand"><Layers3 size={17} /></span><span><strong>img2threejs 资产检视</strong><small>候选模型质量门与家具入库</small></span></div>
        <div className="review-status"><span className="review-online-dot" />本地检视模式</div>
      </header>

      <section className="asset-review-grid">
        <aside className="review-queue">
          <div className="review-section-heading"><span><small>REVIEW QUEUE</small><strong>候选资产</strong></span><Badge variant="outline">{GENERATED_ASSETS.length}</Badge></div>
          <div className="review-filter">
            {(["active", "archived", "all"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "active" ? "待检视" : value === "archived" ? "已归档" : "全部"}</button>)}
          </div>
          <div className="review-asset-list">
            {visibleAssets.map((entry) => <button key={entry.manifest.id} className={entry.manifest.id === asset.manifest.id ? "review-asset active" : "review-asset"} onClick={() => selectAsset(entry.manifest.id)}>
              <span className="review-asset-icon"><Box size={19} /></span>
              <span><strong>{entry.manifest.name}</strong><small>{entry.manifest.id}</small></span>
              <Badge variant={entry.effectiveStatus === "candidate" ? "secondary" : "outline"}>{entry.effectiveStatus === "candidate" ? "候选" : entry.effectiveStatus === "approved" ? "已批准" : "归档"}</Badge>
              <ChevronRight size={14} />
            </button>)}
          </div>
          <div className="review-skill-note"><ShieldCheck size={17} /><span><strong>质量证据由 skill 生成</strong><small>浏览器只消费已经生成的 TypeScript 工厂。</small></span></div>
        </aside>

        <section className="review-stage">
          <div className="review-stage-heading">
            <span><small>LIVE MODEL</small><strong>{asset.manifest.name}</strong></span>
            <div className="review-view-buttons">
              {asset.manifest.reviewViews.map((entry) => <button key={entry} className={view === entry ? "active" : ""} onClick={() => setView(entry)}>{VIEW_LABELS[entry]}</button>)}
            </div>
            <button className="review-icon-button" title="适应窗口"><Maximize2 size={15} /></button>
          </div>
          <div className="review-compare">
            <figure className="reference-frame">
              <figcaption><ImageIcon size={13} /> 参考图</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${basePath}${asset.manifest.referenceImage}`} alt={`${asset.manifest.name}参考图`} />
            </figure>
            <div className="model-frame">
              <div className="model-frame-label"><Rotate3D size={13} /> 拖拽旋转 · 滚轮缩放</div>
              <AssetReviewViewport asset={asset} dimensions={displayDimensions} view={view} onInspect={onInspect} />
            </div>
          </div>
          <div className="review-stage-footer">
            <span><i className={report?.grounded ? "pass" : ""} />Y-up · 地面中心原点</span>
            <span><i className={report?.aspectCompatible ? "pass" : "warning"} />比例偏差 {report ? `${(report.aspectDeviation * 100).toFixed(1)}%` : "—"}</span>
            <span><i className="pass" />Three.js r185</span>
          </div>
        </section>

        <aside className="review-inspector">
          <div className="review-section-heading"><span><small>ADMISSION</small><strong>入库检查</strong></span></div>
          <section className="review-check-card">
            <div><FileCheck2 size={16} /><span><strong>工厂证据</strong><small>{asset.manifest.qualityEvidence.length} 项可追溯证据</small></span><Check size={15} className="check-pass" /></div>
            <div><Ruler size={16} /><span><strong>真实尺寸</strong><small>{completeDimensions ? `${dimensions.width} × ${dimensions.depth} × ${dimensions.height} mm` : "等待额外上下文"}</small></span>{completeDimensions ? <Check size={15} className="check-pass" /> : <span className="check-wait">待补</span>}</div>
            <div><Box size={16} /><span><strong>比例门</strong><small>{report?.aspectCompatible ? "原生比例与目标尺寸一致" : "偏差超过 5%，需要返修"}</small></span>{report?.aspectCompatible ? <Check size={15} className="check-pass" /> : <span className="check-wait">阻止</span>}</div>
          </section>

          <section className="review-form-section">
            <h2>尺寸上下文</h2>
            <div className="review-dimension-grid">
              {(["width", "depth", "height"] as const).map((key) => <label key={key}><span>{key === "width" ? "宽" : key === "depth" ? "深" : "高"}</span><Input type="number" min="1" value={dimensions[key] || ""} placeholder="mm" onChange={(event) => setDimensions((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}
            </div>
            <label className="review-field"><span>尺寸来源</span><NativeSelect className="w-full" value={sourceType} onChange={(event) => setSourceType(event.target.value as DimensionSourceType)}>{Object.entries(DIMENSION_SOURCE_LABELS).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></label>
            <label className="review-field"><span>上下文说明</span><Input value={sourceNote} placeholder="例如：商品规格页，型号 ABC-123" onChange={(event) => setSourceNote(event.target.value)} /></label>
            <p>图片只负责造型与比例；毫米尺寸必须来自用户、商品规格或测量上下文。</p>
          </section>

          <section className="review-form-section hierarchy-section"><h2>模型层级</h2><div>{hierarchy.length ? hierarchy.map((node) => <span key={node}>{node}</span>) : <small>等待模型加载…</small>}</div></section>

          <div className={writable ? "review-readonly-notice writable" : "review-readonly-notice"}>{writable ? "本地项目写回已启用。批准会更新版本化资产清单并刷新家具面板。" : "当前为只读检视；请在本地开发模式完成批准或归档。"}</div>
          {decisionError && <div className="review-decision-error">{decisionError}</div>}
          <div className="review-actions">
            {asset.effectiveStatus === "archived"
              ? <Button variant="outline" disabled={!writable || saving} onClick={() => decide("candidate")}><Archive />恢复候选</Button>
              : <Button variant="outline" disabled={!writable || saving} onClick={() => decide("archived")}><Archive />归档</Button>}
            <Button disabled={!writable || !canApprove || saving} onClick={() => decide("approved")}><Check />{saving ? "正在写回…" : "批准加入家具库"}</Button>
          </div>
        </aside>
      </section>
    </main>
  );
}
