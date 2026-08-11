/* Pro 解鎖 —— 免費/付費的單一真相來源。
 *
 * 現在只有一個旗標 poker.pro；之後要加訂閱層時把它換成 {pro:1, events:1} 兩鍵，
 * 其他檔案只呼叫 Pro.has() / Pro.limit()，不會受影響。
 *
 * gating 一律做在 UI 層。PWA 原始碼是公開的，改 localStorage 就能解鎖 ——
 * 這是取捨不是漏洞：目的是讓 App Store 使用者有清楚的付費理由，不是防破解。
 *
 * 金流還沒接：購買鍵目前只會說明「上架後開放」。原生殼接好 StoreKit 之後，
 * 由 IAP 模組呼叫 Pro.setPurchaseHandler() 把真正的購買流程掛上來。
 */
(function () {
  'use strict';

  var KEY = 'poker.pro';
  var QUIZ_KEY = 'poker.pro.quiz';
  var USER_KEY = 'poker.user';

  /* 超級使用者：這些 email 一律視同 Pro，全部功能可見（Tony 2026-08-11 指示）。
     解鎖方式：開 App 時網址帶一次 ?user=<email>，命中就存進 localStorage 永久生效；
     ?user=off 清除。網頁版與原生殼都認。 */
  var SUPER_USERS = ['tonychuangtw@gmail.com'];

  /* 免費版上限（Tony 2026-08-06 定案） */
  var LIMITS = {
    records: 10,     // 記帳筆數
    hands: 5,        // 複盤手牌數
    villains: 1,     // EV 對手數（多人要 Pro）
    quizPerDay: 10,  // 每日訓練題數
    eventDays: 14    // 賽事只看 14 天內
  };

  /* 上架首發價；正式接上 StoreKit 後改成從商店讀，不要寫死在 UI */
  var PRICE_TEXT = 'US$19.99';

  var BENEFITS = [
    '無限記帳筆數與進階統計',
    'ICM、分錢計算與 Nash 圖表',
    '完整翻前 range：面對開牌 / 被 3-bet / 冷 4-bet',
    'Range vs Range 與多人勝率',
    '訓練無限題、錯題本與週報',
    '無限手牌複盤、完整賽事表與開賽提醒'
  ];

  var purchaseHandler = null;
  var restoreHandler = null;

  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function isSuper() {
    var u = read(USER_KEY);
    return !!u && SUPER_USERS.indexOf(u.trim().toLowerCase()) !== -1;
  }

  /* 原生殼（App Store 版）才有真正的購買 gating。網頁版在金流接上前一律全解鎖：
     沒有登入系統就無法只認 Tony 的 email，而鎖住又賣不了東西，只是把自己人擋在外面
     （2026-08-11 Tony 指示：打開就要什麼都看得到，網頁跟 App 一致）。
     iOS 上架接 IAP 時再回來檢討網頁版策略。 */
  var IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform &&
                     window.Capacitor.isNativePlatform());

  function has() { return !IS_NATIVE || !!read(KEY) || isSuper(); }

  function limit(k) { return has() ? Infinity : LIMITS[k]; }

  /* ---------- 每日訓練題數 ---------- */
  function today() { return new Date().toISOString().slice(0, 10); }
  function quizState() {
    var raw = read(QUIZ_KEY);
    var st = null;
    try { st = raw ? JSON.parse(raw) : null; } catch (e) {}
    if (!st || st.d !== today()) st = { d: today(), n: 0 };
    return st;
  }
  function quizLeft() {
    if (has()) return Infinity;
    return Math.max(0, LIMITS.quizPerDay - quizState().n);
  }
  function quizBump() {
    if (has()) return;
    var st = quizState();
    st.n++;
    write(QUIZ_KEY, JSON.stringify(st));
  }

  /* ---------- 付費牆 ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function closePaywall() {
    var m = document.getElementById('paywall');
    if (m) m.remove();
    document.body.style.overflow = '';
  }

  /* reason：可選，說明是踩到哪個限制才跳出來的 */
  function paywall(reason) {
    closePaywall();
    var back = el('div', 'paywall-backdrop');
    back.id = 'paywall';
    back.addEventListener('click', function (e) { if (e.target === back) closePaywall(); });

    var box = el('div', 'paywall');
    box.appendChild(el('div', 'paywall-badge', t('Pro 解鎖')));
    if (reason) box.appendChild(el('p', 'paywall-reason', reason));
    box.appendChild(el('h3', null, t('Pro 可以做什麼')));

    var ul = el('ul', 'paywall-list');
    BENEFITS.forEach(function (b) {
      var li = el('li', null, t(b));
      ul.appendChild(li);
    });
    box.appendChild(ul);

    box.appendChild(el('p', 'paywall-price', PRICE_TEXT + ' — ' + t('一次付清，永久解鎖，不是訂閱')));

    var buy = el('button', 'btn primary full', t('購買 Pro'));
    buy.addEventListener('click', function () {
      if (purchaseHandler) { purchaseHandler(); return; }
      alert(t('App 內購買尚未開放，正式版上架後就能購買。'));
    });
    box.appendChild(buy);

    var restore = el('button', 'btn full', t('恢復購買'));
    restore.addEventListener('click', function () {
      if (restoreHandler) { restoreHandler(); return; }
      alert(t('App 內購買尚未開放，正式版上架後就能購買。'));
    });
    box.appendChild(restore);

    /* Email 白名單解鎖：不依賴網址參數 —— iOS 主畫面 PWA 與 Safari 的
       localStorage 不互通、Telegram 內建瀏覽器又是第三份，URL 解鎖常落錯地方。
       在這裡輸入一次就存進「目前這個」環境，哪裡開都解得了。 */
    var byEmail = el('button', 'btn-link', t('輸入解鎖 Email'));
    byEmail.addEventListener('click', function () {
      var em = prompt(t('輸入解鎖 Email'));
      if (!em) return;
      write(USER_KEY, em.trim().toLowerCase());
      if (isSuper()) {
        unlockAll();
        closePaywall();
        alert(t('已解鎖，歡迎回來！'));
      } else {
        try { localStorage.removeItem(USER_KEY); } catch (e) {}
        alert(t('這個 Email 沒有解鎖資格。'));
      }
    });
    box.appendChild(byEmail);

    var later = el('button', 'btn-link', t('稍後再說'));
    later.addEventListener('click', closePaywall);
    box.appendChild(later);

    /* Apple 會看付費畫面上有沒有這兩個連結 */
    var links = el('p', 'paywall-links');
    var pp = el('a', null, t('隱私政策'));
    pp.href = 'privacy.html'; pp.target = '_blank'; pp.rel = 'noopener';
    var sp = el('a', null, t('支援'));
    sp.href = 'support.html'; sp.target = '_blank'; sp.rel = 'noopener';
    links.appendChild(pp);
    links.appendChild(document.createTextNode(' ｜ '));
    links.appendChild(sp);
    box.appendChild(links);

    back.appendChild(box);
    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';
  }

  /* ---------- 鎖住區塊 ---------- */
  function lock(node) {
    if (node.dataset.proLocked) return;
    node.dataset.proLocked = '1';
    node.classList.add('pro-locked');

    var ov = el('div', 'pro-lock-overlay');
    var card = el('div', 'pro-lock-card');
    card.appendChild(el('div', 'pro-lock-icon', '🔒'));
    card.appendChild(el('div', 'pro-lock-title', t('Pro 功能')));
    var btn = el('button', 'btn primary', t('解鎖 Pro'));
    btn.addEventListener('click', function () { paywall(''); });
    card.appendChild(btn);
    ov.appendChild(card);
    node.appendChild(ov);
  }

  /* 免費版限制觸發時的提示（踩到才跳，不要一開場就擋） */
  function hitLimit(msg) { paywall(msg); }

  function unlockAll() {
    var locked = document.querySelectorAll('[data-pro-locked]');
    for (var i = 0; i < locked.length; i++) {
      locked[i].classList.remove('pro-locked');
      locked[i].removeAttribute('data-pro-locked');
      var ov = locked[i].querySelector(':scope > .pro-lock-overlay');
      if (ov) ov.remove();
    }
  }

  function set(on) {
    if (on) write(KEY, '1');
    else { try { localStorage.removeItem(KEY); } catch (e) {} }
    if (on) { unlockAll(); closePaywall(); }
    else location.reload();
  }

  function boot() {
    /* ?pro=dev 解鎖、?pro=off 還原 —— 只給網頁版試看用。
       原生殼一律忽略，免得有人靠網址就解鎖 App Store 買來的東西。
       上架前這段要拿掉或改成不可猜的字串。 */
    if (!IS_NATIVE) {
      if (/[?&]pro=dev/.test(location.search)) write(KEY, '1');
      if (/[?&]pro=off/.test(location.search)) { try { localStorage.removeItem(KEY); } catch (e) {} }
    }
    /* ?user=<email> 超級使用者登記（網址不分大小寫，整串轉小寫再解析） */
    try {
      var qUser = new URLSearchParams(location.search.toLowerCase()).get('user');
      if (qUser === 'off') { try { localStorage.removeItem(USER_KEY); } catch (e) {} }
      else if (qUser) write(USER_KEY, qUser.trim());
    } catch (e) {}
    if (has()) return;
    var nodes = document.querySelectorAll('[data-pro]');
    for (var i = 0; i < nodes.length; i++) lock(nodes[i]);
  }

  window.Pro = {
    has: has,
    limit: limit,
    limits: LIMITS,
    priceText: PRICE_TEXT,
    quizLeft: quizLeft,
    quizBump: quizBump,
    paywall: paywall,
    hitLimit: hitLimit,
    set: set,
    setPurchaseHandler: function (fn) { purchaseHandler = fn; },
    setRestoreHandler: function (fn) { restoreHandler = fn; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
