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
- `lib/bedroom/asset-registry.ts`：内建资产及 img2threejs 工厂注册层。
- `docs/IMG2THREEJS_INTEGRATION.md`：程序化资产接入约定。

布局数据采用毫米和 Y-up 坐标。当前版本以浏览器内状态演示交互，后续可接入持久化布局文件、房间测量数据及正式 img2threejs 生成资产。
