# 后端、Agent 与家具资产云端化计划

> 状态：实施中；A–F 的代码基础已完成，G–H 与生产启用仍受门禁约束
> 文档版本：3.0
> 更新日期：2026-09-01
> 当前决策：后端作为唯一数据与 Agent 系统；ChatGPT Sites、GitHub Pages 或其他页面只作为客户端
> 当前优先级：完成真实 PostgreSQL/S3/OIDC 集成验收与可信技能端到端试运行，再建设普通用户隔离 Runner

## 1. 目的与范围

本计划描述 Bedroom Layout Studio 从本地文件工具演进为多用户云端应用时的后端、数据、对象存储、Codex Agent、技能运行、家具资产版本和基础设施方案。

目标能力：

- 用户隔离的布局保存、读取、保存副本和版本恢复；
- 家具资产、参考图、GLB、源码和审核证据的隔离存储；
- 前端通过自然语言请求 Codex Agent 创建、包装、修改和验证家具；
- 后端运行 `furniture-asset-packaging`，必要时只读调用 `img2threejs`；
- 前端展示 Agent 进度、提问、审批、验证报告、模型预览和结果；
- 同时支持 ChatGPT Sites、GitHub Pages 或其他 Web 客户端；
- 普通用户上传的 JS/TS 不在主页面或普通 API 进程中直接执行。

本计划已经进入代码实施阶段。仓库中提供数据库 schema、filesystem/S3 存储适配器、API、Agent Worker、OIDC 验证入口、SSE 客户端和部署模板；本次实施不连接或修改生产数据库、对象存储、账号系统和现有部署。

## 2. 总体架构

采用“自建后端 + 独立 Agent Runner”。Sites 可以继续托管前端，但不承担数据库、对象存储或 Codex CLI 执行职责。

```text
ChatGPT Sites ─────────┐
                      │
GitHub Pages ─────────┼── HTTPS API / SSE ── 自建后端
                      │                       ├── PostgreSQL
其他 Web 客户端 ──────┘                       ├── S3 兼容对象存储
                                              ├── Agent 控制面
                                              └── 隔离 Agent Runner
                                                     ├── Codex SDK / App Server stdio
                                                     ├── furniture-asset-packaging
                                                     ├── img2threejs（只读）
                                                     ├── Git / Node / Python / Chromium
                                                     └── GLB 导出、重载和证据生成
```

系统分为三个平面：

1. **数据平面**：用户、布局、资产、版本、对象、审核和审计。
2. **Agent 控制平面**：任务队列、状态机、事件、提问、审批、取消、重试和幂等。
3. **Agent 执行平面**：Codex、技能、Git 工作区、构建、浏览器渲染、GLB 验证和候选准入。

API 进程不能直接执行用户代码；Runner 不能持有生产数据库超级用户凭证或对象存储主密钥。

## 3. 当前家具资产数据组织基线

后端设计以当前 `FurnitureAssetManifestV3` 为唯一家具能力契约，不再使用旧计划中的 schema v2 `format + entry` 模型。

### 3.1 仓库目录

```text
apps/web/lib/bedroom/assets/
├── manifest-types.ts                 共享 manifest v3 类型
├── package-types.ts                  统一包与 source model 类型
├── contracts.ts                      正式目录投影类型
├── catalog.ts                        正式家具目录
├── runtime-cache.ts                  动态加载与缓存
├── providers/user-generated-provider.ts  前端快照/未来后端 API 边界
├── registry/                         两种范围的统一派生注册表
├── builtin/<asset-id>/
│   ├── asset.json                    manifest v3
│   ├── runtime.ts                    固定导出 createFurnitureModel
│   ├── model.ts                      可选，固定导出 createSourceModel
│   ├── reconstruction/               可选，重建 spec、状态和来源材料
│   └── evidence/                     可选，验证报告、截图和导出证据
└── user-generated/<asset-id>/        与 builtin 完全相同的包结构
    ├── asset.json
    ├── runtime.ts
    ├── model.ts                      可选
    ├── reconstruction/               可选，重建 spec、状态和来源材料
    └── evidence/                     可选，验证报告、截图和导出证据
```

`builtin` 与 `user-generated` 是**交付范围和所有权边界**，不是建模方式：

- `builtin` 表示资产随仓库和网站版本发布；它既可以直接在项目中手写，也可以由 `furniture-asset-packaging`、`img2threejs` 或混合流程生成；
- `user-generated` 表示用户拥有、按用户/工作区隔离、无需重新构建网站即可发布的资产；
- 两个范围使用完全相同的包结构和 manifest v3，生成方式记录在 `origin.method`，可取 `manual-procedural`、`existing-procedural`、`img2threejs` 或 `hybrid`；
- `assetScope` 与 `lifecyclePolicy` 相互独立。仓库资产通常是 `repository-trusted`，用户资产通常是 `user-reviewed`，但不能通过目录名推断生成方式；
- `asset.json` 和 `runtime.ts` 必须存在；只有独立源模型有价值时才创建 `model.ts`；只有确有重建材料或持久化证据时才创建 `reconstruction/`、`evidence/`；
- 项目直接产出的资产可以不创建两个可选目录，也不应为了目录外观提交占位文件。Git 不跟踪空目录；manifest 中没有重建信息时使用契约允许的缺省值或 `null`。

