# img2threejs 家具资产管线

img2threejs 通过 `.agents/skills/img2threejs` Git submodule 提供，是只读的离线重建能力，
不是 Web 服务。初始化仓库后运行：

```text
git submodule update --init --recursive
```

不支持本机硬编码路径或 Junction 接入。浏览器只加载已经包装到统一家具包中的静态内容：
仓库随包资产位于 `lib/bedroom/assets/builtin/<asset-id>/`，当前前端暂存的用户资产位于
`lib/bedroom/assets/user-generated/<asset-id>/`。两者都使用 `asset.json + runtime.ts`，可选
`model.ts`；区别仅是供给范围，不是生成方式。后续后端计划通过 provider/API 边界替换用户
资产目录读取。

生成资产使用 manifest schema v3。`draft` 表示技术准备不完整；`candidate` 表示可靠尺寸、
默认配置、状态、参数、组件、GLB 导出重载和当前哈希证据全部通过；`approved` 表示用户在
`/asset-review?asset=<asset-id>` 完成外观确认。只有有效 approved 资产进入家具面板。

图片不能独立提供可信毫米尺寸。任何 factory、wrapper 或能力修改都会使旧证据过期，资产
有效状态自动回到 draft，完成候选准入后才能再次成为 candidate。
