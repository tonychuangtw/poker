# 貢獻指南

歡迎加入。這份文件 10 分鐘讀完，講清楚「怎麼交東西」跟「哪些東西不要碰」。

## 專案 30 秒版

- 純前端單頁 PWA：vanilla HTML/CSS/JS，**無框架、無 build 步驟**，clone 下來直接開 `index.html` 就能跑
- 部署 = GitHub Pages 直接發布 `main` 分支 → **main 長什麼樣，線上就長什麼樣**
- 另有 Capacitor iOS 殼（`ios/`、`tools/build-www.mjs`、`codemagic.yaml`），網頁改好 iOS 自動跟上

## 工作流程

1. 開 branch（從最新的 `main`）
2. 改好後發 PR，CI（GitHub Actions）會自動跑測試 + 語法檢查，**紅燈不併**
3. 合併前 rebase 一下 `main` —— 機器人每天會直接 push 資料 commit 到 main（見下）

```bash
node test/test.js        # 送 PR 前先在本機跑，2300+ 個測試需全綠
```

## ⚠️ 不要手改的東西

| 路徑 | 是什麼 |
|---|---|
| `data/` 整個目錄 | 每日自動產生：賽事（tournaments）、逐日賽程（schedules）、匯率（fx）、資料翻譯（*-i18n）。**手改隔天就被排程蓋掉**。改資料邏輯請改 `tools/` 對應腳本 |
| `js/i18n-dict.js` | 產物。改翻譯請改 `tools/i18n-src/*.json` 後跑 `node tools/i18n-merge.mjs` |
| `js/preflop-table.js` 的 9-max 資料 | 由 `tools/gen-9max-ranges.js` 產生，改產生器後重跑 |

自動化排程（在維護者的機器上跑，不在 CI）每天只動 `data/`，直接 push main，跟大家的 PR 不衝突。

## 部署須知（重要）

改了 `js/` / `css/` / `index.html` 之後、合併前要跑：

```bash
node tools/bump-version.mjs   # 靜態資源版本戳 ?v=N 與 SW cache 名一起 +1
```

GitHub Pages 有 ~10 分鐘快取，沒 bump 版本會出現「新 JS 配舊 CSS」的混版故障。CI 不會自動做這件事（多個 PR 同時 bump 會衝突），習慣上一個 PR 合併前 bump 一次即可。

## 程式慣例

- 跟現有程式一致：ES5 風格（`var`、`function`）、IIFE 模組、無相依套件
- **不要命名 `var t`** —— 會遮蔽 i18n 的翻譯函式 `t()`
- CSS 字級一律 `rem`（字級調整功能靠改 `<html>` font-size），顏色用 CSS 變數（5 色系主題）
- 使用者看得到的字串：寫繁體中文並包 `t('…')`，然後：
  1. key 加進 `tools/i18n-keys.json`
  2. `tools/i18n-src/` 的 11 個語言檔各補一條翻譯
  3. `node tools/i18n-merge.mjs` 重產字典
- 免費/付費 gating 只透過 `Pro.has()` / `Pro.limit()`（`js/pro.js` 是唯一真相來源），鎖區塊用 `[data-pro]` 屬性宣告

## 目錄導覽

```
index.html          單頁入口（所有分頁都在這）
css/style.css       全站樣式（含 5 色系主題變數）
js/                 各功能模組（app.js 主控、equity/icm/nash 計算、schedule 賽程表…）
data/               ⚠️ 機器產物（見上）
tools/              產生器與維運腳本
test/test.js        測試套件（node 直接跑）
ios/ + codemagic.yaml   Capacitor iOS 殼與雲端建置
```

有問題開 GitHub Issue 討論。