后端对象存储和 Agent 工作区也必须保留这一逻辑包结构。上传、重建、验证和发布产生的文件先写入 revision 工作区，验证成功后再固化为不可变 artifact；不能为 `builtin` 和 `user-generated` 发明两套不兼容格式。

### 3.2 Manifest v3

后端必须完整保存并验证以下契约：

```text
身份：schemaVersion、assetScope、id、name、category、status、origin、lifecyclePolicy
尺寸：dimensions、dimensionSource、dimensionConstraints、footprintPolicy、clearancePolicy
能力：defaultConfiguration、parameterDefinitions、states、components
      capabilityBindings、validationConfigurations、designOverrides
导出：exportCapabilities、exportReady、exportIssue、exportEvidence
证据：candidateEvidence、qualityEvidence、reviewViews、referenceImage
审批：approvedFactoryHash、reviewedAt
来源：origin.method、origin.sourceUrl、origin.sourceRevision、reconstruction
```

### 3.3 生命周期与哈希

家具资产状态仅有：

```text
draft → candidate → approved → archived
```

- `draft`：技术准备不完整、验证失败或证据过期。
- `candidate`：尺寸、配置、状态、参数、组件、三种 purpose、GLB 和外观证据均完成，只等待视觉批准。
- `approved`：有效 candidate 经过用户批准，且批准 hash 与当前契约一致。
- `archived`：不再使用，但保留历史。

普通用户刚上传的参考图、GLB、JSON 或 JS/TS 都先进入 `draft`。

`contractHash` 覆盖可选 `model.ts`、必需 `runtime.ts`、尺寸和能力、状态和参数、组件和 bindings、验证矩阵、设计覆盖与 `exportCapabilities`；不覆盖状态、验证结果字段、时间戳、证据对象和批准 hash。后端同时保存 `raw_status` 与重新计算的 `effective_status`。任何模型或能力修改都会令旧证据失效，使有效状态回到 `draft`。

## 4. 仓库资产与云端用户资产

当前动态加载器在构建时静态生成，上传 JS 到对象存储不会自动成为前端模块。因此保留两条路径。

### 4.1 仓库资产

```text
Agent 创建 Git worktree
→ 修改 asset.json/model.ts/runtime.ts
→ 同步和验证
→ 产生候选包与 patch
→ 人工批准和合并
→ 构建发布
```

适用于内置、管理员维护和随网站发布的程序化资产。

### 4.2 云端用户资产

```text
上传参考图、GLB、JSON 或源码
→ 不可变 draft revision
→ Agent/转换服务
→ 输出 GLB 或安全 scene-json
→ 完成 v3 契约和证据
→ candidate
→ 用户批准
→ approved
→ 通用运行时加载器读取
```

普通用户资产不依赖重新构建站点。源码作为可复现来源保存，生产前端优先加载派生 GLB 或受约束 JSON。

## 5. 后端技术栈

### 5.1 系统与部署

- Linux x86-64，建议 Ubuntu Server 24.04 LTS 或同等长期支持发行版；
- Caddy 负责 TLS 和反向代理；
- 第一阶段采用可直接开发和调试的进程式部署，不以 Docker 为前置条件：Node API、Agent Worker 和前端开发服务器分别运行；
- PostgreSQL 可安装在开发机或使用远程开发实例；对象先通过本地文件系统适配器保存，之后无缝切换到 S3 兼容适配器；
- Codex CLI/SDK、Git、Node、Python 和 Chromium 直接安装在开发/Runner 主机，由独立低权限系统用户运行；
- 使用 `systemd` 或等价进程管理器设置重启、日志、环境变量、CPU、内存、PID 和文件句柄限制；
- Docker/OCI、gVisor、Kata 或临时虚拟机保留为正式生产及执行不可信 JS/TS 时的隔离选项，不是最小后端原型的依赖。

进程式开发部署只允许受信任的管理员任务和仓库代码。它不是用户任意代码的安全边界；在加强隔离 Runner 完成前，不向普通用户开放任意 JS/TS 的服务器执行。

### 5.2 API 与数据库

```text
Node.js 22 LTS
TypeScript
Fastify
Zod
Drizzle ORM
PostgreSQL 18（始终更新到当前受支持 minor）
```

选择原因：现有项目已使用 Node、TypeScript、Zod 和 Drizzle；Fastify适合 JSON API、签名上传和 SSE；PostgreSQL 统一承担业务记录、幂等、事件和初期队列。GLB、图片、源码包和大日志不进入数据库，只保存 object key、SHA-256、大小、MIME 和保留策略。

