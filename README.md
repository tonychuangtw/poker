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

### 4. 圖表
- Push/Fold Nash 均衡（HU）、開牌 RFI（6-max / 9-max）、面對開牌、被 3-bet 四張 range 圖
- 每張圖都有「🎚 混合頻率」檢視：格子橫向依 加注 / 跟注 / 棄牌 的頻率分段上色。
  Nash 圖用的是均衡的實際混合頻率；其餘三張是把「分數 ≥ 門檻」的硬切換成門檻附近的斜坡（模型推估）
- 翻後 c-bet 速查：輸入翻牌看牌面質地（濕度 0–1）、建議 c-bet 頻率與尺度，填手牌再給單手建議
- MDF / 詐唬比速查：各種下注尺度的 MDF、跟注賠率與平衡的 value : bluff 比

### 5. 訓練
- 六種測驗：Push/Fold、開牌 RFI、面對開牌、被 3-bet、翻後 c-bet、河牌接 bluff
- 翻前四種在門檻附近是混合策略：你選的動作與圖表正解在模型裡都有 ≥25% 頻率時，兩者皆算對
- 錯題本用 Leitner 間隔重複：答對升一盒（隔 1 → 3 → 7 → 14 天再考），連過 5 盒才畢業；答錯打回第 1 盒
- 滾動 30 題熟練度、每日任務 + 連續天數、週報

## 檔案結構

```
index.html        單頁入口（七分頁）
css/style.css     深色主題樣式
js/app.js         分頁切換 + 記帳 + 各分頁 UI
js/evaluator.js   7 張牌評牌器
js/equity.js      勝率計算（窮舉 / Monte Carlo）
js/icm.js         ICM (Malmuth-Harville)
js/pushfold.js    range 記號、combo 展開、push/fold $EV
js/ranges.js      翻前 range 資料 + 籌碼深度試算 + 混合頻率模型
js/postflop.js    牌面質地、c-bet 策略、MDF / bluff-catcher、range vs range on board
js/nash.js        HU push/fold Nash（fictitious play）
js/hands.js       關鍵手牌複盤的 EV / 決策評估
js/training.js    熟練度、錯題本（Leitner SRS）、每日任務
test/test.js      Node 測試（node test/test.js）
```

## 測試

```bash
node test/test.js
```

驗證評牌器牌型大小、wheel 順、kicker、平分底池、AA vs KK 勝率、ICM 對稱性與獎池總和、
range 記號展開、籌碼深度試算、混合頻率、牌面質地與聽牌判定、MDF / 底池賠率、
Leitner 間隔重複的升降盒，以及河牌 bluff-catcher 題目產生器（每題都用評牌器驗證
hero 確實贏光所有詐唬、輸給所有價值，equity 精確等於詐唬占比）。
