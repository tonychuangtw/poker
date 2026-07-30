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
    /* ===== 6-max：面對 UTG 開牌 ===== */
    hj_vs_utg: {
      name: 'HJ vs UTG 開牌',
      hero: 'HJ', opener: 'UTG', sizeTxt: 'UTG 開 2.5bb（HJ 有位置，後面還有 4 家）',
      threeBet: 'JJ+ AQs+ AKo A5s',
      call: 'TT-88 AJs ATs KQs KJs QJs JTs T9s AQo'
    },
    co_vs_utg: {
      name: 'CO vs UTG 開牌',
      hero: 'CO', opener: 'UTG', sizeTxt: 'UTG 開 2.5bb',
      threeBet: 'JJ+ AQs+ AKo A5s A4s',
      call: 'TT-77 AJs ATs KQs KJs QJs JTs T9s 98s AQo'
    },
    btn_vs_utg: {
      name: 'BTN vs UTG 開牌',
      hero: 'BTN', opener: 'UTG', sizeTxt: 'UTG 開 2.5bb（BTN 位置最好，可多冷跟）',
      threeBet: 'TT+ AQs+ AKo A5s A4s',
      call: '99-44 AJs ATs A9s KQs KJs KTs QJs QTs JTs T9s 98s 87s 76s AQo AJo KQo'
    },
    sb_vs_utg: {
      name: 'SB vs UTG 開牌',
      hero: 'SB', opener: 'UTG', sizeTxt: 'UTG 開 2.5bb（SB 無位置且 BB 在後，以 3-bet 或棄牌為主）',
      threeBet: 'JJ+ AQs+ AKo A5s A4s',
      call: 'TT-77 AJs KQs KJs QJs JTs'
    },
    bb_vs_utg: {
      name: 'BB vs UTG 開牌',
      hero: 'BB', opener: 'UTG', sizeTxt: 'UTG 開 2.5bb（BB 防守，收尾行動、價格好）',
      threeBet: 'QQ+ AKs AKo A5s A4s',
      call: 'JJ-22 AQs-A6s A3s A2s KQs-K7s QJs-Q8s JTs J9s J8s T9s T8s T7s ' +
            '98s 97s 87s 86s 76s 75s 65s 64s 54s 53s 43s AQo-A9o KQo KJo KTo QJo QTo JTo'
    },

    /* ===== 6-max：面對 HJ 開牌 ===== */
    co_vs_hj: {
      name: 'CO vs HJ 開牌',
      hero: 'CO', opener: 'HJ', sizeTxt: 'HJ 開 2.5bb（CO 有位置）',
      threeBet: 'TT+ AQs+ AKo A5s A4s',
      call: '99-66 AJs ATs A9s KQs KJs KTs QJs QTs JTs T9s 98s 87s AQo AJo KQo'
    },
    btn_vs_hj: {
      name: 'BTN vs HJ 開牌',
      hero: 'BTN', opener: 'HJ', sizeTxt: 'HJ 開 2.5bb（BTN 有位置）',
      threeBet: 'TT+ AQs+ AKo A5s-A3s',
      call: '99-22 AJs ATs A9s KQs KJs KTs QJs QTs JTs T9s 98s 87s 76s 65s 54s AQo AJo KQo'
    },
    sb_vs_hj: {
      name: 'SB vs HJ 開牌',
      hero: 'SB', opener: 'HJ', sizeTxt: 'HJ 開 2.5bb（SB 無位置，3-bet 為主）',
      threeBet: 'TT+ AQs+ AKo A5s A4s',
      call: '99-77 AJs ATs KQs KJs QJs JTs T9s'
    },
    bb_vs_hj: {
      name: 'BB vs HJ 開牌',
      hero: 'BB', opener: 'HJ', sizeTxt: 'HJ 開 2.5bb（BB 防守）',
      threeBet: 'JJ+ AQs+ AKo A5s A4s',
      call: 'TT-22 AJs ATs A9s-A6s A3s A2s KQs-K6s QJs-Q7s JTs-J7s T9s T8s T7s ' +
            '98s 97s 87s 86s 76s 75s 65s 64s 54s 53s 43s AQo-A8o KQo KJo KTo QJo QTo JTo T9o'
    },

    /* ===== 6-max：面對 CO 開牌 ===== */
    btn_vs_co: {
      name: 'BTN vs CO 開牌',
      hero: 'BTN', opener: 'CO', sizeTxt: 'CO 開 2.5bb',
      threeBet: 'TT+ AQs+ AKo A5s-A3s 76s 65s',
      call: '99-22 AJs ATs A9s KQs KJs KTs QJs QTs JTs T9s 98s 87s AQo AJo KQo'
    },
    sb_vs_co: {
      name: 'SB vs CO 開牌',
      hero: 'SB', opener: 'CO', sizeTxt: 'CO 開 2.5bb（SB 無位置，以 3-bet 為主）',
      threeBet: '99+ ATs+ A5s-A3s KTs+ QTs+ JTs T9s AJo+ KQo',
      call: '88-66 A9s A8s J9s 98s'
    },
    bb_vs_co: {
      name: 'BB vs CO 開牌',
      hero: 'BB', opener: 'CO', sizeTxt: 'CO 開 2.5bb（BB 防守）',
      threeBet: 'TT+ ATs+ A5s-A2s KTs+ QTs+ JTs T9s 98s AJo+ KQo',
      call: '99-22 A9s-A6s K9s-K5s Q9s-Q6s J9s-J7s T8s T7s 97s 96s 87s 86s 76s 75s ' +
            '65s 64s 54s ATo-A7o KTo K9o QTo Q9o JTo J9o T9o'
    },

    /* ===== 6-max：面對 BTN / SB 開牌 ===== */
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
    /* ===== 9-max Full Ring ===== */
    hj_vs_utg9: {
      name: 'HJ vs UTG 開牌（9-max）', table: 9,
      hero: 'HJ', opener: 'UTG', sizeTxt: '9-max，UTG 開 2.5bb',
      threeBet: 'JJ+ AKs AKo A5s A4s',
      call: 'TT-88 AQs AJs ATs KQs KJs QJs JTs T9s 98s AQo'
    },
    co_vs_utg9: {
      name: 'CO vs UTG 開牌（9-max）', table: 9,
      hero: 'CO', opener: 'UTG', sizeTxt: '9-max，UTG 開 2.5bb（UTG 範圍很緊）',
      threeBet: 'JJ+ AQs+ AKo A5s A4s',
      call: 'TT-88 AJs ATs KQs KJs QJs JTs T9s 98s AQo'
    },
    btn_vs_utg9: {
      name: 'BTN vs UTG 開牌（9-max）', table: 9,
      hero: 'BTN', opener: 'UTG', sizeTxt: '9-max，UTG 開 2.5bb（BTN 有位置，冷跟小對子/同花連張）',
      threeBet: 'TT+ AQs+ AKo A5s A4s',
      call: '99-44 AJs ATs A9s KQs KJs KTs QJs QTs JTs T9s 98s 87s AQo AJo KQo'
    },
    sb_vs_utg9: {
      name: 'SB vs UTG 開牌（9-max）', table: 9,
      hero: 'SB', opener: 'UTG', sizeTxt: '9-max，UTG 開 2.5bb（SB 無位置，3-bet 或棄牌）',
      threeBet: 'JJ+ AQs+ AKo A5s A4s',
      call: 'TT-88 AJs KQs KJs QJs JTs'
    },
    bb_vs_mp9: {
      name: 'BB vs MP 開牌（9-max 防守）', table: 9,
      hero: 'BB', opener: 'MP', sizeTxt: '9-max，MP 開 2.5bb（BB 防守）',
      threeBet: 'QQ+ AKs AKo A5s A4s',
      call: 'JJ-22 AQs-A6s A3s A2s KQs-K8s QJs-Q9s JTs J9s T9s T8s 98s 97s ' +
            '87s 76s 65s 54s AQo-ATo KQo KJo QJo'
    },
    bb_vs_utg9: {
      name: 'BB vs UTG 開牌（9-max）', table: 9,
      hero: 'BB', opener: 'UTG', sizeTxt: '9-max，UTG 開 2.5bb（BB 防守）',
      threeBet: 'QQ+ AKs AKo A5s A4s',
      call: 'JJ-22 AQs-A6s A3s A2s K9s+ Q9s+ J9s+ T8s+ 97s+ 86s+ 75s+ 64s+ ' +
            '54s 53s 43s AQo-ATo KQo KJo QJo JTo'
    }
  };

  /* 顯示與測驗順序：6-max 依「開牌者位置由前到後、hero 由前到後」，之後才是 9-max */
  var DEF_SPOT_KEYS = [
    'hj_vs_utg', 'co_vs_utg', 'btn_vs_utg', 'sb_vs_utg', 'bb_vs_utg',
    'co_vs_hj', 'btn_vs_hj', 'sb_vs_hj', 'bb_vs_hj',
    'btn_vs_co', 'sb_vs_co', 'bb_vs_co',
    'sb_vs_btn', 'bb_vs_btn',
    'bb_vs_sb',
    'hj_vs_utg9', 'co_vs_utg9', 'btn_vs_utg9', 'sb_vs_utg9', 'bb_vs_utg9', 'bb_vs_mp9'
  ];

  /* ---------- 被 3-bet（自己開牌後遭 3-bet）的 4-bet / 跟注 range ----------
   * 狀態沿用防守圖：'tb' = 加注（此處為 4-bet）、'in' = 跟注、未列出 = 蓋牌。
   * openBb / tbBb / deadBb 用來算跟注的底池賠率（callPrice）。 */
  var VS3B_SPOTS = {
    co_vs_bb3b: {
      name: 'CO 開牌 vs BB 3-bet',
      hero: 'CO', villain: 'BB', villainSpot: 'bb_vs_co',
      openBb: 2.5, tbBb: 12, deadBb: 0.5,
      note: 'BB 3-bet 範圍最寬（有 MDF 壓力），CO 有位置 → 跟注為主、4-bet 偏價值',
      fourBet: 'QQ+ AKs AKo A5s',
      call: 'JJ-77 AQs AJs ATs KQs KJs QJs QTs JTs T9s 98s 87s AQo AJo KQo'
    },
    co_vs_sb3b: {
      name: 'CO 開牌 vs SB 3-bet',
      hero: 'CO', villain: 'SB', villainSpot: 'sb_vs_co',
      openBb: 2.5, tbBb: 11, deadBb: 1,
      note: 'SB 3-bet 比 BB 緊且更兩極化，續玩要再收一點',
      fourBet: 'QQ+ AKs AKo A5s A4s',
      call: 'JJ-88 AQs AJs ATs KQs KJs KTs QJs QTs JTs T9s 98s AQo AJo KQo'
    },
    co_vs_btn3b: {
      name: 'CO 開牌 vs BTN 3-bet',
      hero: 'CO', villain: 'BTN', villainSpot: 'btn_vs_co',
      openBb: 2.5, tbBb: 8, deadBb: 1.5,
      note: 'BTN 3-bet 較小（約 3x）但有位置；價格好卻整局無位置，冷跟要更嚴',
      fourBet: 'QQ+ AKs AKo A5s A4s',
      call: 'JJ-77 AQs AJs ATs KQs KJs QJs JTs T9s 98s AQo KQo'
    },
    btn_vs_sb3b: {
      name: 'BTN 開牌 vs SB 3-bet',
      hero: 'BTN', villain: 'SB', villainSpot: 'sb_vs_btn',
      openBb: 2.5, tbBb: 11, deadBb: 1,
      note: 'BTN 開牌很寬，被 3-bet 必須棄掉大量邊緣牌；有位置 → 小對子/同花連張可跟',
      fourBet: 'JJ+ AQs+ AKo A5s A4s',
      call: 'TT-44 AJs ATs A9s KQs KJs KTs QJs QTs JTs T9s 98s 87s 76s 65s 54s AQo AJo KQo'
    },
    btn_vs_bb3b: {
      name: 'BTN 開牌 vs BB 3-bet',
      hero: 'BTN', villain: 'BB', villainSpot: 'bb_vs_btn',
      openBb: 2.5, tbBb: 12, deadBb: 0.5,
      note: 'BB 3-bet 最寬，BTN 有位置 → 續玩最寬的一格',
      fourBet: 'JJ+ AQs+ AKo A5s A4s',
      call: 'TT-22 AJs ATs A9s A8s KQs KJs KTs K9s QJs QTs Q9s JTs J9s T9s T8s ' +
            '98s 87s 76s 65s 54s AQo AJo KQo KJo'
    },
    sb_vs_bb3b: {
      name: 'SB 開牌 vs BB 3-bet',
      hero: 'SB', villain: 'BB', villainSpot: 'bb_vs_sb',
      openBb: 3, tbBb: 12, deadBb: 0,
      note: 'SB 開牌寬又整局無位置，被 BB 3-bet 只留能打得舒服的牌，其餘 4-bet 或棄',
      fourBet: 'JJ+ AQs+ AKo A5s A4s',
      call: 'TT-77 AJs ATs KQs KJs QJs JTs T9s 98s AQo AJo'
    }
  };

  var VS3B_SPOT_KEYS = ['co_vs_bb3b', 'co_vs_sb3b', 'co_vs_btn3b',
                        'btn_vs_sb3b', 'btn_vs_bb3b', 'sb_vs_bb3b'];

  /** 被 3-bet 後跟注的底池賠率：需要多少 equity 才能無條件跟注到底 */
  function callPrice(spotKey) {
    var s = VS3B_SPOTS[spotKey];
    if (!s) return null;
    var toCall = s.tbBb - s.openBb;
    var pot = s.tbBb * 2 + s.deadBb;   // 跟注後的底池（雙方各 tbBb + 死錢）
    return { toCall: toCall, pot: pot, needEq: toCall / pot };
  }

  /* ---------- 自訂 range 覆寫（純函式，UI 與測試共用） ----------
   * 狀態字串：'out'（棄牌/不開）、'in'（開牌/跟注）、'tb'（3-bet，僅防守圖）。
   * map 為稀疏物件 { 手牌標籤: 狀態 }，未列出的視為 'out'。
   * override 為「與預設不同」的稀疏差異。 */

  /** 依圖表類型循環切換狀態：rfi = 開↔不開；def / vs3b = 棄→跟→加注→棄 */
  function cycleState(chartType, state) {
    if (chartType === 'def' || chartType === 'vs3b') {
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

  /** 依 score 由高到低取牌，湊滿 targetCombos 時的 score 即為門檻。
   * targetCombos <= 0 回傳 2（不可能達到 → 空集合）；湊不滿回傳 0（全取）。 */
  function thresholdAt(score, targetCombos) {
    if (targetCombos <= 0) return 2;
    var pf = PF(), order = [], i;
    for (i = 0; i < 169; i++) order.push(i);
    order.sort(function (a, b) { return score[b] - score[a]; });
    var cum = 0;
    for (i = 0; i < order.length; i++) {
      cum += pf.comboCount(order[i]);
      if (cum >= targetCombos) return score[order[i]];
    }
    return 0;
  }

  /** 校準門檻：equity ≥ tb 的手牌約湊滿 tbCombos；≥ cont 的約湊滿 contCombos。
   * contCombos 應為「續玩總量」= 3-bet + 跟注 combo 數。回傳 { tb, cont }。 */
  function defenseThresholds(villainClasses, tbCombos, contCombos) {
    var eq = equityMapVs(villainClasses);
    var tbThr = thresholdAt(eq, tbCombos);
    var contThr = thresholdAt(eq, contCombos);
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

  /* ---------- 被 3-bet：籌碼深度試算（10–300bb，純函式） ----------
   * 100bb 的建議表當基準，其餘深度用同一組門檻重算，規則寫明如下：
   *   3-bet 實際大小 = min(表定大小, 有效籌碼)   籌碼不夠時 3-bet 就是全下
   *   底池 = 3-bet 大小 × 2 + 死錢；跟注後 SPR = (有效籌碼 - 3-bet 大小) / 底池
   *   排序分數 = equity(對上對手 3-bet range) + 隱含賠率加成
   *   隱含賠率加成 = IMPLIED_W × 隱含指數(手牌) × min(SPR, SPR_CAP)/SPR_CAP
   *     → 深籌碼：小對子/同花連張的加成變大，跟注範圍變寬
   *     → 淺籌碼：加成趨近 0，這些牌自動掉出跟注範圍
   *   4-bet 只看 raw equity（不吃隱含賠率）。門檻在兩種極端間內插：
   *     SPR 夠深（≥ COMMIT_SPR）→ 用 100bb 校準門檻（4-bet 不等於全下，可以被打回棄牌）
   *     SPR 很淺 → 4-bet 就是全下，門檻 = 底池賠率 − 棄牌權益折抵（JAM_CREDIT）→ range 明顯變寬
   *     深於 150bb 再上調 DEEP_PENALTY → 不會深籌碼拿 JJ/AQ 就把整疊打光
   *   模式：有效籌碼 ≤ 3-bet 大小 → 只能跟全下或棄（門檻 = 底池賠率）
   *         跟注後 SPR < JAM_SPR → 沒有跟注這個選項，只剩 4-bet 全下 / 棄
   * 同樣是簡化的 equity 排序近似：阻斷牌 bluff（如 A5s）不在模型內。 */

  var VS3B_BASE_BB = 100;   // 建議表的基準深度
  var VS3B_MIN_BB = 10, VS3B_MAX_BB = 300;
  var IMPLIED_W = 0.10;     // 隱含賠率最多可抵掉的 equity（10 個百分點）
  var SPR_CAP = 6;          // SPR 超過此值後隱含賠率不再加成
  var JAM_SPR = 0.5;        // 跟注後 SPR 低於此值 → 沒有跟注，只剩全下 / 棄
  var COMMIT_SPR = 2;       // SPR 到此值以上，4-bet 才算「不等於全下」
  var JAM_CREDIT = 0.06;    // 4-bet 全下的棄牌權益折抵（6 個百分點）
  var DEEP_PENALTY = 0.02;  // 深籌碼 4-bet 價值門檻上調（最多 2 個百分點）

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  /** 隱含賠率指數 0..1：越吃籌碼深度的牌越高（小對子打三條、同花連張打堅果） */
  function impliedIndex(idx) {
    var r = Math.floor(idx / 13), c = idx % 13;
    var hi = 14 - (r < c ? r : c), lo = 14 - (r < c ? c : r);
    if (r === c) return lo <= 9 ? 1 : 0.5;        // 99 以下的口袋對最吃深度
    var suited = r < c, gap = hi - lo;
    if (!suited) return 0.1;                      // 雜色牌幾乎沒有隱含賠率
    if (hi === 14) return lo <= 5 ? 0.7 : 0.6;    // 同花 A（輪子 / 堅果同花）
    return gap <= 2 ? 0.8 : 0.45;                 // 同花連張 / 一兩張間隔
  }

  /** 對手（3-bet 方）的 3-bet range — 直接取對應防守情境的 threeBet，兩張表共用同一份資料 */
  function vs3bVillainRange(spotKey) {
    var spot = VS3B_SPOTS[spotKey];
    if (!spot || !DEF_SPOTS[spot.villainSpot]) return null;
    return PF().rangeFromNotation(DEF_SPOTS[spot.villainSpot].threeBet);
  }

  /** 某有效籌碼下的局面數字：3-bet 實際大小、底池、底池賠率、SPR、模式 */
  function vs3bStackInfo(spotKey, effBb) {
    var s = VS3B_SPOTS[spotKey];
    if (!s) return null;
    var eff = Math.min(VS3B_MAX_BB, Math.max(VS3B_MIN_BB, effBb));
    var tb = Math.min(s.tbBb, eff);        // 籌碼不夠蓋住 → 3-bet 就是全下
    var open = Math.min(s.openBb, eff);
    var pot = tb * 2 + s.deadBb;
    var spr = (eff - tb) / pot;
    return {
      effBb: eff, tbBb: tb, openBb: open, toCall: tb - open, pot: pot,
      needEq: (tb - open) / pot, spr: spr,
      mode: eff <= tb ? 'callAllin' : spr < JAM_SPR ? 'jamOrFold' : 'normal'
    };
  }

  function impliedFactor(spr) { return clamp01(spr / SPR_CAP); }

  /** 於 100bb 用建議表校準門檻：4-bet 看 raw equity、續玩看 equity + 隱含加成 */
  function vs3bCalibrate(spotKey) {
    var pf = PF(), s = VS3B_SPOTS[spotKey];
    var villain = vs3bVillainRange(spotKey);
    if (!villain) return null;
    var eq = equityMapVs(villain);
    var base = vs3bStackInfo(spotKey, VS3B_BASE_BB);
    var f = impliedFactor(base.spr), score = new Array(169);
    for (var i = 0; i < 169; i++) score[i] = eq[i] + IMPLIED_W * impliedIndex(i) * f;
    var fbC = pf.rangeComboTotal(pf.rangeFromNotation(s.fourBet));
    var contC = fbC + pf.rangeComboTotal(pf.rangeFromNotation(s.call));
    return { eq: eq, fourBet: thresholdAt(eq, fbC), cont: thresholdAt(score, contC) };
  }

  /** 用校準好的門檻算某深度下的 169 map：{ 手牌: 'tb'（4-bet/全下）| 'in'（跟注） } */
  function vs3bDefense(spotKey, effBb, calib) {
    var pf = PF();
    var info = vs3bStackInfo(spotKey, effBb);
    if (!info || !calib) return {};
    var map = {}, i;
    if (info.mode === 'callAllin') {
      // 對手 3-bet 已把你蓋住 → 只剩跟全下 / 棄，門檻就是底池賠率
      for (i = 0; i < 169; i++) {
        if (calib.eq[i] >= info.needEq) map[pf.classLabel(i)] = 'tb';
      }
      return map;
    }
    // 淺籌碼的 4-bet 等於全下 → 門檻往「底池賠率 − 棄牌權益」靠；深籌碼才回到校準值
    var w = clamp01(info.spr / COMMIT_SPR);
    var thr4 = w * calib.fourBet + (1 - w) * Math.max(0, info.needEq - JAM_CREDIT)
      + DEEP_PENALTY * clamp01((info.effBb - 150) / 150); // 深 → 價值範圍收緊
    var f = impliedFactor(info.spr);
    for (i = 0; i < 169; i++) {
      if (calib.eq[i] >= thr4) map[pf.classLabel(i)] = 'tb';
      else if (info.mode === 'normal' &&
               calib.eq[i] + IMPLIED_W * impliedIndex(i) * f >= calib.cont) {
        map[pf.classLabel(i)] = 'in';
      }
    }
    return map;
  }

  var Ranges = {
    DEF_SPOTS: DEF_SPOTS, DEF_SPOT_KEYS: DEF_SPOT_KEYS,
    VS3B_BASE_BB: VS3B_BASE_BB, VS3B_MIN_BB: VS3B_MIN_BB, VS3B_MAX_BB: VS3B_MAX_BB,
    impliedIndex: impliedIndex, vs3bVillainRange: vs3bVillainRange,
    vs3bStackInfo: vs3bStackInfo, vs3bCalibrate: vs3bCalibrate, vs3bDefense: vs3bDefense,
    VS3B_SPOTS: VS3B_SPOTS, VS3B_SPOT_KEYS: VS3B_SPOT_KEYS, callPrice: callPrice,
    RFI_RANGES_6: RFI_RANGES_6, RFI_POS_6: RFI_POS_6,
    RFI_RANGES_9: RFI_RANGES_9, RFI_POS_9: RFI_POS_9,
    cycleState: cycleState, mergeOverride: mergeOverride, diffOverride: diffOverride,
    openerRfiNotation: openerRfiNotation, openerOpenPct: openerOpenPct,
    defenseThresholds: defenseThresholds, dynamicDefense: dynamicDefense
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Ranges;
  else global.Ranges = Ranges;
})(typeof window !== 'undefined' ? window : this);
