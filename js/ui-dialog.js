/* app 內建彈窗（2026-08-15 Tony：「應該是要在畫面裡跳出和 UI 風格像的東西」）
   - UI.toast(msg)：取代原生 alert 的浮出提示，自動消失；window.alert 直接覆寫成這個，
     全站既有 alert 呼叫零改動就換皮。
   - UI.confirm(msg) → Promise<boolean>：取代原生 confirm 的置中對話框。
     原生 confirm 是同步的、覆寫不了，呼叫點要各自改成 .then()。 */
(function () {
  'use strict';
  function tt(s) { return (typeof window.t === 'function') ? window.t(s) : s; }

  var toastBox = null;
  function toast(msg) {
    if (!toastBox) {
      toastBox = document.createElement('div');
      toastBox.className = 'toast-box';
      document.body.appendChild(toastBox);
    }
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'alert');
    el.textContent = String(msg);
    toastBox.appendChild(el);
    /* 疊太多就先收最舊的 */
    while (toastBox.children.length > 3) toastBox.removeChild(toastBox.firstChild);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 350);
    }, 3200);
  }

  function confirmDlg(msg, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var bk = document.createElement('div');
      bk.className = 'dlg-backdrop';
      var box = document.createElement('div');
      box.className = 'dlg';
      box.setAttribute('role', 'alertdialog');
      var body = document.createElement('div');
      body.className = 'dlg-msg';
      body.textContent = String(msg);
      var row = document.createElement('div');
      row.className = 'dlg-btns';
      var btnNo = document.createElement('button');
      btnNo.type = 'button';
      btnNo.className = 'btn dlg-cancel';
      btnNo.textContent = opts.cancelLabel || tt('取消');
      var btnOk = document.createElement('button');
      btnOk.type = 'button';
      btnOk.className = 'btn primary';
      btnOk.textContent = opts.okLabel || tt('確定');
      if (!opts.hideCancel) row.appendChild(btnNo);
      row.appendChild(btnOk);
      box.appendChild(body); box.appendChild(row);
      bk.appendChild(box);
      function done(val) {
        document.removeEventListener('keydown', onKey, true);
        bk.classList.remove('show');
        setTimeout(function () { if (bk.parentNode) bk.parentNode.removeChild(bk); }, 180);
        resolve(val);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); done(false); }
        if (e.key === 'Enter') { e.stopPropagation(); done(true); }
      }
      btnOk.addEventListener('click', function () { done(true); });
      btnNo.addEventListener('click', function () { done(false); });
      bk.addEventListener('click', function (e) { if (e.target === bk) done(false); });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(bk);
      requestAnimationFrame(function () { bk.classList.add('show'); });
      btnOk.focus();
    });
  }

  function promptDlg(msg, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var bk = document.createElement('div');
      bk.className = 'dlg-backdrop';
      var box = document.createElement('div');
      box.className = 'dlg';
      box.setAttribute('role', 'dialog');
      var body = document.createElement('div');
      body.className = 'dlg-msg';
      body.textContent = String(msg);
      var input = document.createElement('input');
      input.type = opts.type || 'text';
      input.className = 'dlg-input';
      if (opts.placeholder) input.placeholder = opts.placeholder;
      var row = document.createElement('div');
      row.className = 'dlg-btns';
      var btnNo = document.createElement('button');
      btnNo.type = 'button';
      btnNo.className = 'btn dlg-cancel';
      btnNo.textContent = tt('取消');
      var btnOk = document.createElement('button');
      btnOk.type = 'button';
      btnOk.className = 'btn primary';
      btnOk.textContent = tt('確定');
      row.appendChild(btnNo); row.appendChild(btnOk);
      box.appendChild(body); box.appendChild(input); box.appendChild(row);
      bk.appendChild(box);
      function done(val) {
        document.removeEventListener('keydown', onKey, true);
        bk.classList.remove('show');
        setTimeout(function () { if (bk.parentNode) bk.parentNode.removeChild(bk); }, 180);
        resolve(val);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); done(null); }
        if (e.key === 'Enter') { e.stopPropagation(); done(input.value); }
      }
      btnOk.addEventListener('click', function () { done(input.value); });
      btnNo.addEventListener('click', function () { done(null); });
      bk.addEventListener('click', function (e) { if (e.target === bk) done(null); });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(bk);
      requestAnimationFrame(function () { bk.classList.add('show'); });
      input.focus();
    });
  }

  /* 單鍵版：只有「知道了」，給純告知用（訊息太長不適合 toast 時） */
  function infoDlg(msg) {
    return confirmDlg(msg, { hideCancel: true, okLabel: tt('知道了') });
  }

  window.UI = { toast: toast, confirm: confirmDlg, prompt: promptDlg, info: infoDlg };
  window.alert = function (msg) { toast(msg); };
})();
