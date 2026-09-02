# 家具资产数据组织

## 设计结论

家具使用 TypeScript 作为作者源码、标准 ECMAScript Module 作为浏览器运行载体，不定义一套
新的家具脚本语言。仓库内置资产和云端用户资产共享同一个 manifest、固定导出和运行 ABI；
差别只在交付方式：前者进入站点构建，后者由受控 Runner 独立编译后写入对象存储。

PostgreSQL 只保存控制面元数据、状态、关系、对象 key 和 hash，不保存 `asset.json`、源码、
编译模块、模型、材质、纹理或证据正文。开发环境的对象存储可以落在 filesystem，生产环境
通常使用独立 S3 兼容存储；“对象存储”不等同于 API 服务器本机磁盘。

```text
TypeScript source package
  ├─ repository build ───────────────→ builtin browser module
  └─ isolated asset build/publish ───→ user-generated browser module
                                           │
                                           ▼
                                  immutable object storage
                                           │ keys + hashes only
                                           ▼
                                       PostgreSQL

Browser → catalog API → verified publication descriptor → runtime.mjs + resources
Backend/Runner → package index key → asset.json + runtime.mjs + resources
```

## 一个逻辑包，两个物理阶段

### 作者源包

`builtin` 和 `user-generated` 都使用相同作者包：

```text
<asset-id>/
├─ asset.json       # required manifest v3
├─ runtime.ts       # required; exports createFurnitureModel
├─ model.ts         # optional; exports createSourceModel
├─ resources/       # optional textures and other runtime resources
├─ reconstruction/ # optional source/spec/workflow state
└─ evidence/       # optional validation and review evidence
```

`assetScope` 表示所有权和交付范围，不表示代码如何生成；`origin.method` 记录建模方法，
`lifecyclePolicy` 记录内容审核策略。简单家具直接在 `runtime.ts` 中实现；只有保留独立源模型
有实际价值时才增加 `model.ts`。

### 发布包

云端 revision 不能把 TypeScript 当作浏览器入口。受控 Runner 必须类型检查、解析依赖并生成
一个不可变发布包：

```text
tenants/{tenantId}/assets/{assetId}/revisions/{revisionId}/
├─ package-index.json
├─ contract/asset.json
├─ source/runtime.ts
├─ source/model.ts                       # optional
├─ source/resources/...                  # optional
├─ runtime/runtime.mjs
├─ runtime/resources/...                 # optional textures/binary data
├─ reconstruction/...                    # optional
└─ evidence/...
```

`package-index.json` 是对象存储中的内容清单，不是数据库 JSONB。它列出逻辑路径、object key、
SHA-256、字节数和 MIME；`runtime.mjs` 是标准 JavaScript ESM，不是自定义场景语言，也不是
GLB。发布模块必须封闭依赖图：资产私有源码依赖被 bundle；运行时只使用固定 ABI 提供的
Three.js/资源解析能力，不从任意网络位置加载依赖。

仓库资产可以在站点构建时生成等价发布模块和 package index。迁移期间允许继续使用当前
Vite 生成的动态 import 注册表，但它与云端发布模块必须实现相同 factory 语义。

## 浏览器运行 ABI

源码继续固定导出 `createFurnitureModel`。目标 ABI 保留标准 JavaScript/TypeScript 能力，
不把家具结构和行为限制成另一套 DSL：

```ts
export interface FurnitureRuntimeContext {
  purpose: "scene" | "review" | "export";
  runtimeAbiVersion: 1;
  three: typeof import("three");
  resolveResource(logicalPath: string): string;
}

export function createFurnitureModel(
  configuration: FurnitureConfiguration,
  context: FurnitureRuntimeContext,
): THREE.Group;

// Optional export.
export function updateFurnitureModel(
  group: THREE.Group,
  previous: FurnitureConfiguration,
  next: FurnitureConfiguration,
  context: FurnitureRuntimeContext,
): void;

// Optional export.
export function disposeFurnitureModel(group: THREE.Group): void;
```

`createFurnitureModel` 表达静态层级、程序化几何、BufferGeometry、材质和贴图；可选的
`updateFurnitureModel` 表达状态和参数变化，缺失时宿主用新配置重建模型。manifest 中的
states、parameters、components 和 capability bindings 仍是可审核契约；ESM 是其实现。

资源不应硬编码签名 URL。模块使用逻辑路径调用 `resolveResource()`，宿主根据当前 revision
的 package index 解析对象 URL、校验 hash 并缓存。这样短期签名 URL 过期不会改变资产契约。

浏览器不执行 `.ts`：Runner 将 `.ts` 编译为 `.mjs`，API 以正确的 JavaScript MIME、CORS 和
CSP 提供不可变模块 URL，前端使用标准 `import()` 按需加载。

## 执行信任不是资产所有权

`assetScope` 和 `lifecyclePolicy` 不能兼任代码执行授权。增加独立执行策略：