建议采用 npm workspaces 的前后端分目录单仓库：

```text
/
├── apps/
│   ├── web/                     现有 Vinext/Vite 前端；Sites/Pages 构建根
│   ├── api/                     HTTP、SSE、身份、布局、资产和 Agent 控制面
│   └── agent-worker/            Codex、技能、构建、验证和 artifact 处理
├── packages/
│   ├── contracts/               layout、manifest v3、API DTO、Agent event
│   ├── bedroom-core/            与浏览器框架无关的布局和场景逻辑
│   ├── furniture-assets/        仓库家具包及其派生注册表
│   ├── database/                Drizzle schema、migration 和 repository
│   └── storage/                 filesystem 与 S3 兼容适配器
├── .agents/skills/              保留仓库根目录；只供后端 Agent 使用
├── infra/                       服务配置和未来容器/生产部署文件
├── meta_plan/
├── package.json                 workspaces 与统一开发/构建命令
└── package-lock.json
```

不只分成笼统的 `frontend/` 和 `backend/`：API 与 Agent Worker 的权限、依赖、扩缩容和故障影响不同，因此分别作为 `apps/api` 和 `apps/agent-worker`。`.agents/skills` 保留在仓库根目录，便于 Codex 发现和子模块维护，但绝不能进入 Web bundle。

仓库家具包保留在 `apps/web/lib/bedroom/assets`，纯类型和校验逻辑已抽取到 `packages/contracts` 与 `packages/furniture-assets`。这一选择避免复制静态可加载模块，同时保持资产包格式不变。Agent 在独立工作区制作 revision，不直接改写正在运行的网站资源。

### 5.3 队列

MVP 使用 `pg-boss`，减少 Redis 运维，并支持事务、重试、延迟任务和多 Worker。稳定并发超过 4–8、事件吞吐影响 PostgreSQL或需要多区域时，再引入 Redis/Valkey + BullMQ 或专用消息系统。用户可见 run 和 event 始终持久化到 PostgreSQL。

### 5.4 对象存储

业务代码只依赖 S3 兼容接口：

1. 本地开发：`filesystem` 驱动，根目录由 `STORAGE_ROOT` 明确配置；
2. 需要验证签名上传或 S3 语义时：可选 MinIO，不要求日常开发必须运行；
3. 私有测试：S3 兼容存储或 MinIO 独立卷并异机备份；
4. 正式生产：优先独立 S3 兼容对象存储服务；
5. 全部自托管时：对象存储使用独立节点/磁盘和异机备份，不能只放 API 系统盘。

Bucket 默认私有，浏览器使用短期签名 GET/PUT。对象 key 由后端生成。

### 5.5 身份

后端消费 OIDC/OAuth 2.1，不自制密码和 MFA 协议。外部 subject 映射到内部 `users.id`，所有访问同时约束 `tenant_id`、`workspace_id` 和资源 ID。Sites 与 GitHub Pages 使用同一身份提供方；Sites 平台用户 ID 可以关联，但不是不可迁移的唯一主键。

### 5.6 前端通信

- CRUD：HTTPS JSON API；
- 大文件：签名 PUT；
- LLM 问答统一作为 Agent run：前端使用普通 POST 提交用户消息，后端立即返回或复用 `runId`；
- LLM 增量回答、Agent 进度、工具状态、提问、验证和最终结果：统一通过该 run 的 SSE 事件流推送；
- 用户回答、审批、取消和重试：普通 POST；相应处理结果继续通过 SSE 返回；
- SSE 带递增 `sequence`，使用 `Last-Event-ID` 恢复；
- SSE 断线重连后先重放遗漏事件，再进入实时流；最终消息和 run 状态必须持久化，不能只存在于连接内存；
- 初期不使用 WebSocket，多人实时协作出现后再增加。

### 5.7 本地开发与端口配置

根目录提供统一命令，但三个进程可以独立启动和调试：

```text
npm run dev:web
npm run dev:api
npm run dev:worker
npm run dev:all
```

所有监听地址、端口、公开路径和 API 地址都必须可通过环境变量或命令行参数覆盖。前端自部署缺省使用浏览器允许、且便于识别的 `5555`，后端 API 缺省使用 `3333`；不要使用 Chromium 明确阻止的 `6666`：

```dotenv
WEB_HOST=127.0.0.1
WEB_PORT=5555
API_HOST=127.0.0.1
API_PORT=3333
PUBLIC_API_BASE_URL=http://127.0.0.1:3333
PUBLIC_BASE_PATH=/
CORS_ALLOWED_ORIGINS=http://127.0.0.1:5555
AGENT_WORKER_CONCURRENCY=1
STORAGE_DRIVER=filesystem
STORAGE_ROOT=/srv/bedroom-layout-studio/dev-storage
```

