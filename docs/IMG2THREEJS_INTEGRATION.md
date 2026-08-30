# img2threejs 候选资产管线

img2threejs 在本项目中是仓库级 Codex skill，不是 Web 服务。运行
`scripts/link-img2threejs-skill.ps1` 后，`.agents/skills/img2threejs` 会指向本机
`D:\GitHub\img2threejs`。skill 离线生成 TypeScript 工厂、规格和评审证据；浏览器只加载已生成的静态代码。

## 生成约定

每个资产位于 `lib/bedroom/generated/<assetId>/`：

- `asset.json`：名称、分类、状态、工厂入口、参考图、质量证据、尺寸与来源。
- `create*Model.ts`：返回 `THREE.Group` 的 img2threejs 工厂。
- 参考图与公开评审图片放在 `public/generated-assets/<assetId>/`。

新资产状态必须为 `candidate`。生成完成后运行 `npm run assets:sync`，静态 registry 会记录工厂 SHA-256。工厂变化后，已批准资产会自动退回候选状态，直到重新检视。

## 检视与入库

本地启动后访问 `/asset-review?asset=<assetId>`。页面提供参考图、实时模型、固定视角、网格、包围盒、层级和尺寸来源编辑。

批准必须同时满足：

- 宽、深、高均为正数，单位为毫米；
- 尺寸来自用户明确输入、商品规格、房间测量或有说明的其他可靠上下文；
- 至少有一项质量证据；
- 模型原生三轴比例与目标尺寸的偏差不超过 5%。

图片只决定造型和比例，不能独立产生可信毫米尺寸。适配器将模型统一为 Y-up、底面中心原点；比例门通过后才允许最多 5% 的微量轴向校准。

批准和归档只在 Vite 本地开发模式可写。固定写回端点只接受已知资产 ID、受限状态和尺寸来源，并使用临时文件原子替换 `asset.json`。批准后会记录时间与已审工厂哈希并刷新页面；只有 `approved` 资产会进入家具面板。归档可恢复且不会删除任何文件。

生产构建、GitHub Pages 和其他静态部署没有写回端点，因此检视页自动变为只读。

## 验证

```powershell
npm run assets:check
npm test
```

仓库包含一个真实的 `crown-chest` img2threejs 候选工厂作为兼容性样例。它故意不附带毫米尺寸，因此在补充可靠上下文前只能检视或归档，不能批准。
