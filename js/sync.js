/* Poker cloud sync — Google Identity Services + progress sync API.
 * Disabled (site behaves exactly like offline version) until both values below are set. */
(function () {
  var CLIENT_ID = "481860179039-gb37qsdogd4vgnn2g5umh73jen02avj4.apps.googleusercontent.com";
  var API_BASE = "https://claudebot500.tailfcf67f.ts.net";

  if (!CLIENT_ID || !API_BASE || typeof window === "undefined") return;

  var TOKEN_KEY = "sync.token";
  var PUSH_INTERVAL_MS = 60000;
  var lastPushedHash = null;

  function token() { try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function setToken(t) { try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
  function clearToken() { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  function jwtPayload(t) {
    try { return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); }
    catch (e) { return null; }
  }
  function signedIn() {
    var p = jwtPayload(token());
    return p && p.exp * 1000 > Date.now() ? p : null;
  }

  function currentLevel() { return "main"; }

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

  function api(method, level, body, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, API_BASE + "/api/progress?level=" + encodeURIComponent(level) + "&app=poker");
    xhr.setRequestHeader("Authorization", "Bearer " + token());
    if (body) xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = function () {
      if (xhr.status === 401) { clearToken(); renderUi(); cb("auth"); return; }
      if (xhr.status < 200 || xhr.status >= 300) { cb("http " + xhr.status); return; }
      var data = null;
      try { data = JSON.parse(xhr.responseText); } catch (e) {}
      cb(null, data);
    };
    xhr.onerror = function () { cb("network"); };
    xhr.send(body ? JSON.stringify(body) : null);
  }

  function syncTs(level) {
    try { return parseInt(localStorage.getItem("poker.sync_ts") || "0", 10) || 0; } catch (e) { return 0; }
  }
  function setSyncTs(level, ts) {
    try { localStorage.setItem("poker.sync_ts", String(ts)); } catch (e) {}
  }

  function pull(level, done) {
    api("GET", level, null, function (err, res) {
      if (err || !res || !res.blob) { if (done) done(err); return; }
      var serverTs = res.updatedAt || 0;
      if (serverTs > syncTs(level)) {
        try {
          Object.keys(res.blob).forEach(function (k) {
            if (k.indexOf("poker.") === 0) localStorage.setItem(k, res.blob[k]);
          });
        } catch (e) {}
        setSyncTs(level, serverTs);
        if (done) done(null, true);   // applied → caller should reload
        return;
      }
      if (done) done(null, false);
    });
  }

  function push(level, done) {
    var data = gatherKeys(level);
    var h = blobHash(data);
    if (h === lastPushedHash) { if (done) done(null, false); return; }
    api("PUT", level, data, function (err, res) {
      if (err) { if (done) done(err); return; }
      lastPushedHash = h;
      if (res && res.updatedAt) setSyncTs(level, res.updatedAt);
      setStatus("✓ synced");
      if (done) done(null, true);
    });
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
      chip.textContent = (p.given_name || p.name || "?").charAt(0).toUpperCase();
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
         （LINE/Telegram 內建瀏覽器常擋 accounts.google.com，2026-08-15 全線檢修） */
      pill.addEventListener("click", function () {
        if (gisLoaded) return;
        if (gisFailed) {
          UI.info(t("這個 App 內建瀏覽器擋住 Google 登入，請改用 Safari / Chrome 等外部瀏覽器開啟本站再登入。"));
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
    if (window.Pro && Pro.recheck) Pro.recheck();  // 白名單 email 登入 → 立即全解鎖
    renderUi();
    var level = currentLevel();
    setStatus("syncing…");
    pull(level, function (err, applied) {
      if (applied) { location.reload(); return; }
      push(level);
    });
  }

  var gisLoaded = false, gisFailed = false;

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

    var s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = function () { gisLoaded = true; initGis(); };
    s.onerror = function () { gisFailed = true; };
    /* 有些 webview 不觸發 onerror、就是載不完：逾時當作失敗 */
    setTimeout(function () { if (!gisLoaded) gisFailed = true; }, 6000);
    document.head.appendChild(s);

    setInterval(function () { if (signedIn()) push(currentLevel()); }, PUSH_INTERVAL_MS);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden" && signedIn()) push(currentLevel());
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
