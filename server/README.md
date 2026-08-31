# 雲端同步伺服器（自架版）

`js/sync.js` 的完整後端：Google 登入換票、進度同步、兩地 SQLite 雙向複寫。
兩站（github.io 版與 ksdiseo.com 版）各跑一份、各用自己的 OAuth client，資料庫透過
`/api/replica/sync` 自動互補收斂——帳號以 Google `sub` 對齊（同一個 Google 帳號在
不同 OAuth client 拿到的 `sub` 相同），所以不需要任何帳號對照表。

## 快速開始

```bash
npm install better-sqlite3        # 唯一相依；repo 前端本體不需要
cp server/config.example.json server/config.json   # 填自己的值（見下）
node server/sync-server.js server/config.json
```

## 設定欄位

| 欄位 | 說明 |
|---|---|
| `port` / `db_path` | 監聽埠與 SQLite 檔案位置 |
| `google_client_ids` | 接受的 OAuth client（陣列，可多個；aud 驗證用） |
| `hmac_secret` | session 票簽章密鑰。**每站自己生一把**（`openssl rand -hex 32`），不用與對方相同 |
| `replica_secret` | 兩站共用的複寫密鑰。**面交取得、絕不 commit** |
| `replica_peer` | 對方的 `/api/replica/sync` 完整 URL。設了就每 `replica_interval_ms` 主動交換；留空＝純被動（對方來打你也會收斂，一邊有排程即可） |
| `cors_origins` | 允許跨網域呼叫的前端來源（例：github.io） |

## 舊資料搬遷（一次性）

把你現有後端的每使用者資料轉進本伺服器的 SQLite（`progress` 表，`blob`＝該使用者整組
`poker.*` 的 JSON 字串，`updated_at` 沿用原時間戳）。首輪複寫 `since=0` 全量交換後，
兩站自動互補齊。schema 與複寫規則詳見 [PROTOCOL.md](PROTOCOL.md)。

## 部署備忘

- 前端 `js/sync.js` 的 `API_BASE` 指向這台伺服器（跨網域時記得把前端來源加進 `cors_origins`）
- 資料庫記得排每日備份（`sqlite3 syncdata.db ".backup 快照路徑"`）
- 兩台主機保持 NTP 對時（複寫用 `updated_at` 比新舊）
