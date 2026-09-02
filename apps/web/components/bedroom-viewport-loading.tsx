export function BedroomViewportLoading({ label = "正在加载 3D 编辑器…" }: { label?: string }) {
  return <div className="three-viewport viewport-loading" role="status"><span className="viewport-loading-spinner" /><strong>{label}</strong><small>房间结构会先出现，家具随后逐件加载。</small></div>;
}
