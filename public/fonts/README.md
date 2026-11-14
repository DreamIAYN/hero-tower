# 内置字体

本目录包含 **Fandol Hei** 的 Web 字体转换版本，用于在缺少系统中文字体的环境中正确显示游戏文本。

- Fandol 字体由 Fandol team（Clerk Ma、Jie Su）开发。
- 原始字体：`FandolHei-Regular.otf`、`FandolHei-Bold.otf`
- 授权：**GPL + GPL font exception**
- 来源：TeX Live 2026 / CTAN `fonts/fandol`
- 转换：用 `pyftsubset --flavor=woff2 --text-file=<项目字符集> --layout-features='*' --desubroutinize` 生成项目字符子集（含游戏内全部英雄/UI 汉字）

如果二次分发本项目，请保留本说明并遵守 Fandol 的授权条款。
