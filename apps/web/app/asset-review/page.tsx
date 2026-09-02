"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive, ArrowLeft, Box, Check, ChevronRight, FileCheck2, ImageIcon,
  Layers3, Maximize2, Rotate3D, Ruler, ShieldCheck, Cuboid,
} from "lucide-react";
import { AssetReviewViewport } from "@/components/asset-review-viewport";
import { DataSourceStatus } from "@/components/data-source-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { FURNITURE_REVIEW_ASSETS } from "@/lib/bedroom/review/catalog";
import { loadFurnitureReviewFactory } from "@/lib/bedroom/review/runtime-loader";
import type { GlbReviewResult } from "@/lib/bedroom/glb-review";
import { DIMENSION_SOURCE_LABELS, type ModelFitReport } from "@/lib/bedroom/assets/package-types";
import type { DimensionSourceType, ReviewViewId } from "@/lib/bedroom/assets/manifest-types";
import type {
  Dimensions3D, FurnitureParameterDefinition, FurnitureParameterValue,
} from "@/lib/bedroom/types";
import { publicBasePath as basePath, publicUrl } from "@/lib/public-url";

const VIEW_LABELS: Record<ReviewViewId, string> = {
  reference: "参考",
  front: "正面",
  right: "右侧",
  rear: "背面",
  left: "左侧",
  top: "顶部",
  perspective: "透视",
};

