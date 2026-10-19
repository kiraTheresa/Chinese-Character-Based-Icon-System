# 字成图

输入一个汉字，选择简体／繁体和圆框／方框，下载透明背景的 PNG 或 SVG 图标。

## 启动

需要 Node.js 18 或以上版本。在本目录运行：

```sh
npm start
```

打开终端输出的地址，默认是 http://127.0.0.1:4173。端口被占用时会自动使用下一个端口。也可以用 `HANZI_ICON_PORT` 指定起始端口。

无需安装 npm 依赖，无需构建。使用本地 HTTP 服务访问，不能直接双击 HTML 文件，否则浏览器会限制读取字体文件。

## 第一版范围

- 一个汉字输入，兼容中文输入法；多字、空输入、非汉字或缺字时禁止导出。
- 简体／繁体转换；繁体采用台湾常用字形。单字转换采用词库的默认对应，有歧义时请直接输入目标繁体字，例如「發」或「髮」。
- 圆形／方形细边框，固定深色，自动按字形轮廓居中。
- 512 × 512 PNG，透明背景。
- SVG 使用字形路径，没有外链字体或 `<text>` 元素；外框与汉字都是矢量。
- 32、48、64 像素的小尺寸预览。

页面不调用 AI 服务，输入和导出全部在浏览器中完成。字体、转换词库和脚本已放在项目内，运行时不依赖外部 CDN。字体没有覆盖所有 Unicode 汉字，缺字时页面会提示。

## 文件

- `public/index.html`：页面结构。
- `public/styles.css`：桌面和窄屏样式。
- `public/app.js`：简繁转换、字体加载、SVG 绘制和 PNG 导出。
- `public/assets/fonts/`：思源黑体 Medium，简体和繁体 OTF。
- `public/assets/vendor/`：本地 JavaScript 库及许可文件。
- `public/assets/sources.json`：下载来源、字体修订版本和文件摘要。
- `server.mjs`：只提供 `public/` 文件的本地静态服务。

## 来源与许可

- [Adobe 思源黑体](https://github.com/adobe-fonts/source-han-sans)：SIL Open Font License 1.1，许可保留在 `public/assets/fonts/LICENSE.txt`。
- [opentype.js 1.3.4](https://github.com/opentypejs/opentype.js)：MIT，读取 OTF 并提取字形路径。
- [opencc-js 1.4.2](https://github.com/nk2028/opencc-js)：MIT，使用其完整浏览器构建进行简繁转换；上游词库许可一并保留在 `public/assets/vendor/`。

当前页面及导出体验需由实际使用验收；本项目没有预设的自动化测试或构建步骤。