- `repository-bundled`：随受信任仓库构建；
- `platform-built-esm`：源码经隔离 Runner、依赖封闭、静态检查、运行验证和发布签名；
- `quarantined-source`：仅保存和审核，不允许浏览器执行。

视觉上的 `user-reviewed` 不能批准代码安全。只有平台构建并绑定当前 artifact hash 的模块才可
进入浏览器 catalog。任意用户上传的 JS/TS 默认是 `quarantined-source`；在普通用户代码隔离、
资源限制和故障演练完成前不得发布为 `platform-built-esm`。

静态分析不是安全边界。发布流水线还必须限制 import、禁止未声明 dynamic import、`eval`、
`new Function`、任意网络 API 和子 Worker，并在隔离浏览器中对 CPU、内存、节点、顶点、纹理
和执行时间设置预算。若未来允许未受信任模块，必须迁移到能够容纳完整 Three.js 场景的独立
render Worker/隔离 origin；单纯把模块放进 Worker 不能把函数或 `THREE.Group` 克隆回主线程。

## 数据库只保存 key，不保存资产正文

### `assets`

保存稳定控制面身份：

```text
id, tenant_id, workspace_id, owner_user_id
asset_key, name, category, scope, lifecycle_policy, execution_policy
current_revision_id, published_revision_id, archived_at, timestamps
```

`assets.id` 是数据库 UUID；`asset_key` 是工作区内稳定逻辑 ID，并且必须等于对象存储
`asset.json` 中的 `id`。不再让 `slug`、manifest `id` 和数据库 UUID 承担含混的同一角色。

### `asset_revisions`

只保存 revision 控制面和根 key：

```text
id, tenant_id, asset_id, parent_revision_id
manifest_schema_version, runtime_abi_version
raw_status, effective_status, contract_hash, artifact_set_hash
package_root_key, package_index_key, package_index_hash
source_agent_run_id, created_by, created_at
```

删除 manifest JSONB 正文以及固定的 manifest/runtime/model 内容列。API 或 Worker 需要 manifest
时，通过 `package_index_key` 找到 `contract/asset.json`，读取后验证其 SHA-256 和 schema。

`asset_artifacts` 可以为查询、保留和审计索引单个对象，但仍只保存：

```text
revision_id, kind, logical_path, object_key, sha256, size_bytes, media_type
```

不把任何对象字节放进 PostgreSQL。`storage_objects` 也只保存对象元数据；filesystem/S3 才是
字节的权威来源。

review、validation 和 publication 是独立事实。revision 内容不可变；批准不能改写 package
或 contractHash，只新增 review/publication，并更新资产的 published revision 指针。

## Contract hash 与发布 hash

必须区分源码契约和浏览器实际执行内容：

- `artifactSetHash`：package index 中所有发布对象 hash 的确定性聚合；
- `contractHash`：作者源码与 manifest 能力字段的确定性摘要；状态和证据字段不参与，避免证据
  自引用。

具体地说，`artifactSetHash` 使用 `package-index` 中除索引自身外全部对象的逻辑路径、SHA-256
和字节数计算。revision 同时绑定两类 hash 与 runtime ABI version；任一不匹配都不能发布。

候选证据和批准绑定 `contractHash`。任何运行模块、依赖、材质、贴图、能力、参数或状态改变都
使旧证据失效。GLB 可以继续作为可选导出和可移植性证据，但不是浏览器运行载体，也不应成为
远程 ESM 能否发布的唯一门禁。

## 发布和读取流程

```text
source package
→ isolated Runner typecheck/bundle
→ inspect closed ESM dependency graph
→ validate scene/review/export configurations
→ validate states, parameters, components, pivots and resources
→ write immutable package objects
→ write package-index.json last
→ create revision with keys + hashes only
→ candidate review
→ publish current contractHash
→ browser catalog returns revision descriptor
→ catalog API reads and verifies package index + asset.json
→ browser receives only the approved revision descriptor
→ browser imports runtime.mjs and resolves declared resources
```

对象上传采用 staging prefix；只有全部对象上传、hash 复核和运行验证通过后才写正式
`package-index.json` 并创建 revision。浏览器只读取 approved/published revision，不扫描 bucket，
也不根据数据库内容重新拼装资产正文。

## 当前实现与后续加固

当前仓库已经具备 package-index/ABI 共享契约、keys-only revision schema、包边界与对象完整性
校验、不可变审批发布指针、目录 API、远端 ESM loader，以及 skill 侧的 ESM 构建和实际导入
验收。仓库内置 loader 与前端暂存的 user-generated snapshot 暂时保留为离线/迁移回退；远端同
ID 的已发布 revision 会覆盖它。

生产化仍需在部署层落实隔离 Runner、CSP、独立执行 origin、资源预算、签名 URL 刷新以及
恶意包故障演练。`platform-built-esm` 只能由这些门禁的受控服务设置，不能接受客户端直接
提交该执行策略。
