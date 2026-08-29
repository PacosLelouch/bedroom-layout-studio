# img2threejs 接入约定

本项目以 Three.js 的 `THREE.Group` 作为程序化资产边界，采用 Y-up、毫米单位。生成资产不直接修改编辑器代码，而是通过 `registerImg2ThreeAsset()` 注册。

```ts
import { registerImg2ThreeAsset } from "@/lib/bedroom/asset-registry";
import { createObjectModel } from "./generated/createObjectModel";

registerImg2ThreeAsset({
  id: "custom-chair-01",
  name: "参考图生成椅",
  category: "seat",
  size: { width: 720, depth: 760, height: 820 },
  color: "#9b6856",
  factory: createObjectModel,
});
```

## 工厂约束

- 签名：`factory(spec, options) => THREE.Group`。
- 根节点和可点击子节点应保留稳定的 `name`。
- 编辑器会写入 `furnitureId`、`assetId`、`clickable` 和 `explodable` 元数据。
- 模型原点位于家具落地点中心，Y=0 为地面。
- 随机细节必须使用 `options.seed`，保证相同布局可复现。
- 尺寸来自 `options.dimensions`，不要在模型内部假设厘米或米。

后续获得卧室或家具参考图后，再运行 img2threejs 的正式 intake、规格、生成、验证和多角度质量门流程。当前文件只提供应用侧稳定接入层，不伪造尚未从图片获得的重建数据。
