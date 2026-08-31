# 卧室布局工作台

面向多卧室家具规划的 Three.js 交互 Web 项目。支持房间切换、家具添加、选取、拖拽、旋转、复制、删除、尺寸编辑、吸附、边界/碰撞提示，以及平面与 3D 视角。

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

## 目录

- `app/`：页面和界面样式。
- `components/bedroom-viewport.tsx`：Three.js 场景、拾取、拖拽与相机交互。
- `lib/bedroom/types.ts`：房间和家具布局数据协议。
- `lib/bedroom/layouts/`：三个内置房间布局的 JSON 资产、索引和完整格式说明。
- `lib/bedroom/room-layouts.ts`：加载并校验布局 JSON 的入口。
- `public/floorplans/`：供页面直接访问的三个 SVG 标尺底图；`docs/` 中保留原始交付文件。
- `lib/bedroom/asset-registry.ts`：内建资产及 img2threejs 工厂注册层。
- `docs/IMG2THREEJS_INTEGRATION.md`：程序化资产接入约定。

布局数据采用毫米和 Y-up 坐标。三个内置方案只从 JSON 资产加载；用户可把所有房间保存到浏览器，也可另存为 JSON 文件并再次导入。JSON 的目录组织、字段协议和扩展步骤见 [`lib/bedroom/layouts/README.md`](lib/bedroom/layouts/README.md)。

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
