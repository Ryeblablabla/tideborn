# 潜鳞 · TIDEBORN

《潜鳞》是一款 Three.js 实时水墨动作游戏。由苇汀的小蛇出发，穿过大湖、沧溟与千山，最终飞向天阙。游动轨迹驱动龙躯，水域敌人掉落食物。六槽法门、淬炼、元素反应与四位首领构成一局游历。

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

## 代码与素材

- `src/simulation.js`、`src/encounters.js` 和 `src/cultivation.js` 负责局内规则、敌群和成长。
- `src/ink/` 负责水墨材质、场景、角色与特效，`src/audio*.js` 负责合成音效。
- 项目代码和原创程序化角色依 [MIT](LICENSE) 发布。第三方字体、通用笔刷和库适用各自授权，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- 开源版使用随源码生成的独立角色几何。正式版演示中的精雕角色模型及其派生数据没有随仓库分发。
