# 云端布局存储与家具资产格式计划

> 状态：规划中，暂不实施后端化  
> 当前优先级：先稳定本地布局 JSON 与家具资产格式，再决定云端服务  
> 适用项目：Bedroom Layout Studio

## 1. 目的

本计划用于记录布局和家具资产从“本地文件工具”逐步演进为“支持用户隔离和云端存取的应用”时的建议方案。

当前阶段不启用 D1、R2，不增加账号系统，不迁移现有布局，也不允许网页直接执行用户上传的 JavaScript。近期工作重点是先统一数据格式和前端加载边界，使后续接入任意后端时不必重写场景与资产系统。

## 2. 当前阶段的决定

### 2.1 现在做

- 继续以 JSON 作为布局的标准保存格式。
- 保留三个预制房间为独立布局 JSON。
- 在布局 JSON 根目录维护 README，说明目录组织、字段含义、版本和兼容规则。
- 为家具资产设计统一清单格式，使 GLB、声明式 JSON 和可信的 img2threejs 工厂代码可以共用同一套资产索引。
- 将具体加载方式封装在资产加载层之后，场景只接收规范化的 `THREE.Group`。
- 所有资产继续通过尺寸检查、Y-up、贴地、居中和候选/审核流程。

### 2.2 现在不做

- 不启用 ChatGPT Sites 的 D1 或 R2。
- 不建设用户注册、登录、组织和权限系统。
- 不建设 GitHub Pages 共用的远程 API。
- 不实现云端布局同步、冲突合并和多设备历史版本。
- 不实现用户 JavaScript 的在线编译或沙箱执行。
- 不把 R2、S3、数据库或其他云服务密钥放进浏览器。

## 3. 目标架构

如果未来需要同时支持 ChatGPT Sites 和 GitHub Pages，建议把数据服务设计成独立 HTTPS API：

```text
ChatGPT Sites ───────┐
                     ├── HTTPS API ── D1：用户、索引、权限、版本、审核
GitHub Pages ────────┘              └─ R2：布局 JSON、GLB、贴图、源码、缩略图
```

如果届时只需要 ChatGPT Sites，可以先把 API 放在 Sites 的同源服务端，减少部署复杂度。无论采用哪种部署方式，前端都只调用 HTTP API，不依赖 D1/R2 的绑定细节。

### 3.1 D1 的职责

D1 是具有 SQLite 语义的结构化数据库，建议保存：

- 用户及稳定用户标识；
- 布局名称、所有者、状态和当前版本；
- 布局版本对应的 R2 对象位置与内容哈希；
- 家具资产名称、类别、尺寸、格式和所有者；
- 资产版本、审核状态、源文件哈希和派生文件哈希；
- 配额、权限和必要的审计记录。

D1 不用于保存 GLB、贴图或较大的历史版本文件。

### 3.2 R2 的职责

R2 是对象存储，建议保存：

- 布局 JSON 和布局历史版本；
- GLB、GLTF、BIN 和贴图；
- 声明式家具 JSON；
- img2threejs 生成的 JS/TS 源码；
- 从源码转换出的 GLB 或安全 JSON；
- 家具缩略图和审核视图。

建议对象键按用户、资产和版本隔离，例如：

```text
users/{userId}/layouts/{layoutId}/versions/{versionId}/layout.json
users/{userId}/assets/{assetId}/versions/{versionId}/source/model.glb
users/{userId}/assets/{assetId}/versions/{versionId}/source/scene.json
users/{userId}/assets/{assetId}/versions/{versionId}/source/factory.ts
users/{userId}/assets/{assetId}/versions/{versionId}/derived/model.glb
users/{userId}/assets/{assetId}/versions/{versionId}/derived/thumbnail.webp
```

## 4. GitHub Pages 的接入边界

GitHub Pages 是静态前端托管，不直接连接 D1，也不保存 D1/R2 的访问密钥。

未来接入时应遵循以下规则：

- GitHub Pages 通过 HTTPS API 查询布局和资产元数据；
- 服务端根据登录用户检查布局和资产所有权；
- 私有 R2 文件使用短期签名 GET URL 下载；
- 上传大文件时，由服务端检查用户、配额、文件名和类型，再返回短期签名 PUT URL；
- R2 配置只允许正式前端来源的 CORS；
- 浏览器永远不获得数据库凭证、R2 Access Key 或服务端管理凭证。

公开的预制家具可以通过公共 CDN/对象 URL 加载；用户私有家具必须经过鉴权 API 或短期签名 URL。

## 5. 统一家具资产模型

计划支持三类资产载荷：

```text
glb
scene-json
factory-js
```

建议使用统一的资产清单描述资产身份、尺寸、格式、状态和入口。示例：