这里的数值只是缺省值。前端开发服务器可使用 `/api` 代理到已配置的 API，也可直接使用 `PUBLIC_API_BASE_URL`。CORS 来源从配置解析为精确列表，不使用 `*`。在 Sites 或 GitHub Pages 上，浏览器访问的是平台 HTTPS 域名，不存在可由应用选择的公开监听端口；此时只注入公开 API URL、站点 base path 和后端允许来源。

## 6. Codex Agent 接入

| 任务 | 接入方式 |
|---|---|
| 一次性检查、CI、报告 | `codex exec --json` |
| 多轮家具创建和修改 | Codex TypeScript SDK |
| 自定义会话、审批、用户输入、细事件 | App Server 本地 stdio/JSONL |
| 结构化布局建议或普通 LLM 问答 | Responses API 或 Codex Agent，由后端包装为 Agent run 和 SSE，不要求启动代码工作区 |

App Server 的远程 WebSocket 不作为生产接口。无论底层使用 Codex SDK、App Server 还是 Responses API，后端都转换为自己的统一 Agent 事件和 SSE；浏览器不直接连接模型提供方或 App Server。这样普通 LLM 回答、家具生成任务和布局建议可以共用会话组件、断线恢复、取消、审计和权限模型。

### 6.1 Agent 状态机

```text
queued → preparing → running
       → awaiting_user / awaiting_approval
       → validating
       → succeeded / failed / cancelled / timed_out
```

Agent 状态与资产状态分开。例如验证时 Agent 是 `validating`、资产仍是 `draft`；全部技术门禁完成后任务 `succeeded`、资产才成为 `candidate`。

### 6.2 事件

```text
run.started
run.progress
agent.message.started
agent.message.delta
agent.message.completed
agent.tool.started
agent.tool.completed
artifact.created
artifact.preview
validation.started
validation.result
user_input.required
approval.required
approval.resolved
run.completed
run.failed
```

`agent.message.delta` 只携带可展示的增量内容；`agent.message.completed` 携带最终消息 ID、完整内容 hash、usage 和结束原因。前端按 `messageId + sequence` 去重并拼接，收到 completed 后以服务端持久化消息为准。只输出产品级、脱敏事件，不默认输出内部推理、绝对路径、密钥、其他租户数据和完整原始命令日志。

### 6.3 API 草案

```text
POST   /api/v1/agent-runs
GET    /api/v1/agent-runs/{runId}
GET    /api/v1/agent-runs/{runId}/events          SSE
POST   /api/v1/agent-runs/{runId}/messages
POST   /api/v1/agent-runs/{runId}/approvals/{requestId}
POST   /api/v1/agent-runs/{runId}/cancel

GET/POST /api/v1/assets
GET      /api/v1/assets/{assetId}/revisions
POST     /api/v1/assets/{assetId}/approve

GET/POST /api/v1/layouts
POST     /api/v1/layouts/{layoutId}/versions
POST     /api/v1/layouts/{layoutId}/copies
```

创建 run 或发送消息时，API 返回 `202 Accepted`、`runId`、`conversationId` 和事件流地址；模型生成不占用该 POST 的响应连接。前端随后建立 SSE，依次渲染 `agent.message.started → delta* → completed`。如果回答期间发生工具调用、需要用户补充信息或产生资产预览，它们按同一全序 `sequence` 插入事件流。

任务请求携带 `baseRevision` 和 `idempotencyKey`。revision 已变化时拒绝覆盖，要求重新基于最新版本执行。消息 POST 也使用幂等键，避免网络重试产生两次 LLM 回答。SSE 可以使用 Bearer 鉴权的 fetch streaming 客户端；如果采用原生 `EventSource`，必须通过同源代理或安全的短期流令牌解决其自定义 Authorization header 限制。

## 7. 技能在后端运行

### 7.1 发布与版本

- 两个技能随受控仓库 revision 发布；生产容器化后再同时记录镜像版本；
- `img2threejs` Git submodule 只读；
- 每个 run 记录项目、技能包、Codex、Node、Python 和 Chromium 版本；
- 开发阶段由 Agent Worker 以只读权限访问技能目录，生产隔离阶段改为只读挂载；
- 资产 `state.json`、spec 和证据写在任务工作区；
- 升级技能后保留旧 Git revision、依赖锁和运行时版本；生产容器化后也保留旧镜像，以复现历史 revision。

### 7.2 Runner 运行环境

```text
Linux x86-64
Node.js 22 LTS、npm、TypeScript、项目锁定依赖
Python 3.11/3.12
Git
Codex CLI / SDK
Chromium + Playwright 运行依赖
Bash、字体、基础图像库
Three.js/GLB 验证脚本
```

img2threejs 核心使用 Python 3.10+ 标准库，不把 SAM2、Depth Anything 等大型可选依赖放进默认 CPU 环境；它们后续使用独立 GPU Runner、依赖环境与队列。

### 7.3 工作区生命周期

```text
/runner/workspaces/{tenantId}/{runId}/
├── repo/       独立 worktree 或资产工作区
├── input/      只读输入副本
├── output/     待发布结果
├── temp/       浏览器和构建中间文件
└── logs/       脱敏日志
```

