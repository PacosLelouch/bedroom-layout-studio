# 布局 JSON 资产说明

本目录是内置卧室布局 JSON 的存储根目录。AI 或用户新增、调整内置布局时，应先阅读本文档。

三个预制布局的房间、门窗和家具实例数据必须只维护在本目录的 `.json` 文件中，不要把布局数据重新写回 JavaScript 或 TypeScript。`../room-layouts.ts` 只负责静态导入、索引映射和校验，不包含布局内容。

## 目录结构

```text
layouts/
├─ README.md                 # 本说明
├─ index.json                # 内置布局清单与加载顺序
├─ master.json               # 主卧现有布局
├─ large-secondary.json      # 大次卧现有布局
└─ small-secondary.json      # 小次卧现有布局
```

`index.json` 是内置布局入口。应用按照 `layouts` 数组顺序显示房间标签，并通过 `file` 找到对应 JSON。每个 `id` 必须唯一，而且必须与目标布局文件顶层的 `id` 相同。

目前为了让打包工具静态收集 JSON，新增文件后还需要在 `../room-layouts.ts` 中增加一次 import，并加入文件映射。应用启动时会校验索引和所有布局；字段错误、未知字段、ID 不一致或遗漏文件都会直接报错，避免带病数据进入 2D/3D 场景。

## 单个布局文件格式

每个布局文件表示一个完整房间，顶层结构如下。JSON 不允许注释、尾随逗号、`NaN` 或 `Infinity`。

```json
{
  "id": "master",
  "name": "主卧",
  "dimensions": { "width": 3001, "depth": 5155, "height": 2800 },
  "clearArea": 11.34,
  "planSrc": "/floorplans/master-bedroom.svg",
  "outline": [
    { "x": 0, "z": 0 },
    { "x": 3001, "z": 0 },
    { "x": 3001, "z": 5155 },
    { "x": 0, "z": 5155 }
  ],
  "keepOutZones": [],
  "doors": [],
  "bayWindow": {
    "side": "bottom",
    "start": 0,
    "length": 3001,
    "depth": 650,
    "sillHeight": 600
  },
  "items": []
}
```

### 坐标和单位

- 所有长度、位置、净空距离均使用毫米；`clearArea` 使用平方米。
- 平面坐标使用 `x` 和 `z`：`x` 从左向右，`z` 从上向下；3D 高度使用 `y`，但布局 JSON 中通常只存高度值。
- `position` 是家具模型的平面中心点，不是左上角。
- `rotation` 使用角度，当前界面主要使用 `0`、`90`、`180`、`270`。
- `outline` 按房间边界顺序填写，至少三个点；不要重复首点作为末点。

