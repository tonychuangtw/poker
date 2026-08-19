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
      name: t('HJ vs UTG 開牌'),
      hero: 'HJ', opener: 'UTG', sizeTxt: t('UTG 開 2.5bb（HJ 有位置，後面還有 4 家）'),
      threeBet: 'JJ+ AQs+ AKo A5s',
      call: 'TT-88 AJs ATs KQs KJs QJs JTs T9s AQo'
    },
    co_vs_utg: {
      name: t('CO vs UTG 開牌'),
      hero: 'CO', opener: 'UTG', sizeTxt: t('UTG 開 2.5bb'),
      threeBet: 'JJ+ AQs+ AKo A5s A4s',
      call: 'TT-77 AJs ATs KQs KJs QJs JTs T9s 98s AQo'
    },
    btn_vs_utg: {
      name: t('BTN vs UTG 開牌'),
      hero: 'BTN', opener: 'UTG', sizeTxt: t('UTG 開 2.5bb（BTN 位置最好，可多冷跟）'),
      threeBet: 'TT+ AQs+ AKo A5s A4s',
      call: '99-44 AJs ATs A9s KQs KJs KTs QJs QTs JTs T9s 98s 87s 76s AQo AJo KQo'
    },
    sb_vs_utg: {
      name: t('SB vs UTG 開牌'),
      hero: 'SB', opener: 'UTG', sizeTxt: t('UTG 開 2.5bb（SB 無位置且 BB 在後，以 3-bet 或棄牌為主）'),
      threeBet: 'JJ+ AQs+ AKo A5s A4s',
      call: 'TT-77 AJs KQs KJs QJs JTs'
    },
    bb_vs_utg: {
      name: t('BB vs UTG 開牌'),
      hero: 'BB', opener: 'UTG', sizeTxt: t('UTG 開 2.5bb（BB 防守，收尾行動、價格好）'),
      threeBet: 'QQ+ AKs AKo A5s A4s',
      call: 'JJ-22 AQs-A6s A3s A2s KQs-K7s QJs-Q8s JTs J9s J8s T9s T8s T7s ' +
            '98s 97s 87s 86s 76s 75s 65s 64s 54s 53s 43s AQo-A9o KQo KJo KTo QJo QTo JTo'
    },

    /* ===== 6-max：面對 HJ 開牌 ===== */
    co_vs_hj: {
      name: t('CO vs HJ 開牌'),
      hero: 'CO', opener: 'HJ', sizeTxt: t('HJ 開 2.5bb（CO 有位置）'),
      threeBet: 'TT+ AQs+ AKo A5s A4s',
      call: '99-66 AJs ATs A9s KQs KJs KTs QJs QTs JTs T9s 98s 87s AQo AJo KQo'
    },
    btn_vs_hj: {
      name: t('BTN vs HJ 開牌'),
      hero: 'BTN', opener: 'HJ', sizeTxt: t('HJ 開 2.5bb（BTN 有位置）'),
      threeBet: 'TT+ AQs+ AKo A5s-A3s',
      call: '99-22 AJs ATs A9s KQs KJs KTs QJs QTs JTs T9s 98s 87s 76s 65s 54s AQo AJo KQo'
    },
    sb_vs_hj: {
      name: t('SB vs HJ 開牌'),
      hero: 'SB', opener: 'HJ', sizeTxt: t('HJ 開 2.5bb（SB 無位置，3-bet 為主）'),
      threeBet: 'TT+ AQs+ AKo A5s A4s',
      call: '99-77 AJs ATs KQs KJs QJs JTs T9s'
    },
    bb_vs_hj: {
      name: t('BB vs HJ 開牌'),
      hero: 'BB', opener: 'HJ', sizeTxt: t('HJ 開 2.5bb（BB 防守）'),
      threeBet: 'JJ+ AQs+ AKo A5s A4s',
      call: 'TT-22 AJs ATs A9s-A6s A3s A2s KQs-K6s QJs-Q7s JTs-J7s T9s T8s T7s ' +
            '98s 97s 87s 86s 76s 75s 65s 64s 54s 53s 43s AQo-A8o KQo KJo KTo QJo QTo JTo T9o'
    },

    /* ===== 6-max：面對 CO 開牌 ===== */
    btn_vs_co: {
      name: t('BTN vs CO 開牌'),
      hero: 'BTN', opener: 'CO', sizeTxt: t('CO 開 2.5bb'),
      threeBet: 'TT+ AQs+ AKo A5s-A3s 76s 65s',
      call: '99-22 AJs ATs A9s KQs KJs KTs QJs QTs JTs T9s 98s 87s AQo AJo KQo'
    },
    sb_vs_co: {
      name: t('SB vs CO 開牌'),
      hero: 'SB', opener: 'CO', sizeTxt: t('CO 開 2.5bb（SB 無位置，以 3-bet 為主）'),
      threeBet: '99+ ATs+ A5s-A3s KTs+ QTs+ JTs T9s AJo+ KQo',
      call: '88-66 A9s A8s J9s 98s'
    },
    bb_vs_co: {
      name: t('BB vs CO 開牌'),
      hero: 'BB', opener: 'CO', sizeTxt: t('CO 開 2.5bb（BB 防守）'),
      threeBet: 'TT+ ATs+ A5s-A2s KTs+ QTs+ JTs T9s 98s AJo+ KQo',
      call: '99-22 A9s-A6s K9s-K5s Q9s-Q6s J9s-J7s T8s T7s 97s 96s 87s 86s 76s 75s ' +
            '65s 64s 54s ATo-A7o KTo K9o QTo Q9o JTo J9o T9o'
    },

    /* ===== 6-max：面對 BTN / SB 開牌 ===== */
    sb_vs_btn: {
      name: t('SB vs BTN 開牌'),
      hero: 'SB', opener: 'BTN', sizeTxt: t('BTN 開 2.5bb（SB 以 3-bet 為主）'),
      threeBet: '88+ ATs+ A5s-A2s KTs+ QTs+ JTs T9s 98s 76s 65s AJo+ KQo',
      call: '77-55 A9s A8s J9s 87s'
    },
    bb_vs_btn: {
      name: t('BB vs BTN 開牌'),
      hero: 'BB', opener: 'BTN', sizeTxt: t('BTN 開 2.5bb（BB 防守）'),
      threeBet: '99+ ATs+ A5s-A2s KTs+ QTs+ JTs T9s 98s 87s 76s AJo+ KQo',
      call: '88-22 A9s-A6s K9s-K2s Q9s-Q2s J9s-J6s T8s-T6s 97s-95s 86s-84s ' +
            '75s 74s 65s-63s 54s 53s 43s ATo-A2o KTo K9o QTo Q9o JTo J9o T9o'
    },
    bb_vs_sb: {
      name: t('BB vs SB 開牌'),
      hero: 'BB', opener: 'SB', openBb: 3, sizeTxt: t('SB 開 3bb（BB 防守）'),
      threeBet: '88+ ATs+ A5s-A2s KTs+ QTs+ JTs T9s ATo+ KQo',
      call: '77-22 A9s-A6s K9s-K6s Q9s Q8s J9s J8s T8s 98s 97s 87s 86s 76s 75s ' +
            '65s 54s A9o-A5o KTo K9o QTo JTo T9o'
    },
  /* ===== 9-max Full Ring：面對開牌（現場取向） =====
   * 由 tools/gen-9max-ranges.js 產生，請改產生器後重跑，不要手改這一段。
   * 寬度擬合自 15 個 6-max 情境並套現場調整（冷跟 ×1.15、SB ×0.85、BB ×1.05、3-bet ×0.85），
   * 選牌用 equity + 隱含賠率排序（權重 0.14），3-bet 內含依開牌寬度遞增的 bluff 比例。 */
  utg1_vs_utg9: {
    name: t('UTG+1 vs UTG 開牌（9-max）'), table: 9,
    hero: 'UTG+1', opener: 'UTG',
    sizeTxt: t('現場取向，UTG 開 2.5bb（你後面還有 7 家會行動）'),
    threeBet: 'JJ+ A5s',
    call: 'TT-99 AKs+'
  },
  mp_vs_utg9: {
    name: t('MP vs UTG 開牌（9-max）'), table: 9,
    hero: 'MP', opener: 'UTG',
    sizeTxt: t('現場取向，UTG 開 2.5bb（你後面還有 6 家會行動）'),
    threeBet: 'JJ+ AKs+ A5s',
    call: 'TT-99'
  },
  lj_vs_utg9: {
    name: t('LJ vs UTG 開牌（9-max）'), table: 9,
    hero: 'LJ', opener: 'UTG',
    sizeTxt: t('現場取向，UTG 開 2.5bb（你後面還有 5 家會行動）'),
    threeBet: 'TT+ AKs+ A5s',
    call: '99-88 AQs'
  },
  hj_vs_utg9: {
    name: t('HJ vs UTG 開牌（9-max）'), table: 9,
    hero: 'HJ', opener: 'UTG',
    sizeTxt: t('現場取向，UTG 開 2.5bb（你後面還有 4 家會行動）'),
    threeBet: 'JJ+ AKs+ AKo+',
    call: 'TT-33 AQs-AJs'
  },
  co_vs_utg9: {
    name: t('CO vs UTG 開牌（9-max）'), table: 9,
    hero: 'CO', opener: 'UTG',
    sizeTxt: t('現場取向，UTG 開 2.5bb（你後面還有 3 家會行動）'),
    threeBet: 'JJ+ AKs+ A5s AKo+',
    call: 'TT-22 AQs-ATs KJs+ QTs+ JTs+ AQo'
  },
  btn_vs_utg9: {
    name: t('BTN vs UTG 開牌（9-max）'), table: 9,
    hero: 'BTN', opener: 'UTG',
    sizeTxt: t('現場取向，UTG 開 2.5bb（你後面還有 2 家會行動）'),
    threeBet: 'TT+ AKs+ A5s AKo+',
    call: '99-22 AQs-A9s KJs+ QTs+ J9s+ T8s+ 97s+ 87s+ 76s+ AQo-AJo'
  },
  sb_vs_utg9: {
    name: t('SB vs UTG 開牌（9-max）'), table: 9,
    hero: 'SB', opener: 'UTG',
    sizeTxt: t('現場取向，UTG 開 2.5bb（SB 無位置且 BB 還在後面，冷跟最吃虧）'),
    threeBet: 'JJ+ AKs+ A5s AKo+',
    call: 'TT-66 AQs-AJs'
  },
  bb_vs_utg9: {
    name: t('BB vs UTG 開牌（9-max）'), table: 9,
    hero: 'BB', opener: 'UTG',
    sizeTxt: t('現場取向，UTG 開 2.5bb（BB 收尾行動、價格最好）'),
    threeBet: 'JJ+ AKs+ AKo+',
    call: 'TT-22 AQs-A2s K2s+ Q3s+ J7s+ T6s+ 95s+ 85s+ 74s+ 64s+ 53s+ 42s+ 32s+ ' +
      'AQo-ATo KQo+'
  },
  mp_vs_utg19: {
    name: t('MP vs UTG+1 開牌（9-max）'), table: 9,
    hero: 'MP', opener: 'UTG+1',
    sizeTxt: t('現場取向，UTG+1 開 2.5bb（你後面還有 6 家會行動）'),
    threeBet: 'JJ+ AKs+ A5s',
    call: 'TT-99'
  },
  lj_vs_utg19: {
    name: t('LJ vs UTG+1 開牌（9-max）'), table: 9,
    hero: 'LJ', opener: 'UTG+1',
    sizeTxt: t('現場取向，UTG+1 開 2.5bb（你後面還有 5 家會行動）'),
    threeBet: 'JJ+ AKs+ AKo+',
    call: 'TT-88 AQs'
  },
  hj_vs_utg19: {
    name: t('HJ vs UTG+1 開牌（9-max）'), table: 9,
    hero: 'HJ', opener: 'UTG+1',
    sizeTxt: t('現場取向，UTG+1 開 2.5bb（你後面還有 4 家會行動）'),
    threeBet: 'JJ+ AKs+ A5s AKo+',
    call: 'TT-33 AQs-AJs'
  },
  co_vs_utg19: {
    name: t('CO vs UTG+1 開牌（9-max）'), table: 9,
    hero: 'CO', opener: 'UTG+1',
    sizeTxt: t('現場取向，UTG+1 開 2.5bb（你後面還有 3 家會行動）'),
    threeBet: 'JJ+ AKs+ A5s-A4s AKo+',
    call: 'TT-22 AQs-A9s KJs+ QJs+ JTs+ T9s+ AQo'
  },
  btn_vs_utg19: {
    name: t('BTN vs UTG+1 開牌（9-max）'), table: 9,
    hero: 'BTN', opener: 'UTG+1',
    sizeTxt: t('現場取向，UTG+1 開 2.5bb（你後面還有 2 家會行動）'),
    threeBet: 'TT+ AKs+ A5s AKo+',
    call: '99-22 AQs-A8s KJs+ QTs+ J9s+ T8s+ 97s+ 87s+ 76s+ AQo-AJo'
  },
  sb_vs_utg19: {
    name: t('SB vs UTG+1 開牌（9-max）'), table: 9,
    hero: 'SB', opener: 'UTG+1',
    sizeTxt: t('現場取向，UTG+1 開 2.5bb（SB 無位置且 BB 還在後面，冷跟最吃虧）'),
    threeBet: 'JJ+ AKs+ A5s-A4s AKo+',
    call: 'TT-66 AQs-AJs'
  },
  bb_vs_utg19: {
    name: t('BB vs UTG+1 開牌（9-max）'), table: 9,
    hero: 'BB', opener: 'UTG+1',
    sizeTxt: t('現場取向，UTG+1 開 2.5bb（BB 收尾行動、價格最好）'),
    threeBet: 'JJ+ AKs+ AKo+',
    call: 'TT-22 AQs-A2s K2s+ Q3s+ J7s+ T6s+ 95s+ 85s+ 74s+ 63s+ 53s+ 42s+ 32s+ ' +
      'AQo-ATo KQo+'
  },
  lj_vs_mp9: {
    name: t('LJ vs MP 開牌（9-max）'), table: 9,
    hero: 'LJ', opener: 'MP',
    sizeTxt: t('現場取向，MP 開 2.5bb（你後面還有 5 家會行動）'),
    threeBet: 'JJ+ AKs+ AKo+',
    call: 'TT-77 AQs'
  },
  hj_vs_mp9: {
    name: t('HJ vs MP 開牌（9-max）'), table: 9,
    hero: 'HJ', opener: 'MP',
    sizeTxt: t('現場取向，MP 開 2.5bb（你後面還有 4 家會行動）'),
    threeBet: 'JJ+ AKs+ A5s AKo+',
    call: 'TT-44 AQs-ATs AQo'
  },
  co_vs_mp9: {
    name: t('CO vs MP 開牌（9-max）'), table: 9,
    hero: 'CO', opener: 'MP',
    sizeTxt: t('現場取向，MP 開 2.5bb（你後面還有 3 家會行動）'),
    threeBet: 'JJ+ AKs+ A5s-A4s AKo+',
    call: 'TT-22 AQs-A9s KJs+ JTs+ AQo-AJo'
  },
  btn_vs_mp9: {
    name: t('BTN vs MP 開牌（9-max）'), table: 9,
    hero: 'BTN', opener: 'MP',
    sizeTxt: t('現場取向，MP 開 2.5bb（你後面還有 2 家會行動）'),
    threeBet: 'TT+ AKs+ A5s-A4s AKo+',
    call: '99-22 AQs-A8s KJs+ QTs+ J9s+ T9s+ 98s+ 87s+ 76s+ AQo-ATo'
  },
  sb_vs_mp9: {
    name: t('SB vs MP 開牌（9-max）'), table: 9,
    hero: 'SB', opener: 'MP',
    sizeTxt: t('現場取向，MP 開 2.5bb（SB 無位置且 BB 還在後面，冷跟最吃虧）'),
    threeBet: 'TT+ AKs+ A5s-A4s AKo+',
    call: '99-55 AQs-AJs'
  },
  bb_vs_mp9: {
    name: t('BB vs MP 開牌（9-max）'), table: 9,
    hero: 'BB', opener: 'MP',
    sizeTxt: t('現場取向，MP 開 2.5bb（BB 收尾行動、價格最好）'),
    threeBet: 'TT+ AKs+ A5s AKo+',
    call: '99-22 AQs-A6s A4s-A2s K3s+ Q3s+ J7s+ T6s+ 95s+ 85s+ 74s+ 63s+ 53s+ ' +
      '42s+ 32s+ AQo-A9o KQo+'
  },
  hj_vs_lj9: {
    name: t('HJ vs LJ 開牌（9-max）'), table: 9,
    hero: 'HJ', opener: 'LJ',
    sizeTxt: t('現場取向，LJ 開 2.5bb（你後面還有 4 家會行動）'),
    threeBet: 'JJ+ AKs+ A5s-A4s AKo+',
    call: 'TT-44 AQs-ATs KQs+ AQo'
  },
  co_vs_lj9: {
    name: t('CO vs LJ 開牌（9-max）'), table: 9,
    hero: 'CO', opener: 'LJ',
    sizeTxt: t('現場取向，LJ 開 2.5bb（你後面還有 3 家會行動）'),
    threeBet: 'TT+ AKs+ A5s AKo+',
    call: '99-22 AQs-A8s KJs+ AQo-ATo'
  },
  btn_vs_lj9: {
    name: t('BTN vs LJ 開牌（9-max）'), table: 9,
    hero: 'BTN', opener: 'LJ',
    sizeTxt: t('現場取向，LJ 開 2.5bb（你後面還有 2 家會行動）'),
    threeBet: 'TT+ AKs+ A5s-A4s AKo+',
    call: '99-22 AQs-A6s A3s-A2s KJs+ QTs+ JTs+ T9s+ AQo-ATo'
  },
  sb_vs_lj9: {
    name: t('SB vs LJ 開牌（9-max）'), table: 9,
    hero: 'SB', opener: 'LJ',
    sizeTxt: t('現場取向，LJ 開 2.5bb（SB 無位置且 BB 還在後面，冷跟最吃虧）'),
    threeBet: '99+ AQs+ A5s-A4s AKo+',
    call: '88-55 AJs-ATs KQs+'
  },
  bb_vs_lj9: {
    name: t('BB vs LJ 開牌（9-max）'), table: 9,
    hero: 'BB', opener: 'LJ',
    sizeTxt: t('現場取向，LJ 開 2.5bb（BB 收尾行動、價格最好）'),
    threeBet: 'TT+ AQs+ A5s-A4s AKo+',
    call: '99-22 AJs-A6s A3s-A2s K4s+ Q4s+ J7s+ T6s+ 96s+ 85s+ 74s+ 64s+ 53s+ ' +
      '42s+ 32s+ AQo-A8o KJo+'
  },
  co_vs_hj9: {
    name: t('CO vs HJ 開牌（9-max）'), table: 9,
    hero: 'CO', opener: 'HJ',
    sizeTxt: t('現場取向，HJ 開 2.5bb（你後面還有 3 家會行動）'),
    threeBet: 'TT+ AKs+ A5s-A4s AKo+',
    call: '99-22 AQs-A7s KJs+ AQo-ATo'
  },
  btn_vs_hj9: {
    name: t('BTN vs HJ 開牌（9-max）'), table: 9,
    hero: 'BTN', opener: 'HJ',
    sizeTxt: t('現場取向，HJ 開 2.5bb（你後面還有 2 家會行動）'),
    threeBet: 'TT+ AKs+ A5s-A3s AKo+',
    call: '99-22 AQs-A6s A2s KJs+ QTs+ JTs+ T9s+ AQo-A9o'
  },
  sb_vs_hj9: {
    name: t('SB vs HJ 開牌（9-max）'), table: 9,
    hero: 'SB', opener: 'HJ',
    sizeTxt: t('現場取向，HJ 開 2.5bb（SB 無位置且 BB 還在後面，冷跟最吃虧）'),
    threeBet: '99+ AQs+ A5s-A3s AQo+',
    call: '88-55 AJs-ATs'
  },
  bb_vs_hj9: {
    name: t('BB vs HJ 開牌（9-max）'), table: 9,
    hero: 'BB', opener: 'HJ',
    sizeTxt: t('現場取向，HJ 開 2.5bb（BB 收尾行動、價格最好）'),
    threeBet: 'TT+ AQs+ A5s-A3s AQo+',
    call: '99-22 AJs-A6s A2s K6s+ Q6s+ J7s+ T6s+ 96s+ 86s+ 75s+ 64s+ 53s+ 42s+ ' +
      '32s+ AJo-A5o KJo+'
  },
  btn_vs_co9: {
    name: t('BTN vs CO 開牌（9-max）'), table: 9,
    hero: 'BTN', opener: 'CO',
    sizeTxt: t('現場取向，CO 開 2.5bb（你後面還有 2 家會行動）'),
    threeBet: 'TT+ AQs+ A5s-A3s AKo+',
    call: '99-22 AJs-A6s A2s KTs+ QTs+ JTs+ AQo-A9o KQo+'
  },
  sb_vs_co9: {
    name: t('SB vs CO 開牌（9-max）'), table: 9,
    hero: 'SB', opener: 'CO',
    sizeTxt: t('現場取向，CO 開 2.5bb（SB 無位置且 BB 還在後面，冷跟最吃虧）'),
    threeBet: '99+ ATs+ A5s-A2s AQo+',
    call: '88-44 KQs+'
  },
  bb_vs_co9: {
    name: t('BB vs CO 開牌（9-max）'), table: 9,
    hero: 'BB', opener: 'CO',
    sizeTxt: t('現場取向，CO 開 2.5bb（BB 收尾行動、價格最好）'),
    threeBet: '99+ AJs+ A5s-A2s T9s+ AQo+',
    call: '88-22 ATs-A6s K2s+ Q8s+ J8s+ T8s-T7s 96s+ 86s+ 75s+ 64s+ 53s+ 42s+ ' +
      '32s+ AJo-A5o KTo+'
  },
  sb_vs_btn9: {
    name: t('SB vs BTN 開牌（9-max）'), table: 9,
    hero: 'SB', opener: 'BTN',
    sizeTxt: t('現場取向，BTN 開 2.5bb（SB 無位置且 BB 還在後面，冷跟最吃虧）'),
    threeBet: '66+ A8s+ A5s-A2s KJs+ T9s+ 98s+ 87s+ 76s+ 65s+ 54s+ 43s+ 32s+ AJo+',
    call: '55-33 A7s QJs+'
  },
  bb_vs_btn9: {
    name: t('BB vs BTN 開牌（9-max）'), table: 9,
    hero: 'BB', opener: 'BTN',
    sizeTxt: t('現場取向，BTN 開 2.5bb（BB 收尾行動、價格最好）'),
    threeBet: '77+ A9s+ A5s-A2s KQs+ T9s+ 98s+ 87s+ 76s+ 65s+ 54s+ 43s+ ATo+ KQo+',
    call: '66-22 A8s-A6s KJs-K2s Q7s+ J9s+ T8s 97s 86s 75s 64s A9o-A2o KJo-K8o ' +
      'QTo+'
  },
  bb_vs_sb9: {
    name: t('BB vs SB 開牌（9-max）'), table: 9,
    hero: 'BB', opener: 'SB', openBb: 3,
    sizeTxt: t('現場取向，SB 開 3bb（BB 收尾行動、價格最好）'),
    threeBet: '88+ ATs+ A5s-A2s T9s+ 98s+ 87s+ ATo+',
    call: '77-22 A9s-A6s K2s+ Q8s+ J9s+ T8s 97s 86s 75s+ 64s+ 53s+ 43s+ A9o-A2o ' +
      'K9o+ QJo+'
  },
  };

  /* 顯示與測驗順序：6-max 依「開牌者位置由前到後、hero 由前到後」，之後才是 9-max */
  var DEF_SPOT_KEYS = [
    'hj_vs_utg', 'co_vs_utg', 'btn_vs_utg', 'sb_vs_utg', 'bb_vs_utg', 'co_vs_hj',
    'btn_vs_hj', 'sb_vs_hj', 'bb_vs_hj', 'btn_vs_co', 'sb_vs_co', 'bb_vs_co', 'sb_vs_btn',
    'bb_vs_btn', 'bb_vs_sb',
    'utg1_vs_utg9', 'mp_vs_utg9', 'lj_vs_utg9', 'hj_vs_utg9', 'co_vs_utg9', 'btn_vs_utg9',
    'sb_vs_utg9', 'bb_vs_utg9', 'mp_vs_utg19', 'lj_vs_utg19', 'hj_vs_utg19', 'co_vs_utg19',
    'btn_vs_utg19', 'sb_vs_utg19', 'bb_vs_utg19', 'lj_vs_mp9', 'hj_vs_mp9', 'co_vs_mp9',
    'btn_vs_mp9', 'sb_vs_mp9', 'bb_vs_mp9', 'hj_vs_lj9', 'co_vs_lj9', 'btn_vs_lj9',
    'sb_vs_lj9', 'bb_vs_lj9', 'co_vs_hj9', 'btn_vs_hj9', 'sb_vs_hj9', 'bb_vs_hj9',
    'btn_vs_co9', 'sb_vs_co9', 'bb_vs_co9', 'sb_vs_btn9', 'bb_vs_btn9', 'bb_vs_sb9'
  ];

  /* ---------- 被 3-bet（自己開牌後遭 3-bet）的 4-bet / 跟注 range ----------
   * 狀態沿用防守圖：'tb' = 加注（此處為 4-bet）、'in' = 跟注、未列出 = 蓋牌。
   * openBb / tbBb / deadBb 用來算跟注的底池賠率（callPrice）。 */
  var VS3B_SPOTS = {
    co_vs_bb3b: {
      name: t('CO 開牌 vs BB 3-bet'),
      hero: 'CO', villain: 'BB', villainSpot: 'bb_vs_co',
      openBb: 2.5, tbBb: 12, deadBb: 0.5,
      note: t('BB 3-bet 範圍最寬（有 MDF 壓力），CO 有位置 → 跟注為主、4-bet 偏價值'),
      fourBet: 'QQ+ AKs AKo A5s',
      call: 'JJ-77 AQs AJs ATs KQs KJs QJs QTs JTs T9s 98s 87s AQo AJo KQo'
    },
    co_vs_sb3b: {
      name: t('CO 開牌 vs SB 3-bet'),
      hero: 'CO', villain: 'SB', villainSpot: 'sb_vs_co',
      openBb: 2.5, tbBb: 11, deadBb: 1,
      note: t('SB 3-bet 比 BB 緊且更兩極化，續玩要再收一點'),
      fourBet: 'QQ+ AKs AKo A5s A4s',
      call: 'JJ-88 AQs AJs ATs KQs KJs KTs QJs QTs JTs T9s 98s AQo AJo KQo'
    },
    co_vs_btn3b: {
      name: t('CO 開牌 vs BTN 3-bet'),
      hero: 'CO', villain: 'BTN', villainSpot: 'btn_vs_co',
      openBb: 2.5, tbBb: 8, deadBb: 1.5,
      note: t('BTN 3-bet 較小（約 3x）但有位置；價格好卻整局無位置，冷跟要更嚴'),
      fourBet: 'QQ+ AKs AKo A5s A4s',
      call: 'JJ-77 AQs AJs ATs KQs KJs QJs JTs T9s 98s AQo KQo'
    },
    btn_vs_sb3b: {
      name: t('BTN 開牌 vs SB 3-bet'),
      hero: 'BTN', villain: 'SB', villainSpot: 'sb_vs_btn',
      openBb: 2.5, tbBb: 11, deadBb: 1,
      note: t('BTN 開牌很寬，被 3-bet 必須棄掉大量邊緣牌；有位置 → 小對子/同花連張可跟'),
      fourBet: 'JJ+ AQs+ AKo A5s A4s',
      call: 'TT-44 AJs ATs A9s KQs KJs KTs QJs QTs JTs T9s 98s 87s 76s 65s 54s AQo AJo KQo'
    },
    btn_vs_bb3b: {
      name: t('BTN 開牌 vs BB 3-bet'),
      hero: 'BTN', villain: 'BB', villainSpot: 'bb_vs_btn',
      openBb: 2.5, tbBb: 12, deadBb: 0.5,
      note: t('BB 3-bet 最寬，BTN 有位置 → 續玩最寬的一格'),
      fourBet: 'JJ+ AQs+ AKo A5s A4s',
      call: 'TT-22 AJs ATs A9s A8s KQs KJs KTs K9s QJs QTs Q9s JTs J9s T9s T8s ' +
            '98s 87s 76s 65s 54s AQo AJo KQo KJo'
    },
    sb_vs_bb3b: {
      name: t('SB 開牌 vs BB 3-bet'),
      hero: 'SB', villain: 'BB', villainSpot: 'bb_vs_sb',
      openBb: 3, tbBb: 12, deadBb: 0,
      note: t('SB 開牌寬又整局無位置，被 BB 3-bet 只留能打得舒服的牌，其餘 4-bet 或棄'),
      fourBet: 'JJ+ AQs+ AKo A5s A4s',
      call: 'TT-77 AJs ATs KQs KJs QJs JTs T9s 98s AQo AJo'
    },

  /* ===== 6-max：被 3-bet 的補齊格（同一支產生器） =====
   * 手寫的 6 格（CO / BTN / SB 開牌）在上面，這裡是 UTG / HJ 開牌被 3-bet 的部分，
   * 續玩寬度 = 對手 3-bet 寬度 × 手寫 6 格量出的比例（4-bet 0.357、跟注 0.886）。 */
  utg_vs_hj3b: {
    name: t('UTG 開牌 vs HJ 3-bet'),
    hero: 'UTG', villain: 'HJ', villainSpot: 'hj_vs_utg',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('HJ 在這裡的 3-bet 約 3.6%；對方翻後有位置、你整局無位置 → 續玩要收窄，打不舒服的牌寧可棄或直接 4-bet'),
    fourBet: 'QQ+',
    call: 'JJ-88 AKs+ AKo+'
  },
  utg_vs_co3b: {
    name: t('UTG 開牌 vs CO 3-bet'),
    hero: 'UTG', villain: 'CO', villainSpot: 'co_vs_utg',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('CO 在這裡的 3-bet 約 3.9%；對方翻後有位置、你整局無位置 → 續玩要收窄，打不舒服的牌寧可棄或直接 4-bet'),
    fourBet: 'QQ+ A5s',
    call: 'JJ-55 AKs+ AKo+'
  },
  utg_vs_btn3b: {
    name: t('UTG 開牌 vs BTN 3-bet'),
    hero: 'UTG', villain: 'BTN', villainSpot: 'btn_vs_utg',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('BTN 在這裡的 3-bet 約 4.4%；對方翻後有位置、你整局無位置 → 續玩要收窄，打不舒服的牌寧可棄或直接 4-bet'),
    fourBet: 'QQ+ AKs+',
    call: 'JJ-66 AKo+'
  },
  utg_vs_sb3b: {
    name: t('UTG 開牌 vs SB 3-bet'),
    hero: 'UTG', villain: 'SB', villainSpot: 'sb_vs_utg',
    openBb: 2.5, tbBb: 11, deadBb: 1,
    note: t('SB 在這裡的 3-bet 約 3.9%；你翻後有位置 → 邊緣牌用跟注續玩，4-bet 留給價值與阻斷牌'),
    fourBet: 'QQ+ A5s',
    call: 'JJ-77 AKs+ AKo+'
  },
  utg_vs_bb3b: {
    name: t('UTG 開牌 vs BB 3-bet'),
    hero: 'UTG', villain: 'BB', villainSpot: 'bb_vs_utg',
    openBb: 2.5, tbBb: 12, deadBb: 0.5,
    note: t('BB 在這裡的 3-bet 約 3.2%；你翻後有位置 → 邊緣牌用跟注續玩，4-bet 留給價值與阻斷牌'),
    fourBet: 'KK+ AKs+',
    call: 'QQ-99 AKo+'
  },
  hj_vs_co3b: {
    name: t('HJ 開牌 vs CO 3-bet'),
    hero: 'HJ', villain: 'CO', villainSpot: 'co_vs_hj',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('CO 在這裡的 3-bet 約 4.4%；對方翻後有位置、你整局無位置 → 續玩要收窄，打不舒服的牌寧可棄或直接 4-bet'),
    fourBet: 'QQ+ AKs+',
    call: 'JJ-66 AKo+'
  },
  hj_vs_btn3b: {
    name: t('HJ 開牌 vs BTN 3-bet'),
    hero: 'HJ', villain: 'BTN', villainSpot: 'btn_vs_hj',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('BTN 在這裡的 3-bet 約 4.7%；對方翻後有位置、你整局無位置 → 續玩要收窄，打不舒服的牌寧可棄或直接 4-bet'),
    fourBet: 'QQ+ AKs+ A5s',
    call: 'JJ-55 AQs AKo+'
  },
  hj_vs_sb3b: {
    name: t('HJ 開牌 vs SB 3-bet'),
    hero: 'HJ', villain: 'SB', villainSpot: 'sb_vs_hj',
    openBb: 2.5, tbBb: 11, deadBb: 1,
    note: t('SB 在這裡的 3-bet 約 4.4%；你翻後有位置 → 邊緣牌用跟注續玩，4-bet 留給價值與阻斷牌'),
    fourBet: 'QQ+ AKs+',
    call: 'JJ-66 AKo+'
  },
  hj_vs_bb3b: {
    name: t('HJ 開牌 vs BB 3-bet'),
    hero: 'HJ', villain: 'BB', villainSpot: 'bb_vs_hj',
    openBb: 2.5, tbBb: 12, deadBb: 0.5,
    note: t('BB 在這裡的 3-bet 約 3.9%；你翻後有位置 → 邊緣牌用跟注續玩，4-bet 留給價值與阻斷牌'),
    fourBet: 'QQ+ A5s',
    call: 'JJ-77 AKs+ AKo+'
  },
  /* ===== 9-max Full Ring：被 3-bet（同一支產生器） ===== */
  utg_vs_utg13b9: {
    name: t('UTG 開牌 vs UTG+1 3-bet（9-max）'), table: 9,
    hero: 'UTG', villain: 'UTG+1', villainSpot: 'utg1_vs_utg9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：UTG+1 在這裡的 3-bet 只有 2.1%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'ATs+ KQs+'
  },
  utg_vs_mp3b9: {
    name: t('UTG 開牌 vs MP 3-bet（9-max）'), table: 9,
    hero: 'UTG', villain: 'MP', villainSpot: 'mp_vs_utg9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：MP 在這裡的 3-bet 只有 2.4%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ ATs+ KQs+'
  },
  utg_vs_lj3b9: {
    name: t('UTG 開牌 vs LJ 3-bet（9-max）'), table: 9,
    hero: 'UTG', villain: 'LJ', villainSpot: 'lj_vs_utg9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：LJ 在這裡的 3-bet 只有 2.9%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ ATs+ KJs+'
  },
  utg_vs_hj3b9: {
    name: t('UTG 開牌 vs HJ 3-bet（9-max）'), table: 9,
    hero: 'UTG', villain: 'HJ', villainSpot: 'hj_vs_utg9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：HJ 在這裡的 3-bet 只有 3.0%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-99 AKs+ 76s+ 65s+ 54s+'
  },
  utg_vs_co3b9: {
    name: t('UTG 開牌 vs CO 3-bet（9-max）'), table: 9,
    hero: 'UTG', villain: 'CO', villainSpot: 'co_vs_utg9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：CO 在這裡的 3-bet 只有 3.3%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-99 AKs+ AKo+'
  },
  utg_vs_btn3b9: {
    name: t('UTG 開牌 vs BTN 3-bet（9-max）'), table: 9,
    hero: 'UTG', villain: 'BTN', villainSpot: 'btn_vs_utg9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：BTN 在這裡的 3-bet 只有 3.8%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-88 AKs+ AKo+'
  },
  utg_vs_sb3b9: {
    name: t('UTG 開牌 vs SB 3-bet（9-max）'), table: 9,
    hero: 'UTG', villain: 'SB', villainSpot: 'sb_vs_utg9',
    openBb: 2.5, tbBb: 11, deadBb: 1,
    note: t('9-max 現場：SB 在這裡的 3-bet 只有 3.3%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-99 AKs+ AKo+'
  },
  utg_vs_bb3b9: {
    name: t('UTG 開牌 vs BB 3-bet（9-max）'), table: 9,
    hero: 'UTG', villain: 'BB', villainSpot: 'bb_vs_utg9',
    openBb: 2.5, tbBb: 12, deadBb: 0.5,
    note: t('9-max 現場：BB 在這裡的 3-bet 只有 3.0%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-99 AKs+ 76s+ 65s+ 54s+'
  },
  utg1_vs_mp3b9: {
    name: t('UTG+1 開牌 vs MP 3-bet（9-max）'), table: 9,
    hero: 'UTG+1', villain: 'MP', villainSpot: 'mp_vs_utg19',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：MP 在這裡的 3-bet 只有 2.4%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ ATs+ KQs+'
  },
  utg1_vs_lj3b9: {
    name: t('UTG+1 開牌 vs LJ 3-bet（9-max）'), table: 9,
    hero: 'UTG+1', villain: 'LJ', villainSpot: 'lj_vs_utg19',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：LJ 在這裡的 3-bet 只有 3.0%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-99 AKs+ 76s+ 65s+ 54s+'
  },
  utg1_vs_hj3b9: {
    name: t('UTG+1 開牌 vs HJ 3-bet（9-max）'), table: 9,
    hero: 'UTG+1', villain: 'HJ', villainSpot: 'hj_vs_utg19',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：HJ 在這裡的 3-bet 只有 3.3%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-99 AKs+ AKo+'
  },
  utg1_vs_co3b9: {
    name: t('UTG+1 開牌 vs CO 3-bet（9-max）'), table: 9,
    hero: 'UTG+1', villain: 'CO', villainSpot: 'co_vs_utg19',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：CO 在這裡的 3-bet 只有 3.6%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-88 AKs+ AKo+'
  },
  utg1_vs_btn3b9: {
    name: t('UTG+1 開牌 vs BTN 3-bet（9-max）'), table: 9,
    hero: 'UTG+1', villain: 'BTN', villainSpot: 'btn_vs_utg19',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：BTN 在這裡的 3-bet 只有 3.8%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-88 AKs+ AKo+'
  },
  utg1_vs_sb3b9: {
    name: t('UTG+1 開牌 vs SB 3-bet（9-max）'), table: 9,
    hero: 'UTG+1', villain: 'SB', villainSpot: 'sb_vs_utg19',
    openBb: 2.5, tbBb: 11, deadBb: 1,
    note: t('9-max 現場：SB 在這裡的 3-bet 只有 3.6%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-88 AKs+ AKo+'
  },
  utg1_vs_bb3b9: {
    name: t('UTG+1 開牌 vs BB 3-bet（9-max）'), table: 9,
    hero: 'UTG+1', villain: 'BB', villainSpot: 'bb_vs_utg19',
    openBb: 2.5, tbBb: 12, deadBb: 0.5,
    note: t('9-max 現場：BB 在這裡的 3-bet 只有 3.0%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-99 AKs+ 76s+ 65s+ 54s+'
  },
  mp_vs_lj3b9: {
    name: t('MP 開牌 vs LJ 3-bet（9-max）'), table: 9,
    hero: 'MP', villain: 'LJ', villainSpot: 'lj_vs_mp9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：LJ 在這裡的 3-bet 只有 3.0%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-99 AKs+ 76s+ 65s+ 54s+'
  },
  mp_vs_hj3b9: {
    name: t('MP 開牌 vs HJ 3-bet（9-max）'), table: 9,
    hero: 'MP', villain: 'HJ', villainSpot: 'hj_vs_mp9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：HJ 在這裡的 3-bet 只有 3.3%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-99 AKs+ AKo+'
  },
  mp_vs_co3b9: {
    name: t('MP 開牌 vs CO 3-bet（9-max）'), table: 9,
    hero: 'MP', villain: 'CO', villainSpot: 'co_vs_mp9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：CO 在這裡的 3-bet 只有 3.6%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-88 AKs+ AKo+'
  },
  mp_vs_btn3b9: {
    name: t('MP 開牌 vs BTN 3-bet（9-max）'), table: 9,
    hero: 'MP', villain: 'BTN', villainSpot: 'btn_vs_mp9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：BTN 在這裡的 3-bet 只有 4.1%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-88 AKs+ AKo+'
  },
  mp_vs_sb3b9: {
    name: t('MP 開牌 vs SB 3-bet（9-max）'), table: 9,
    hero: 'MP', villain: 'SB', villainSpot: 'sb_vs_mp9',
    openBb: 2.5, tbBb: 11, deadBb: 1,
    note: t('9-max 現場：SB 在這裡的 3-bet 只有 4.1%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-88 AKs+ AKo+'
  },
  mp_vs_bb3b9: {
    name: t('MP 開牌 vs BB 3-bet（9-max）'), table: 9,
    hero: 'MP', villain: 'BB', villainSpot: 'bb_vs_mp9',
    openBb: 2.5, tbBb: 12, deadBb: 0.5,
    note: t('9-max 現場：BB 在這裡的 3-bet 只有 3.8%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-66 AKs+'
  },
  lj_vs_hj3b9: {
    name: t('LJ 開牌 vs HJ 3-bet（9-max）'), table: 9,
    hero: 'LJ', villain: 'HJ', villainSpot: 'hj_vs_lj9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：HJ 在這裡的 3-bet 只有 3.6%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-88 AKs+ AKo+'
  },
  lj_vs_co3b9: {
    name: t('LJ 開牌 vs CO 3-bet（9-max）'), table: 9,
    hero: 'LJ', villain: 'CO', villainSpot: 'co_vs_lj9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：CO 在這裡的 3-bet 只有 3.8%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-88 AKs+ AKo+'
  },
  lj_vs_btn3b9: {
    name: t('LJ 開牌 vs BTN 3-bet（9-max）'), table: 9,
    hero: 'LJ', villain: 'BTN', villainSpot: 'btn_vs_lj9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：BTN 在這裡的 3-bet 只有 4.1%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-88 AKs+ AKo+'
  },
  lj_vs_sb3b9: {
    name: t('LJ 開牌 vs SB 3-bet（9-max）'), table: 9,
    hero: 'LJ', villain: 'SB', villainSpot: 'sb_vs_lj9',
    openBb: 2.5, tbBb: 11, deadBb: 1,
    note: t('9-max 現場：SB 在這裡的 3-bet 只有 4.8%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+ A5s',
    call: 'JJ-66 AKs+ AKo+'
  },
  lj_vs_bb3b9: {
    name: t('LJ 開牌 vs BB 3-bet（9-max）'), table: 9,
    hero: 'LJ', villain: 'BB', villainSpot: 'bb_vs_lj9',
    openBb: 2.5, tbBb: 12, deadBb: 0.5,
    note: t('9-max 現場：BB 在這裡的 3-bet 只有 4.4%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-77 AKs+ AKo+'
  },
  hj_vs_co3b9: {
    name: t('HJ 開牌 vs CO 3-bet（9-max）'), table: 9,
    hero: 'HJ', villain: 'CO', villainSpot: 'co_vs_hj9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：CO 在這裡的 3-bet 只有 4.1%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-88 AKs+ AKo+'
  },
  hj_vs_btn3b9: {
    name: t('HJ 開牌 vs BTN 3-bet（9-max）'), table: 9,
    hero: 'HJ', villain: 'BTN', villainSpot: 'btn_vs_hj9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：BTN 在這裡的 3-bet 只有 4.4%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+',
    call: 'JJ-88 AQs+ AKo+'
  },
  hj_vs_sb3b9: {
    name: t('HJ 開牌 vs SB 3-bet（9-max）'), table: 9,
    hero: 'HJ', villain: 'SB', villainSpot: 'sb_vs_hj9',
    openBb: 2.5, tbBb: 11, deadBb: 1,
    note: t('9-max 現場：SB 在這裡的 3-bet 只有 6.0%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+ AKs+ A5s',
    call: 'JJ-44 AQs AKo+'
  },
  hj_vs_bb3b9: {
    name: t('HJ 開牌 vs BB 3-bet（9-max）'), table: 9,
    hero: 'HJ', villain: 'BB', villainSpot: 'bb_vs_hj9',
    openBb: 2.5, tbBb: 12, deadBb: 0.5,
    note: t('9-max 現場：BB 在這裡的 3-bet 只有 5.6%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+ AKs+ A5s',
    call: 'JJ-44 AKo+'
  },
  co_vs_btn3b9: {
    name: t('CO 開牌 vs BTN 3-bet（9-max）'), table: 9,
    hero: 'CO', villain: 'BTN', villainSpot: 'btn_vs_co9',
    openBb: 2.5, tbBb: 8, deadBb: 1.5,
    note: t('9-max 現場：BTN 在這裡的 3-bet 只有 4.7%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'QQ+ A5s',
    call: 'JJ-77 AQs+ AKo+'
  },
  co_vs_sb3b9: {
    name: t('CO 開牌 vs SB 3-bet（9-max）'), table: 9,
    hero: 'CO', villain: 'SB', villainSpot: 'sb_vs_co9',
    openBb: 2.5, tbBb: 11, deadBb: 1,
    note: t('9-max 現場：SB 在這裡的 3-bet 只有 6.9%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'JJ+ AKs+',
    call: 'TT-44 AQs AQo+'
  },
  co_vs_bb3b9: {
    name: t('CO 開牌 vs BB 3-bet（9-max）'), table: 9,
    hero: 'CO', villain: 'BB', villainSpot: 'bb_vs_co9',
    openBb: 2.5, tbBb: 12, deadBb: 0.5,
    note: t('9-max 現場：BB 在這裡的 3-bet 只有 6.9%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'JJ+ AKs+',
    call: 'TT-44 AQs AQo+'
  },
  btn_vs_sb3b9: {
    name: t('BTN 開牌 vs SB 3-bet（9-max）'), table: 9,
    hero: 'BTN', villain: 'SB', villainSpot: 'sb_vs_btn9',
    openBb: 2.5, tbBb: 11, deadBb: 1,
    note: t('9-max 現場：SB 在這裡的 3-bet 只有 12.8%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'TT+ AKs+ A5s-A4s AKo+',
    call: '99-22 AQs-A7s KTs+ QTs+ JTs+ T9s+ AQo-ATo'
  },
  btn_vs_bb3b9: {
    name: t('BTN 開牌 vs BB 3-bet（9-max）'), table: 9,
    hero: 'BTN', villain: 'BB', villainSpot: 'bb_vs_btn9',
    openBb: 2.5, tbBb: 12, deadBb: 0.5,
    note: t('9-max 現場：BB 在這裡的 3-bet 只有 13.3%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'TT+ AKs+ A5s-A4s AKo+',
    call: '99-22 AQs-A8s KJs+ QTs+ J9s+ T8s+ 98s+ AQo-ATo'
  },
  sb_vs_bb3b9: {
    name: t('SB 開牌 vs BB 3-bet（9-max）'), table: 9,
    hero: 'SB', villain: 'BB', villainSpot: 'bb_vs_sb9',
    openBb: 3, tbBb: 14.5, deadBb: 0.5,
    note: t('9-max 現場：BB 在這裡的 3-bet 只有 10.1%，偏價值 —— 被 3-bet 時多半真的被更強的 range 打，續玩要比 6-max 收得多'),
    fourBet: 'JJ+ AKs+ A5s AKo+',
    call: 'TT-22 AQs-ATs KJs+ QJs+ AQo-AJo'
  },
  };

  var VS3B_SPOT_KEYS = [
    'utg_vs_hj3b', 'utg_vs_co3b', 'utg_vs_btn3b', 'utg_vs_sb3b', 'utg_vs_bb3b',
    'hj_vs_co3b', 'hj_vs_btn3b', 'hj_vs_sb3b', 'hj_vs_bb3b', 'co_vs_btn3b', 'co_vs_sb3b',
    'co_vs_bb3b', 'btn_vs_sb3b', 'btn_vs_bb3b', 'sb_vs_bb3b', 'utg_vs_utg13b9',
    'utg_vs_mp3b9', 'utg_vs_lj3b9', 'utg_vs_hj3b9', 'utg_vs_co3b9', 'utg_vs_btn3b9',
    'utg_vs_sb3b9', 'utg_vs_bb3b9', 'utg1_vs_mp3b9', 'utg1_vs_lj3b9', 'utg1_vs_hj3b9',
    'utg1_vs_co3b9', 'utg1_vs_btn3b9', 'utg1_vs_sb3b9', 'utg1_vs_bb3b9', 'mp_vs_lj3b9',
    'mp_vs_hj3b9', 'mp_vs_co3b9', 'mp_vs_btn3b9', 'mp_vs_sb3b9', 'mp_vs_bb3b9',
    'lj_vs_hj3b9', 'lj_vs_co3b9', 'lj_vs_btn3b9', 'lj_vs_sb3b9', 'lj_vs_bb3b9',
    'hj_vs_co3b9', 'hj_vs_btn3b9', 'hj_vs_sb3b9', 'hj_vs_bb3b9', 'co_vs_btn3b9',
    'co_vs_sb3b9', 'co_vs_bb3b9', 'btn_vs_sb3b9', 'btn_vs_bb3b9', 'sb_vs_bb3b9'
  ];

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

  /* ---------- 家族單調化 ----------
   * 「對子」「同高牌的同花」「同高牌的雜色」各自是一個家族，家族內由強到弱排。
   * 直接拿分數切門檻會切出破洞：impliedIndex 在 99 以下跳一階（1.0 vs 0.5），
   * 99 的加成比 TT 大，排序就翻過來，圖上會出現「JJ 跟注、TT 蓋牌、99 跟注」。
   * 這裡把每個家族的分數由強到弱取累進最小值，任何門檻切下去都保證是連續一段。 */
  var FAMILIES = (function () {
    var fams = [], h, k, fam = [];
    for (h = 0; h < 13; h++) fam.push(h * 13 + h);
    fams.push(fam);
    for (h = 0; h < 12; h++) {
      fam = [];
      for (k = h + 1; k < 13; k++) fam.push(h * 13 + k);   // 同花
      fams.push(fam);
      fam = [];
      for (k = h + 1; k < 13; k++) fam.push(k * 13 + h);   // 雜色
      fams.push(fam);
    }
    return fams;
  })();

  /* 單調化會壓出「同分平台」（例如面對很窄的 3-bet range 時，22–99 的 equity 幾乎一樣，
   * 一路被壓成同一個值）。門檻是「score >= thr」，同分平台會一次整排掃進來 ——
   * 目標 52 combo 卻拿到 94 combo，圖上就變成「JJ-22 全部跟注」。
   * 這裡在單調化後減掉 index × 1e-9，讓同分平台變成嚴格遞減、門檻切得準；
   * index 在家族內就是由強到弱，所以切出來仍是連續一段。 */
  var TIE_EPS = 1e-9;

  function monotoneFamilies(arr) {
    var out = arr.slice();
    for (var f = 0; f < FAMILIES.length; f++) {
      var fam = FAMILIES[f];
      for (var i = 1; i < fam.length; i++) {
        if (out[fam[i]] > out[fam[i - 1]]) out[fam[i]] = out[fam[i - 1]];
      }
    }
    for (var j = 0; j < out.length; j++) out[j] -= j * TIE_EPS;
    return out;
  }

  /** 選 range 用的 equity（已單調化） */
  function selectionEq(villainClasses) {
    return monotoneFamilies(equityMapVs(villainClasses));
  }
  /** 選 range 用的「equity + 隱含賠率加成」（已單調化） */
  function selectionScore(eq, w, f) {
    var s = new Array(169);
    for (var i = 0; i < 169; i++) s[i] = eq[i] + w * impliedIndex(i) * f;
    return monotoneFamilies(s);
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

  /** 防守圖的校準：3-bet 門檻看 raw equity、續玩門檻看 equity + 100bb 的隱含加成。
   * 回傳 { tb, cont, sprBase }，供 defenseAtDepth 在任何深度重算。 */
  function defenseCalibrate(spotKey, villainClasses, tbCombos, contCombos) {
    var eq = selectionEq(villainClasses);
    var base = defStackInfo(spotKey, VS3B_BASE_BB);
    var score = selectionScore(eq, IMPLIED_W, 1);
    var tbThr = thresholdAt(eq, tbCombos);
    var contThr = thresholdAt(score, contCombos);
    return { tb: tbThr, cont: contThr, sprBase: base ? base.spr : 0 };
  }

  /* ---------- 被 3-bet：籌碼深度試算（10–300bb，純函式） ----------
   * 100bb 的建議表當基準，其餘深度用同一組門檻重算，規則寫明如下：
   *   3-bet 實際大小 = min(表定大小, 有效籌碼)   籌碼不夠時 3-bet 就是全下
   *   底池 = 3-bet 大小 × 2 + 死錢；跟注後 SPR = (有效籌碼 - 3-bet 大小) / 底池
   *   排序分數 = equity(對上對手 3-bet range) + 隱含賠率加成
   *   隱含賠率加成 = IMPLIED_W × 隱含指數(手牌) × 深度係數
   *   深度係數 = √(該深度的 SPR ÷ 同情境 100bb 的 SPR)（上限 DEEP_FACTOR_CAP）
   *     → 100bb 剛好是 1.0，也就是建議表的校準點
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
  var DEEP_FACTOR_CAP = 1.6; // 深籌碼的隱含賠率加成上限（以 100bb 為 1.0）
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

  /** 隱含賠率加成係數：以同情境 100bb 為 1.0，開根號表示「深度的邊際效益遞減」，
   * 深籌碼最多放大到 DEEP_FACTOR_CAP。 */
  function depthCurve(ratio) {
    return Math.min(DEEP_FACTOR_CAP, Math.sqrt(Math.max(0, ratio)));
  }
  function impliedFactor(spr, sprBase) {
    return sprBase > 0 ? depthCurve(spr / sprBase) : 0;
  }

  /** 於 100bb 用建議表校準門檻：4-bet 看 raw equity、續玩看 equity + 隱含加成 */
  function vs3bCalibrate(spotKey) {
    var pf = PF(), s = VS3B_SPOTS[spotKey];
    var villain = vs3bVillainRange(spotKey);
    if (!villain) return null;
    var eq = selectionEq(villain);
    var base = vs3bStackInfo(spotKey, VS3B_BASE_BB);
    var score = selectionScore(eq, IMPLIED_W, 1);   // 校準點：100bb 的深度係數定義為 1.0
    var fbC = pf.rangeComboTotal(pf.rangeFromNotation(s.fourBet));
    var contC = fbC + pf.rangeComboTotal(pf.rangeFromNotation(s.call));
    return { eq: eq, sprBase: base.spr,
             fourBet: thresholdAt(eq, fbC), cont: thresholdAt(score, contC) };
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
    var thr4 = aggroThreshold(calib.fourBet, info.spr, info.needEq, info.effBb);
    var f = impliedFactor(info.spr, calib.sprBase);
    var score = selectionScore(calib.eq, IMPLIED_W, f);
    for (i = 0; i < 169; i++) {
      if (calib.eq[i] >= thr4) map[pf.classLabel(i)] = 'tb';
      else if (info.mode === 'normal' && score[i] >= calib.cont) {
        map[pf.classLabel(i)] = 'in';
      }
    }
    return map;
  }

  /* ---------- 開牌 RFI 的籌碼深度規則（10–300bb，純函式） ----------
   * 深度改變的是「組成」，不是寬度 —— 寬度仍由圖上的 % 滑桿（或建議表）決定。
   *   排序分數 = equity(對上會續玩的範圍 top RFI_VILLAIN_PCT%) + 隱含賠率加成
   *   加成 = IMPLIED_W × 隱含指數 × 深度係數（= √(籌碼 ÷ 100bb)，上限 DEEP_FACTOR_CAP）
   *     → 淺籌碼：等於純攤牌 equity 排序，A 高牌與雜色大牌擠進來、同花小連張掉出去
   *     → 深籌碼：同花連張、小對子（打中就贏一整疊）擠進來，雜色邊緣牌掉出去
   *   RFI_JAM_BB 以下標成「開牌 = 全下」：那個深度的開牌實務上就是 jam，
   *   排序邏輯本來就已經退化成攤牌 equity，剛好一致。 */

  var RFI_JAM_BB = 20;        // 20bb 以下：開牌等於全下
  var RFI_VILLAIN_PCT = 20;   // 參考對手「會續玩」的範圍寬度

  var rfiEqCache = null;
  function rfiVillainEq() {
    if (!rfiEqCache) rfiEqCache = selectionEq(PF().topPercentRange(RFI_VILLAIN_PCT));
    return rfiEqCache;
  }

  function clampBb(bb) {
    return Math.min(VS3B_MAX_BB, Math.max(VS3B_MIN_BB, bb));
  }
  function rfiDepthFactor(bb) {
    return depthCurve(clampBb(bb) / VS3B_BASE_BB);
  }
  function rfiStackInfo(bb) {
    var eff = clampBb(bb);
    return { effBb: eff, factor: rfiDepthFactor(eff), mode: eff <= RFI_JAM_BB ? 'jam' : 'raise' };
  }

  /** 某深度下的開牌 range：維持 targetCombos 的寬度，組成依深度重排。
   * 回傳 { 手牌標籤: 'in' }，未列出 = 不開。 */
  function rfiAtDepth(targetCombos, bb) {
    var pf = PF(), f = rfiDepthFactor(bb);
    var score = selectionScore(rfiVillainEq(), IMPLIED_W, f), i;
    var thr = thresholdAt(score, targetCombos);
    var map = {};
    for (i = 0; i < 169; i++) if (score[i] >= thr) map[pf.classLabel(i)] = 'in';
    return map;
  }

  /* ---------- 面對開牌（防守）的籌碼深度規則（10–300bb，純函式） ----------
   * 與「被 3-bet」同一套規則，只是換成面對 open：
   *   跟注要補的錢 = 開牌大小 − 自己已投入的盲注；底池 = 開牌大小 × 2 + 死錢
   *   3-bet 大小 = 開牌 × (無位置 4 倍 / 有位置 3 倍)，被籌碼蓋住就是全下
   *   跟注門檻吃隱含賠率加成（隨跟注後 SPR）→ 深籌碼跟得寬、淺籌碼先掉小對子與同花連張
   *   3-bet 門檻在「100bb 校準值」與「底池賠率 − 棄牌權益」之間依 3-bet 後的 SPR 內插
   *     → 3-bet 等於全下時範圍明顯放寬；深於 150bb 再收緊
   *   跟注後 SPR < JAM_SPR → 沒有平跟，只剩 3-bet 全下 / 棄牌 */

  var DEF_3BET_MULT_OOP = 4, DEF_3BET_MULT_IP = 3;

  /** 該防守情境的開牌大小（bb）；只有 SB 開牌是 3bb，其餘 2.5bb */
  function defOpenBb(spot) { return spot.openBb || 2.5; }

  /** hero 位置決定已投入的盲注與桌上的死錢 */
  function defBlinds(hero) {
    if (hero === 'BB') return { post: 1, dead: 0.5 };
    if (hero === 'SB') return { post: 0.5, dead: 1 };
    return { post: 0, dead: 1.5 };
  }

  /** 某有效籌碼下的防守局面數字：跟注額、底池、賠率、SPR、3-bet 大小與模式 */
  function defStackInfo(spotKey, bb) {
    var spot = DEF_SPOTS[spotKey];
    if (!spot) return null;
    var eff = clampBb(bb);
    var open = Math.min(defOpenBb(spot), eff);
    var b = defBlinds(spot.hero);
    var oop = spot.hero === 'SB' || spot.hero === 'BB';
    var tb = Math.min(open * (oop ? DEF_3BET_MULT_OOP : DEF_3BET_MULT_IP), eff);
    var pot = open * 2 + b.dead;                  // 跟注後的底池
    var pot3 = tb * 2 + b.dead;                   // 對手跟你 3-bet 後的底池
    return {
      effBb: eff, openBb: open, threeBetBb: tb,
      toCall: Math.max(0, open - b.post), pot: pot,
      needEq: Math.max(0, open - b.post) / pot,
      needEq3: (tb - b.post) / pot3,
      spr: (eff - open) / pot,
      spr3: (eff - tb) / pot3,
      threeBetAllIn: tb >= eff,
      mode: (eff - open) / pot < JAM_SPR ? 'jamOrFold' : 'normal'
    };
  }

  /** 加注門檻：加注越接近全下，門檻越往「底池賠率 − 棄牌權益」靠；深籌碼再收緊 */
  function aggroThreshold(calibThr, spr, needEq, effBb) {
    var w = clamp01(spr / COMMIT_SPR);
    return w * calibThr + (1 - w) * Math.max(0, needEq - JAM_CREDIT)
      + DEEP_PENALTY * clamp01((effBb - 150) / 150);
  }

  /** 某深度 + 某對手開牌寬度下的防守 map：{ 手牌: 'tb'（3-bet）| 'in'（跟注） }
   * impliedW 可覆寫隱含賠率權重（產生器用：現場多人底池 → 同花連張與小對子加成更高）。 */
  function defenseAtDepth(spotKey, villainClasses, thresholds, bb, impliedW) {
    var pf = PF(), info = defStackInfo(spotKey, bb);
    if (!info) return {};
    var w = typeof impliedW === 'number' ? impliedW : IMPLIED_W;
    var eq = selectionEq(villainClasses);
    var thr3 = aggroThreshold(thresholds.tb, info.spr3, info.needEq3, info.effBb);
    var f = impliedFactor(info.spr, thresholds.sprBase), map = {};
    var score = selectionScore(eq, w, f);
    for (var i = 0; i < 169; i++) {
      if (eq[i] >= thr3) map[pf.classLabel(i)] = 'tb';
      else if (info.mode === 'normal' && score[i] >= thresholds.cont) {
        map[pf.classLabel(i)] = 'in';
      }
    }
    return map;
  }

  /* ---------- 冷 4-bet / 冷跟（前面有人開牌、又有人 3-bet，而你還沒行動） ----------
   * 這是第四種翻前局面，跟另外三張圖都不一樣：
   *   RFI = 沒人入池／面對開牌 = 一個開牌者／被 3-bet = 你自己開的
   *   這裡 = 別人開牌、第三家 3-bet，你完全還沒投錢（或只投了盲注）
   *
   * 模型刻意只算「對上 3-bet 者」的勝率，理由與代價都寫在這裡：
   *   開牌者多半會棄牌或被 4-bet 擠掉，而且他的 range 比 3-bet 者弱得多，
   *   所以主導這個決定的是 3-bet 者。但如果開牌者也跟進變成三人底池，
   *   你的實際勝率會比這裡算的更低 —— 也就是說這張圖給的是偏樂觀的上限。
   *
   * 另外一個重點（也是這張圖一定要有「對手 3-bet 寬度」滑桿的原因）：
   *   這個決定對「他 3-bet 多寬」極度敏感。例如 BTN 拿 AQo，
   *   對手 3-bet 3.6% 時你只有 33.5% 勝率、要 40% 才跟得起 → 蓋牌；
   *   同一手牌對手若 3-bet 到 9%，勝率就變成 47.6% → 變成跟。
   *   把對手寬度寫死成單一數字，只會讓人在錯的對手身上照抄。
   */

  var COLD_4BET_EQ = 0.50;      // 冷 4-bet 的價值門檻（現場幾乎不做 bluff 冷 4-bet）
  var COLD_CALL_PENALTY = 0.03; // 冷跟要比純底池賠率再嚴一點：開牌者還沒表態、後面還可能被再擠
  /* 每個情境另外有 oopPenalty：翻後位置的代價（equity 點）。
   * 只看底池賠率的話 SB 反而比 BTN 便宜（少投 0.5bb），會得出「SB 跟得比 BTN 寬」這種
   * 明顯錯誤的結論 —— 冷跟最重要的成本是「接下來三條街都要無位置面對兩家」，
   * 所以位置的代價要明寫成資料，不能只靠賠率。 */

  var COLD_SPOTS = {
    btn_cold9: {
      name: t('BTN：中位開牌 → 後位 3-bet（9-max）'), table: 9,
      hero: 'BTN', opener: 'MP', tbettor: 'CO',
      openBb: 2.5, tbBb: 8, heroPost: 0, deadBb: 1.5,
      villainSpot: 'co_vs_mp9', oopPenalty: 0,
      note: t('你有位置、也還沒投錢，但對手冷 3-bet 一個中位開牌的範圍很窄。位置救不了被壓制的牌。')
    },
    sb_cold9: {
      name: t('SB：中位開牌 → 後位 3-bet（9-max）'), table: 9,
      hero: 'SB', opener: 'MP', tbettor: 'CO',
      openBb: 2.5, tbBb: 8, heroPost: 0.5, deadBb: 1,
      villainSpot: 'co_vs_mp9', oopPenalty: 0.06,
      note: t('整局無位置、還有 BB 在後面 —— 這裡是三個位置裡最該直接蓋牌的。')
    },
    bb_cold9: {
      name: t('BB：中位開牌 → 後位 3-bet（9-max）'), table: 9,
      hero: 'BB', opener: 'MP', tbettor: 'CO',
      openBb: 2.5, tbBb: 8, heroPost: 1, deadBb: 0.5,
      villainSpot: 'co_vs_mp9', oopPenalty: 0.045,
      note: t('已經投了 1bb 所以價格最好，但翻後整局無位置，而且是對上兩個 range。')
    },
    bb_vs_sb_squeeze9: {
      name: t('BB：中位開牌 → SB squeeze（9-max）'), table: 9,
      hero: 'BB', opener: 'MP', tbettor: 'SB',
      openBb: 2.5, tbBb: 11, heroPost: 1, deadBb: 0,
      villainSpot: 'sb_vs_mp9', oopPenalty: 0.045,
      note: t('SB squeeze 的尺度更大（無位置要收費），但範圍通常也比冷 3-bet 寬一點。')
    },
    btn_cold6: {
      name: t('BTN：前位開牌 → CO 3-bet（6-max）'),
      hero: 'BTN', opener: 'UTG', tbettor: 'CO',
      openBb: 2.5, tbBb: 8, heroPost: 0, deadBb: 1.5,
      villainSpot: 'co_vs_utg', oopPenalty: 0,
      note: t('6-max 的 3-bet range 比 9-max 寬，所以續玩範圍也明顯寬一些。')
    },
    sb_cold6: {
      name: t('SB：前位開牌 → CO 3-bet（6-max）'),
      hero: 'SB', opener: 'UTG', tbettor: 'CO',
      openBb: 2.5, tbBb: 8, heroPost: 0.5, deadBb: 1,
      villainSpot: 'co_vs_utg', oopPenalty: 0.06,
      note: t('無位置又夾在中間，續玩要比 BTN 收一大截。')
    },
    bb_cold6: {
      name: t('BB：前位開牌 → CO 3-bet（6-max）'),
      hero: 'BB', opener: 'UTG', tbettor: 'CO',
      openBb: 2.5, tbBb: 8, heroPost: 1, deadBb: 0.5,
      villainSpot: 'co_vs_utg', oopPenalty: 0.045,
      note: t('價格最好的冷跟位置，但翻後要無位置面對兩家。')
    },
    bb_vs_sb_squeeze6: {
      name: t('BB：前位開牌 → SB squeeze（6-max）'),
      hero: 'BB', opener: 'UTG', tbettor: 'SB',
      openBb: 2.5, tbBb: 11, heroPost: 1, deadBb: 0,
      villainSpot: 'sb_vs_utg', oopPenalty: 0.045,
      note: t('SB squeeze 尺度大，你要用很強的範圍才跟得起。')
    }
  };
  var COLD_SPOT_KEYS = ['btn_cold9', 'sb_cold9', 'bb_cold9', 'bb_vs_sb_squeeze9',
                        'btn_cold6', 'sb_cold6', 'bb_cold6', 'bb_vs_sb_squeeze6'];

  /** 該情境裡 3-bet 者的預設 3-bet range（沿用防守表，兩張表共用同一份資料） */
  function coldVillainRange(spotKey) {
    var s = COLD_SPOTS[spotKey];
    if (!s || !DEF_SPOTS[s.villainSpot]) return null;
    return PF().rangeFromNotation(DEF_SPOTS[s.villainSpot].threeBet);
  }
  /** 該情境 3-bet 者的預設寬度（% of 1326） */
  function coldVillainPct(spotKey) {
    var r = coldVillainRange(spotKey);
    return r ? PF().rangeComboTotal(r) / 1326 * 100 : 0;
  }

  /** 某有效籌碼下的局面數字：要補多少、底池、賠率、SPR、模式 */
  function coldStackInfo(spotKey, bb) {
    var s = COLD_SPOTS[spotKey];
    if (!s) return null;
    var eff = clampBb(bb);
    var open = Math.min(s.openBb, eff);
    var tb = Math.min(s.tbBb, eff);
    var toCall = Math.max(0, tb - s.heroPost);
    var pot = open + tb + s.deadBb + s.heroPost;   // 你行動前的底池（含你已投的盲注）
    var spr = (eff - tb) / (pot + toCall);
    return {
      effBb: eff, openBb: open, tbBb: tb, toCall: toCall, pot: pot,
      needEq: toCall > 0 ? toCall / (pot + toCall) : 0,
      spr: spr,
      fourBetBb: Math.min(tb * 2.3, eff),
      fourBetAllIn: tb * 2.3 >= eff,
      mode: eff <= tb ? 'callAllin' : spr < JAM_SPR ? 'jamOrFold' : 'normal'
    };
  }

  /** 某深度 + 某對手 3-bet 寬度下的 map：{ 手牌: 'tb'（冷 4-bet）| 'in'（冷跟） } */
  function coldDefense(spotKey, villainClasses, bb) {
    var pf = PF(), info = coldStackInfo(spotKey, bb);
    if (!info) return {};
    var eq = selectionEq(villainClasses);
    var base = coldStackInfo(spotKey, VS3B_BASE_BB);
    var f = impliedFactor(info.spr, base ? base.spr : 0);
    var map = {}, i;
    if (info.mode !== 'normal') {
      // 籌碼太淺 → 沒有冷跟這個選項，只剩全下或棄
      for (i = 0; i < 169; i++) {
        if (eq[i] >= info.needEq) map[pf.classLabel(i)] = 'tb';
      }
      return map;
    }
    var contThr = info.needEq + COLD_CALL_PENALTY + (COLD_SPOTS[spotKey].oopPenalty || 0);
    var score = selectionScore(eq, IMPLIED_W, f);
    for (i = 0; i < 169; i++) {
      if (eq[i] >= COLD_4BET_EQ) map[pf.classLabel(i)] = 'tb';
      else if (score[i] >= contThr) map[pf.classLabel(i)] = 'in';
    }
    return map;
  }

  /* ---------- 混合頻率（純函式） ----------
   * 上面幾張圖都是「排序分數 ≥ 門檻就做這個動作」的硬切，實際 GTO 解在門檻附近是混合的。
   * 這裡把硬切換成一段線性斜坡：分數剛好等於門檻 = 50%，往上 MIX_BAND 到 100%、往下到 0%。
   *   加注頻率  = ramp(加注用分數, 加注門檻)
   *   續玩頻率  = ramp(續玩用分數, 續玩門檻)   （＝ 1 − 棄牌頻率）
   *   跟注頻率  = 續玩 − 加注
   * 測驗評分用 MIX_ACCEPT：只要你選的動作在模型裡有 ≥25% 的頻率就算對，
   * 因為那本來就是該手牌的混合策略之一，不該判錯。
   * 這是「門檻附近本來就模糊」的表述，不是逐 combo 的 solver 頻率。 */

  var MIX_BAND = 0.03;     // 門檻上下各 3 個 equity 百分點內視為混合區
  var MIX_ACCEPT = 0.25;   // 測驗：頻率 ≥ 此值的動作都算對
  var MIX_PURE = 0.9;      // 頻率 ≥ 此值視為純策略（顯示用）

  function mixRamp(score, thr) {
    return clamp01(0.5 + (score - thr) / (2 * MIX_BAND));
  }
  /** 由「加注頻率」與「續玩頻率」拆成三個動作的頻率（和為 1） */
  function freqSplit(pAggro, pCont) {
    var a = clamp01(pAggro), c = clamp01(pCont);
    if (c < a) c = a;
    return { aggro: a, call: c - a, fold: 1 - c };
  }
  /** 頻率最高的動作（唯一正解、錯題本用） */
  function mixBest(fr) {
    return (fr.aggro >= fr.call && fr.aggro >= fr.fold) ? 'aggro'
      : (fr.call >= fr.fold) ? 'call' : 'fold';
  }
  /** 某個動作在模型裡有足夠頻率 */
  function mixAccept(fr, action) { return (fr[action] || 0) >= MIX_ACCEPT; }
  /**
   * 測驗放寬判定：你選的動作與圖表正解「在模型裡都有 ≥25% 頻率」才算兩者皆可。
   * 兩邊都要檢查是關鍵 —— 圖表正解在模型裡頻率是 0 時（例如 A5s 這種
   * 靠阻斷牌的 4-bet bluff，equity 排序模型抓不到），代表模型跟圖表根本不同調，
   * 這時要以圖表為準嚴格評分，不能讓模型把錯的說成對的。
   */
  function mixTolerates(fr, chosen, best) {
    if (!fr || chosen === best) return false;
    return mixAccept(fr, chosen) && mixAccept(fr, best);
  }
  /** 是否為混合手牌（沒有任何動作接近純策略） */
  function isMixed(fr) {
    return Math.max(fr.aggro, fr.call, fr.fold) < MIX_PURE;
  }

  /** 開牌 RFI 的頻率表：{ 手牌: {aggro, call:0, fold} } */
  function rfiFreqMap(targetCombos, bb) {
    var pf = PF(), f = rfiDepthFactor(bb);
    var score = selectionScore(rfiVillainEq(), IMPLIED_W, f), i;
    var thr = thresholdAt(score, targetCombos);
    var map = {};
    for (i = 0; i < 169; i++) {
      map[pf.classLabel(i)] = freqSplit(mixRamp(score[i], thr), mixRamp(score[i], thr));
    }
    return map;
  }

  /** 面對開牌的頻率表：{ 手牌: {aggro（3-bet）, call, fold} } */
  function defFreqMap(spotKey, villainClasses, thresholds, bb) {
    var pf = PF(), info = defStackInfo(spotKey, bb);
    if (!info) return {};
    var eq = selectionEq(villainClasses);
    var thr3 = aggroThreshold(thresholds.tb, info.spr3, info.needEq3, info.effBb);
    var f = impliedFactor(info.spr, thresholds.sprBase), map = {};
    var score = selectionScore(eq, IMPLIED_W, f);
    for (var i = 0; i < 169; i++) {
      var a = mixRamp(eq[i], thr3);
      var cont = info.mode === 'normal' ? mixRamp(score[i], thresholds.cont) : a;
      map[pf.classLabel(i)] = freqSplit(a, cont);
    }
    return map;
  }

  /** 冷 4-bet 的頻率表：{ 手牌: {aggro（冷 4-bet）, call, fold} } */
  function coldFreqMap(spotKey, villainClasses, bb) {
    var pf = PF(), info = coldStackInfo(spotKey, bb);
    if (!info) return {};
    var eq = selectionEq(villainClasses);
    var base = coldStackInfo(spotKey, VS3B_BASE_BB);
    var f = impliedFactor(info.spr, base ? base.spr : 0);
    var map = {}, i, a, cont;
    if (info.mode !== 'normal') {
      for (i = 0; i < 169; i++) {
        a = mixRamp(eq[i], info.needEq);
        map[pf.classLabel(i)] = freqSplit(a, a);
      }
      return map;
    }
    var contThr = info.needEq + COLD_CALL_PENALTY + (COLD_SPOTS[spotKey].oopPenalty || 0);
    var cscore = selectionScore(eq, IMPLIED_W, f);
    for (i = 0; i < 169; i++) {
      a = mixRamp(eq[i], COLD_4BET_EQ);
      cont = mixRamp(cscore[i], contThr);
      map[pf.classLabel(i)] = freqSplit(a, cont);
    }
    return map;
  }

  /** 被 3-bet 的頻率表：{ 手牌: {aggro（4-bet）, call, fold} } */
  function vs3bFreqMap(spotKey, bb, calib) {
    var pf = PF(), info = vs3bStackInfo(spotKey, bb);
    if (!info || !calib) return {};
    var map = {}, i, a, cont;
    if (info.mode === 'callAllin') {
      for (i = 0; i < 169; i++) {
        a = mixRamp(calib.eq[i], info.needEq);
        map[pf.classLabel(i)] = freqSplit(a, a);
      }
      return map;
    }
    var thr4 = aggroThreshold(calib.fourBet, info.spr, info.needEq, info.effBb);
    var f = impliedFactor(info.spr, calib.sprBase);
    var vscore = selectionScore(calib.eq, IMPLIED_W, f);
    for (i = 0; i < 169; i++) {
      a = mixRamp(calib.eq[i], thr4);
      cont = info.mode === 'normal' ? mixRamp(vscore[i], calib.cont) : a;
      map[pf.classLabel(i)] = freqSplit(a, cont);
    }
    return map;
  }

  var Ranges = {
    MIX_BAND: MIX_BAND, MIX_ACCEPT: MIX_ACCEPT, MIX_PURE: MIX_PURE,
    mixRamp: mixRamp, freqSplit: freqSplit, mixBest: mixBest,
    mixAccept: mixAccept, mixTolerates: mixTolerates, isMixed: isMixed,
    rfiFreqMap: rfiFreqMap, defFreqMap: defFreqMap, vs3bFreqMap: vs3bFreqMap,
    COLD_SPOTS: COLD_SPOTS, COLD_SPOT_KEYS: COLD_SPOT_KEYS,
    COLD_4BET_EQ: COLD_4BET_EQ, COLD_CALL_PENALTY: COLD_CALL_PENALTY,
    coldVillainRange: coldVillainRange, coldVillainPct: coldVillainPct,
    coldStackInfo: coldStackInfo, coldDefense: coldDefense, coldFreqMap: coldFreqMap,
    DEF_SPOTS: DEF_SPOTS, DEF_SPOT_KEYS: DEF_SPOT_KEYS,
    VS3B_BASE_BB: VS3B_BASE_BB, VS3B_MIN_BB: VS3B_MIN_BB, VS3B_MAX_BB: VS3B_MAX_BB,
    RFI_JAM_BB: RFI_JAM_BB, rfiStackInfo: rfiStackInfo, rfiAtDepth: rfiAtDepth,
    defOpenBb: defOpenBb, defStackInfo: defStackInfo, defenseAtDepth: defenseAtDepth,
    defenseCalibrate: defenseCalibrate,
    impliedIndex: impliedIndex, equityMapVs: equityMapVs, thresholdAt: thresholdAt,
    IMPLIED_W: IMPLIED_W, vs3bVillainRange: vs3bVillainRange,
    vs3bStackInfo: vs3bStackInfo, vs3bCalibrate: vs3bCalibrate, vs3bDefense: vs3bDefense,
    VS3B_SPOTS: VS3B_SPOTS, VS3B_SPOT_KEYS: VS3B_SPOT_KEYS, callPrice: callPrice,
    RFI_RANGES_6: RFI_RANGES_6, RFI_POS_6: RFI_POS_6,
    RFI_RANGES_9: RFI_RANGES_9, RFI_POS_9: RFI_POS_9,
    cycleState: cycleState, mergeOverride: mergeOverride, diffOverride: diffOverride,
    openerRfiNotation: openerRfiNotation, openerOpenPct: openerOpenPct
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Ranges;
  else global.Ranges = Ranges;
})(typeof window !== 'undefined' ? window : this);