开始时验证身份和 revision、创建工作区、下载明确输入、挂载只读技能/缓存、注入任务能力令牌并启动 Codex。结束时终止子进程、校验输出、上传 artifact、写入不可变 revision 并销毁工作区。失败工作区默认保留 24 小时诊断后清理。

### 7.4 Codex 凭证

不把上游 API Key 暴露为项目命令可读取的普通环境变量。推荐在 Runner 外运行本地凭证代理；任务只获得单任务短期 token 或 Unix socket。代理限制租户、run、模型、并发和最大用量。npm lifecycle、用户脚本和浏览器进程拿不到主密钥。

### 7.5 权限等级

普通用户只能修改任务资产工作区，不能写主仓库、自动部署或读取其他资产；只能产生 draft/candidate，`approved` 需要明确审核。管理员任务可创建 worktree、运行全构建并生成 patch/PR，但合并和部署仍是独立权限。

## 8. 用户代码隔离

```text
上传 JS/TS → draft revision → 静态检查 → 加强隔离 Runner
→ 限时编译执行 → 检查 THREE.Group 和预算 → 导出安全派生资产
→ 证据 → candidate
```

禁止在前端、API 或普通共享 Runner 使用 `eval`、`new Function`、Blob 动态导入、script 注入、用户 npm lifecycle、宿主 Docker socket或继承宿主密钥。

加强隔离默认限制：无 root、只读根文件系统、独立 user namespace、无 Docker socket、默认无网络、最多 4 vCPU/8 GB RAM/20 GB 临时盘、PID 256，并设单命令和整任务超时。静态分析不是安全边界。

## 9. 数据库模型

```text
users / identities / tenants / workspaces / workspace_members
layouts / layout_versions
assets / asset_revisions / asset_artifacts / asset_reviews
agent_threads / agent_runs / agent_events / agent_requests / agent_usage
audit_events / storage_objects / idempotency_keys
```

### 9.1 布局

`layouts` 保存稳定身份和当前版本；`layout_versions` 保存不可变 JSON object key、hash、父版本和创建来源。“保存副本”创建新的 layout 和初始版本，不覆盖原布局。

### 9.2 资产

`assets` 保存租户、所有者、名称、类别、scope、lifecycle policy 和 current revision；`asset_revisions` 保存 parent、manifest schema、raw/effective status、contract hash、manifest/source/runtime object key 和 Agent run 来源。每次修改创建新 revision。

`asset_artifacts.kind` 至少包括：

```text
manifest、reference-image、source-model、runtime
reconstruction-state、reconstruction-spec、candidate-report、glb-report
material-evidence、appearance-comparison、derived-glb、scene-json
thumbnail、source-bundle、sanitized-log
```

### 9.3 Agent

`agent_runs` 保存租户、用户、intent、状态、Codex thread、base/result revision、runner、技能版本、幂等键、心跳和失败摘要；`agent_events` 按 run + sequence 持久化公开事件；`agent_requests` 保存待回答问题和审批及其过期/解决信息。

## 10. 对象存储组织

```text
tenants/{tenantId}/
├── layouts/{layoutId}/versions/{versionId}/layout.json
├── assets/{assetId}/revisions/{revisionId}/
│   ├── manifest/asset.json
│   ├── source/source-bundle.tar.zst
│   ├── source/reference-01.webp
│   ├── derived/model.glb
│   ├── derived/scene.json
│   ├── derived/thumbnail.webp
│   └── evidence/...
└── agent-runs/{runId}/input|output|logs/...
```

key 由后端生成；revision artifact 不可变；全部有 SHA-256；默认私有；上传后复核字节数、hash、MIME 和文件头；临时区与正式区分开；定期清理未完成 multipart upload。

## 11. 服务器配置与磁盘

### 11.1 资源特征

当前项目本地依赖约 2 GB、完整工作区约 2.3 GB，不能为每个任务复制 `node_modules`。开发阶段共享只读依赖缓存，任务只创建 worktree、输入、输出和临时文件；生产容器化后再共享基础镜像层和只读缓存。

核心家具流程为 CPU 型：主要消耗 Codex、Node 构建、Chromium、Three.js 源/重载模型、多视角截图和临时工作区。默认不需要 GPU。

### 11.2 单任务限额

| 任务 | CPU | 内存 | 临时盘 | 超时 |
|---|---:|---:|---:|---:|
| 布局分析/JSON | 1–2 vCPU | 2–4 GB | 2 GB | 10–20 分钟 |
| manifest/wrapper 修改 | 2 vCPU | 4–6 GB | 10 GB | 20–30 分钟 |
| 打包 + 全配置 GLB | 4 vCPU | 8 GB | 20 GB | 30–60 分钟 |
| 完整 img2threejs | 4 vCPU | 8–12 GB | 30 GB | 60–120 分钟 |
| 可选本地视觉模型 | 4–8 vCPU | 16–32 GB | 40 GB | 60–120 分钟 |