### 房间字段

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id` | string | 稳定且唯一的房间 ID；推荐小写英文和连字符 |
| `name` | string | 界面显示名称 |
| `dimensions` | object | 房间最大宽、深、高，单位毫米 |
| `clearArea` | number | 净面积，单位平方米 |
| `planSrc` | string，可选 | `public/` 下标尺 SVG 的站点绝对路径；界面新建的空房间可以没有标尺图 |
| `outline` | array | 房间净轮廓的 `{x, z}` 点列 |
| `keepOutZones` | array | 门扇或通行禁放区域 |
| `doors` | array | 可交互门洞和门扇参数 |
| `bayWindow` | object，可选 | 飘窗所在侧、起点、长度、进深和窗台高度；普通空房间可以省略 |
| `items` | array | 当前布局中的家具实例 |

### 家具 `items` 格式

```json
{
  "id": "master-bed",
  "assetId": "double-bed",
  "name": "1800 双人床",
  "position": { "x": 900, "z": 4000 },
  "rotation": 0,
  "size": { "width": 1800, "depth": 2100, "height": 520 },
  "color": "#d9cbb9",
  "parameterValues": {},
  "stateId": null
}
```

必填字段：

- `id`：该房间内唯一的家具实例 ID。
- `assetId`：必须能在 `../asset-registry.ts` 的家具目录中找到；找不到时只能显示兜底方盒模型。
- `name`：界面显示名称。
- `position`：家具中心的 `{x, z}` 坐标。
- `rotation`：绕 Y 轴旋转角度。
- `size`：`width`、`depth`、`height`，均为正数。
- `color`：CSS 颜色字符串，推荐六位十六进制颜色。
- `parameterValues`：当前家具实例的参数值；没有特殊参数时使用空对象。
- `stateId`：当前有限状态 ID；没有状态时使用 `null`。状态必须由 `assetId` 对应的家具 manifest 声明。

可选字段：

- `wallMounted`：是否为墙面安装；为 `true` 时不计入地面占用碰撞。
- `supportSurface`：家具承托面，可为房间地面、飘窗台或墙面；飘窗摆柜应使用 `bay-window`，并完整落在飘窗范围内。
- `baseHeight`：家具底面标高；飘窗摆柜通常等于飘窗台高度，不能用墙面吊装标高代替。
- `clearanceDepth`、`clearanceLabel`：柜门或操作净空及其说明。
- `presetId`：创建该实例时使用的家具预制体 ID；预制体失效不会改变实例已保存的配置。

编辑器的“轮廓”模式通过拖拽墙段中点来平移整段墙，并同步同一墙段上的门和门区；这种方式会保持原有正交墙体，不会因单独拖动一个角点产生斜墙。调整后仍需检查家具、飘窗和固定设施是否落在新轮廓内。

### 旧版家具字段兼容

版本 1 布局可能把 `interactionState`、`loweredHeight`、`raisedHeight`、`collapsedDepth`、`expandedDepth`、`collapsedWidth`、`expandedWidth`、`collapsedPositionX/Z` 和 `expandedPositionX/Z` 直接写在家具顶层。读取器仍接受这些字段，并将它们规范化为 `stateId` 和 `parameterValues`，但保存和重新导出时不会继续输出旧字段。

新增或修改布局时使用当前格式，不要继续创建旧字段。例如升降桌应写成：

```json
{
  "parameterValues": {
    "loweredHeight": 750,
    "raisedHeight": 1100
  },
  "stateId": "closed"
}
```

布局实例只保存当前配置，不复制状态定义、参数定义、组件或运行时行为；这些能力由 `assetId` 对应的统一家具 manifest 决定。只有有效 `approved` 资产出现在正式家具目录中，`draft`、`candidate` 和 `archived` 资产不能作为新的正式家具加入布局。

### 禁放区 `keepOutZones` 格式

```json
{
  "id": "master-entry-door",
  "label": "入户门开启区 R900",
  "x": 0,
  "z": 900,
  "width": 900,
  "depth": 900,
  "kind": "door"
}
```

`kind` 只能是 `door` 或 `circulation`。`x`、`z` 表示矩形区域起点，`width`、`depth` 必须为正数。

### 门 `doors` 格式

```json
{
  "id": "master-entry",
  "label": "主卧门 W900",
  "hinge": { "x": 0, "z": 900 },
  "width": 900,
  "wallAxis": "x",
  "wallCoordinate": 0,
  "openingStart": 900,
  "closedAngle": 90,
  "openAngle": 0,
  "isOpen": true
}
```

`wallAxis` 只能是 `x` 或 `z`。角度采用度数；`isOpen` 可省略，省略时由界面默认状态处理。

## 新增或修改内置布局

1. 复制最接近的布局 JSON，并使用小写英文加连字符命名文件。
2. 修改顶层 `id`、`name`、几何数据、门窗和家具；确认所有 ID 唯一。
3. 在 `index.json` 的 `layouts` 中登记 `id`、显示名称和文件名。
4. 在 `../room-layouts.ts` 中导入新 JSON，并加入传给 `parseIndexedRoomLayouts` 的文件映射。
5. 如果设置了 `planSrc`，确保对应的 SVG 已放入 `public/floorplans/`。
6. 运行项目构建；结构校验或 ID 对不上时，构建会失败并指出问题。

修改已有布局时不要随意更换房间 `id`。浏览器保存的用户方案和当前房间选择都依赖稳定 ID。

## 运行时保存与读取

内置 JSON 是随应用发布的只读默认值。网页中的“保存方案”菜单提供两种方式：

- “保存到浏览器”把当前所有房间组合成一个 JSON 快照，序列化后存入当前浏览器的 `localStorage`。
- “另存为 JSON 副本”打开系统另存为对话框，让用户选择目录和文件名；不支持文件选择接口的浏览器会改为下载 JSON。

“读取方案”既可以恢复浏览器方案，也可以导入此前另存的 JSON 副本。两种来源使用完全相同的快照格式和校验规则。

当前浏览器存储键：

```text
key: bedroom-layout-studio.layout.v2
```

兼容读取的旧版存储键：

```text
legacy key: bedroom-layout-studio.layout.v1
```

读取旧键中的 v1 快照时会先迁移为 v2；后续保存统一写入当前的 v2 存储键。

快照格式：

```json
{
  "schemaVersion": 2,
  "id": "browser-layout",
  "name": "我的卧室布局",
  "savedAt": "2026-08-31T12:00:00.000Z",
  "rooms": []
}
```

`rooms` 中的每一项都使用本文前面描述的单房间格式。“读取方案”会解析 JSON、校验 `schemaVersion` 和全部房间字段，然后替换当前布局；读取前的布局会进入撤销历史。界面新增的空房间也会出现在 `rooms` 中。版本 1 快照仍可导入，读取时会把旧家具状态和参数迁移为版本 2 格式。

浏览器保存仅对当前浏览器、当前设备和当前站点地址有效。清除站点数据、使用另一台设备或更换域名后不会自动同步。要实现账号间或设备间同步，应在保持相同快照协议的基础上接入服务端数据库，不要让浏览器直接修改本目录文件。

## 协议版本

当前正式输出版本为 `schemaVersion: 2`；`schemaVersion: 1` 仅作为兼容输入。版本 2 使用 `stateId` 和 `parameterValues` 表示家具配置。如果未来修改运行时快照的字段含义或做不兼容变更，应继续递增版本并提供迁移逻辑；不要复用旧版本号表示另一种结构。
