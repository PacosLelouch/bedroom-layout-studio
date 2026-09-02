"use client";

import { ChevronDown, Database, HardDriveDownload } from "lucide-react";
import { useEffect, useState } from "react";

type CatalogSource = "frontend" | "server";

/** Shared, deliberately compact disclosure of where the active furniture data came from. */
export function DataSourceStatus() {
  const [catalogSource, setCatalogSource] = useState<CatalogSource>("frontend");
  const [runtimeCount, setRuntimeCount] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onCatalogSource = (event: Event) => {
      const source = (event as CustomEvent<{ source?: CatalogSource }>).detail?.source;
      if (source === "server" || source === "frontend") setCatalogSource(source);
    };
    const onRuntimeCache = (event: Event) => {
      const entries = (event as CustomEvent<{ entries?: number }>).detail?.entries;
      if (typeof entries === "number") setRuntimeCount(entries);
    };
    window.addEventListener("bedroom:catalog-source", onCatalogSource);
    window.addEventListener("bedroom:runtime-cache", onRuntimeCache);
    return () => {
      window.removeEventListener("bedroom:catalog-source", onCatalogSource);
      window.removeEventListener("bedroom:runtime-cache", onRuntimeCache);
    };
  }, []);

  const catalogLabel = catalogSource === "server" ? "家具：服务器数据" : "家具：前端内置数据";
  const cacheLabel = runtimeCount ? `运行时缓存：${runtimeCount} 项` : "运行时缓存：未命中";
  return <aside className={expanded ? "data-source-status expanded" : "data-source-status"} aria-label="数据来源与前端缓存状态">
    <button type="button" className="data-source-toggle" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>
      <Database size={13} /><span>数据状态</span><ChevronDown size={13} />
    </button>
    {expanded && <div className="data-source-details">
      <span><Database size={12} /><strong>{catalogLabel}</strong><small>{catalogSource === "server" ? "当前家具目录已由服务器返回" : "使用随前端构建提供的家具目录"}</small></span>
      <span><HardDriveDownload size={12} /><strong>{cacheLabel}</strong><small>仅统计本浏览器会话已加载的家具运行时</small></span>
    </div>}
  </aside>;
}
