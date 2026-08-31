# 兩地 SQLite 雙向同步協定 v1

> 現成實作：[sync-server.js](sync-server.js)（本目錄），照 [README.md](README.md) 跑起來即可，不必從規格自己刻。
> 一次呼叫＝雙向交換，只要其中一邊設定 `replica_peer` 排程輪詢，兩邊就會收斂。

## 背景

- 兩站各自用自己的 Google OAuth client 登入，但 **Google ID token 的 `sub` 對同一帳號在不同 client 是同一個值** → 兩邊資料庫都以 `sub` 當使用者主鍵，帳號天然對齊，不需要對照表。
- 資料單位＝每使用者一包 blob（前端 sync.js 打包的整組 `poker.*` localStorage JSON）。伺服器只做 blob 級 LWW，細部合併由前端既有機制負責（跟現在多裝置同步同語意）。

## 建議 schema

```sql
CREATE TABLE users (
  sub TEXT PRIMARY KEY,          -- Google sub
  email TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_login INTEGER NOT NULL
);
CREATE TABLE progress (
  sub TEXT NOT NULL,
  app TEXT NOT NULL,             -- 目前固定 'poker'
  level TEXT NOT NULL,           -- 目前固定 'main'
  blob TEXT NOT NULL,            -- 整包 poker.* 的 JSON 字串
  updated_at INTEGER NOT NULL,   -- ms epoch，由「接受使用者寫入的那台」蓋章
  PRIMARY KEY (sub, app, level)
);
```

內部欄位名隨意，交換格式照下面就好。

## 端點契約

```
POST /api/replica/sync
Authorization: Bearer <共享密鑰>        ← 兩站共用，安全管道交換；比對請用 timing-safe
Content-Type: application/json

Request:
{
  "since": 1788154000000,              // 只回傳 updated_at > since 的列；0 = 全量
  "rows": [                            // 呼叫方要給你的新列（可為空陣列）
    { "sub": "1112260701…", "email": "tony@…", "app": "poker",
      "level": "main", "blob": "{\"poker.sessions\":\"[…]\"}", "updated_at": 1788154525362 }
  ]
}

Response 200:
{
  "ok": true,
  "applied": 1,                        // 你實際套用的列數
  "rows": [ …你這邊 updated_at > since 的列，同上格式… ],
  "now": 1788154600000,                // 呼叫方下次的游標（見「批次」）
  "truncated": false
}
```

## 套用規則（兩邊都必須一致，這是收斂的關鍵）

1. **LWW、嚴格較新才覆蓋**：`incoming.updated_at > existing.updated_at` 才寫入；等於或較舊一律忽略（這讓 echo 天然冪等）。
2. **沿用原 updated_at，絕不重新蓋章**——重蓋章會讓同一筆資料在兩邊永遠互相「比較新」，打乒乓。
3. **列不刪除**：刪除語意在 blob 內部的墓碑（`poker.deleted`），由前端處理；複寫層永遠只有 upsert。
4. 驗證輸入：`sub` 為 5–30 位數字、`blob` 為字串且 ≤ 2MB、`updated_at` 為正整數；不合格的列跳過即可。
5. 兩台主機保持 NTP 對時（秒級誤差無妨，前端合併會兜底）。

## 批次與游標

- 單次回應 rows 總量約 4MB 上限；超過時 `truncated: true` 且 `now` = 最後一列的 `updated_at`（呼叫方下輪以此為 since 續傳）。沒截斷時 `now` = 你的當下時間。
- 呼叫端把游標回退 10 分鐘做重疊——重送無害（規則 1）。

## 歷史資料搬遷（一次性）

你把現有雲端的每使用者資料灌進你的 SQLite（`updated_at` 用原本的時間戳，沒有就用當下），首輪 `since=0` 全量交換後兩邊自動互補齊，不需要額外的匯入流程。

## 對接資訊

- ksdiseo.com 側端點（已上線可測）：`POST https://ksdiseo.com/api/replica/sync`
- 沒帶密鑰會回 401，可先這樣測連通性：
  ```bash
  curl -X POST https://ksdiseo.com/api/replica/sync \
    -H "Authorization: Bearer <密鑰>" -H "Content-Type: application/json" \
    -d '{"since": 0, "rows": []}'
  # → {"ok":true,"applied":0,"rows":[…],"now":…}
  ```
- 對方端點 URL 填進 `replica_peer` 重啟，即開始定期交換。

## 已驗證過的行為

雙向收斂（A 寫 X、B 寫 Y → 兩邊都有 X+Y）、衝突取新（同使用者兩邊寫 → updated_at 大者勝出且兩邊時間戳一致）、重送冪等（applied=0）、錯密鑰 401。
