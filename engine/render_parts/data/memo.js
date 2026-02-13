"use strict";

/**
 * memo.js
 * - render のホットパスで使う memo(Map) をまとめる
 * - ここは「状態」だけ。判断・整形ロジックは置かない。
 *
 * 使い方:
 *   const memo = createMemo();
 *   memo.signMeta.get(k) / set(k,v) ...
 */

function createMemo() {
  return {
    // sign meta（sign_key -> meta）
    signMeta: new Map(),

    // ja label（key -> ja）
    bodyJa: new Map(),
    pointJa: new Map(),
    aspectJa: new Map(),
    anyJa: new Map(),

    // core（key -> core）
    coreOf: new Map(),
    aspectCore: new Map(),

    // misc
    misc: new Map(),
  };
}

module.exports = { createMemo };