等待用户回答时释放计算 Runner，只保留状态和工作区快照。

### 11.3 最低开发单机

```text
4 vCPU / 16 GB RAM / 200 GB NVMe / 100 Mbps
1 个家具任务并发
```

建议磁盘：系统与基础工具 30 GB、Node/Python/Chromium 和共享缓存 20 GB、PostgreSQL 30 GB、本地对象 60 GB、Agent 工作区 50 GB、日志与余量至少 10 GB，总计约 200 GB。若使用远程 PostgreSQL 和对象存储，本地磁盘可以减少，但 Agent 工作区仍建议至少预留 50 GB。这只适合开发，单机故障会同时影响数据和任务。

### 11.4 推荐私有测试

```text
8 vCPU / 32 GB RAM / 500 GB NVMe（大量证据用 1 TB）
至少 200 Mbps
2 个标准家具任务，或 1 个完整重建
```

建议：系统、运行时与未来镜像 60 GB、PostgreSQL 80 GB、对象 200–600 GB、Runner/缓存 120 GB、总盘至少 20% 空闲。若对象存储在外部，本机可降至 250 GB，但 Runner scratch 仍保留至少 100 GB。

### 11.5 小规模生产

```text
API/控制：4 vCPU / 8–16 GB / 100 GB NVMe
PostgreSQL：4 vCPU / 16 GB / 200 GB NVMe
Runner × 2：每台 8 vCPU / 32 GB / 250 GB NVMe
对象存储：外部 S3；或独立自托管存储节点 2 TB 起并异机备份
```

每台 Runner 最多 2 个标准任务或 1 个完整重建；总计约 4 个标准任务并行。数据库与执行用户代码的 Runner 不在同一安全边界。

### 11.6 容量公式

每个家具 revision 粗略预算：参考图 2–20 MB；manifest/源码/spec/state 1–10 MB；GLB 1–50 MB；缩略图 0.1–1 MB；多视角和材质证据 10–150 MB；报告/脱敏日志 1–20 MB。

标准 revision 按 **250 MB**，高保真按 **500 MB–1 GB** 规划。

```text
对象需求
= 用户数 × 每用户资产数 × 平均 revision 数 × 平均 revision 大小
  + 布局版本 + 30% 余量
```

例如 100 用户 × 20 资产 × 3 revision × 250 MB = 1.5 TB；加 30% 后约 2 TB。布局 JSON 远小于家具证据，家具截图/GLB 是主要容量。

Runner 磁盘最低公式：

```text
40 GB 系统/运行时 + 20 GB 共享缓存 + 并发数 × 30 GB + 30% 余量
```

2 并发理论约 160 GB，实际建议 250 GB NVMe。

### 11.7 GPU

默认不配 GPU。启用 SAM2、Depth Anything、本地视觉/生成模型或大规模 GPU 离屏渲染时增加独立 GPU Runner：建议 8 vCPU、32 GB RAM、至少 16 GB VRAM、500 GB NVMe，并使用独立队列和镜像。

## 12. 保留、备份和恢复

默认保留：未完成上传 24 小时；成功工作区发布后清理；失败工作区 24 小时；原始日志 7 天；脱敏审计至少 90 天；普通 draft 30 天（可固定）；candidate/approved 长期；archived 软删除 30 天后方可清理。

PostgreSQL 每日全量备份并连续归档 WAL 或至少每小时增量；对象存储开启版本或不可变策略并每日异机复制；备份加密；每月真实恢复演练。初期目标 RPO 1 小时、RTO 4 小时；正式对外后目标 RPO 15 分钟、RTO 1 小时。单机 MinIO 不等于高可用备份。

## 13. 监控

建议 OpenTelemetry、Prometheus、Grafana、Loki 和 Sentry（或等价组件）。监控 API、PostgreSQL、对象容量、Agent 队列、Runner 心跳、任务时长/失败、OpenAI 用量和工作区清理。

必须告警：磁盘 75%/85%、数据库或对象备份失败、Runner 心跳丢失、队列延迟、Agent 失败率、API 5xx、SSE 异常、OpenAI 限额接近、工作区清理失败。

## 14. 前端子目录与托管适配

Sites 和 GitHub Pages 都只托管 `apps/web` 的用户界面，调用自建后端，不负责系统数据库、系统对象存储、Codex 进程、Git worktree、用户代码沙箱和长时间家具验证。两者使用同一前端源码，但生成不同目标产物。

### 14.1 ChatGPT Sites

