# 输入模型

房间数据属于每次任务的用户输入，不属于技能知识。优先接受 JSON；收到文字、CAD、SVG 或标尺图时，先抽取并归一化，再让用户确认影响结果的歧义。

## 本项目接入

本仓库已经使用 JSON 保存内置布局：`lib/bedroom/layouts/*.json`，由 `lib/bedroom/layout-schema.ts` 进行 Zod 校验，`lib/bedroom/room-layouts.ts` 只负责静态导入和索引映射。修改项目布局时应遵循该现有协议，不要把房间数据重新写进 TypeScript，也不要把三个具体房间的数据复制进本技能。

下面的结构是用于收集设计输入的概念模型；真正写入本项目时，应映射到仓库当前的 `RoomLayout`/`LayoutSnapshot` JSON 协议。固定设施或用户画像尚未被协议表达的字段，应先扩展并迁移协议，不能偷偷丢弃。

## 建议 JSON 结构

```json
{
  "units": "mm",
  "room": {
    "id": "user-room-id",
    "outline": [{ "x": 0, "z": 0 }],
    "height": null,
    "source": "survey|cad|svg|user-text"
  },
  "fixedElements": [
    {
      "id": "fixed-element-id",
      "type": "door|window|bay_window|column|beam|radiator|air_conditioner|socket|switch|curtain|other",
      "geometry": {},
      "states": [],
      "movable": false,
      "confirmed": true
    }
  ],
  "requirements": [
    {
      "function": "sleep|storage|study|vanity|seating|other",
      "priority": "required|preferred|alternative",
      "options": []
    }
  ],
  "furniture": [
    {
      "id": "product-or-generic-id",
      "footprint": { "width": 0, "depth": 0 },
      "height": 0,
      "states": [],
      "source": "product|user|default"
    }
  ],
  "userProfile": {
    "mode": "function_first|balanced|accessible",
    "stature": null,
    "mobility": null,
    "handedness": null
  },
  "preferences": {
    "bedAgainstWallAllowed": true,
    "useBayWindow": true,
    "storagePriority": "medium"
  }
}
```

## 归一化要求

- 所有坐标统一成毫米和同一原点；记录轴方向。
- 区分床垫名义尺寸、家具完整外廓和运动包络。
- 门记录门洞、铰链、门扇宽度、开启方向和所需状态。
- 飘窗记录台面范围、高度、承重确认、窗扇和窗帘操作区。
- 多状态家具记录每个状态的实体几何、运动路径和状态切换所需空间。
- 缺少产品尺寸时可使用默认值，但必须把其来源标为 `default`。
