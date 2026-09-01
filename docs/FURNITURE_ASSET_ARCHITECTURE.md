# 家具资产数据组织

## 统一原则

所有家具使用同一个 manifest v3、同一个运行时入口、同一套状态/参数/组件契约、同一套
contract hash 与候选准入规则。目录只区分资产从哪里供给，不区分它由人手写、由
`furniture-asset-packaging` 创建，还是由只读 `img2threejs` 重建。

- `assetScope: "builtin"`：随当前仓库和前端版本发布的资产。这里可以包含技能生成内容。
- `assetScope: "user-generated"`：用户拥有的资产；当前先随前端目录读取，后续由后端 API
  provider 替换。
- `origin.method`：独立记录 `manual-procedural | existing-procedural | img2threejs | hybrid`。
- `lifecyclePolicy`：独立记录是仓库自动信任还是需要用户审核。

因此“内置”和“用户生成”仍被清楚区分，但不再拥有两套文件格式。

## 唯一包格式

```text
lib/bedroom/assets/
├─ builtin/
│  └─ <asset-id>/
│     ├─ asset.json       # 必需
│     ├─ runtime.ts       # 必需；固定导出 createFurnitureModel
│     ├─ model.ts         # 可选；固定导出 createSourceModel
│     ├─ reconstruction/  # 可选
│     └─ evidence/        # 可选
├─ user-generated/
│  └─ <asset-id>/         # 与 builtin 完全相同的包结构
├─ registry/
│  ├─ catalog.generated.ts
│  ├─ runtime-loaders.generated.ts
│  ├─ model-loaders.generated.ts
│  └─ index.ts
├─ providers/
│  └─ user-generated-provider.ts
├─ manifest-types.ts
├─ contract-core.mjs
├─ package-types.ts
└─ catalog.ts
```

不再支持 `descriptor.ts`，也不允许 manifest 自定义 factory 文件名或 export 名。简单家具把
模型直接写在 `runtime.ts`；需要保留原始重建模型、独立比例适配或原生检视时才增加
`model.ts`。这不是两类资产，只是同一包的可选层。

共享程序化零件可以放在范围根的 `shared/` 工具目录；只有带 `asset.json` 的目录才会被当作
家具包发现。

## 注册表与后端边界

`scripts/sync-furniture-assets.mjs` 扫描两个范围，校验目录名、`assetScope`、固定文件与
manifest，然后生成纯派生注册表。应用和审核页只消费统一 registry，不再分别拼接“内置
catalog”和“generated catalog”。

当前 `frontendUserGeneratedAssetProvider` 从前端生成的用户资产快照供给目录。provider
接口是未来后端 API 的替换点。后端方案确定前，不假定远程程序代码如何执行；API 至少需要
返回可审核的 manifest/状态/证据，运行模型将选择受信任部署代码或 GLB 等安全载体。

## 状态与证据

- `draft`：技术准备不完整，或当前 hash 与证据不匹配。
- `candidate`：所有配置的 scene/review/export、GLB 重载、组件、pivot、材质和外观证据已
  通过，仅等待用户外观批准。
- `approved`：候选经用户批准；只有有效 approved 进入正式家具目录。
- `archived`：归档。

哈希覆盖可选 `model.ts`、必需 `runtime.ts` 和能力契约；不覆盖 status、时间戳、审核 hash、
readiness 结果和证据对象。任何模型或能力改动都会令旧证据失效。

仓库信任的内置包由自动化套件提供派生技术证据；用户资产把候选/导出证据保存在包内。
两者的准入判断仍调用同一份 `contract-core.mjs`。