export default function AssetReviewPage() {
  const [assetId, setAssetId] = useState(() => FURNITURE_REVIEW_ASSETS[0]?.manifest.id ?? "");
  const [queryReady, setQueryReady] = useState(false);
  const asset = FURNITURE_REVIEW_ASSETS.find((entry) => entry.manifest.id === assetId) ?? FURNITURE_REVIEW_ASSETS[0];
  const [view, setView] = useState<ReviewViewId>(() => asset?.manifest.reviewViews[0] ?? "reference");
  const [dimensions, setDimensions] = useState<Dimensions3D>(() => asset?.manifest.dimensions ?? { width: 0, depth: 0, height: 0 });
  const [sourceType, setSourceType] = useState<DimensionSourceType>(() => asset?.manifest.dimensionSource?.type ?? "user-provided");
  const [sourceNote, setSourceNote] = useState(() => asset?.manifest.dimensionSource?.note ?? "");
  const [stateId, setStateId] = useState<string | null>(() => asset?.manifest.defaultConfiguration?.stateId ?? asset?.manifest.states[0]?.id ?? null);
  const [parameterValues, setParameterValues] = useState<Record<string, FurnitureParameterValue>>(() => asset?.manifest.defaultConfiguration?.parameters ?? Object.fromEntries((asset?.manifest.parameterDefinitions ?? []).map((entry) => [entry.id, entry.defaultValue])));
  const [report, setReport] = useState<ModelFitReport | null>(null);
  const [hierarchy, setHierarchy] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "builtin" | "draft" | "candidate" | "archived">("all");
  const [writable, setWritable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [glbReview, setGlbReview] = useState<GlbReviewResult | null>(null);
  const [reviewingGlb, setReviewingGlb] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`${basePath}/__asset-review/capabilities`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((value) => { if (active) setWritable(value.writable === true); })
      .catch(() => { if (active) setWritable(false); });
    return () => { active = false; };
  }, []);

  const selectAsset = useCallback((nextId: string) => {
    const next = FURNITURE_REVIEW_ASSETS.find((entry) => entry.manifest.id === nextId);
    if (!next) return;
    setAssetId(nextId);
    setDimensions(next.manifest.dimensions ?? { width: 0, depth: 0, height: 0 });
    setSourceType(next.manifest.dimensionSource?.type ?? "user-provided");
    setSourceNote(next.manifest.dimensionSource?.note ?? "");
    setStateId(next.manifest.defaultConfiguration?.stateId ?? next.manifest.states[0]?.id ?? null);
    setParameterValues(next.manifest.defaultConfiguration?.parameters ?? Object.fromEntries(next.manifest.parameterDefinitions.map((entry) => [entry.id, entry.defaultValue])));
    setView(next.manifest.reviewViews[0] ?? "reference");
    setReport(null);
    setHierarchy([]);
    setGlbReview(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const requested = new URLSearchParams(window.location.search).get("asset");
      if (requested && FURNITURE_REVIEW_ASSETS.some((entry) => entry.manifest.id === requested)) selectAsset(requested);
      setQueryReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectAsset]);

  useEffect(() => {
    if (!asset || !queryReady) return;
    window.history.replaceState(null, "", `${window.location.pathname}?asset=${encodeURIComponent(asset.manifest.id)}`);
  }, [asset, queryReady]);

  const visibleAssets = useMemo(() => FURNITURE_REVIEW_ASSETS.filter((entry) => {
    if (filter === "all") return true;
    if (filter === "builtin") return entry.manifest.assetScope === "builtin";
    if (filter === "draft") return entry.effectiveStatus === "draft";
    if (filter === "candidate") return entry.effectiveStatus === "candidate";
    if (filter === "archived") return entry.effectiveStatus === "archived";
    return true;
  }), [filter]);
  const completeDimensions = dimensions.width > 0 && dimensions.depth > 0 && dimensions.height > 0;
  const dimensionConstraints = asset?.manifest.dimensionConstraints ?? {};
  const states = asset?.manifest.states ?? [];
  const parameterDefinitions = asset?.manifest.parameterDefinitions ?? [];
  const components = asset?.manifest.components ?? [];
  const capabilityBindings = asset?.manifest.capabilityBindings ?? [];
  const uniqueStates = new Set(states.map((entry) => entry.id)).size === states.length && states.every((entry) => /^[a-z][a-z0-9-]*$/.test(entry.id) && entry.label.trim());
  const uniqueParameters = new Set(parameterDefinitions.map((entry) => entry.id)).size === parameterDefinitions.length && parameterDefinitions.every((entry) => /^[a-z][a-zA-Z0-9]*$/.test(entry.id) && entry.label.trim());
  const validDefaultState = states.length === 0 ? stateId === null : states.some((entry) => entry.id === stateId);
  const validConstraints = (["width", "depth", "height"] as const).every((axis) => {
    const rule = dimensionConstraints[axis];
    const value = dimensions[axis];
    return (!rule?.min || !rule.max || rule.min <= rule.max) && (!rule?.min || value >= rule.min) && (!rule?.max || value <= rule.max);
  });
  const canApprove = Boolean(
    asset?.effectiveStatus === "candidate" && completeDimensions && sourceNote.trim() && asset?.manifest.qualityEvidence.length && report?.aspectCompatible && uniqueStates && uniqueParameters && validDefaultState && validConstraints,
  );
  const displayDimensions = completeDimensions ? dimensions : null;
  const previewConfiguration = useMemo(
    () => ({
      // Zero dimensions deliberately select the generated-model adapter's
      // proportion-preserving review scale. They are never accepted for admission.
      dimensions: completeDimensions ? dimensions : { width: 0, depth: 0, height: 0 },
      parameters: { color: asset?.manifest.appearance.defaultColor ?? "#c7b69d", ...parameterValues },
      stateId,
    }),
    [completeDimensions, dimensions, parameterValues, stateId],
  );
  const onInspect = useCallback((nextReport: ModelFitReport, nodes: string[]) => {
    setReport(nextReport);
    setHierarchy(nodes);
  }, []);

  const decide = async (status: "draft" | "candidate" | "approved" | "archived") => {
    if (!asset.repositoryWritable) return;
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
          dimensionConstraints,
          states,
          stateId,
          parameterDefinitions,
          parameterValues,
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

  const reviewGlb = async () => {
    setReviewingGlb(true);
    setDecisionError(null);
    try {
      const runtimeFactory = await loadFurnitureReviewFactory(asset.manifest.id);
      const { reviewRuntimeFactoryGlb } = await import("@/lib/bedroom/review/glb-review");
      setGlbReview(await reviewRuntimeFactoryGlb(runtimeFactory, previewConfiguration));
    } catch (error) {
      setGlbReview(null);
      setDecisionError(error instanceof Error ? error.message : "GLB 导出重载检查失败。");
    } finally {
      setReviewingGlb(false);
    }
  };

  const exportGlb = async () => {
    setReviewingGlb(true);
    setDecisionError(null);
    try {
      const runtimeFactory = await loadFurnitureReviewFactory(asset.manifest.id);
      const { createFurnitureGlbFromFactory, downloadGlbData } = await import("@/lib/bedroom/glb-export");
      const result = await createFurnitureGlbFromFactory(runtimeFactory, previewConfiguration, asset.manifest.name);
      downloadGlbData(result.data, result.fileName);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "无法导出当前 GLB。");
    } finally {
      setReviewingGlb(false);
    }
  };

  if (!asset) {
    return <main className="asset-review-empty"><Box size={36} /><h1>暂无家具资产</h1><p>内置家具和通过包装管线登记的用户家具会出现在这里。</p><Button asChild><Link href="/">返回布局工作台</Link></Button></main>;
  }

  return (
    <main className="asset-review-shell">
      <header className="review-topbar">
        <Link href="/" className="review-back"><ArrowLeft size={16} /> 返回布局工作台</Link>
        <div className="review-title"><span className="review-brand"><Layers3 size={17} /></span><span><strong>家具资产检视</strong><small>内置与用户家具的统一能力检查</small></span></div>
        <div className="review-status"><span className="review-online-dot" />统一家具契约 v3</div>
      </header>

      <section className="asset-review-grid">
        <aside className="review-queue">
          <div className="review-section-heading"><span><small>FURNITURE LIBRARY</small><strong>家具资产</strong></span><Badge variant="outline">{FURNITURE_REVIEW_ASSETS.length}</Badge></div>
          <div className="review-filter">
            {(["all", "builtin", "draft", "candidate", "archived"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "全部" : value === "builtin" ? "内置" : value === "draft" ? "草稿" : value === "candidate" ? "候选" : "归档"}</button>)}
          </div>
          <div className="review-asset-list">
            {visibleAssets.map((entry) => <button key={entry.manifest.id} className={entry.manifest.id === asset.manifest.id ? "review-asset active" : "review-asset"} onClick={() => selectAsset(entry.manifest.id)}>
              <span className="review-asset-icon"><Box size={19} /></span>
              <span><strong>{entry.manifest.name}</strong><small>{entry.manifest.id}</small></span>
              <Badge variant={entry.effectiveStatus === "candidate" ? "secondary" : "outline"}>{entry.manifest.assetScope === "builtin" ? `内置 · ${entry.effectiveStatus === "draft" ? "草稿" : entry.effectiveStatus === "candidate" ? "候选" : entry.effectiveStatus === "approved" ? "已批准" : "归档"}` : entry.effectiveStatus === "draft" ? "草稿" : entry.effectiveStatus === "candidate" ? "候选" : entry.effectiveStatus === "approved" ? "已批准" : "归档"}</Badge>
              <ChevronRight size={14} />
            </button>)}
          </div>
          <div className="review-skill-note"><ShieldCheck size={17} /><span><strong>同一家具运行时契约</strong><small>内置与用户资产共用配置、状态、组件和 GLB 路径。</small></span></div>
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
              {asset.manifest.referenceImage
                ? <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={publicUrl(asset.manifest.referenceImage)} alt={`${asset.manifest.name}参考图`} />
                  </>
                : <div className="reference-placeholder"><Box size={34} /><strong>无外部参考图</strong><span>以默认配置、命名层级和导出重载结果为检视基准。</span></div>}
            </figure>
            <div className="model-frame">
              <div className="model-frame-label"><Rotate3D size={13} /> 拖拽旋转 · 滚轮缩放</div>
              <AssetReviewViewport asset={asset} dimensions={displayDimensions} configuration={previewConfiguration} view={view} onInspect={onInspect} />
              <DataSourceStatus />
            </div>
          </div>
          <div className="review-stage-footer">
            <span><i className={report?.grounded ? "pass" : ""} />Y-up · 地面中心原点</span>
            <span><i className={report?.aspectCompatible ? "pass" : "warning"} />{asset.manifest.assetScope === "builtin" ? "运行时配置已构建" : `比例偏差 ${report ? `${(report.aspectDeviation * 100).toFixed(1)}%` : "—"}`}</span>
            <span><i className="pass" />Three.js r185</span>
          </div>
        </section>

        <aside className="review-inspector">
          <div className="review-section-heading"><span><small>CURRENT CONFIGURATION</small><strong>当前配置</strong></span></div>

          <section className="review-config-section">
            <h2>尺寸与来源</h2>
            <div className="review-dimension-grid">
              {(["width", "depth", "height"] as const).map((key) => <label key={key}><span>{key === "width" ? "宽" : key === "depth" ? "深" : "高"}</span><Input type="number" min="1" value={dimensions[key] || ""} placeholder="mm" onChange={(event) => setDimensions((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}
            </div>
            <label className="review-field"><span>尺寸来源</span><NativeSelect className="w-full" value={sourceType} disabled={!asset.repositoryWritable} onChange={(event) => setSourceType(event.target.value as DimensionSourceType)}>{Object.entries(DIMENSION_SOURCE_LABELS).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></label>
            <label className="review-field"><span>上下文说明</span><Input value={sourceNote} readOnly={!asset.repositoryWritable} placeholder="例如：商品规格页，型号 ABC-123" onChange={(event) => setSourceNote(event.target.value)} /></label>
            <p>图片只决定造型与比例；毫米尺寸必须来自可靠上下文。</p>
          </section>

          <section className="review-config-section">
            <h2>状态 <small>定义只读，点击切换预览</small></h2>
            {states.length
              ? <div className="review-state-preview">{states.map((entry) => <button type="button" key={entry.id} className={stateId === entry.id ? "active" : ""} aria-pressed={stateId === entry.id} onClick={() => setStateId(entry.id)}><strong>{entry.label}</strong><small>{entry.id}</small></button>)}</div>
              : <p className="review-empty-capability">该家具没有交互状态。</p>}
          </section>

          <section className="review-config-section">
            <h2>特殊参数 <small>仅调整当前值</small></h2>
            {parameterDefinitions.length
              ? <div className="review-parameter-values">{parameterDefinitions.map((definition) => <ParameterValueControl key={definition.id} definition={definition} value={parameterValues[definition.id] ?? definition.defaultValue} onChange={(value) => setParameterValues((current) => ({ ...current, [definition.id]: value }))} />)}</div>
              : <p className="review-empty-capability">该家具没有特殊参数。</p>}
          </section>

          <section className="review-config-section">
            <h2>语义组件 <small>节点与活动轴只读</small></h2>
            {components.length
              ? <div className="review-constraint-summary">{components.map((component) => <div key={component.id}><strong>{component.label}</strong><span>{component.nodeNames.join("、")}{component.pivotNode ? ` · pivot ${component.pivotNode}` : ""}</span></div>)}</div>
              : <p className="review-empty-capability">尚未声明语义组件。</p>}
          </section>

          <section className="review-config-section">
            <h2>尺寸范围 <small>资产定义，只读</small></h2>
            <div className="review-constraint-summary">{(["width", "depth", "height"] as const).map((axis) => {
              const rule = dimensionConstraints[axis];
              return <div key={axis}><strong>{axis === "width" ? "宽" : axis === "depth" ? "深" : "高"}</strong><span>{rule?.min !== undefined || rule?.max !== undefined ? `${rule.min ?? "不限"} – ${rule.max ?? "不限"} mm${rule.step ? ` · 步长 ${rule.step}` : ""}` : "未声明硬限制"}</span></div>;
            })}</div>
          </section>

          <div className="review-section-heading review-admission-heading"><span><small>ADMISSION</small><strong>入库检查</strong></span></div>
          <section className="review-check-card">
            {asset.readinessIssues.map((issue) => <div key={issue}><ShieldCheck size={16} /><span><strong>技术准备</strong><small>{issue}</small></span><span className="check-wait">阻止</span></div>)}
            <div><FileCheck2 size={16} /><span><strong>工厂证据</strong><small>{asset.manifest.qualityEvidence.length} 项可追溯证据</small></span><Check size={15} className="check-pass" /></div>
            <div><Ruler size={16} /><span><strong>真实尺寸</strong><small>{completeDimensions ? `${dimensions.width} × ${dimensions.depth} × ${dimensions.height} mm` : "等待额外上下文"}</small></span>{completeDimensions ? <Check size={15} className="check-pass" /> : <span className="check-wait">待补</span>}</div>
            <div><Box size={16} /><span><strong>{asset.manifest.assetScope === "builtin" ? "运行时构建" : "比例门"}</strong><small>{asset.manifest.assetScope === "builtin" ? "默认配置和当前状态可确定性构建" : report?.aspectCompatible ? "原生比例与目标尺寸一致" : "偏差超过 5%，需要返修"}</small></span>{report?.aspectCompatible ? <Check size={15} className="check-pass" /> : <span className="check-wait">阻止</span>}</div>
            <div><Cuboid size={16} /><span><strong>家具能力</strong><small>{states.length} 个状态 · {parameterDefinitions.length} 个特殊参数 · {components.length} 个组件 · {capabilityBindings.length} 个绑定</small></span>{uniqueStates && uniqueParameters && validDefaultState && components.length > 0 ? <Check size={15} className="check-pass" /> : <span className="check-wait">阻止</span>}</div>
            <div><Cuboid size={16} /><span><strong>GLB 兼容</strong><small>{asset.manifest.exportReady ? "已通过可移植材质与重载检查" : asset.manifest.exportIssue ?? "尚未提供导出证据"}</small></span>{asset.manifest.exportReady ? <Check size={15} className="check-pass" /> : <span className="check-wait">暂不可导出</span>}</div>
          </section>

          <section className="review-form-section">
            <div className="review-capability-heading"><h2>临时 GLB 重载</h2><span className="review-glb-actions"><Button size="sm" variant="outline" disabled={!previewConfiguration || reviewingGlb} onClick={reviewGlb}><FileCheck2 />{reviewingGlb ? "处理中…" : "执行检查"}</Button><Button size="sm" disabled={!previewConfiguration || reviewingGlb} onClick={exportGlb}><Cuboid />导出 GLB</Button></span></div>
            {glbReview
              ? <p>{(glbReview.byteLength / 1024).toFixed(1)} KB · 尺寸{glbReview.dimensionsMatch ? "一致" : "不一致"} · {glbReview.grounded ? "已落地" : "未落地"} · {glbReview.namedNodeCount} 个命名节点 · {glbReview.materialCount} 个材质 · {glbReview.materialsPortable ? "材质可移植" : "检测到运行时着色，需提供导出材质"}</p>
              : <p>按当前尺寸、参数和状态生成独立 GLB，再重新载入比较包围盒、落地点、节点和材质可移植性。</p>}
          </section>

          <section className="review-form-section hierarchy-section"><h2>模型层级</h2><div>{hierarchy.length ? hierarchy.map((node) => <span key={node}>{node}</span>) : <small>等待模型加载…</small>}</div></section>

          <div className={writable && asset.repositoryWritable ? "review-readonly-notice writable" : "review-readonly-notice"}>{asset.manifest.lifecyclePolicy === "repository-trusted" ? "仓库信任家具由版本和自动化管理；这里可以试调配置和执行检视，但不会把临时值写回源码。" : writable ? "资产能力定义需要由后续 LLM Agent 修改；当前页面只写回尺寸上下文、配置值和入库决定。" : "当前为只读检视；请在本地开发模式完成批准或归档。"}</div>
          {decisionError && <div className="review-decision-error">{decisionError}</div>}
          {asset.repositoryWritable ? <div className="review-actions">
            {asset.effectiveStatus === "archived"
              ? <Button variant="outline" disabled={!writable || saving} onClick={() => decide("draft")}><Archive />恢复为草稿</Button>
              : <Button variant="outline" disabled={!writable || saving} onClick={() => decide("archived")}><Archive />归档</Button>}
            <Button disabled={!writable || !canApprove || saving} onClick={() => decide("approved")}><Check />{saving ? "正在写回…" : "批准加入家具库"}</Button>
          </div> : <div className="review-actions"><Button variant="outline" disabled><Check />内置家具已入库</Button></div>}
        </aside>
      </section>
    </main>
  );
}

function ParameterValueControl({ definition, value, onChange }: {
  definition: FurnitureParameterDefinition;
  value: FurnitureParameterValue;
  onChange: (value: FurnitureParameterValue) => void;
}) {
  return <label className="review-parameter-value">
    <span><strong>{definition.label}</strong><small>{definition.id}</small></span>
    {definition.type === "number" && <Input type="number" value={Number(value)} min={definition.min} max={definition.max} step={definition.step} onChange={(event) => onChange(Number(event.target.value))} />}
    {definition.type === "boolean" && <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />}
    {definition.type === "color" && <input type="color" value={String(value)} onChange={(event) => onChange(event.target.value)} />}
    {definition.type === "enum" && <NativeSelect value={String(value)} onChange={(event) => onChange(event.target.value)}>{definition.options.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}</NativeSelect>}
    {definition.type === "number" && definition.unit && <em>{definition.unit}</em>}
  </label>;
}
