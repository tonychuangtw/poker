/* 首次使用功能導覽（2026-08-15 Tony，參考 PokerAlpha 的 step-by-step 教學）
   spotlight 圈住目標元素＋教學卡（步驟點、上一步/下一步/略過），
   第一次開 app 自動跑一輪介紹各分頁；看完記 poker.tourDone，
   網址帶 ?tour=1 或按 footer 的「功能導覽」可重看。 */
(function () {
  'use strict';
  var DONE_KEY = 'poker.tourDone';

  /* target 給多個候選（手機 FAB / 桌面按鈕），取第一個看得到的 */
  var STEPS = [
    { tab: 'tracker', target: ['.hero-card'], title: '記帳',
      text: '記錄每場戰績，這裡自動算總盈虧、場次與 bb/hr，下方還有走勢圖和統計磚。' },
    { tab: 'tracker', target: ['#btnAddSessionDesk', '#fabAddSession'], title: '新增紀錄',
      text: '按這顆新增一筆：日期、類型、買入、拿回，其他欄位選填。' },
    { tab: 'tracker', target: ['#heroScope'], title: '期間切換',
      text: '月／年／全部／自訂起訖日，儀表板統計跟著切換。' },
    { tab: 'equity', target: ['.tab-btn[data-tab="equity"]'], title: 'EV 權益計算',
      text: '選手牌和對手 range，算勝率與 EV，支援多人底池與翻後公牌。' },
    { tab: 'icm', target: ['.tab-btn[data-tab="icm"]'], title: 'ICM 獎金模型',
      text: '輸入獎金結構與籌碼，算每人的獎金權益，Final Table 談 deal 直接用。' },
    { tab: 'nash', target: ['.tab-btn[data-tab="nash"]'], title: '策略',
      text: '翻前 range 圖與翻後速查表都在這：先從目錄選你遇到的情境，再看該情境的建議打法。' },
    { tab: 'train', target: ['.tab-btn[data-tab="train"]'], title: '訓練測驗',
      text: '用測驗練 range 記憶，答錯的題目會重複出現直到記熟。' },
    { tab: 'hands', target: ['.tab-btn[data-tab="hands"]'], title: '手牌複盤',
      text: '5 步精靈記下關鍵手牌，可匯出文字或牌桌圖跟朋友討論。' },
    { tab: 'events', target: ['.tab-btn[data-tab="events"]'], title: '賽事行事曆',
      text: '世界巡迴賽賽程都在這，之後 App 版還能開賽前提醒。' }
  ];

  var idx = 0, ring = null, card = null, shield = null, raf = 0;

  function q(sel) { return document.querySelector(sel); }
  function visibleTarget(step) {
    for (var i = 0; i < step.target.length; i++) {
      var el = q(step.target[i]);
      /* 不能用 offsetParent 判斷可見：FAB 是 position:fixed，offsetParent 恆為 null
         （08-15 Tony 回報手機版「新增紀錄」那步光圈沒跳過去，就是這裡） */
      if (!el) continue;
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
    return null;
  }
  function switchTab(name) {
    var btn = q('.tab-btn[data-tab="' + name + '"]');
    if (btn && !btn.classList.contains('active')) btn.click();
  }

  function build() {
    shield = document.createElement('div');
    shield.className = 'tour-shield';
    ring = document.createElement('div');
    ring.className = 'tour-ring';
    card = document.createElement('div');
    card.className = 'tour-card';
    document.body.appendChild(shield);
    document.body.appendChild(ring);
    document.body.appendChild(card);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
  }

  function destroy() {
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    [shield, ring, card].forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    shield = ring = card = null;
  }

  function place() {
    if (!ring) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      var step = STEPS[idx];
      var el = visibleTarget(step);
      if (!el) return;
      var r = el.getBoundingClientRect();
      var pad = 6;
      ring.style.top = (r.top - pad) + 'px';
      ring.style.left = (r.left - pad) + 'px';
      ring.style.width = (r.width + pad * 2) + 'px';
      ring.style.height = (r.height + pad * 2) + 'px';
      /* 教學卡：目標在上半部就放下面，反之放上面；水平置中並夾在視窗內 */
      var vw = window.innerWidth, vh = window.innerHeight;
      var cw = Math.min(340, vw - 24);
      card.style.width = cw + 'px';
      var ch = card.offsetHeight || 180;
      var top = (r.top + r.height / 2 < vh / 2) ? r.bottom + 14 : r.top - ch - 14;
      top = Math.max(12, Math.min(top, vh - ch - 12));
      var left = r.left + r.width / 2 - cw / 2;
      left = Math.max(12, Math.min(left, vw - cw - 12));
      card.style.top = top + 'px';
      card.style.left = left + 'px';
    });
  }

  function render(dir) {
    var step = STEPS[idx];
    switchTab(step.tab);
    /* 目標真的不存在就自動往同方向跳過這一步，別讓光圈卡在原地 */
    if (!visibleTarget(step)) {
      var next = idx + (dir === -1 ? -1 : 1);
      if (next < 0 || next >= STEPS.length) { end(); return; }
      idx = next; render(dir); return;
    }
    var dots = STEPS.map(function (_, i) {
      return '<span class="tour-dot' + (i === idx ? ' on' : '') + '"></span>';
    }).join('');
    card.innerHTML =
      '<div class="tour-head"><strong>' + t(step.title) + '</strong>' +
      '<span class="tour-step">' + (idx + 1) + ' / ' + STEPS.length + '</span></div>' +
      '<p class="tour-text">' + t(step.text) + '</p>' +
      '<div class="tour-dots">' + dots + '</div>' +
      '<div class="tour-btns">' +
      '<button type="button" class="btn-link tour-skip">' + t('略過') + '</button>' +
      (idx > 0 ? '<button type="button" class="btn tour-prev">' + t('上一步') + '</button>' : '') +
      '<button type="button" class="btn primary tour-next">' +
      t(idx === STEPS.length - 1 ? '開始使用' : '下一步') + '</button></div>';
    card.querySelector('.tour-skip').addEventListener('click', end);
    card.querySelector('.tour-next').addEventListener('click', function () {
      if (idx >= STEPS.length - 1) { end(); return; }
      idx++; render();
    });
    var prev = card.querySelector('.tour-prev');
    if (prev) prev.addEventListener('click', function () { idx--; render(); });
    var el = visibleTarget(step);
    if (el) el.scrollIntoView({ block: 'center' });
    place();
    /* scrollIntoView 之後再校一次位 */
    setTimeout(place, 60);
  }

  function start() {
    if (card) return;
    idx = 0;
    build();
    render();
  }

  function end() {
    try { localStorage.setItem(DONE_KEY, '1'); } catch (e) {}
    destroy();
    switchTab('tracker');
  }

  window.Tour = { start: start };

  /* footer 加「功能導覽」重看入口 */
  var foot = document.querySelector('.app-footer');
  if (foot) {
    var sep = document.createTextNode(' ｜ ');
    var link = document.createElement('a');
    link.href = 'javascript:void(0)';
    link.textContent = t('功能導覽');
    link.addEventListener('click', start);
    foot.appendChild(sep);
    foot.appendChild(link);
  }

  var force = /[?&]tour=1/.test(location.search);
  var done = false;
  try { done = localStorage.getItem(DONE_KEY) === '1'; } catch (e) {}
  if (force || !done) setTimeout(start, 700);
})();
