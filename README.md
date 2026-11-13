# 潜鳞 · TIDEBORN

《潜鳞》是一款 Three.js 实时水墨动作游戏。由苇汀的小蛇出发，穿过大湖、沧溟与千山，最终飞向天阙。游动轨迹驱动龙躯，水域敌人掉落食物。六槽法门、淬炼、元素反应与四位首领构成一局游历。

## 下载试玩

在 [GitHub Releases](https://github.com/Ryeblablabla/tideborn/releases/latest) 下载离线包，解压后用浏览器打开 `潜鳞-离线版.html`。游戏需要支持 WebGL 2 的浏览器。

## 本地运行

需要 Node.js 20.19+ 或 22.12+。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。键盘 WASD 或按住鼠标移动，空格破浪，Q／E 升降，Esc 暂停。手机使用摇杆和升降按钮。附加 `?preview=0` 可以进入观形模式，`0` 至 `4` 对应五形。

```sh
npm test
npm run build
```

构建会生成 `dist/` 和可直接打开的 `潜鳞-离线版.html`。

## 代码入口

- [`src/simulation.js`](src/simulation.js)、[`src/encounters.js`](src/encounters.js) 和 [`src/cultivation.js`](src/cultivation.js) 负责局内规则、敌群和成长。
- [`src/ink/materials.js`](src/ink/materials.js) 是实时水墨材质入口，[`src/ink/world.js`](src/ink/world.js) 组织场景、角色和特效。
- [`src/ink/public-dragon.js`](src/ink/public-dragon.js) 生成五种角色几何，[`src/ink/dragon.js`](src/ink/dragon.js) 负责实例化、续长和动态。
- [`src/audio.js`](src/audio.js) 和 [`src/audio-cues.js`](src/audio-cues.js) 合成并调度游戏音效。

## 运行素材与许可

| 内容 | 位置 | 许可 |
| --- | --- | --- |
| 项目代码、程序化模型和合成音效 | [`src/`](src/) | [MIT](LICENSE) |
| 通用笔刷蒙版与纸纹、流向噪声 | [`src/ink/assets/`](src/ink/assets/)，[素材来源](src/ink/assets/shared-ink-resources.json) | 笔刷与纸纹为 CC0-1.0，流向噪声由程序生成 |
| 马善政毛笔楷书与志莽行书的 WOFF 子集 | [`src/ink/assets/type/`](src/ink/assets/type/) | SIL OFL 1.1，目录内附原始许可 |
| pixelfx 源码及引擎依赖声明 | [`vendor/`](vendor/) | [第三方许可](THIRD_PARTY_NOTICES.md) |

开源版使用随源码生成的五形。正式版演示中的 Tripo 精雕模型及其派生数据未纳入本仓库。