- 将 `.openai/hosting.json` 放在 `apps/web/`，使该目录成为 Site 项目根；迁移时实际执行一次平台配置与构建验证；
- Sites 构建在 `apps/web` 工作目录运行，或由根脚本代理到 `npm run build --workspace @bedroom/web`；
- 前端通过构建环境注入绝对的 `PUBLIC_API_BASE_URL`，所有数据库、存储和 Agent 请求都访问外部后端；
- Sites 环境不打包 `.agents/skills`、数据库驱动、Codex CLI 或 Worker 依赖；
- 若托管工具要求仓库根作为输入，使用根级薄构建脚本把工作目录委派到 `apps/web`，不复制第二套前端；
- 当前项目迁移目录后再执行部署，不在本计划阶段发布。

### 14.2 GitHub Pages

- Pages 只接收静态产物，不使用前端 server route；需要服务端能力的功能全部调用 `PUBLIC_API_BASE_URL`；
- 项目站点默认 `PUBLIC_BASE_PATH=/bedroom-layout-studio/`，自定义域名则使用 `/`；路由、资源、Worker 和动态加载路径都必须基于该值，不能硬编码根路径；
- GitHub Actions 的构建工作目录为 `apps/web`，或调用根 workspace 脚本，并只上传 Pages 专用静态输出目录；
- API 使用绝对 HTTPS 地址。后端把实际 Pages 域名加入精确 CORS 白名单；
- 跨域身份优先使用 OIDC Authorization Code + PKCE 和短期 Bearer token，避免依赖第三方 Cookie。若必须使用 Cookie，则要求 `Secure`、合适的 `SameSite`、CSRF 防护和精确的 credentials CORS；
- 浏览器刷新任意客户端路由时要有静态回退方案，或者采用 hash/router 能被 Pages 正确恢复的模式。

### 14.3 双目标构建约束

根目录计划提供：

```text
npm run build:web:sites
npm run build:web:pages
npm run deploy:web:sites
npm run deploy:web:pages
```

两种构建共用 `packages/contracts`、`packages/bedroom-core` 和 `packages/furniture-assets`，仅在 base path、平台适配层和输出格式上不同。CI 必须分别验证两个构建，防止只在本地 `/` 根路径可用。部署命令不应成为普通 `build` 的隐式副作用。

## 15. 分阶段实施

### A：本地优先

稳定三个布局 JSON、保存副本、manifest v3、统一的 `builtin|user-generated` 资产包、动态加载器、审核流程和 `draft → candidate → approved` 测试；不建设后端。

### B：单仓库目录迁移

先抽取 `packages/contracts`、`packages/bedroom-core` 和 `packages/furniture-assets`，再把现有前端原样迁到 `apps/web`，保持 UI 和本地功能不变。随后分别验证本地可配置端口、Sites 构建和 GitHub Pages 子路径构建。不要在移动前端的同一提交中引入真实后端行为，以便定位回归。

### C：共享协议

抽取布局 Schema、manifest v3、Agent event 和 API DTO；加入本地/远程 API adapter；定义 GLB/scene-json 云端加载接口。

### D：可开发的最小数据后端

创建 `apps/api` 和直接运行的开发脚本，接入 PostgreSQL、OIDC 和 filesystem 存储；实现布局版本、保存副本、资产 revision、artifact、配额和审计；暂不运行 Codex。完成后再验证 S3 适配器和签名上传。

### E：Agent 控制面

实现 run/event/request、pg-boss、SSE、取消、超时、幂等和心跳；先用模拟 Worker 验证前端交互。

### F：可信技能 Worker

创建 `apps/agent-worker`，以独立低权限系统用户直接运行；接入 Codex SDK/App Server stdio；后端运行家具打包技能；只读访问 img2threejs；实现 worktree、artifact 和候选报告；先限管理员。稳定后再制作可复现的 Runner 镜像和生产隔离部署。

### G：普通用户家具 Agent

加入租户工作区隔离、参考图创建、提示词修改、draft/candidate/批准、派生 GLB/JSON、配额和成本限制。

### H：用户 JS/TS 沙箱

建设加强隔离 Runner、默认无网络、硬资源限制、安全派生资产和故障演练，通过后才向普通用户开放。

### 15.1 2026-09-01 实施记录

| 阶段 | 仓库状态 | 说明 |
|---|---|---|
| A | 完成 | 三套布局、本地保存/副本、manifest v3、动态加载、审核与资产门禁测试保持通过。 |
| B | 完成 | 前端迁入 `apps/web`，根目录改为 npm workspaces；Sites 与 Pages 使用独立构建命令。 |
| C | 基础完成 | layout、manifest、Agent event、API DTO、SSE 解码和远程布局 adapter 已抽到共享包；云端 GLB/scene-json 产品加载仍随 G 阶段接入。 |
| D | 开发基础完成 | PostgreSQL schema/migration、内存与 PostgreSQL repository、filesystem/S3 adapter、OIDC 验证入口和布局/资产 API 已实现。配额执行、完整 audit 写入、浏览器签名上传流程以及真实 PostgreSQL/S3/OIDC 集成验收尚未完成。 |
| E | 开发基础完成 | Agent run、全序公开事件、SSE replay、幂等创建/消息/审批、模拟 Worker、超时和心跳字段已实现。持久化 request 生命周期、运行中跨进程取消、死任务回收和负载故障测试仍待完成。 |
| F | 执行骨架完成 | 独立 Worker、pg-boss、受限工作区/worktree、Codex App Server stdio 握手、turn 事件映射和低权限 systemd 模板已实现。家具包装技能的真实端到端 artifact/candidate 发布、管理员私测和可复现 Runner 镜像尚未完成。 |
| G | 部分界面完成 | Web Agent 面板可创建 run、增量读取/恢复 SSE、取消、补充信息和审批；普通用户参考图到派生 GLB/scene-json 的完整链路、配额和成本策略尚未实现。 |
| H | 未开始 | 任意用户 JS/TS 仍禁止在生产执行；加强隔离 Runner 和故障演练是开放前硬门禁。 |