```json
{
  "schemaVersion": 2,
  "id": "crown-chest",
  "name": "皇冠五斗柜",
  "category": "storage",
  "format": "factory-js",
  "entry": {
    "path": "source/createModel.ts",
    "exportName": "createModel"
  },
  "dimensions": {
    "width": 900,
    "depth": 450,
    "height": 1100,
    "unit": "mm"
  },
  "dimensionSource": {
    "type": "design-spec",
    "note": "用户提供的产品尺寸"
  },
  "status": "candidate",
  "contentHash": "sha256:...",
  "derived": {
    "modelPath": "derived/model.glb",
    "thumbnailPath": "derived/thumbnail.webp"
  }
}
```

本地文件可以使用相对路径；云端化后，可将 `path` 映射为 R2 object key，而不是把临时签名 URL永久写入清单。

## 6. GLB 资产

GLB 是优先推荐的浏览器运行时格式。

加载流程：

```text
读取 GLB
  → GLTFLoader 解析
  → 取得 THREE.Group
  → 检查包围盒和复杂度
  → 规范化坐标、贴地与尺寸
  → 加入房间场景
```

导入或上传时需要检查：

- 文件大小、扩展名、MIME 和 GLB 文件头；
- 网格、节点、材质、贴图和三角面数量；
- 外部资源引用；
- 包围盒是否为空或异常；
- 资产声明尺寸与实际比例是否一致；
- 是否需要支持动画；
- 是否超过浏览器内存和 GPU 预算。

## 7. 声明式 JSON 资产

`scene-json` 指项目自定义的受约束描述格式，不等同于任意 JavaScript，也不默认等同于 Three.js ObjectLoader JSON。

初期可以支持以下节点：

- `group`
- `box`
- `cylinder`
- `sphere`
- `capsule`
- `lathe`
- `extrude`
- `mesh`
- `repeat`
- `mirror`

示例：

```json
{
  "schemaVersion": 1,
  "type": "procedural-three",
  "coordinateSystem": {
    "up": "y",
    "unit": "mm"
  },
  "dimensions": {
    "width": 900,
    "depth": 450,
    "height": 1100
  },
  "nodes": [
    {
      "id": "body",
      "type": "box",
      "size": [860, 1000, 420],
      "position": [0, 550, 0],
      "material": {
        "type": "standard",
        "color": "#c8b696",
        "roughness": 0.75
      }
    }
  ]
}
```

加载流程：

```text
读取 JSON
  → JSON Schema/Zod 校验
  → 检查节点和资源预算
  → ProceduralFurnitureBuilder
  → THREE.Group
  → 通用规范化流程
```

格式要求：

- 不允许函数、表达式或可执行字符串；
- 不允许任意模块导入；
- 材质和几何类型采用白名单；
- 限制节点、重复次数、曲线分段和贴图尺寸；
- 对未知字段采取明确的拒绝或兼容策略；
- `schemaVersion` 必填，并提供版本迁移函数；
- 外部贴图仅允许资产包内相对路径或经过批准的对象键。

未来可让 img2threejs 同时生成 TS 工厂和 `scene-json`。由基础几何体组成的家具优先使用 JSON；需要复杂程序化逻辑的模型仍可保留 TS 源码。

## 8. img2threejs JS/TS 资产

仓库内置、经过代码审查并在构建期编译的 img2threejs 工厂可以继续作为可信资产使用。普通用户上传的 JS/TS 只能作为候选源文件保存，不能在主页面中直接执行。

禁止使用以下方式执行用户源码：

```text
eval
new Function
动态导入 Blob URL
向主页面注入 script 标签
```

原因包括凭证和数据窃取、冒用用户调用 API、无限循环、内存/GPU 耗尽、网络外传以及篡改应用全局状态。关键字扫描和 import 白名单只能帮助筛选，不能构成安全边界。

未来的安全处理流程：

```text
上传 JS/TS 源码
  → 以 candidate 状态保存到隔离区
  → 校验大小、哈希、导入和导出
  → 在无凭证、默认无网络的隔离环境中编译
  → 限时、限内存执行 createModel()
  → 检查输出节点、几何、材质、贴图和包围盒
  → 规范化坐标和尺寸
  → 导出 GLB 或 scene-json
  → 生成缩略图和审核视图
  → 审核通过后发布派生资产
```

生产浏览器加载派生的 GLB/JSON，不加载普通用户的原始 JS。原始源码保留用于复现、修改、重新编译和审查。

Cloudflare Worker 或 Sites 服务端不能被默认视为通用的不可信代码沙箱。若后续真的执行用户代码，应单独建设具有网络、CPU、内存、文件系统和运行时间限制的隔离转换服务。

## 9. 统一加载接口

场景层不关心资产来自 GLB、JSON 还是可信工厂。建议统一为：

```ts
type FurnitureAssetFormat = "glb" | "scene-json" | "factory-js";

interface FurnitureAssetLoader {
  load(asset: FurnitureAsset): Promise<THREE.Group>;
}
```

