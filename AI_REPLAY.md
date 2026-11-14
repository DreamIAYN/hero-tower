# AI 混战比赛录像

## 直接看

- **完整录像（100 秒，10 FPS，1280×800，无声）**：[ai_ffa_full.webp](data/replays/ai_ffa_full.webp)
- **封面/截图**：[ai_ffa_poster.png](data/replays/ai_ffa_poster.png)
- **游戏内回放**：打开 <http://127.0.0.1:4317> → 首页「最近回放」→ `AI · 赤狐 获胜 · 房间 AI4194`

> **版本说明**：这局录像生成于 6 CPS AI 平衡之前，使用 7 CPS 旧参数；当前最新标准为 6 CPS，平衡结果见 [AI_BALANCE_REPORT.md](AI_BALANCE_REPORT.md)。

> 如果服务器已经关闭：
>
> ```bash
> npm start
> ```
>
> 然后打开 <http://127.0.0.1:4317>。回放文件保存在 `data/replays/`，服务器会保留最近 12 局。

## 这局是什么

| 项目 | 内容 |
| --- | --- |
| 模式 | 4 AI 自由混战（噩梦 AI） |
| 地图种子 | `314194` |
| 阵容 | 苍隼 / 影刺 / 灵姝 / 霜翎 |
| 时长 | 99.57 秒 |
| 结果 | `AI · 赤狐`（苍隼）最后存活 |
| 总击杀 | 48 |
| 回放帧数 | 466 帧（原生 5 FPS） |
| 视频帧数 | 996 帧（10 FPS 抓取 + 插值采样） |
| 回放文件 | `data/replays/ai-ffa-314194-mw7s4imf.json.gz` |

## 游戏内回放能做什么

- 播放 / 暂停；
- 拖动进度条；
- 1x / 2x / 4x 倍速；
- 查看英雄、魂塔、灵仆/镜像、资源点、技能特效和击杀播报；
- 退出回放回到首页。

## 怎么生成的

1. **生成回放数据**：`node scripts/make-ai-replay.mjs --seed 314194 --heroes falcon,shade,spirit,frost`
   - 用服务器同款 `shared/engine.js` 跑 4 AI 混战；
   - 按 5 FPS 记录 `frames` 与事件；
   - 写出与 `server.js` 兼容的 `.json.gz` / `.meta.json`。
2. **抓取真实客户端画面**：`node scripts/capture-ai-replay.mjs --id ai-ffa-314194-mw7s4imf --fps 10`
   - 用无头 Chromium 打开本地游戏；
   - 在「最近回放」里打开这局；
   - 暂停后按 0.1 秒步进，用 CDP 截取整页；
3. **合成动画**：`python3 scripts/encode-replay-webp.py --out data/replays/ai_ffa_full.webp`
   - 将 996 张 1600×1000 截图缩放为 1280×800；
   - 合成 10 FPS 动画 WebP（约 12 MiB）。

## 备注

- WebP 是完整 100 秒录像，但为了体积和通用性做了 1280×800 缩放；游戏内回放是原始 5 FPS 数据，可自由拖动/倍速。
- 这局是「AI 对 AI」，没有人类玩家操作；AI 难度为噩梦。
- 想换一局：改 `--seed` 和 `--heroes` 重新生成回放即可。
