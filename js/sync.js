/* Poker cloud sync — Google Identity Services + progress sync API.
 * Disabled (site behaves exactly like offline version) until both values below are set. */
(function () {
  var CLIENT_ID = "481860179039-gb37qsdogd4vgnn2g5umh73jen02avj4.apps.googleusercontent.com";
  var API_BASE = "https://claudebot500.tailfcf67f.ts.net";

  if (!CLIENT_ID || !API_BASE || typeof window === "undefined") return;

  var TOKEN_KEY = "sync.token";  // Google ID token（1 小時過期，只當換票的鑰匙）
  /* 長效 session（2026-08-22 Tony：「不要一直要求登入」）：Google 登入後拿 ID token
     跟後端換一顆 30 天 HMAC token 存 localStorage，之後每次開頁滾動續期，不用重登。
     鍵名刻意不用 poker. 前綴 —— gatherKeys 會把 poker.* 全部上傳雲端，token 不能跟著同步 */
  var SESS_KEY = "sync.sess";
  var PUSH_INTERVAL_MS = 60000;
  /* 2026-08-25 資料遺失事故（Tony 8/23–24 記帳被洗掉）後的重寫：
     - pull 不再整包覆蓋：清單鍵（sessions/hands/notes）按 id 逐筆合併，刪除靠墓碑（poker.deleted）
     - 存檔即推（debounce 2 秒），不再只靠 60 秒輪詢；關頁改 fetch keepalive，iOS 收 App 不會砍掉
     - lastPushedHash 落地（sync.lastHash）：冷啟動時資料沒變就不重推，不會把舊資料重新蓋章成「最新」
     事故鏈：凌晨輸入→關 App 推送被砍→早上另一個瀏覽器分身冷啟動重推舊資料→PWA pull 見時間戳較新整包蓋掉 */
  var LIST_KEYS = ["poker.sessions", "poker.hands", "poker.notes"];
  var TOMB_KEY = "poker.deleted";   // [{id,ts}]，隨 blob 同步，合併時濾掉已刪紀錄
  var TOMB_CAP = 400;
  var DIRTY_KEY = "sync.dirty";     // 本機有未同步變更（非 poker. 前綴 → 不會被上傳）
  var HASH_KEY = "sync.lastHash";   // 最後一次與雲端一致時的 blob hash
  var lastPushedHash = null;
  try { lastPushedHash = localStorage.getItem(HASH_KEY) || null; } catch (e) {}

  function token() {
    try { return localStorage.getItem(SESS_KEY) || sessionStorage.getItem(TOKEN_KEY) || ""; }
    catch (e) { return ""; }
  }
  function setToken(t) { try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
  function clearToken() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
    try { localStorage.removeItem(SESS_KEY); } catch (e) {}
  }

  function jwtPayload(t) {
    try { return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); }
    catch (e) { return null; }
  }
  function signedIn() {
    var tk = token();
    if (!tk) return null;
    var p = jwtPayload(tk);
    if (!p) return null;
    if (tk.indexOf("sess.") === 0) {
      return p.x > Date.now() ? { email: p.e || "" } : null;
    }
    return p.exp * 1000 > Date.now() ? p : null;
  }

  function refreshSession() {
    if (!token()) return;
    var xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE + "/api/session");
    xhr.setRequestHeader("Authorization", "Bearer " + token());
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300) return;
      var d = null;
      try { d = JSON.parse(xhr.responseText); } catch (e) {}
      if (d && d.token) {
        try { localStorage.setItem(SESS_KEY, d.token); } catch (e) {}
        try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
      }
    };
    xhr.send();
  }

  function currentLevel() { return "main"; }

  /* ---------- 本機變更偵測（不動 app.js：攔 localStorage.setItem） ---------- */
  var applying = false;      // pull 套用雲端資料時不算「本機變更」
  var pushTimer = null;

  function rawSet(k, v) {
    applying = true;
    try { localStorage.setItem(k, v); } catch (e) {}
    applying = false;
  }
  function markDirty() { try { localStorage.setItem(DIRTY_KEY, "1"); } catch (e) {} }
  function clearDirty() { try { localStorage.removeItem(DIRTY_KEY); } catch (e) {} }
  function isDirty() { try { return !!localStorage.getItem(DIRTY_KEY); } catch (e) { return false; } }

  function parseList(raw) {
    try { var a = JSON.parse(raw); return Array.isArray(a) ? a : null; } catch (e) { return null; }
  }
  function loadTombs() { return parseList(localStorage.getItem(TOMB_KEY)) || []; }
  function saveTombs(list) {
    list.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    rawSet(TOMB_KEY, JSON.stringify(list.slice(0, TOMB_CAP)));
  }

  /* 清單鍵被覆寫時，diff 出消失的 id 記成墓碑，合併時才分得出「這筆被刪了」和「對方多一筆」 */
  function recordRemovedIds(key, oldRaw, newRaw) {
    var oldArr = parseList(oldRaw), newArr = parseList(newRaw);
    if (!oldArr || !oldArr.length) return;
    var kept = {};
    (newArr || []).forEach(function (r) { if (r && r.id) kept[r.id] = 1; });
    var tombs = null;
    oldArr.forEach(function (r) {
      if (r && r.id && !kept[r.id]) {
        if (!tombs) tombs = loadTombs();
        tombs.push({ id: r.id, ts: Date.now() });
      }
    });
    if (tombs) saveTombs(tombs);
  }

  try {
    var origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      var isData = this === localStorage && !applying && typeof k === "string" &&
        k.indexOf("poker.") === 0 && k !== "poker.sync_ts" && k !== TOMB_KEY;
      var oldVal = null;
      if (isData && LIST_KEYS.indexOf(k) >= 0) {
        try { oldVal = localStorage.getItem(k); } catch (e) {}
      }
      origSetItem.call(this, k, v);
      if (!isData) return;
      if (oldVal !== null && oldVal !== v) recordRemovedIds(k, oldVal, v);
      markDirty();
      schedulePush();
    };
  } catch (e) {}

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      if (signedIn()) push(currentLevel());
    }, 2000);
  }

  /* ---------- 逐筆合併 ---------- */
  function mergeList(localRaw, remoteRaw, tombSet, preferLocal) {
    var loc = parseList(localRaw) || [];
    var rem = parseList(remoteRaw) || [];
    var byId = {}, order = [], noId = [];
    function add(r, isLocal) {
      if (!r) return;
      if (!r.id) { if (isLocal) noId.push(r); return; }   // 無 id 只保本機側，避免重複增生
      if (tombSet[r.id]) return;
      if (byId[r.id] === undefined) order.push(r.id);
      // 同 id 兩邊都有：本機沒動過（!preferLocal）以雲端為準，動過則本機優先
      if (byId[r.id] === undefined || (!isLocal && !preferLocal)) byId[r.id] = r;
    }
    loc.forEach(function (r) { add(r, true); });
    rem.forEach(function (r) { add(r, false); });
    return JSON.stringify(order.map(function (id) { return byId[id]; }).concat(noId));
  }

  function gatherKeys(level) {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("poker.") === 0 && k !== "poker.sync_ts") {
          out[k] = localStorage.getItem(k);
        }
      }
    } catch (e) {}
    return out;
  }
  function blobHash(obj) {
    var s = JSON.stringify(obj), h = 0;
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return h + ":" + s.length;
  }

  function api(method, level, body, cb, opts) {
    var url = API_BASE + "/api/progress?level=" + encodeURIComponent(level) + "&app=poker";
    var payload = body ? JSON.stringify(body) : null;
    /* 關頁/收 App 時的推送用 keepalive fetch：XHR 會被 iOS 直接砍掉（8/25 資料遺失主因之一）。
       keepalive body 上限 64KB，超過退回 XHR（至少開著頁時 60 秒輪詢推得上去） */
    if (opts && opts.keepalive && window.fetch && (!payload || payload.length < 60000)) {
      var headers = { "Authorization": "Bearer " + token() };
      if (payload) headers["Content-Type"] = "application/json";
      fetch(url, { method: method, headers: headers, body: payload || undefined, keepalive: true })
        .then(function (r) {
          if (r.status === 401) { clearToken(); renderUi(); cb("auth"); return null; }
          if (!r.ok) { cb("http " + r.status); return null; }
          return r.json().catch(function () { return null; }).then(function (d) { cb(null, d); });
        }, function () { cb("network"); });
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.setRequestHeader("Authorization", "Bearer " + token());
    if (payload) xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = function () {
      if (xhr.status === 401) { clearToken(); renderUi(); cb("auth"); return; }
      if (xhr.status < 200 || xhr.status >= 300) { cb("http " + xhr.status); return; }
      var data = null;
      try { data = JSON.parse(xhr.responseText); } catch (e) {}
      cb(null, data);
    };
    xhr.onerror = function () { cb("network"); };
    xhr.send(payload);
  }

  function syncTs(level) {
    try { return parseInt(localStorage.getItem("poker.sync_ts") || "0", 10) || 0; } catch (e) { return 0; }
  }
  function setSyncTs(level, ts) {
    try { localStorage.setItem("poker.sync_ts", String(ts)); } catch (e) {}
  }

  function mergeTombs(localRaw, remoteRaw) {
    var byId = {};
    [localRaw, remoteRaw].forEach(function (raw) {
      (parseList(raw) || []).forEach(function (tb) {
        if (tb && tb.id && (!byId[tb.id] || (tb.ts || 0) > (byId[tb.id].ts || 0))) byId[tb.id] = tb;
      });
    });
    var list = Object.keys(byId).map(function (id) { return byId[id]; });
    list.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    return list.length ? JSON.stringify(list.slice(0, TOMB_CAP)) : null;
  }

  /* pull = 下載雲端後「合併」，不是覆蓋。合併結果和雲端不同就立刻推回去，兩邊收斂成聯集。 */
  function pull(level, done) {
    api("GET", level, null, function (err, res) {
      if (err) { if (done) done(err); return; }
      if (!res || !res.blob) { push(level, function () { if (done) done(null, false); }); return; }
      var remote = res.blob;
      var serverTs = res.updatedAt || 0;
      var local = gatherKeys(level);
      var dirty = isDirty();
      var remoteNewer = serverTs > syncTs(level);

      var tombJson = mergeTombs(local[TOMB_KEY], remote[TOMB_KEY]);
      var tombSet = {};
      (parseList(tombJson) || []).forEach(function (tb) { tombSet[tb.id] = 1; });

      var keys = {};
      Object.keys(local).forEach(function (k) { keys[k] = 1; });
      Object.keys(remote).forEach(function (k) { if (k.indexOf("poker.") === 0) keys[k] = 1; });
      delete keys[TOMB_KEY];

      var merged = {};
      Object.keys(keys).forEach(function (k) {
        if (LIST_KEYS.indexOf(k) >= 0) {
          merged[k] = mergeList(local[k], remote[k], tombSet, dirty || !remoteNewer);
        } else if (local[k] === undefined) {
          merged[k] = remote[k];
        } else if (remote[k] === undefined) {
          merged[k] = local[k];
        } else {
          merged[k] = (remoteNewer && !dirty) ? remote[k] : local[k];
        }
      });
      if (tombJson !== null) merged[TOMB_KEY] = tombJson;

      var changedLocal = false, changedRemote = false;
      Object.keys(merged).forEach(function (k) {
        if (merged[k] !== local[k]) changedLocal = true;
        if (merged[k] !== remote[k]) changedRemote = true;
      });

      if (changedLocal) {
        Object.keys(merged).forEach(function (k) {
          if (merged[k] !== local[k]) rawSet(k, merged[k]);
        });
      }
      setSyncTs(level, serverTs);
      if (changedRemote) {
        push(level, function () { if (done) done(null, changedLocal); });
      } else {
        lastPushedHash = blobHash(gatherKeys(level));
        try { localStorage.setItem(HASH_KEY, lastPushedHash); } catch (e) {}
        clearDirty();
        if (done) done(null, changedLocal);   // changedLocal → caller reloads
      }
    });
  }

  function push(level, done, opts) {
    var data = gatherKeys(level);
    var h = blobHash(data);
    if (h === lastPushedHash && !isDirty()) { if (done) done(null, false); return; }
    api("PUT", level, data, function (err, res) {
      if (err) { if (done) done(err); return; }
      lastPushedHash = h;
      try { localStorage.setItem(HASH_KEY, h); } catch (e) {}
      clearDirty();
      if (res && res.updatedAt) setSyncTs(level, res.updatedAt);
      setStatus("✓ synced");
      if (done) done(null, true);
    }, opts);
  }

  /* ---------------- UI ---------------- */
  var ui = null, statusEl = null, statusTimer = null;

  function setStatus(msg) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { statusEl.textContent = ""; }, 3000);
  }

  function renderUi() {
    if (!ui) return;
    var p = signedIn();
    if (p) {
      ui.innerHTML = "";
      var chip = document.createElement("button");
      chip.className = "icon-btn sync-chip";
      chip.title = (p.email || "") + t(" — 點擊登出");
      chip.textContent = (p.given_name || p.name || p.email || "?").charAt(0).toUpperCase();
      chip.addEventListener("click", function () {
        UI.confirm(t("登出雲端同步？（本機資料會保留在此裝置）")).then(function (ok) {
          if (ok) { clearToken(); lastPushedHash = null; renderUi(); }
        });
      });
      statusEl = document.createElement("span");
      statusEl.className = "sync-status";
      ui.appendChild(statusEl);
      ui.appendChild(chip);
    } else {
      ui.innerHTML = "";
      statusEl = null;
      var wrap = document.createElement("div");
      wrap.className = "sync-login-wrap";
      var pill = document.createElement("button");
      pill.type = "button";
      pill.className = "sync-login";
      pill.textContent = t("登入");
      pill.title = t("Google 登入，跨裝置同步");
      /* GIS 載入成功時透明官方鈕會蓋住 pill 接走點擊，這裡只有 GIS 缺席才會進來
         （LINE/Telegram 內建瀏覽器常擋 accounts.google.com，2026-08-15 全線檢修；
         2026-08-23 Tony 在真 Safari/Chrome 也看到「內建瀏覽器」誤判 —— 訊息分兩種、可重試） */
      pill.addEventListener("click", function () {
        if (gisLoaded) return;
        if (gisFailed) {
          if (inWebview()) {
            UI.info(t("這個 App 內建瀏覽器擋住 Google 登入，請改用 Safari / Chrome 等外部瀏覽器開啟本站再登入。"));
          } else {
            UI.confirm(t("連不上 Google 登入元件（accounts.google.com 沒有回應），可能是網路不穩或被內容過濾／廣告攔截擋住。要再試一次嗎？")).then(function (ok) {
              if (!ok) return;
              gisFailed = false;
              gisAttempts = 0;
              loadGis();
              UI.toast(t("重試中，請稍候再點登入。"));
            });
          }
        } else {
          UI.toast(t("登入元件載入中，請稍候再點。"));
        }
      });
      var slot = document.createElement("div");
      slot.className = "gsi-slot";
      wrap.appendChild(pill);
      wrap.appendChild(slot);
      ui.appendChild(wrap);
      if (window.google && google.accounts && google.accounts.id) {
        google.accounts.id.renderButton(slot, { type: "icon", shape: "circle", size: "large" });
      }
    }
  }

  function onCredential(resp) {
    if (!resp || !resp.credential) return;
    setToken(resp.credential);
    refreshSession();  // Google ID token 只有 1 小時，馬上換 30 天長效 token
    if (window.Pro && Pro.recheck) Pro.recheck();  // 白名單 email 登入 → 立即全解鎖
    renderUi();
    var level = currentLevel();
    setStatus("syncing…");
    pull(level, function (err, applied) {
      if (applied) { location.reload(); return; }
      push(level);
    });
  }

  var gisLoaded = false, gisFailed = false, gisAttempts = 0;

  /* 真 webview（LINE/FB/IG/Telegram 內建瀏覽器、原生殼）才顯示「換外部瀏覽器」指引；
     一般瀏覽器載不到 gsi 多半是網路/過濾器問題，給重試而不是叫人換瀏覽器 */
  function inWebview() {
    var ua = navigator.userAgent || "";
    if (/\bLine\/|FBAV|FBAN|Instagram|MicroMessenger|TelegramWeb|; wv\)/i.test(ua)) return true;
    if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) return true;
    return false;
  }

  /* gsi/client 載入：偶發逾時不能一次定生死（2026-08-23 教訓：舊版 6 秒沒載完就永久
     顯示「被擋住」且不再重試，Safari/Chrome 網路慢一拍就整站不能登入）。改成最多 3 次，
     每次 8 秒；逾時後真的載進來也照常啟用（onload 不受逾時旗標影響） */
  function loadGis() {
    gisAttempts++;
    var settled = false;
    var s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = function () {
      settled = true;
      gisLoaded = true;
      gisFailed = false;
      initGis();
    };
    s.onerror = function () {
      if (settled) return;
      settled = true;
      gisRetryOrFail();
    };
    setTimeout(function () {
      if (settled || gisLoaded) return;
      settled = true;
      gisRetryOrFail();
    }, 8000);
    document.head.appendChild(s);
  }

  function gisRetryOrFail() {
    if (gisAttempts < 3) { loadGis(); return; }
    gisFailed = true;
  }

  function initGis() {
    google.accounts.id.initialize({ client_id: CLIENT_ID, callback: onCredential, auto_select: true });
    renderUi();
  }

  function boot() {
    var header = document.querySelector(".app-header");
    if (!header) return;
    ui = document.createElement("div");
    ui.className = "sync-ui";
    header.appendChild(ui);
    /* 先畫登入鈕，不等 GIS：webview 擋 accounts.google.com 時入口不能消失 */
    renderUi();

    loadGis();

    /* 已有長效 token（重開頁）：滾動續期 + 先拉一次雲端進度 */
    if (signedIn()) {
      refreshSession();
      pull(currentLevel(), function (err, applied) {
        if (applied) location.reload();
      });
    }

    setInterval(function () { if (signedIn()) push(currentLevel()); }, PUSH_INTERVAL_MS);
    function flushOnHide() {
      clearTimeout(pushTimer);
      if (signedIn()) push(currentLevel(), null, { keepalive: true });
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flushOnHide();
    });
    window.addEventListener("pagehide", flushOnHide);   // iOS 收 App 不一定發 visibilitychange
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
