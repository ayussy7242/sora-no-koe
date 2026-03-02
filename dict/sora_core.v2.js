"use strict";

/**
 * dict/sora_core.v2.js
 * 🌌 SORA CORE SSOT (v2)
 *
 * 目的:
 * - 「意味の順番」は生成側で固定しやすい形に、素材をスロット化して提供
 * - 「言い回し」はAIに任せる（辞書は“断片”）
 * - 度数フェーズで圧/速度/残り方のバイアスを与えられる
 *
 * 想定スロット（生成側）:
 * 1) appear  : 出現 / 立ち上がり
 * 2) impact  : 作用 / 変化点
 * 3) order   : 反応の順序（先に入る→後で追う）
 * 4) residue : 残り方（余韻 / 持続）
 * 5) stance  : 立ち位置（どこに寄るか）
 *
 * ※ role は「核の意味」だが、本文に必須ではない（材料として使う）
 */

const SORA_CORE_V2 = Object.freeze({
  version: "sora_core.v2",
  locale: "ja",

  // --------------------------
  // FACTS (degree phase)
  // --------------------------
  facts: Object.freeze({
    degree_phase: Object.freeze([
      {
        name: "early",
        min: 0,
        max: 9.999,
        fact: "始まりの度数にある{sign}の{planet}。",
        bias: Object.freeze({
          // 立ち上がりが早い/初速が出る/未分化
          appear: Object.freeze(["初速", "点火", "立ち上がり", "未分化", "先行"]),
          impact: Object.freeze(["新規", "刷新", "開始", "最初の輪郭"]),
          order: Object.freeze(["先に出る", "先に入る", "後で追う"]),
          residue: Object.freeze(["残りは薄め", "余韻は短め", "切り替わりやすい"]),
          stance: Object.freeze(["入口側", "前線", "先頭"]),
        }),
      },
      {
        name: "mid",
        min: 10,
        max: 19.999,
        fact: "{sign}の中盤の位置で、{planet}が立つ。",
        bias: Object.freeze({
          // 構造が整う/持続が安定
          appear: Object.freeze(["安定起動", "輪郭", "整列", "定着"]),
          impact: Object.freeze(["骨格化", "運用", "持続", "制度化"]),
          order: Object.freeze(["順序が整う", "追従が早い", "噛み合う"]),
          residue: Object.freeze(["余韻は中庸", "残りが安定", "持続する"]),
          stance: Object.freeze(["中核", "運用側", "中心寄り"]),
        }),
      },
      {
        name: "late",
        min: 20,
        max: 28.999,
        fact: "{sign}の後半度数にある{planet}。",
        bias: Object.freeze({
          // 熟成/回収/まとめ
          appear: Object.freeze(["熟した立ち上がり", "完成度", "慣れ", "洗練"]),
          impact: Object.freeze(["収束", "回収", "仕上げ", "完成"]),
          order: Object.freeze(["後から整う", "折り返す", "回収して固まる"]),
          residue: Object.freeze(["余韻が濃い", "残りやすい", "消えにくい"]),
          stance: Object.freeze(["成熟側", "仕上げ側", "回収側"]),
        }),
      },
      {
        name: "final",
        min: 29,
        max: 29.999,
        fact: "最終度数にある{sign}の{planet}。",
        bias: Object.freeze({
          // 臨界/切り替え/極端
          appear: Object.freeze(["臨界", "極点", "張り", "決着前"]),
          impact: Object.freeze(["再定義", "決着", "終端", "切断と接続"]),
          order: Object.freeze(["一度止まる", "位相が変わる", "調整ではない切替"]),
          residue: Object.freeze(["刻まれる", "抜けにくい", "長く残る"]),
          stance: Object.freeze(["境界線", "閾値", "終端側"]),
        }),
      },
    ]),
  }),

  // --------------------------
  // MEANING (planets/signs)
  // --------------------------
  meaning: Object.freeze({
    // --- planets / points ---
    planets: Object.freeze({
      sun: Object.freeze({
        role: Object.freeze(["自己表現", "中心", "存在", "温度", "意志", "芯", "発光"]),
        appear: Object.freeze(["前面に出る", "場の温度が先に変わる", "光が先に届く", "中心が立つ"]),
        impact: Object.freeze(["基準が生まれる", "全体の調和が塗り替わる", "景色が広がる", "中心が固定される"]),
        order: Object.freeze(["意味より先に体感が入る", "反応が先に鳴って言葉が追う", "理解は後で追いつく"]),
        residue: Object.freeze(["余韻が長く残る", "中心の感触が消えにくい", "温度が残る"]),
        stance: Object.freeze(["中心側に寄る", "基準側に立つ", "前線に立つ"]),
      }),

      moon: Object.freeze({
        role: Object.freeze(["感情", "反応", "安心", "体感", "揺れ", "満ち引き"]),
        appear: Object.freeze(["感情が先に輪郭を取る", "空気への反応が先に出る", "気配が先に触れる"]),
        impact: Object.freeze(["安心の取り方が変わる", "揺れが整い方に触れる", "反応のクセが表に出る"]),
        order: Object.freeze(["反応が先で理解が後から合流する", "感じてから整える順序", "体感が先に走る"]),
        residue: Object.freeze(["感触が身体に残る", "余韻が内側に沈む", "残りが静かに滞留する"]),
        stance: Object.freeze(["反応の側に立つ", "空気の中に入る", "体感寄りに寄る"]),
      }),

      mercury: Object.freeze({
        role: Object.freeze(["思考", "言葉", "理解", "通路", "翻訳", "接続"]),
        appear: Object.freeze(["言葉が先に走る", "会話が回路を作る", "接続が先に起動する"]),
        impact: Object.freeze(["理解の輪郭が変わる", "接続の仕方が更新される", "整理が進む", "誤差が詰まる"]),
        order: Object.freeze(["話しながら整う", "出てから追いつく", "言葉が先で意味が後から乗る"]),
        residue: Object.freeze(["一度通った回路が残る", "言葉が残り方を決める", "フレーズが残る"]),
        stance: Object.freeze(["通路の側に立つ", "接続の起点になる", "翻訳側に寄る"]),
      }),

      venus: Object.freeze({
        role: Object.freeze(["好意", "美意識", "距離", "価値", "親和"]),
        appear: Object.freeze(["好き嫌いの前に反応が出る", "距離が先に決まる", "触れた瞬間に傾く"]),
        impact: Object.freeze(["価値の基準が変わる", "距離の置き方が更新される", "好みが形になる"]),
        order: Object.freeze(["判断より先に馴染みが出る", "好意が先で理由が後から付く", "近づいてから整える"]),
        residue: Object.freeze(["余韻が好みとして残る", "残り方が親密さを作る", "基準が残る"]),
        stance: Object.freeze(["親和の側に立つ", "包む側に寄る", "選別の側に寄る"]),
      }),

      mars: Object.freeze({
        role: Object.freeze(["推進", "境界", "摩擦", "着火", "実行", "持続圧"]),
        appear: Object.freeze(["圧が先に立つ", "摩擦が起動する", "身体が先に動く"]),
        impact: Object.freeze(["進め方が決まる", "境界が固まる", "摩擦ごと前進する", "推進が定着する"]),
        order: Object.freeze(["体感が先で言葉が後", "押してから整える", "動いてから説明が追う"]),
        residue: Object.freeze(["消えにくい圧が残る", "方向性が固定される", "勢いが残る"]),
        stance: Object.freeze(["推進側に立つ", "境界を持つ側に寄る", "実行側に寄る"]),
      }),

      jupiter: Object.freeze({
        role: Object.freeze(["拡大", "安心", "保護", "許容量", "意味の広がり", "寛容"]),
        appear: Object.freeze(["余白が広がる", "守られている感覚が増す", "世界が少し広く見える"]),
        impact: Object.freeze(["可能域が広がる", "安心が増えて動ける", "意味が増幅する", "視野が膨らむ"]),
        order: Object.freeze(["安心が先で行動が後から広がる", "許可が先に出る", "広がってから輪郭が付く"]),
        residue: Object.freeze(["余韻が希望として残る", "広がりが残る", "許容量が残る"]),
        stance: Object.freeze(["入口側に立つ", "保護側に寄る", "拡張側に寄る"]),
      }),

      saturn: Object.freeze({
        role: Object.freeze(["現実", "骨格", "責任", "枠", "時間", "耐久"]),
        appear: Object.freeze(["枠が先に見える", "重みが先に届く", "現実の輪郭が立つ"]),
        impact: Object.freeze(["背負える形に組み替える", "続く形だけを残す", "耐久を作る", "規律が立つ"]),
        order: Object.freeze(["先に固めてから進む", "形にしてから安心が来る", "遅れて効いてくる"]),
        residue: Object.freeze(["骨格が残る", "手応えが残る", "責任の輪郭が残る"]),
        stance: Object.freeze(["現実側に立つ", "骨格側に寄る", "運用側に寄る"]),
      }),

      uranus: Object.freeze({
        role: Object.freeze(["変化", "再設計", "ずれ", "解放", "切替", "非連続"]),
        appear: Object.freeze(["ズレが先に出る", "違和感が点火する", "切替の気配が立つ"]),
        impact: Object.freeze(["再設計が始まる", "常識が外れる", "手順が更新される", "回路が変わる"]),
        order: Object.freeze(["先に外れてから合わせ直す", "壊すより切替が起きる", "飛んでから整う"]),
        residue: Object.freeze(["ズレがスイッチとして残る", "新しい回路が残る", "更新が残る"]),
        stance: Object.freeze(["更新側に立つ", "再設計側に寄る", "自由側に寄る"]),
      }),

      neptune: Object.freeze({
        role: Object.freeze(["理想", "境界", "共鳴", "溶ける", "像", "漂い"]),
        appear: Object.freeze(["境界が薄くなる", "雰囲気が先に満ちる", "像が先に立つ"]),
        impact: Object.freeze(["現実に共鳴が混ざる", "輪郭がにじむ", "理想が前提になる"]),
        order: Object.freeze(["気配が先で理由が後", "溶けてから形になる", "曖昧さが先に来る"]),
        residue: Object.freeze(["余韻が漂う", "像が残る", "境界の薄さが残る"]),
        stance: Object.freeze(["共鳴側に立つ", "境界の外縁に寄る", "漂い側に寄る"]),
      }),

      pluto: Object.freeze({
        role: Object.freeze(["深層", "真実", "核", "再定義", "終わらせ方", "圧"]),
        appear: Object.freeze(["濃度が先に沈む", "核が先に触れる", "深さが先に届く"]),
        impact: Object.freeze(["定義が変わる", "核が掘られる", "終わらせ方が更新される", "真実が露出する"]),
        order: Object.freeze(["先に刺さって後で言葉になる", "触れてから戻れない", "沈んでから浮上する"]),
        residue: Object.freeze(["刻まれる", "抜けにくい", "核の余韻が残る"]),
        stance: Object.freeze(["深層側に立つ", "核の側に寄る", "真実側に寄る"]),
      }),

      chiron: Object.freeze({
        role: Object.freeze(["痛点", "遅れ", "触れにくさ", "守りたいもの", "縫合", "学習"]),
        appear: Object.freeze(["言葉が遅れる", "反応が一度止まる", "触れた瞬間に沈黙が出る"]),
        impact: Object.freeze(["守り方が変わる", "痛点が輪郭を持つ", "癒しが構造化する"]),
        order: Object.freeze(["止まってから動く", "後から理解が追いつく", "触れてから整える"]),
        residue: Object.freeze(["静かな余韻が残る", "痛点が記憶として残る", "守りの癖が残る"]),
        stance: Object.freeze(["守る側に寄る", "痛点の外縁に立つ", "縫合側に寄る"]),
      }),

      lilith: Object.freeze({
        role: Object.freeze(["濃度", "主権", "拒否", "沈黙", "境界の核", "禁忌"]),
        appear: Object.freeze(["言葉にならない圧が出る", "沈黙が先に満ちる", "距離が先に開く"]),
        impact: Object.freeze(["途中で終われない", "濃度が臨界を作る", "主権が表に出る"]),
        order: Object.freeze(["先に引いて後で触れる", "拒否ではなく濃度が先", "黙ってから動く"]),
        residue: Object.freeze(["未完が残る", "濃度が残る", "沈黙が残る"]),
        stance: Object.freeze(["主権側に立つ", "境界線に寄る", "濃度側に寄る"]),
      }),

      north_node: Object.freeze({
        role: Object.freeze(["方向", "引力", "更新", "未知", "未来側", "全体視"]),
        appear: Object.freeze(["方向が引かれる", "未知が気配として立つ", "外側の視点が伸びる"]),
        impact: Object.freeze(["関係性が再配置される", "視点が更新される", "未来側へ伸びる"]),
        order: Object.freeze(["一歩引いてから進む", "俯瞰が先で選択が後", "距離が先に生まれる"]),
        residue: Object.freeze(["方向の余韻が残る", "視点の更新が残る", "引力が残る"]),
        stance: Object.freeze(["俯瞰側に立つ", "未来側に寄る", "更新側に寄る"]),
      }),

      south_node: Object.freeze({
        role: Object.freeze(["慣れ", "既知", "反射", "自然に出る", "癖", "既得"]),
        appear: Object.freeze(["自然に出る", "無意識に起動する", "慣れた動きが先に出る"]),
        impact: Object.freeze(["中心に戻る", "手数が増える", "癖が強まる"]),
        order: Object.freeze(["先に動いて後で整える", "反射が先で意識が後", "慣れが先行する"]),
        residue: Object.freeze(["癖が残る", "慣れが残る", "既知の余韻が残る"]),
        stance: Object.freeze(["既知側に立つ", "反射側に寄る", "慣れ側に寄る"]),
      }),

      asc: Object.freeze({
        role: Object.freeze(["入口", "第一印象", "届き方", "輪郭", "立ち上がり", "前面"]),
        appear: Object.freeze(["先に届く", "説明より先に伝わる", "入口の圧が立つ"]),
        impact: Object.freeze(["印象が固定される", "関係の入口が決まる", "距離が決まる"]),
        order: Object.freeze(["先に伝わって後で理解される", "見た目が先で意味が後", "入口が先行する"]),
        residue: Object.freeze(["印象が残る", "入口の温度が残る", "輪郭が残る"]),
        stance: Object.freeze(["入口側に立つ", "前面側に寄る", "届き方の側に寄る"]),
      }),

      mc: Object.freeze({
        role: Object.freeze(["表舞台", "見られ方", "役割", "肩書", "社会的輪郭", "到達点"]),
        appear: Object.freeze(["見える場所に出る", "役割が前に出る", "表に立つ"]),
        impact: Object.freeze(["役割が定義される", "見られ方が固まる", "仕事の輪郭が立つ"]),
        order: Object.freeze(["先に役割が走って後で中身が追う", "外側が先で内側が後", "見られ方が先行する"]),
        residue: Object.freeze(["役割の余韻が残る", "肩書の温度が残る", "到達点が残る"]),
        stance: Object.freeze(["表舞台側に立つ", "役割側に寄る", "見られ方側に寄る"]),
      }),

      ic: Object.freeze({
        role: Object.freeze(["根", "居場所", "基点", "内側の安定", "土台", "ホーム"]),
        appear: Object.freeze(["内側に沈む", "根が先に動く", "居場所の感触が立つ"]),
        impact: Object.freeze(["安心の前提が変わる", "土台が組み替わる", "帰る場所が整う"]),
        order: Object.freeze(["内側が先で外側が後", "安心が先に決まる", "根から整う"]),
        residue: Object.freeze(["居場所の余韻が残る", "根の感触が残る", "土台が残る"]),
        stance: Object.freeze(["内側に寄る", "基点側に立つ", "居場所側に寄る"]),
      }),

      dc: Object.freeze({
        role: Object.freeze(["関係", "他者", "契約", "距離", "信頼", "鏡"]),
        appear: Object.freeze(["他者が鏡になる", "距離が先に決まる", "関係の圧が立つ"]),
        impact: Object.freeze(["信頼の作り方が変わる", "契約の輪郭が立つ", "関係の基準が更新される"]),
        order: Object.freeze(["先に触れ方が決まって後で言葉が追う", "体感が先で合意が後", "関係が先行する"]),
        residue: Object.freeze(["信頼の余韻が残る", "距離の癖が残る", "関係の手触りが残る"]),
        stance: Object.freeze(["関係側に立つ", "鏡の側に寄る", "契約側に寄る"]),
      }),
    }),

    // --- signs ---
    // ※ ここは “Planet×Sign” を分離するための「媒体レンズ」。
    // 生成側で planet断片と混ぜる前提の断片素材。
    signs: Object.freeze({
      aries: Object.freeze({
        cores: Object.freeze(["始動", "火種", "先行", "単独", "直進"]),
        color: Object.freeze(["熱", "乾いた速さ", "点火", "先頭"]),
        verbs: Object.freeze(["突く", "立つ", "切る", "始める", "先に出る"]),
        contrasts: Object.freeze(["考える前に", "整う前に", "ではなく"]),
        lens: Object.freeze(["勢い", "初速", "一番手", "開戦", "開始"]),
        order_bias: Object.freeze(["先に動く", "先に出る", "後で追う"]),
        residue_bias: Object.freeze(["短く残る", "次へ移る", "切り替わりやすい"]),
      }),

      taurus: Object.freeze({
        cores: Object.freeze(["定着", "持続", "身体", "重み", "触感"]),
        color: Object.freeze(["重さ", "湿度", "粘り", "落ち着き"]),
        verbs: Object.freeze(["保つ", "留める", "積む", "固める", "馴染ませる"]),
        contrasts: Object.freeze(["速さではなく", "瞬発ではなく", "というより"]),
        lens: Object.freeze(["持続圧", "止まりにくさ", "摩擦の耐久", "体感の現実"]),
        order_bias: Object.freeze(["遅れて効く", "後から固まる", "先に触れる"]),
        residue_bias: Object.freeze(["消えにくい", "残りやすい", "定着する"]),
      }),

      gemini: Object.freeze({
        cores: Object.freeze(["接続", "会話", "回路", "軽さ", "複線"]),
        color: Object.freeze(["風", "軽量", "速度", "散開"]),
        verbs: Object.freeze(["つなぐ", "回す", "ほどく", "運ぶ", "切り替える"]),
        contrasts: Object.freeze(["重くするより", "固定ではなく", "より先に"]),
        lens: Object.freeze(["ネットワーク", "翻訳", "同時進行", "会話の交通"]),
        order_bias: Object.freeze(["言葉が先", "先に回る", "後で整う"]),
        residue_bias: Object.freeze(["薄く残る", "散って残る", "回路が残る"]),
      }),

      cancer: Object.freeze({
        cores: Object.freeze(["包む", "内側", "保護", "居場所", "安心圏"]),
        color: Object.freeze(["ぬくもり", "湿度", "抱擁", "内向き"]),
        verbs: Object.freeze(["抱える", "守る", "包む", "持ち帰る", "温める"]),
        contrasts: Object.freeze(["外へではなく", "判断より先に", "というより"]),
        lens: Object.freeze(["保護感", "内側の温度", "距離の内側", "帰属"]),
        order_bias: Object.freeze(["安心が先", "内側が先", "後で言葉"]),
        residue_bias: Object.freeze(["沈んで残る", "居場所として残る", "温度が残る"]),
      }),

      leo: Object.freeze({
        cores: Object.freeze(["中心", "発光", "誇り", "表現", "堂々"]),
        color: Object.freeze(["熱", "光", "前面", "祝祭"]),
        verbs: Object.freeze(["照らす", "掲げる", "前に出る", "示す", "輝く"]),
        contrasts: Object.freeze(["隠すより", "抑えるより", "ではなく"]),
        lens: Object.freeze(["放射", "中心化", "温度で場を変える", "主役性"]),
        order_bias: Object.freeze(["先に見える", "先に伝わる", "後で理由"]),
        residue_bias: Object.freeze(["余韻が残る", "温度が残る", "印象が残る"]),
      }),

      virgo: Object.freeze({
        cores: Object.freeze(["精度", "整える", "検証", "機能", "調律"]),
        color: Object.freeze(["乾いた精密", "静かな手入れ", "細部"]),
        verbs: Object.freeze(["整える", "詰める", "検証する", "修正する", "磨く"]),
        contrasts: Object.freeze(["勢いではなく", "雰囲気より", "より先に"]),
        lens: Object.freeze(["最適化", "品質", "整備", "実装"]),
        order_bias: Object.freeze(["先に整える", "後で広がる", "手入れが先"]),
        residue_bias: Object.freeze(["手応えが残る", "仕様が残る", "精度が残る"]),
      }),

      libra: Object.freeze({
        cores: Object.freeze(["均衡", "対話", "距離感", "交換", "釣り合い"]),
        color: Object.freeze(["風", "透明", "滑らか", "中間"]),
        verbs: Object.freeze(["測る", "合わせる", "並べる", "交換する", "整列する"]),
        contrasts: Object.freeze(["片側ではなく", "押すより", "というより"]),
        lens: Object.freeze(["バランス", "交渉", "中立", "相互"]),
        order_bias: Object.freeze(["先に距離", "後で合意", "対話が先"]),
        residue_bias: Object.freeze(["薄く残る", "整列して残る", "距離が残る"]),
      }),

      scorpio: Object.freeze({
        cores: Object.freeze(["深度", "濃度", "核心", "再定義", "境界の核"]),
        color: Object.freeze(["濃い影", "沈む圧", "静かな刃"]),
        verbs: Object.freeze(["掘る", "沈む", "切り取る", "結ぶ", "変える"]),
        contrasts: Object.freeze(["途中ではなく", "表面ではなく", "というより"]),
        lens: Object.freeze(["不可逆", "真実", "核", "終わらせ方"]),
        order_bias: Object.freeze(["先に刺さる", "後で言葉", "沈んでから浮く"]),
        residue_bias: Object.freeze(["刻まれる", "抜けにくい", "濃く残る"]),
      }),

      sagittarius: Object.freeze({
        cores: Object.freeze(["拡張", "視野", "意味", "遠方", "冒険"]),
        color: Object.freeze(["乾いた風", "遠景", "上昇"]),
        verbs: Object.freeze(["伸ばす", "飛ぶ", "見る", "探す", "越える"]),
        contrasts: Object.freeze(["近さではなく", "固定ではなく", "より先に"]),
        lens: Object.freeze(["遠心", "学び", "物語化", "射程"]),
        order_bias: Object.freeze(["先に視野", "後で詳細", "広がってから固まる"]),
        residue_bias: Object.freeze(["希望が残る", "射程が残る", "方向が残る"]),
      }),

      capricorn: Object.freeze({
        cores: Object.freeze(["骨格", "現実", "制度", "責任", "持続"]),
        color: Object.freeze(["硬質", "冷えた現実", "積層", "重心"]),
        verbs: Object.freeze(["固める", "積む", "支える", "背負う", "運用する"]),
        contrasts: Object.freeze(["理想ではなく", "勢いではなく", "というより"]),
        lens: Object.freeze(["構造化", "耐久", "成果", "実務"]),
        order_bias: Object.freeze(["先に枠", "後で自由", "固めてから進む"]),
        residue_bias: Object.freeze(["骨格が残る", "手応えが残る", "制度として残る"]),
      }),

      aquarius: Object.freeze({
        cores: Object.freeze(["更新", "自由", "俯瞰", "ネットワーク", "非所属"]),
        color: Object.freeze(["冷気", "透明", "高所", "距離"]),
        verbs: Object.freeze(["外す", "つなぐ", "再配置する", "刷新する", "俯瞰する"]),
        contrasts: Object.freeze(["近さではなく", "情ではなく", "というより"]),
        lens: Object.freeze(["再配置", "新規回路", "全体設計", "距離と自由"]),
        order_bias: Object.freeze(["先に距離", "後で接続", "俯瞰が先"]),
        residue_bias: Object.freeze(["回路が残る", "更新が残る", "距離が残る"]),
      }),

      pisces: Object.freeze({
        cores: Object.freeze(["溶ける", "共鳴", "境界", "像", "漂い"]),
        color: Object.freeze(["水霧", "にじみ", "柔らかい影", "浮遊"]),
        verbs: Object.freeze(["溶かす", "漂う", "重ねる", "滲ませる", "祈る"]),
        contrasts: Object.freeze(["輪郭ではなく", "固定ではなく", "というより"]),
        lens: Object.freeze(["共鳴場", "境界の薄さ", "像の重なり", "浸透"]),
        order_bias: Object.freeze(["気配が先", "後で形", "溶けてから固まる"]),
        residue_bias: Object.freeze(["漂って残る", "像が残る", "境界が薄いまま残る"]),
      }),
    }),
  }),

  // --------------------------
  // RHYTHM / POLICY (style hints)
  // --------------------------
  rhythm: Object.freeze({
    // “断片”を選ぶ時の終止名詞（生成側の微調整用）
    end_nouns: Object.freeze(["配置", "構造", "入口", "基準", "前提", "圧", "深度", "方向", "回路", "芯", "温度", "余韻"]),

    // 禁止寄り（生成側で弾く/避ける用。softなので完全禁止ではなく“避けたい”）
    // ※あなたの方針に合わせて、煽り/断定/命令/吉凶/救済は別レイヤーで禁止するのが本命
    ban_words_soft: Object.freeze(["地点", "位置", "段階", "示す", "強調", "印象", "可能性", "傾向", "になる"]),

    // 対比の接続子（“ではなく/というより/より先に”）
    contrast_markers: Object.freeze(["ではなく", "というより", "より先に"]),

    // 文章の圧を落とすクッション（生成側が必要なら）
    softeners: Object.freeze(["ことがある", "ように感じる", "〜として残る", "〜に寄る"]),
  }),
});

module.exports = { SORA_CORE_V2 };
