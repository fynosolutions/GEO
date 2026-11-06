# Issue #7 / #1 交付样例

`easy-joy.json` 和 `frydom-express.json` 是两家门店的原始采集结果，各保留八个平台；`核对表.md` 保存人工页面核对记录，`screenshots/` 保存核对截图。`previous-20261105/` 为保留的历史版本。

从仓库根目录运行 `npm ci`、`npm run build`，配置 `.env` 中的 `APIFY_TOKEN` 后，可用以下命令重新采集（产生新的实时结果）：

```sh
npm run collect -- --name "Easy Joy Dim Sum & AYCE Hot Pot" --address "145 Mulberry St, New York, NY 10013"
npm run collect -- --name "Frydom Express" --address "781 61st St, Brooklyn, NY 11220"
```

程序输出 `out/<店名>.json`。样例 JSON 保留采集值，页面核对发现的差异记录在表中，不修改 JSON 来消除差异。人工核验由提交者完成；本次交付检查文件可解析、八个平台完整及核对表、截图齐备。

`main` 于 11 月 4 日被清空是有意操作，原项目备份于 `codex/main`；目前代码已经恢复到 `main`，本次收尾样例也交付到 `main`，今后以 `main` 为主分支。
