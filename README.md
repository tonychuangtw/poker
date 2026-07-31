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
- 面對開牌：6-max 15 個情境（完整覆蓋）＋ 9-max Full Ring 36 個情境（完整覆蓋，現場取向）
- 被 3-bet：6-max 6 個 ＋ 9-max 15 個情境
- 冷 4-bet / 冷跟：第四種翻前局面 —— 別人開牌、第三家 3-bet，而你還沒行動。
  這個決定對「對手 3-bet 多寬」極度敏感（BTN 的 AQo：對手 3.6% 時勝率 33.5% 要 40% → 蓋，
  對手 9% 時勝率 47.6% → 跟），所以對手寬度做成滑桿而不是寫死一個建議表。
  位置的代價寫成資料裡的 `oopPenalty` —— 只看底池賠率的話 SB 反而比 BTN 便宜，
  會得出「SB 跟得比 BTN 寬」這種明顯錯誤的結論
- 9-max 的表由 `tools/gen-9max-ranges.js` 產生，不是手打的。作法是把「多寬」與「哪些牌」分開：
  寬度從 15 個 6-max 情境實測後擬合再外推（殘差會印出來），選牌交給 equity + 隱含賠率排序，
  再套現場調整（冷跟放寬、SB 收緊、3-bet 偏價值、隱含賠率權重調高）。
  要改資料請改產生器後重跑，測試會檢查「位置越好防守越寬 / 對手開越寬防守越寬 /
  BB 最寬 / SB 冷跟最窄 / 對子不可有破洞」等關係
- 每張圖都有「🎚 混合頻率」檢視：格子橫向依 加注 / 跟注 / 棄牌 的頻率分段上色。
  Nash 圖用的是均衡的實際混合頻率；其餘三張是把「分數 ≥ 門檻」的硬切換成門檻附近的斜坡（模型推估）
- 翻後 c-bet 速查：輸入翻牌看牌面質地（濕度 0–1）、建議 c-bet 頻率與尺度，填手牌再給單手建議
- MDF / 詐唬比速查：各種下注尺度的 MDF、跟注賠率與平衡的 value : bluff 比

### 5. 訓練
- 七種測驗：Push/Fold、開牌 RFI、面對開牌、被 3-bet、冷 4-bet、翻後 c-bet、河牌接 bluff
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
