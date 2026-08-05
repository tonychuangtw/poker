/* Capacitor 原生殼 glue — 瀏覽器版（含 PWA）整檔 no-op。
   不經 bundler：原生 WebView 內用 window.Capacitor.Plugins 直接呼叫原生實作。 */
(function () {
  'use strict';
  var cap = window.Capacitor;
  if (!(cap && cap.isNativePlatform && cap.isNativePlatform())) return;
  var P = cap.Plugins || {};
  function noop() {}

  /* ================= 狀態列 / 啟動畫面 ================= */
  window.addEventListener('load', function () {
    if (P.StatusBar) P.StatusBar.setStyle({ style: 'DARK' }).catch(noop);
    /* launchAutoHide=false，等首屏 render 完再淡出，避免白閃 */
    if (P.SplashScreen) {
      setTimeout(function () {
        P.SplashScreen.hide({ fadeOutDuration: 250 }).catch(noop);
      }, 120);
    }
  });

  /* ================= Haptics ================= */
  function impact(style) {
    if (P.Haptics) P.Haptics.impact({ style: style }).catch(noop);
  }
  function notifySuccess() {
    if (P.Haptics) P.Haptics.notification({ type: 'SUCCESS' }).catch(noop);
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('button') : null;
    if (!el) return;
    if (el.classList.contains('tab-btn')) { impact('LIGHT'); return; }
    /* 存檔類：成功觸覺；其他主要動作按鈕：中度敲擊 */
    if (el.id === 'btnSaveHand' || el.id === 'btnAddNote') { notifySuccess(); return; }
    if (el.classList.contains('primary')) impact('MEDIUM');
  }, true);

  /* ================= 賽事開賽提醒（本地推播） ================= */
  var PREF_KEY = 'poker_evt_notif_on';

  function hashId(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (Math.abs(h) % 1000000000) + 1;
  }

  function buildReminders(events) {
    var now = Date.now();
    var horizon = now + 60 * 24 * 3600 * 1000; /* 只排未來 60 天 */
    var list = [];
    events.forEach(function (ev) {
      if (!ev.start || !ev.series) return;
      var base = hashId(ev.series + '|' + ev.start);
      var startDay = new Date(ev.start + 'T09:00:00'); /* 當地時間上午 9 點 */
      var pre3 = new Date(ev.start + 'T10:00:00');
      pre3.setDate(pre3.getDate() - 3);
      var place = (ev.country || '') + (ev.city ? ' · ' + ev.city : '');
      [
        { at: pre3, id: base * 2, body: ev.series + ' 將於 3 天後（' + ev.start + '）開賽 ｜ ' + place },
        { at: startDay, id: base * 2 + 1, body: ev.series + ' 今天開賽 ｜ ' + place }
      ].forEach(function (n) {
        var t = n.at.getTime();
        if (t <= now || t > horizon) return;
        list.push({
          id: n.id,
          title: '♠ 撲克賽事提醒',
          body: n.body,
          schedule: { at: n.at },
          sound: 'default'
        });
      });
    });
    /* iOS pending 上限 64 筆，留最近的 60 筆 */
    list.sort(function (a, b) { return a.schedule.at - b.schedule.at; });
    return list.slice(0, 60);
  }

  function cancelAll() {
    if (!P.LocalNotifications) return Promise.resolve();
    return P.LocalNotifications.getPending().then(function (res) {
      var pend = (res && res.notifications) || [];
      if (!pend.length) return;
      return P.LocalNotifications.cancel({ notifications: pend.map(function (n) { return { id: n.id }; }) });
    }).catch(noop);
  }

  function scheduleAll() {
    if (!P.LocalNotifications) return;
    fetch('data/tournaments.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var reqs = buildReminders((data && data.events) || []);
        if (!reqs.length) return;
        /* 先清掉舊排程再整批重排，資料更新後不會殘留過期提醒 */
        cancelAll().then(function () {
          P.LocalNotifications.schedule({ notifications: reqs }).catch(noop);
        });
      })
      .catch(noop);
  }

  function setStatus(el, on) {
    el.textContent = on ? '已開啟：開賽前 3 天與當天上午提醒' : '';
  }

  /* 在賽事分頁插入提醒開關（只有原生殼看得到） */
  function injectToggle() {
    var panel = document.querySelector('#tab-events .card');
    var anchor = document.getElementById('evList');
    if (!panel || !anchor) return;
    var wrap = document.createElement('label');
    wrap.className = 'notif-toggle';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = localStorage.getItem(PREF_KEY) === '1';
    var txt = document.createElement('span');
    txt.textContent = '📅 開賽提醒通知';
    var status = document.createElement('small');
    wrap.appendChild(cb); wrap.appendChild(txt); wrap.appendChild(status);
    panel.insertBefore(wrap, anchor);
    setStatus(status, cb.checked);

    cb.addEventListener('change', function () {
      if (cb.checked) {
        P.LocalNotifications.requestPermissions().then(function (res) {
          if (res && res.display === 'granted') {
            localStorage.setItem(PREF_KEY, '1');
            scheduleAll();
            notifySuccess();
            setStatus(status, true);
          } else {
            cb.checked = false;
            status.textContent = '通知權限被拒，請到 iOS 設定開啟';
          }
        }).catch(function () { cb.checked = false; });
      } else {
        localStorage.setItem(PREF_KEY, '0');
        cancelAll();
        setStatus(status, false);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    injectToggle();
    /* 已開啟過提醒的話，每次啟動用最新賽事資料重排 */
    if (localStorage.getItem(PREF_KEY) === '1') scheduleAll();
  });
})();
