/* 面對開牌（vs RFI）的防守 range 資料 — 100bb 6-max 現金局
 *
 * 每個情境（spot）包含：
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
    }
  };

  var DEF_SPOT_KEYS = ['co_vs_utg', 'btn_vs_co', 'sb_vs_btn', 'bb_vs_btn', 'bb_vs_sb'];

  var Ranges = { DEF_SPOTS: DEF_SPOTS, DEF_SPOT_KEYS: DEF_SPOT_KEYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Ranges;
  else global.Ranges = Ranges;
})(typeof window !== 'undefined' ? window : this);
