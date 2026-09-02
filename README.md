# 卧室布局工作台

卧室布局工作台是一个 npm workspaces 单仓库：浏览器端提供 Three.js 房间与家具编辑、布局导入导出和家具审核；可选的自建控制面提供多租户布局版本、家具 revision、对象存储和可恢复的 Agent SSE；独立 Worker 在受限 Git worktree 中运行 Codex App Server。Sites 与 GitHub Pages 始终只是客户端，不承载数据库、对象存储或 Agent 执行。

## 快速开始

要求 Node.js `>= 22.13.0`。首次克隆时初始化只读的 `img2threejs` submodule，然后安装依赖：

```bash
git submodule update --init --recursive
npm install
npm run dev:web
```

Web 默认监听 `http://127.0.0.1:5555`；`WEB_HOST`、`WEB_PORT`、`PUBLIC_BASE_PATH` 和 `PUBLIC_API_BASE_URL` 均可配置。未提供 API 地址时，布局编辑和浏览器本地保存仍可使用，Agent 面板会明确显示离线状态。

完整的本地云端开发配置见 [docs/BACKEND_DEVELOPMENT.md](docs/BACKEND_DEVELOPMENT.md)。复制 `.env.example` 的字段到受保护的运行环境后，可分别启动：

```bash
npm run dev:api
npm run dev:worker
npm run dev:all
```

`dev:all` 需要 PostgreSQL、Worker capability token、绝对工作区路径和仓库路径。开发模式可使用内存 repository/queue 与 filesystem storage；生产身份入口为 OIDC Bearer token，开发身份头不能作为生产认证方案。

## 仓库结构

- `apps/web/`：Vinext/Vite 客户端、Three.js 编辑器、家具审核和 Agent 面板；该目录也是 Sites 项目根。
- `apps/api/`：Fastify API、OIDC/开发身份、布局与资产版本、Agent 控制面和 SSE。
- `apps/agent-worker/`：pg-boss 消费者、受限 worktree 生命周期、Codex App Server stdio 适配和公开事件映射。
- `packages/contracts/`：layout v2、manifest v3、API DTO 和 Agent 事件的共享协议。
- `packages/bedroom-core/`：与浏览器框架无关的 API 客户端、SSE 解码器和远程布局 adapter。
- `packages/furniture-assets/`：家具契约校验、候选就绪判定和共享类型。
- `packages/database/`：PostgreSQL Drizzle schema 与迁移。
- `packages/storage/`：不可变 filesystem/S3 对象存储 adapter。
- `apps/web/lib/bedroom/assets/<builtin|user-generated>/`：统一的仓库家具包。
- `.agents/skills/furniture-asset-packaging/`：家具创建、包装、修改、验证和候选准入技能。
- `.agents/skills/img2threejs/`：只读 submodule，需要连续几何重建时由包装技能调用。
- `infra/`：Caddy 和低权限 systemd 样例，不包含真实密钥。

三个内置房间只从 `apps/web/lib/bedroom/layouts/*.json` 加载；详细协议见 [布局格式说明](apps/web/lib/bedroom/layouts/README.md)。布局单位为毫米，坐标系为 Y-up。用户可保存到浏览器、另存 JSON 或重新导入。

## 家具资产

所有家具使用 `asset.json + runtime.ts + 可选 model.ts` 的 manifest v3 包。`builtin` 与 `user-generated` 表示所有权和交付范围，不表示建模方法；两者共享同一契约。

资产生命周期为 `draft → candidate → approved → archived`。后端分别保存 `rawStatus` 和重新推导的 `effectiveStatus`；模型、能力或契约 hash 变化会使旧证据失效。revision 引用的 artifact 必须已存在于对应租户和资产的私有对象前缀下；只有技术门禁通过的 candidate 才能被明确批准。仓库审核页是 `/furniture-review?asset=<asset-id>`。

进一步说明见 [家具资产架构](docs/FURNITURE_ASSET_ARCHITECTURE.md) 和 [img2threejs 接入约定](docs/IMG2THREEJS_INTEGRATION.md)。

## 构建与验证

```bash
npm run typecheck
npm test
npm run build:web:sites
npm run build:web:pages
```

`npm test` 运行所有 workspace 单元/集成测试和 Web 的资产契约、生产构建、体积预算与功能测试。双目标构建使用同一源码：Sites 以 `/` 为默认 base path，Pages 可通过 `PUBLIC_BASE_PATH=/bedroom-layout-studio/` 验证项目子路径。

构建命令没有部署副作用。Sites 发布和 Pages 发布均被单独审批门禁保护；本仓库的 Pages workflow 仅在 GitHub Actions 明确触发后部署 `apps/web/out`。

## 安全与生产边界

- 浏览器只连接产品 API/SSE，不直连 Codex App Server，也不接触 OpenAI 主凭证。
- API 不执行源码；Worker 不持有数据库超级用户或对象存储主密钥。
- 当前进程式 Worker 只允许管理员可信仓库任务。普通用户任意 JS/TS 必须等加强隔离 Runner（无网络、只读根、资源/PID/磁盘限制）和故障演练完成后才能开放。
- `infra/` 是部署模板，不代表已配置备份、高可用、生产 OIDC、TLS 或恢复演练。

实施范围、已完成阶段和仍需生产环境验收的门禁以 [云端与家具资产计划](meta_plan/CLOUD_STORAGE_AND_FURNITURE_ASSET_PLAN.md) 为准。
