// 從 TG 線裡開 `claude` 子程序時，env 要用這支清過的，不要直接把 process.env 丟下去。
//
// 2026-08-06 事故（poker 線聾掉快兩小時，Tony 連報三次）：
//   woa-translate.mjs 是從 poker 這條 TG 線的 session 裡跑的，它開的
//   `claude --print --model haiku` 子程序繼承了 TELEGRAM_STATE_DIR，
//   於是那個拋棄式子程序也把 telegram plugin 叫起來，拿「同一顆 bot token」
//   去 getUpdates —— 跟這條線真正的 poller 撞 Telegram 409。
//
//   後果特別難查，因為每一項健康檢查看起來都是綠的：
//     unit active ✅  bot.pid 有值而且進程活著 ✅  pending_update_count = 0 ✅
//   但那個 bot.pid 指的是子程序的 poller。Tony 發的訊息被它收走，
//   它翻完就結束，訊息跟著消失 —— 不會排隊、不會重送、也不會報錯。
//
//   拿掉 TELEGRAM_STATE_DIR 之後，plugin 會去找預設的 channels/telegram/，
//   那是刻意留空的誘餌目錄、沒有 .env，server.ts 讀不到 token 就自己退出，
//   不會再有第二個 poller 去搶。
//
// 規則：這個 repo 裡任何 execFileSync('claude', ...) / spawn('claude', ...)
//       都要帶 { env: claudeChildEnv() }。
export function claudeChildEnv() {
  const env = { ...process.env };
  delete env.TELEGRAM_STATE_DIR;
  return env;
}
