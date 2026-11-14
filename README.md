# 潜鳞 · TIDEBORN

《潜鳞》是一款 Three.js 实时水墨动作游戏。由苇汀的小蛇出发，穿过大湖、沧溟与千山，最终飞向天阙。前四幕可以探索种子地形和奇遇，法门、元素连携与龙术可搭配成长。游历中会遇到四位首领，天门试炼有三条结局。

## 试玩

游戏需要支持 WebGL 2 的浏览器。网页版可游玩和查榜，GitHub Releases 可下载此前发布的离线包。[在线演示](https://tideborn-game.wangyu-rye.chatgpt.site/) · [离线包](https://github.com/Ryeblablabla/tideborn/releases/latest)

## 本地运行

需要 Node.js 22.12 或更高版本。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。角色自动前进，A／D 或按住鼠标左右拖动转向，空格破浪，化蛟后 W／S 升降，Esc 暂停。手机使用摇杆和升降按钮。附加 `?preview=0` 可以进入观形模式。可用形态编号为 `0`、`2`、`3`、`4`。

```sh
npm test
npm run build
```

构建会生成 `dist/` 和可直接打开的 `潜鳞-离线版.html`。

## 网页版与排行榜

```sh
npm run build:web
npm run db:migrate:local
npm run preview:web
```

打开 `http://127.0.0.1:4176/` 启动带排行榜的本地预览。网页版构建会重新生成 `dist/`，其中 `dist/client/` 是游戏资源，`dist/server/` 是 Worker 接口。预览使用本地 D1 数据库。

正式游历通关后可填写公开昵称，提交用时和最终身长。最快榜按用时升序，身长榜按身长降序，每张显示前 50 局。暂停和选牌不计时。自行部署时，先创建 D1 数据库，在 `wrangler.json` 中填入实际数据库 ID，再应用 `drizzle/` 下的迁移，并在托管平台配置用于签发本局凭证的 `LEADERBOARD_SIGNING_KEY`。

## 代码入口

- [`src/simulation.js`](src/simulation.js)、[`src/encounters.js`](src/encounters.js) 和 [`src/cultivation.js`](src/cultivation.js) 负责局内规则、敌群和成长。
- [`src/ink/materials.js`](src/ink/materials.js) 是实时水墨材质入口，[`src/ink/world.js`](src/ink/world.js) 组织场景、角色和特效。
- [`src/ink/public-dragon.js`](src/ink/public-dragon.js) 生成五种角色几何，[`src/ink/dragon.js`](src/ink/dragon.js) 负责实例化、续长和动态。
- [`src/audio.js`](src/audio.js) 和 [`src/audio-cues.js`](src/audio-cues.js) 合成并调度音乐、环境声和音效。
- [`server/worker.js`](server/worker.js) 提供排行榜 API，[迁移目录](drizzle/) 定义成绩存储和排序索引。

## 运行素材与许可

| 内容 | 位置 | 许可 |
| --- | --- | --- |
| 项目代码、程序化模型和合成音效 | [`src/`](src/) | [MIT](LICENSE) |
| 配乐、环境实录和拟音 | [`src/audio-assets/`](src/audio-assets/) | [素材署名与第三方许可](THIRD_PARTY_NOTICES.md) |
| 通用笔刷蒙版与纸纹、流向噪声 | [`src/ink/assets/`](src/ink/assets/)，[素材来源](src/ink/assets/shared-ink-resources.json) | 笔刷与纸纹为 CC0-1.0，流向噪声由程序生成 |
| 马善政毛笔楷书与志莽行书的 WOFF 子集 | [`src/ink/assets/type/`](src/ink/assets/type/) | SIL OFL 1.1，目录内附原始许可 |
| pixelfx 源码及引擎依赖声明 | [`vendor/`](vendor/) | [第三方许可](THIRD_PARTY_NOTICES.md) |

开源版使用随源码生成的程序化龙形和岩壁笔触。正式版演示使用另行制作的角色模型与岩壁贴图。
