# 撲克工具箱

純前端（vanilla HTML/CSS/JS）單頁德州撲克工具，無框架、無建置步驟、無外部相依，可直接開啟 `index.html` 或部署到 GitHub Pages。介面為繁體中文，深色主題，行動裝置優先。

## 功能

### 1. 記帳
- 記錄每場 session：日期、類型（現金局 / MTT / SNG）、場地、買入、兌現/獎金、備註
- 資料存於瀏覽器 `localStorage`（key: `poker.sessions`），不會上傳
- 依類型篩選、逐筆刪除、盈虧紅綠標色
- 統計：各類別與總計的場次、總買入、總盈虧、ROI%，錦標賽另有 ITM%
- 累積盈虧折線圖（手刻 canvas）
- 匯出 CSV（UTF-8 BOM，Excel 可正確開啟中文）、匯出 / 匯入 JSON 備份

### 2. 現金局 EV
- 點選牌位 + 牌桌選牌，輸入 Hero / Villain 手牌與 0/3/4/5 張公牌（防止重複選牌）
- 勝率計算：剩餘公牌 ≤ 2 張時完全窮舉，否則 Monte Carlo 模擬 50,000 次
- 平分底池計入（equity = 勝 + 平/2）
- 自寫 7 張牌評牌器（枚舉 C(7,5)=21 組五張牌，含 A-5 wheel 順、完整 kicker 比較）
- 跟注 EV：輸入底池與需跟注金額，顯示 EV = 勝率 × (底池+跟注) − 跟注，並給出 +EV 跟注 / −EV 蓋牌 判定

### 3. 錦標賽 ICM
- 輸入獎金結構（最多前 6 名）與玩家籌碼（最多 12 人）
- 以 Malmuth-Harville 模型計算每位玩家的 ICM $EV
- 輸出：玩家、籌碼、籌碼%、ICM $EV、占獎池%

## 檔案結構

```
index.html        單頁入口（三分頁）
css/style.css     深色主題樣式
js/app.js         分頁切換 + 記帳 + Equity/ICM UI
js/evaluator.js   7 張牌評牌器
js/equity.js      勝率計算（窮舉 / Monte Carlo）
js/icm.js         ICM (Malmuth-Harville)
test/test.js      Node 測試（node test/test.js）
```

## 測試

```bash
node test/test.js
```

驗證評牌器牌型大小、wheel 順、kicker、平分底池、AA vs KK 勝率、ICM 對稱性與獎池總和等。
