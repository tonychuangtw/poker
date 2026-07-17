/* 翻前 range 資料 — 100bb 現金局（6-max / 9-max Full Ring）
 *
 * RFI_RANGES_6 / RFI_RANGES_9：各位置無人入池時的開牌（raise-first-in）range。
 * DEF_SPOTS：面對開牌（vs RFI）的防守情境，每個包含：
 *   call     跟注（flat）range 記號
 *   threeBet 3-bet range 記號（價值 + bluff 合併的簡化混合策略）
 * 記號格式同 js/pushfold.js 的 rangeFromNotation（支援 "88-22"、"A5s-A2s" 區間）。
 *
 * 數值為常見已發表 GTO 解的原創近似表述（線性化、去混合），
 * 用途是練習與速查，非逐 combo 精確解。
 * call 與 threeBet 兩組類別互斥（測驗判定需要唯一正解）。
 */
(function (global) {
  'use strict';

  /* ---------- 開牌 RFI（6-max） ---------- */
  var RFI_RANGES_6 = {
    utg: { name: 'UTG', notation: '66+ ATs+ KTs+ QTs+ JTs T9s 98s 87s 76s 65s AJo+ KQo' },
    hj:  { name: 'HJ',  notation: '44+ A9s+ A5s A4s KTs+ QTs+ J9s+ T9s 98s 87s 76s 65s ATo+ KJo+ QJo' },
    co:  { name: 'CO',  notation: '22+ A2s+ K9s+ Q9s+ J9s+ T8s+ 97s+ 86s+ 75s+ 65s 54s A9o+ KTo+ QTo+ JTo' },
    btn: { name: 'BTN', notation: '22+ A2s+ K2s+ Q5s+ J7s+ T7s+ 96s+ 85s+ 74s+ 64s+ 53s+ 43s A2o+ K9o+ Q9o+ J9o+ T9o 98o' },
    sb:  { name: 'SB',  notation: '22+ A2s+ K4s+ Q6s+ J7s+ T7s+ 97s+ 86s+ 75s+ 65s 54s A4o+ K9o+ Q9o+ J9o+ T9o' }
  };
  var RFI_POS_6 = ['utg', 'hj', 'co', 'btn', 'sb'];

  /* ---------- 開牌 RFI（9-max Full Ring）：由 UTG 約 10% 單調放寬到 BTN 約 48% ---------- */
  var RFI_RANGES_9 = {
    utg:  { name: 'UTG',   notation: '66+ ATs+ KJs+ QJs JTs T9s AJo+ KQo' },
    utg1: { name: 'UTG+1', notation: '55+ A9s+ KJs+ QJs JTs T9s 98s AJo+ KQo' },
    mp:   { name: 'MP',    notation: '44+ A9s+ A5s KTs+ QTs+ JTs T9s 98s 87s ATo+ KQo' },
    lj:   { name: 'LJ',    notation: '33+ A8s+ A5s A4s KTs+ QTs+ J9s+ T9s 98s 87s 76s ATo+ KJo+' },
    hj:   { name: 'HJ',    notation: '22+ A7s+ A5s-A2s K9s+ Q9s+ J9s+ T8s+ 98s 87s 76s 65s A9o+ KJo+ QJo' },
    co:   { name: 'CO',    notation: '22+ A2s+ K9s+ Q9s+ J9s+ T8s+ 97s+ 86s+ 75s+ 65s 54s A9o+ KTo+ QTo+ JTo' },
    btn:  { name: 'BTN',   notation: '22+ A2s+ K2s+ Q2s+ J6s+ T6s+ 96s+ 85s+ 74s+ 64s+ 53s+ 43s 32s A2o+ K7o+ Q8o+ J8o+ T8o+ 98o' },
    sb:   { name: 'SB',    notation: '22+ A2s+ K4s+ Q6s+ J7s+ T7s+ 97s+ 86s+ 75s+ 65s 54s A2o+ K9o+ Q9o+ JTo T9o' }
  };
  var RFI_POS_9 = ['utg', 'utg1', 'mp', 'lj', 'hj', 'co', 'btn', 'sb'];

  var DEF_SPOTS = {
    co_vs_utg: {
      name: 'CO vs UTG 開牌',
      hero: 'CO', opener: 'UTG', sizeTxt: 'UTG 開 2.5bb',
      threeBet: 'JJ+ AQs+ AKo A5s A4s',
      call: 'TT-77 AJs ATs KQs KJs QJs JTs T9s 98s AQo'
    },
    btn_vs_co: {
      name: 'BTN vs CO 開牌',
      hero: 'BTN', opener: 'CO', sizeTxt: 'CO 開 2.5bb',
      threeBet: 'TT+ AQs+ AKo A5s-A3s 76s 65s',
      call: '99-22 AJs ATs A9s KQs KJs KTs QJs QTs JTs T9s 98s 87s AQo AJo KQo'
    },
    sb_vs_btn: {
      name: 'SB vs BTN 開牌',
      hero: 'SB', opener: 'BTN', sizeTxt: 'BTN 開 2.5bb（SB 以 3-bet 為主）',
      threeBet: '88+ ATs+ A5s-A2s KTs+ QTs+ JTs T9s 98s 76s 65s AJo+ KQo',
      call: '77-55 A9s A8s J9s 87s'
    },
    bb_vs_btn: {
      name: 'BB vs BTN 開牌',
      hero: 'BB', opener: 'BTN', sizeTxt: 'BTN 開 2.5bb（BB 防守）',
      threeBet: '99+ ATs+ A5s-A2s KTs+ QTs+ JTs T9s 98s 87s 76s AJo+ KQo',
      call: '88-22 A9s-A6s K9s-K2s Q9s-Q2s J9s-J6s T8s-T6s 97s-95s 86s-84s ' +
            '75s 74s 65s-63s 54s 53s 43s ATo-A2o KTo K9o QTo Q9o JTo J9o T9o'
    },
    bb_vs_sb: {
      name: 'BB vs SB 開牌',
      hero: 'BB', opener: 'SB', sizeTxt: 'SB 開 3bb（BB 防守）',
      threeBet: '88+ ATs+ A5s-A2s KTs+ QTs+ JTs T9s ATo+ KQo',
      call: '77-22 A9s-A6s K9s-K6s Q9s Q8s J9s J8s T8s 98s 97s 87s 86s 76s 75s ' +
            '65s 54s A9o-A5o KTo K9o QTo JTo T9o'
    },
    hj_vs_utg9: {
      name: 'HJ vs UTG 開牌（9-max）', table: 9,
      hero: 'HJ', opener: 'UTG', sizeTxt: '9-max，UTG 開 2.5bb',
      threeBet: 'JJ+ AKs AKo A5s A4s',
      call: 'TT-88 AQs AJs ATs KQs KJs QJs JTs T9s 98s AQo'
    },
    bb_vs_utg9: {
      name: 'BB vs UTG 開牌（9-max）', table: 9,
      hero: 'BB', opener: 'UTG', sizeTxt: '9-max，UTG 開 2.5bb（BB 防守）',
      threeBet: 'QQ+ AKs AKo A5s A4s',
      call: 'JJ-22 AQs-A6s A3s A2s K9s+ Q9s+ J9s+ T8s+ 97s+ 86s+ 75s+ 64s+ ' +
            '54s 53s 43s AQo-ATo KQo KJo QJo JTo'
    }
  };

  var DEF_SPOT_KEYS = ['co_vs_utg', 'btn_vs_co', 'sb_vs_btn', 'bb_vs_btn', 'bb_vs_sb',
                       'hj_vs_utg9', 'bb_vs_utg9'];

  /* ---------- 自訂 range 覆寫（純函式，UI 與測試共用） ----------
   * 狀態字串：'out'（棄牌/不開）、'in'（開牌/跟注）、'tb'（3-bet，僅防守圖）。
   * map 為稀疏物件 { 手牌標籤: 狀態 }，未列出的視為 'out'。
   * override 為「與預設不同」的稀疏差異。 */

  /** 依圖表類型循環切換狀態：rfi = 開↔不開；def = 棄→跟→3bet→棄 */
  function cycleState(chartType, state) {
    if (chartType === 'def') {
      return state === 'out' ? 'in' : state === 'in' ? 'tb' : 'out';
    }
    return state === 'in' ? 'out' : 'in';
  }

  /** 預設 map 套用覆寫，回傳新物件（不改動輸入） */
  function mergeOverride(defaultMap, override) {
    var out = {}, k;
    for (k in defaultMap) if (defaultMap.hasOwnProperty(k)) out[k] = defaultMap[k];
    if (override) {
      for (k in override) {
        if (!override.hasOwnProperty(k)) continue;
        if (override[k] === 'out') delete out[k];
        else out[k] = override[k];
      }
    }
    return out;
  }

  /** 由完整自訂 map 算出相對預設的稀疏差異（存 localStorage 用） */
  function diffOverride(defaultMap, fullMap) {
    var d = {}, k;
    for (k in fullMap) {
      if (fullMap.hasOwnProperty(k) && (defaultMap[k] || 'out') !== fullMap[k]) d[k] = fullMap[k];
    }
    for (k in defaultMap) {
      if (defaultMap.hasOwnProperty(k) && !fullMap.hasOwnProperty(k) &&
          defaultMap[k] !== 'out') d[k] = 'out';
    }
    return d;
  }

  /* ---------- 動態防守試算（純函式，依 PushFold equity 表） ----------
   * 想法：先在「預設對手開牌 range」上校準門檻（3-bet / 續玩 各需多少 equity
   * 才能湊到建議表的 combo 數），之後對手開牌變寬或變窄時，
   * 用同一組門檻重算 169 手牌 → 得到動態的 3-bet / 跟注 / 棄牌分佈。
   * 這是簡化的 equity 排序近似：阻斷牌 bluff（如 A5s 3-bet）不在模型內。 */

  function PF() {
    return (typeof module !== 'undefined' && module.exports)
      ? require('./pushfold.js') : global.PushFold;
  }

  /** 該防守情境 opener 的預設 RFI notation（依 6-max / 9-max 表） */
  function openerRfiNotation(spotKey) {
    var spot = DEF_SPOTS[spotKey];
    if (!spot) return null;
    var table = spot.table === 9 ? RFI_RANGES_9 : RFI_RANGES_6;
    for (var k in table) {
      if (table.hasOwnProperty(k) && table[k].name === spot.opener) return table[k].notation;
    }
    return null;
  }

  /** 該情境 opener 的預設開牌寬度（% of 1326 combos） */
  function openerOpenPct(spotKey) {
    var pf = PF();
    var notation = openerRfiNotation(spotKey);
    if (!notation) return 0;
    return pf.rangeComboTotal(pf.rangeFromNotation(notation)) / 1326 * 100;
  }

  /** 169 手牌各自對 villainClasses 的 equity（class 層級，不計 blocker） */
  function equityMapVs(villainClasses) {
    var pf = PF(), eq = new Array(169);
    for (var i = 0; i < 169; i++) {
      eq[i] = pf.equityVsRange(i, [], villainClasses).equity;
    }
    return eq;
  }

  /** 校準門檻：equity ≥ tb 的手牌約湊滿 tbCombos；≥ cont 的約湊滿 contCombos。
   * contCombos 應為「續玩總量」= 3-bet + 跟注 combo 數。回傳 { tb, cont }。 */
  function defenseThresholds(villainClasses, tbCombos, contCombos) {
    var pf = PF();
    var eq = equityMapVs(villainClasses);
    var order = [];
    for (var i = 0; i < 169; i++) order.push(i);
    order.sort(function (a, b) { return eq[b] - eq[a]; });
    var tbThr = tbCombos > 0 ? null : 2;   // 2 = 不可能達到 → 空集合
    var contThr = contCombos > 0 ? null : 2;
    var cum = 0;
    for (i = 0; i < order.length; i++) {
      cum += pf.comboCount(order[i]);
      if (tbThr === null && cum >= tbCombos) tbThr = eq[order[i]];
      if (contThr === null && cum >= contCombos) contThr = eq[order[i]];
      if (tbThr !== null && contThr !== null) break;
    }
    if (tbThr === null) tbThr = 0;
    if (contThr === null) contThr = 0;
    if (contThr > tbThr) contThr = tbThr; // 保證 tb ≥ cont（3-bet ⊆ 續玩）
    return { tb: tbThr, cont: contThr };
  }

  /** 用校準好的門檻對「新的」對手 range 產生 169 map：
   * { 手牌標籤: 'tb' | 'in' }，未列出 = 棄牌（與 DEF 圖的狀態字串一致）。 */
  function dynamicDefense(villainClasses, thresholds) {
    var pf = PF();
    var eq = equityMapVs(villainClasses);
    var map = {};
    for (var i = 0; i < 169; i++) {
      if (eq[i] >= thresholds.tb) map[pf.classLabel(i)] = 'tb';
      else if (eq[i] >= thresholds.cont) map[pf.classLabel(i)] = 'in';
    }
    return map;
  }

  var Ranges = {
    DEF_SPOTS: DEF_SPOTS, DEF_SPOT_KEYS: DEF_SPOT_KEYS,
    RFI_RANGES_6: RFI_RANGES_6, RFI_POS_6: RFI_POS_6,
    RFI_RANGES_9: RFI_RANGES_9, RFI_POS_9: RFI_POS_9,
    cycleState: cycleState, mergeOverride: mergeOverride, diffOverride: diffOverride,
    openerRfiNotation: openerRfiNotation, openerOpenPct: openerOpenPct,
    defenseThresholds: defenseThresholds, dynamicDefense: dynamicDefense
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Ranges;
  else global.Ranges = Ranges;
})(typeof window !== 'undefined' ? window : this);
