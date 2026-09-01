# 仓库技能

克隆仓库后初始化技能 submodule：

```bash
git submodule update --init --recursive
```

本仓库包含两个职责不同的技能：

```text
.agents/skills/
├─ furniture-asset-packaging/  家具资产主编排器
└─ img2threejs/                只读 Git submodule，图像到程序化模型的重建子模块
```

`furniture-asset-packaging` 负责创建或包装家具、按提示词修改尺寸/状态/参数/组件与外观、验证运行时和 GLB，并把技术准备完整的资产登记为 `candidate`。连续几何需要大规模重建时，它可以调用 `img2threejs` 的现有 `generic` 流程，但不得修改 submodule 内容或 gitlink。

两个技能的家具产物都使用统一目录：

```text
lib/bedroom/assets/<builtin|user-generated>/<asset-id>/
├─ asset.json
├─ runtime.ts
└─ model.ts       # 可选
```

`builtin` 和 `user-generated` 区分资产所有权与交付范围，不区分建模方式。审核 Web 应用只读取统一家具包，不在浏览器中执行技能；`img2threejs` 额外生成的 collider、socket、explodable 或 destruction metadata 也不会自动成为家具 UI 能力。