本轮只修改仓库代码、迁移、测试、文档和基础设施模板；没有部署 Sites/Pages，没有启动或迁移生产数据库，没有创建 S3 bucket/OIDC 客户端，也没有变更线上 DNS、TLS 或账号。`infra/` 中的 Caddy/systemd 文件必须在目标主机上经真实密钥管理、备份和恢复演练后才能视为生产配置。

## 16. 上线验收

- manifest v3 是唯一家具契约；
- raw/effective status 分离；Agent 与资产状态分离；
- revision/artifact 不可变且有 SHA-256；
- 只有有效 approved 进入正式目录；
- 技能与 Runner 版本可追溯；
- `builtin` 生成资产的 reconstruction/evidence 可选内容可以完整往返，直接项目资产无需空目录；
- 前端自部署缺省端口为浏览器允许的 `5555`，且端口、API 地址和 base path 均可配置，Sites 与 Pages 两种构建均通过；
- 普通用户不能写主仓库；
- 浏览器和项目命令拿不到 OpenAI 主密钥；
- Runner 有 CPU、内存、PID、磁盘、网络和超时限制；
- 数据库和对象有异机备份且完成恢复演练；
- 普通 LLM 回答和长任务都通过统一 Agent SSE；文本 delta 可增量展示，最终消息持久化；
- SSE 可按 `Last-Event-ID` 恢复，消息和任务幂等键防止重复回答或重复执行；
- 工作区、死任务和垃圾对象清理经过测试；
- 单机环境明确标记为开发/测试，不宣传为高可用。

## 17. 当前推荐决策

1. 采用 npm workspaces 单仓库：`apps/web`、`apps/api`、`apps/agent-worker` 分离，共享代码放在 `packages/*`，技能保留在根目录 `.agents/skills`。
2. 后端采用 Node.js 22 + TypeScript + Fastify + Drizzle + PostgreSQL 18。
3. 初期队列采用 pg-boss，不立即增加 Redis。
4. 开发阶段用可切换的 filesystem 存储，按需使用 MinIO 验证 S3 语义；正式环境优先独立 S3 兼容对象存储。
5. 所有面向用户的 LLM 回答都包装为 Agent run，通过统一、可恢复的 SSE 推送文本增量、工具状态、提问和最终结果；一次性后台任务仍可使用 `codex exec --json`。
6. MVP 直接以独立进程运行 API 与 Agent Worker；前端自部署缺省端口为 `5555`，API 缺省端口为 `3333`，两者都可配置；容器化延后到生产隔离阶段。
7. `builtin` 与 `user-generated` 使用同一 v3 包契约；两者都允许可选 `model.ts`、`reconstruction/` 和 `evidence/`，`builtin` 也可以由生成流程产出。
8. Sites 和 GitHub Pages 只部署 `apps/web`；Pages 使用仓库 base path，二者通过绝对 HTTPS API 地址连接自建后端。
9. 默认 CPU Runner；可选视觉模型使用独立 GPU Runner。
10. 最低开发服务器为 4 vCPU、16 GB、200 GB NVMe、单任务并发。
11. 推荐私有测试服务器为 8 vCPU、32 GB、500 GB–1 TB NVMe、2 个标准任务并发。
12. 正式环境拆分 API、PostgreSQL、Runner 和对象存储安全边界。
13. A–F 的代码基础已落地；下一步按“真实依赖集成验收 → 私有可信任务试运行 → 加强隔离 Runner → 普通用户开放”推进。

## 18. 参考资料

- OpenAI Codex SDK：https://learn.chatgpt.com/docs/codex-sdk
- OpenAI Codex App Server：https://learn.chatgpt.com/docs/app-server
- OpenAI Codex 非交互模式：https://learn.chatgpt.com/docs/non-interactive-mode
- PostgreSQL 支持策略：https://www.postgresql.org/support/versioning/
- Docker 资源限制：https://docs.docker.com/engine/containers/resource_constraints/
- Docker rootless：https://docs.docker.com/engine/security/rootless/
- pg-boss：https://pgboss.io/introduction
- MinIO S3 兼容存储：https://min.io/docs/minio/linux/index.html
