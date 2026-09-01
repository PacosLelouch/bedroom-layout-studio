# 卧室布局工作台

面向多卧室家具规划的 Three.js 交互 Web 项目。支持房间切换、家具添加、选取、拖拽、旋转、复制、删除、尺寸与状态编辑、吸附、边界/碰撞提示、墙体轮廓调整、家具预制体，以及平面与 3D 视角。项目同时提供统一家具资产契约、草稿/候选审核和 GLB 兼容验证。

## 本地运行

要求 Node.js `>= 22.13.0`。克隆后先初始化只读的 `img2threejs` Git submodule：

```bash
git submodule update --init --recursive
npm install
npm run dev
```

默认地址为 `http://localhost:5555`。可通过 `WEB_PORT` 或 `PORT` 覆盖端口；同一工作树不要同时启动多个开发服务，以免 Windows 上的 Vite 依赖缓存发生写入冲突。

完整验证会依次检查资产注册表、执行 Vinext 生产构建、检查客户端体积预算并运行全部测试：

```bash
npm test
```

只执行生产构建可运行 `npm run build`。

## 目录

- `app/`：页面和界面样式。
- `components/bedroom-viewport.tsx`：卧室 Three.js 画布和 React 生命周期入口。
- `lib/bedroom/scene/`：房间场景、相机、交互、资源缓存和按需渲染控制器。
- `lib/bedroom/types.ts`：房间和家具布局数据协议。
- `lib/bedroom/layouts/`：三个内置房间布局的 JSON 资产、索引和完整格式说明。
- `lib/bedroom/room-layouts.ts`：加载并校验布局 JSON 的入口。
- `public/floorplans/`：供页面直接访问的三个 SVG 标尺底图；`docs/` 中保留原始交付文件。
- `lib/bedroom/assets/builtin/`：随网站构建发布的内置家具包。
- `lib/bedroom/assets/user-generated/`：当前随前端读取、未来由后端 API 提供的用户资产包。
- `lib/bedroom/assets/registry/`：从统一家具包生成的目录和运行时加载器。
- `lib/bedroom/asset-registry.ts`：布局编辑器使用的兼容门面；不存放模型工厂。
- `app/furniture-review/`：内置、草稿、候选和归档家具的统一审核入口。
- `.agents/skills/furniture-asset-packaging/`：家具创建、包装、修改、验证和候选准入编排技能。
- `.agents/skills/img2threejs/`：只读 Git submodule，在需要连续几何重建时作为子模块使用。
- [`docs/FURNITURE_ASSET_ARCHITECTURE.md`](docs/FURNITURE_ASSET_ARCHITECTURE.md)：统一家具包、所有权范围和生命周期。
- [`docs/IMG2THREEJS_INTEGRATION.md`](docs/IMG2THREEJS_INTEGRATION.md)：只读图像重建子模块的接入约定。

布局数据采用毫米和 Y-up 坐标。三个内置方案只从 JSON 资产加载；用户可把所有房间保存到浏览器，也可另存为 JSON 文件并再次导入。JSON 的目录组织、字段协议和扩展步骤见 [`lib/bedroom/layouts/README.md`](lib/bedroom/layouts/README.md)。

## 家具资产

所有家具统一使用 `asset.json + runtime.ts + 可选 model.ts`。`builtin` 和 `user-generated` 表示资产所有权与交付范围，不表示建模方式；由技能生成的家具也可以作为内置资产随仓库发布。

资产生命周期为 `draft → candidate → approved → archived`。`candidate` 表示尺寸、默认配置、状态、参数、组件、GLB 和证据均已技术就绪，只等待人工外观批准；只有证据有效的 `approved` 资产进入正式家具目录。审核页面为 `/furniture-review?asset=<asset-id>`，旧 `/asset-review` 地址仅保留兼容。

## 标尺图接入约定

原始 SVG 仅作资料归档时放在 `docs/`，浏览器要显示的副本放在 `public/floorplans/`，页面用 `/floorplans/文件名.svg` 引用。几何计算不直接解析 SVG 路径，而是把图中的权威毫米尺寸同步转录到 `lib/bedroom/layouts/*.json`，保证 2D/3D、碰撞检测、面积统计和原图对照使用同一套房型数据。

目前衣柜规则为：平开门柜深不小于 600 mm，开启区按实际门扇宽度计算（例如 1000 mm 双开门按每扇 500 mm）；推拉门柜深不小于 650 mm，不强制设置柜前硬净空。飘窗收纳使用由窗台承托的摆柜，并记录柜底标高，不能把窗前悬空区域当成默认吊柜安装位。

## 部署到 GitHub Pages

仓库已包含 `.github/workflows/deploy-pages.yml`。首次使用时，在 GitHub 仓库的
**Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
之后推送到 `main` 或 `master` 分支即可自动构建并部署，也可以在 Actions 页面手动运行。

工作流会自动处理两种地址：

- 项目站点：`https://<用户>.github.io/<仓库名>/`
- 用户或组织站点：仓库名为 `<用户>.github.io` 时使用根路径

本地验证静态导出：

```bash
npm run build:pages
```

未设置 GitHub Actions 环境变量时会按根路径生成 `out/`。如需在本地模拟项目站点：

```bash
PAGES_BASE_PATH=/bedroom-layout-studio npm run build:pages
```

现有 `npm run build` 和 Sites 部署配置保持不变。