分派关系：

```text
glb
  → GLTFLoader
  → THREE.Group

scene-json
  → Schema validator
  → ProceduralFurnitureBuilder
  → THREE.Group

factory-js（仓库内置/管理员可信）
  → 构建期编译模块
  → THREE.Group

factory-js（普通用户上传）
  → 隔离转换服务
  → 派生 GLB/scene-json
  → THREE.Group
```

所有路径最终进入同一适配器，执行：

- Y-up 规范化；
- 地面中心对齐；
- 包围盒测量；
- 目标尺寸适配；
- 比例误差检查；
- 质量预算检查；
- 加入场景。

## 10. 用户隔离和版本策略

后端化时需要遵循：

- 服务端从可信身份上下文获取 `userId`，不相信请求体中的所有者字段；
- 每次读写都同时按资源 ID 和用户 ID 查询；
- 对象键包含服务端确定的用户 ID；
- 私有文件默认不公开；
- 用户只能获得自己文件的短期下载/上传地址；
- 每个布局和资产版本使用不可变文件；
- 使用 SHA-256 内容哈希识别修改和去重；
- 源文件哈希变化后，审核状态自动退回 `candidate`；
- 配置单文件、单资产、单用户总量和请求频率限制；
- 删除优先采用软删除与延迟清理，避免误删后无法恢复。

建议的资产状态：

```text
uploading
candidate
building
review_required
approved
rejected
failed
archived
```

## 11. 分阶段实施

### 阶段 A：当前本地阶段

- 完成布局 JSON 的目录、README 和版本定义；
- 将三个现有房间保存为三个预制布局 JSON；
- 完成本地“读取方案、保存、保存副本”体验；
- 确认家具清单中能够表达 `format` 和统一尺寸信息；
- 保留现有可信 img2threejs 工厂注册方式。

完成条件：项目完全离线时，布局仍能可靠读取、保存、另存副本和恢复。

### 阶段 B：多格式家具资产

- 实现 GLB 加载器；
- 定义 `scene-json` Schema；
- 实现 JSON 家具构建器；
- 抽象统一资产加载接口；
- 让三种来源进入同一个尺寸和坐标适配器；
- 增加内容哈希、候选状态和错误提示。

完成条件：内置 GLB、JSON 和可信工厂资产在场景中行为一致。

### 阶段 C：最小云端后端

- 选择 Sites 同源 API 或独立 Worker API；
- 启用用户身份、D1 和 R2；
- 建立布局、布局版本、资产、资产版本表；
- 实现布局上传、下载、保存副本和版本恢复；
- 实现 GLB/JSON 的签名上传和下载；
- 实现用户隔离、配额与基本审计。

完成条件：两个用户无法读取或修改彼此的私有布局与资产，并且布局能跨设备恢复。

### 阶段 D：用户源码转换

- 建设独立隔离转换服务；
- 支持 img2threejs JS/TS 编译和限额执行；
- 将输出固化为 GLB 或 `scene-json`；
- 自动生成缩略图和审核视图；
- 建立审核、重新审核和失败诊断界面。

完成条件：普通用户源码从未在生产主页面直接执行，且源文件变化会触发重新转换与审核。

### 阶段 E：双前端和运营能力

- 让 GitHub Pages 与 ChatGPT Sites 共用一套 API；
- 配置正式 API 域名和精确 CORS；
- 增加版本冲突处理、软删除恢复和用量统计；
- 根据实际使用情况完善 CDN、缓存和成本限制。

## 12. 后端化前需要确认的问题

以下问题不阻塞当前本地开发，到阶段 C 前再决定：

1. ChatGPT Sites 是否为唯一正式入口，还是 GitHub Pages 也承担完整登录和编辑功能？
2. 用户身份使用 Sites 身份、自建身份服务，还是第三方 OAuth？
3. 资产默认私有、公开，还是允许用户逐项分享？
4. 是否要求多人共同编辑同一个布局？
5. 是否保留所有历史版本，以及保留多久？
6. 用户上传资产的容量、三角面、贴图和文件数量上限是多少？
7. JS/TS 转换是仅管理员使用，还是对所有用户开放？
8. 是否需要商业用途下的资产许可声明和来源证明？

## 13. 推荐的近期下一步

在不后端化的前提下，建议按以下顺序推进：

1. 先完成布局 JSON 的稳定存取与“保存副本”；
2. 确认预制布局不再依赖 JS 内嵌数据；
3. 为现有家具清单增加明确的格式和 Schema 版本；
4. 优先实现 GLB 导入；
5. 再定义最小可用的 `scene-json`；
6. 保持用户 JS/TS 仅作为未来能力，不在当前浏览器中开放执行。

这样可以先解决当前布局工具的核心体验，同时避免未来接入 D1、R2 或独立后端时重写资产系统。
