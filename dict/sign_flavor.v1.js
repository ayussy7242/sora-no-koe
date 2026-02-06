// dict/sign_flavor.v1.js
"use strict";

/**
 * sign_flavor.v1 (FULL)
 * - SIGNの固定空気(base) + SIGN×PLANETの役割差分(by_body) を置く辞書
 * - “文章を固定しない”ために、A文は
 *   1) core/tension（内容）
 *   2) grammar（言い回し）
 *   3) phrase（そのまま使える素材）
 *   を分けて持つ
 *
 * 原則：
 * - 判断しない / 予言しない / 行動を促さない
 *
 * 使い方（render側）:
 * const s = SIGN_FLAVOR_V1.signs[signKey]
 * const sp = s?.by_body?.[bodyKey]
 * base.flavor + sp.core/tension を使い、A文を合成
 */

const SIGN_FLAVOR_V1 = Object.freeze({
    version: "sign_flavor.v1",
    locale: "ja",

    // --------------------
    // 可変A文：言い回しパーツ（ここが “衝動と/圧が/試しながら” を可変にする場所）
    // --------------------
    grammar: Object.freeze({
        // core と tension を “どう接続するか”
        connectors: Object.freeze({
            both_rise: [
                "が同時に立ち上がり",
                "が並走し",
                "が重なって触れやすくなり",
                "が同じ場所で反応し",
                "が同時に動き出し",
                "が同じ方向で押し合い",
                "が交差しやすくなり",
                "が近い位置で響き合い",
                "が同じ層で反応し",
                "が同時に熱を持ち",
                "が同じ地点で立ち上がり",
                "が相互に押し返し合い",
                "が同じ速度で進み",
                "が近い距離でぶつかり合い",
                "が並び立つように現れ",
            ],
            between: [
                "のあいだで",
                "の境目で",
                "の間で",
                "の往復で",
                "のはざまで",
                "の切り替わりで",
                "の接点で",
                "の境界で",
                "の交点で",
                "の中継点で",
                "の間合いで",
                "の合流点で",
                "の揺れ目で",
                "の重なりで",
            ],
        }),

        // “core” をどう呼ぶか（サインで変える用）
        core_nouns: Object.freeze({
            impulse: ["衝動", "熱", "起点", "動機", "点火", "初速", "勢い", "踏み込み", "着火", "始動", "加速", "突入"],
            axis: ["軸", "基準", "中心", "輪郭", "核", "芯", "方向", "軌道", "立ち位置", "重心", "要", "焦点"],
            flow: ["流れ", "通路", "テンポ", "回路", "循環", "運び", "やりとり", "流通", "往復", "連結", "推移", "通り道"],
            hold: ["守り", "抱え方", "居場所", "保護", "包み", "受け皿", "場", "内側", "囲い", "滞在", "保つ場所", "居所"],
            craft: ["手元", "整え", "微調整", "仕上げ", "手入れ", "扱い", "整序", "手直し", "整形", "手当て", "組み直し", "調律"],
            mirror: ["鏡", "対比", "関係の像", "映り", "釣り合い", "バランス", "合わせ鏡", "対照", "相互", "対面", "映し合い", "等価"],
            depth: ["深層", "境界", "濃度", "共有", "変容の圧", "奥行き", "密度", "深部", "内圧", "沈み", "重さ", "底"],
            horizon: ["視野", "意味", "遠景", "探索", "拡張", "広がり", "射程", "俯瞰", "見通し", "範囲", "遠望", "外縁"],
            structure: ["構造", "段取り", "積み上げ", "責任", "骨格", "枠", "設計", "手順", "規格", "土台", "工程", "配列"],
            update: ["更新", "俯瞰", "ズレ", "観測", "自由の回路", "切り替え", "再設計", "刷新", "置き換え", "入れ替え", "飛躍", "再編"],
            dissolve: ["余韻", "溶解", "にじみ", "共鳴", "境界のゆるみ", "浸透", "混ざり", "漂い", "曖昧", "ゆらぎ", "溶け合い", "滲み"],
        }),

        // “表現/振る舞い/反応/言葉” の言い回し
        outputs: Object.freeze({
            expression: ["表現", "ふるまい", "置き方", "出し方", "見せ方", "立ち方", "姿勢", "打ち出し方", "表し方", "見え方", "提示の仕方"],
            reaction: ["反応", "守り方", "体感の動き", "揺れ方", "安心の取り方", "距離の取り方", "受け止め方", "響き方", "受信の仕方", "触れ方", "反射の仕方"],
            language: ["言葉", "伝え方", "まとめ方", "説明の輪郭", "対話のテンポ", "語り方", "置き言葉", "言い回し", "表現語彙", "語尾の置き方", "説明の運び"],
        }),

        // tension 内の動的スロット（{drive}/{dyn} 用）
        dynamics: Object.freeze({
            drive: ["衝動", "迷い", "ためらい", "反発", "引き", "勢い", "揺らぎ", "決めきれなさ", "急ぎ", "押し出し", "慎重さ", "躊躇", "跳ね返り"],
            dyn: ["差", "ズレ", "間", "余白", "行き来", "境目", "切り替わり", "揺れ幅", "交差", "隔たり", "端差", "噛み合い", "折れ目"],
        }),

        // aspect別のdyn（最大変化：連携選択）
        dynamics_by_aspect: Object.freeze({
            tense: ["摩擦感", "張り", "圧", "衝突点", "引っかかり", "尖り", "抵抗", "緊張", "詰まり", "硬さ", "鋭さ", "壁感"],
            smooth: ["流れ", "和らぎ", "馴染み", "広がり", "整い", "滑らかさ", "通り", "素直さ", "連続", "自然さ", "溶け込み", "まわり"],
            blend: ["重なり", "濃度", "一体化", "混ざり", "結合", "強調", "統合", "密着", "溶け合い", "重層", "合成", "合流"],
            adjust: ["ズレ", "微差", "調整", "折り合い", "揺れ", "補正", "差分", "詰め", "合わなさ", "擦り合わせ", "行き違い", "手直し"],
            craft: ["試行", "磨き", "工夫", "探り", "再設計", "組み替え", "試作", "微修正", "手作業", "調律", "編み直し", "加工"],
        }),

        // アスペクトの質感語（KeyWord 合成用）
        aspect_tone: Object.freeze({
            tense: ["緊張", "ひっかかり", "摩擦感", "圧", "鋭さ", "張り", "抵抗", "詰まり", "硬さ", "衝突", "尖り", "圧迫"],
            smooth: ["流れ", "和らぎ", "整い", "相性", "広がり", "穏やかさ", "通り", "馴染み", "自然さ", "柔らかさ", "滑らかさ", "連続性"],
            blend: ["混ざり", "重なり", "強調", "密度", "統合", "一本化", "合流", "一体感", "溶け合い", "凝集", "深まり", "結び"],
            adjust: ["調整", "微差", "補正", "揺れ", "馴染み", "折り合い", "行き違い", "擦り合わせ", "端差", "間合い", "揺らぎ", "詰め"],
            craft: ["工夫", "磨き", "試作", "再設計", "探り", "組み替え", "手作業", "改善", "設え", "編み直し", "調律", "仕立て"],
        }),

        // “試しながら” の言い回し
        tryings: Object.freeze({
            try: ["試しながら", "試行錯誤しながら", "形を変えながら", "微調整しながら", "探りながら", "いったん置きながら", "組み替えながら", "試作しながら"],
            settle: ["定着させながら", "保ちながら", "積み上げながら", "固めながら", "形にしながら", "位置を決めながら", "型を保ちながら"],
            observe: ["観測しながら", "距離を取りながら", "俯瞰しながら", "見届けながら", "様子を見ながら", "手元に置きながら"],
            dissolve: ["にじませながら", "ほどきながら", "ゆるめながら", "溶かしながら", "薄めながら", "拡げながら"],
        }),

        // A文テンプレ（“衝動と…”固定ではなく、パーツ差し替え前提）
        templates: Object.freeze({
            A1: "{core}と{tension}{connector}、{output}は{trying}形を持ちやすい。",
            A2: "{core}が前に出やすく、{between}{tension}が触れやすい。",
            A3: "{output}に{core}が乗りやすく、{between}{tension}で揺れやすい。",
            A4: "{core}が動きやすく、{tension}{connector}{output}が整いやすい。",
            A5: "{core}が先に立ち、{between}{tension}が反応の形になりやすい。",
            A6: "{core}が強まりやすく、{between}{tension}が揺れとして残りやすい。",
            A7: "{core}が起点になり、{tension}{connector}{output}が動きやすい。",
            A8: "{core}が前景化し、{between}{tension}で{output}が調整されやすい。",
        }),
    }),

    // --------------------
    // util：最低限の合成（render側に移してもOK）
    // --------------------
    util: Object.freeze({
        _pick(arr, i = 0) {
            if (!Array.isArray(arr) || !arr.length) return "";
            return String(arr[Math.max(0, Math.min(i, arr.length - 1))] || "");
        },
        buildA({
            templateKey = "A1",
            core,
            tension,
            outputKey = "expression",
            connectorKey = "both_rise",
            tryingKey = "try",
            i = 0,
            drive,
            dyn,
        }) {
            const g = SIGN_FLAVOR_V1.grammar;
            const tpl = g.templates?.[templateKey] || g.templates.A1;

            const connector = SIGN_FLAVOR_V1.util._pick(g.connectors?.[connectorKey], i) || "が触れやすくなり";
            const between = SIGN_FLAVOR_V1.util._pick(g.connectors?.between, i) || "のあいだで";
            const output = SIGN_FLAVOR_V1.util._pick(g.outputs?.[outputKey], i) || "表現";
            const trying = SIGN_FLAVOR_V1.util._pick(g.tryings?.[tryingKey], i) || "探りながら";
            const driveWord = String(drive || "");
            const dynWord = String(dyn || "");

            return String(tpl)
                .replace("{core}", String(core || "—"))
                .replace("{tension}", String(tension || "—"))
                .replace("{connector}", connector)
                .replace("{between}", between)
                .replace("{output}", output)
                .replace("{trying}", trying)
                .replace("{drive}", driveWord)
                .replace("{dyn}", dynWord)
                .replace(/\s+/g, " ")
                .trim();
        },
    }),

    // --------------------
    // 全サイン：base + by_body（sun/moon/mercury）
    // --------------------
    signs: Object.freeze({
        // ==========================================================
        // ♈ aries 牡羊座 — FULL (sun..pluto + chiron/Lilith/asc)
        // ==========================================================
        aries: Object.freeze({
            label_ja: "牡羊座",
            axis: "始まり・衝動・直線",
            base: Object.freeze({
                flavor: "はじまりが先に立つ空気。迷う前に点火しやすい質。",
                short: "点火が先に来やすい。",
                keywords: Object.freeze(["始まり", "衝動", "点火", "直線", "突破"]),
            }),

            by_body: Object.freeze({
                // --------------------------
                // sun
                // --------------------------
                sun: Object.freeze({
                    role: "存在の核と方向づけ",
                    core: "自分で始めたい、という起点の意志",
                    tension: "速さと確かさ（手応え）の{dyn}で、{drive}が揺れやすい",
                    fusion: Object.freeze({
                        A: Object.freeze(["点火", "起点", "先手", "初動", "始まり"]),
                        B: Object.freeze(["確かさ", "手応え", "根拠", "続けやすさ", "戻り先"]),
                        expression: Object.freeze(["表現", "立ち位置", "出し方", "決め方", "始め方"]),
                        process: Object.freeze(["押し出しながら", "先に動かしながら", "立ち上げながら", "走りながら", "切り開きながら"]),
                        clarity: Object.freeze(["基準を後追いで合わせつつ", "手応えを取りに戻りつつ", "速度を落とさず整えつつ", "回収点を置きつつ"]),
                        tendency: Object.freeze(["先に出やすい", "勢いが立ちやすい", "早く決まりやすい", "回収が後になる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // moon
                // --------------------------
                moon: Object.freeze({
                    role: "反応と安心の回路",
                    core: "感じた瞬間に動きたい、素直な反射",
                    tension: "落ち着きたい{drive}と、すぐ切り替える反射の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["即反応", "第一反射", "直感", "切り替え", "先走り"]),
                        B: Object.freeze(["落ち着き", "間", "深呼吸", "安心の場", "温度差"]),
                        expression: Object.freeze(["反応", "守り方", "揺れ方", "安心の取り方", "距離の取り方"]),
                        process: Object.freeze(["反射で動きながら", "先に切り替えながら", "走ってから整えながら", "跳ねてから戻しながら"]),
                        clarity: Object.freeze(["落ち着く場所を探しつつ", "安心の条件を後から作りつつ", "温度差を測りつつ", "反応の理由を拾いつつ"]),
                        tendency: Object.freeze(["反応が前に出やすい", "切り替えが速い", "短気に見えやすい", "落ち着きが遅れる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // mercury
                // --------------------------
                mercury: Object.freeze({
                    role: "言葉と理解の通路",
                    core: "結論へ一直線に運びたい思考",
                    tension: "早く言いたい{drive}と、受け取られ方の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["要点", "直球", "結論", "速さ", "一言"]),
                        B: Object.freeze(["受け取り", "余白", "言い直し", "ニュアンス", "相手の速度"]),
                        expression: Object.freeze(["言葉", "伝え方", "まとめ方", "説明の輪郭", "会話テンポ"]),
                        process: Object.freeze(["直球で置きながら", "先に言い切りながら", "短く切りながら", "要点から出しながら"]),
                        clarity: Object.freeze(["受け取り側の速度を見つつ", "余白を足しつつ", "言い直しで補いつつ", "角を丸めつつ"]),
                        tendency: Object.freeze(["強く聞こえやすい", "端的すぎやすい", "早口になりやすい", "後から補足が増える"]),
                    }),
                    defaults: Object.freeze({ outputKey: "language", tryingKey: "try" }),
                }),

                // --------------------------
                // venus
                // --------------------------
                venus: Object.freeze({
                    role: "価値と好みの基準",
                    core: "惹かれた瞬間に“好き”を動かしたい",
                    tension: "熱で選びたい{drive}と、関係の温度差の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["ひと目", "熱", "即決", "好きの火", "直感の好み"]),
                        B: Object.freeze(["温度差", "間合い", "育てる時間", "相手ペース", "距離調整"]),
                        expression: Object.freeze(["惹かれ方", "距離感", "関係の置き方", "好みの出し方", "触れ方"]),
                        process: Object.freeze(["熱で選びながら", "直感で近づきながら", "先に出しながら", "勢いで触れながら"]),
                        clarity: Object.freeze(["温度差を測りつつ", "間合いを調整しつつ", "相手の反応を見つつ", "押し引きを整えつつ"]),
                        tendency: Object.freeze(["早く近づきやすい", "熱が先に立ちやすい", "落差を感じやすい", "急に冷めたように見えやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // mars
                // --------------------------
                mars: Object.freeze({
                    role: "推進と境界のエンジン",
                    core: "踏み込む力が即時に点火する",
                    tension: "進みたい{drive}と、止める境界（ブレーキ）の硬さの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["突進", "踏み込み", "推進", "先制", "攻め"]),
                        B: Object.freeze(["境界", "ブレーキ", "制止", "限界線", "抑え"]),
                        expression: Object.freeze(["行動", "出方", "攻め方", "止め方", "境界の置き方"]),
                        process: Object.freeze(["踏み込みながら", "加速しながら", "押し切りながら", "先に動かしながら"]),
                        clarity: Object.freeze(["止め所を決めつつ", "境界線を引きつつ", "熱量を配分しつつ", "衝突点を避けつつ"]),
                        tendency: Object.freeze(["早く動きやすい", "一気に行きやすい", "止め方が極端になりやすい", "ぶつかると強く出やすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // jupiter
                // --------------------------
                jupiter: Object.freeze({
                    role: "拡大と意味づけ",
                    core: "まずやってみる方向に追い風が入る",
                    tension: "広げたい{drive}と、回収不足になりやすい{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["追い風", "拡大", "挑戦", "先行", "可能性"]),
                        B: Object.freeze(["回収", "検証", "継続", "整合", "現実化"]),
                        expression: Object.freeze(["広げ方", "選び方", "進め方", "見通し", "意味づけ"]),
                        process: Object.freeze(["広げながら", "先に試しながら", "走らせながら", "勢いで開きながら"]),
                        clarity: Object.freeze(["回収点を置きつつ", "検証を挟みつつ", "手応えを拾いつつ", "広げすぎを絞りつつ"]),
                        tendency: Object.freeze(["拡大が先に起きやすい", "楽観が出やすい", "手数が増えやすい", "後半に整える流れになりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // saturn
                // --------------------------
                saturn: Object.freeze({
                    role: "枠と時間の設計",
                    core: "衝動を枠に通して形にしたい",
                    tension: "急ぎたい{drive}と、手順が要る現実の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["枠", "制御", "段取り", "時間", "積み上げ"]),
                        B: Object.freeze(["急ぎ", "衝動", "即時性", "焦り", "短距離"]),
                        expression: Object.freeze(["形にし方", "積み方", "手順", "やり方", "整え方"]),
                        process: Object.freeze(["枠に通しながら", "手順で積みながら", "時間を切りながら", "制御しながら"]),
                        clarity: Object.freeze(["速度を落とさず整えつつ", "手順を省略しすぎず", "急ぎを枠に収めつつ", "締切を味方にしつつ"]),
                        tendency: Object.freeze(["ブレーキが入ると強い", "急ぐほど手順が目立つ", "形にすると安定しやすい", "詰まると苛立ちやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // uranus
                // --------------------------
                uranus: Object.freeze({
                    role: "更新とズレのスイッチ",
                    core: "急にスイッチが入り、やり方を変えたくなる",
                    tension: "自由に切り替えたい{drive}と、継続の必要の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["更新", "切り替え", "ジャンプ", "逸脱", "刷新"]),
                        B: Object.freeze(["継続", "安定", "同じ手順", "維持", "積み上げ"]),
                        expression: Object.freeze(["変え方", "抜け方", "新しい手", "離脱", "戻し方"]),
                        process: Object.freeze(["スイッチを入れながら", "飛びながら", "抜け道を作りながら", "切り替えながら"]),
                        clarity: Object.freeze(["戻る導線を残しつつ", "継続点を確保しつつ", "共有タイミングを見つつ", "更新の影響範囲を測りつつ"]),
                        tendency: Object.freeze(["突然変えやすい", "飽きが速い", "突破口が出やすい", "周囲が追いつかないズレが出やすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // neptune
                // --------------------------
                neptune: Object.freeze({
                    role: "溶解と共鳴の水脈",
                    core: "衝動が“イメージ”に溶けて走りやすい",
                    tension: "直進したい{drive}と、境界が薄まる揺れの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["イメージ", "余韻", "共鳴", "にじみ", "夢"]),
                        B: Object.freeze(["輪郭", "境界", "現実線", "明確さ", "直進"]),
                        expression: Object.freeze(["にじませ方", "出し方", "雰囲気", "輪郭の置き方", "言外の伝達"]),
                        process: Object.freeze(["にじませながら", "溶かしながら", "余韻で走りながら", "感覚で進みながら"]),
                        clarity: Object.freeze(["輪郭を残しつつ", "境界を薄めすぎず", "現実線を引きつつ", "誤解ポイントを避けつつ"]),
                        tendency: Object.freeze(["勢いが霧に混ざりやすい", "誤解が生まれやすい", "ムードが強く出やすい", "直進が散りやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "dissolve" }),
                }),

                // --------------------------
                // pluto
                // --------------------------
                pluto: Object.freeze({
                    role: "深層の圧と再編",
                    core: "衝動が“圧”として濃く立ち上がりやすい",
                    tension: "突破したい{drive}と、引き返せない密度の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["圧", "極点", "再編", "臨界", "変容"]),
                        B: Object.freeze(["密度", "執着", "引き返せなさ", "極端", "支配"]),
                        expression: Object.freeze(["突破の仕方", "押し方", "切り方", "深部の触れ方", "再編の置き方"]),
                        process: Object.freeze(["極点へ寄せながら", "圧をかけながら", "再編しながら", "断ち切りながら"]),
                        clarity: Object.freeze(["臨界点を見極めつつ", "引き返し路を残しつつ", "圧の行き先を選びつつ", "極端化を抑えつつ"]),
                        tendency: Object.freeze(["強く出やすい", "白黒が出やすい", "一撃で変えやすい", "やりすぎに見えやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // chiron
                // --------------------------
                chiron: Object.freeze({
                    role: "傷から学びへ向かう入口",
                    core: "踏み込む瞬間に、痛点が入口として出やすい",
                    tension: "進みたい{drive}と、触れたくない違和感の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["入口", "痛点", "引っかかり", "学び口", "傷の反応"]),
                        B: Object.freeze(["回避", "怖さ", "違和感", "ためらい", "防衛"]),
                        expression: Object.freeze(["反応", "避け方", "越え方", "距離の取り方", "触れ方"]),
                        process: Object.freeze(["踏み込みながら", "触れながら", "避けつつ進みながら", "反応を見つつ"]),
                        clarity: Object.freeze(["痛点を入口として扱いつつ", "回避と前進を切り分けつつ", "過剰反応を抑えつつ", "安全域を確保しつつ"]),
                        tendency: Object.freeze(["踏み込むほど出やすい", "痛点が点火しやすい", "避ける/越えるが振れやすい", "反応が鋭くなりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // Lilith
                // --------------------------
                Lilith: Object.freeze({
                    role: "言語化されなかった主権",
                    core: "“選ばない”が、強い拒否として瞬時に出やすい",
                    tension: "自由でいたい{drive}と、関係に触れた瞬間の反射の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["拒否", "NO", "主権", "非選択", "切断"]),
                        B: Object.freeze(["侵入", "干渉", "束縛気配", "踏み込み", "関係圧"]),
                        expression: Object.freeze(["反射", "距離", "境界", "言い方", "出方"]),
                        process: Object.freeze(["瞬時に切りながら", "拒否で守りながら", "距離を取ることで保ちながら", "跳ね返しながら"]),
                        clarity: Object.freeze(["拒否の理由を言語化しつつ", "境界線を先に置きつつ", "過剰に切りすぎず", "関係の温度を見つつ"]),
                        tendency: Object.freeze(["極端に切り替わりやすい", "強く出やすい", "誤解されやすい", "後から説明したくなくなる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // asc
                // --------------------------
                asc: Object.freeze({
                    role: "入口と印象と身体感覚",
                    core: "第一反射が前に出て、入口が速く開く",
                    tension: "前に出る{drive}と、後から追いつく内側の温度差の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["入口", "第一印象", "初速", "先手", "身体の出方"]),
                        B: Object.freeze(["内側の温度", "後追い", "追いつき", "戸惑い", "温度差"]),
                        expression: Object.freeze(["振る舞い", "出方", "距離の詰め方", "場の入り方", "第一声"]),
                        process: Object.freeze(["先に出ながら", "入口を開きながら", "初速で入っていきながら", "勢いで始めながら"]),
                        clarity: Object.freeze(["内側の温度を追いつかせつつ", "勢いを落としつつ整えつつ", "距離を測りつつ", "場の反応を見つつ"]),
                        tendency: Object.freeze(["速く入る", "距離が詰まりやすい", "圧が強く見えやすい", "後から調整が入る"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),
            }),
        }),

        // ==========================================================
        // ♉ taurus 牡牛座
        // ==========================================================
        // ==========================================================
        // ♉ taurus 牡牛座 — FULL (sun..pluto + chiron/Lilith/asc)
        // ==========================================================
        taurus: Object.freeze({
            label_ja: "牡牛座",
            axis: "身体・感覚・定着",
            base: Object.freeze({
                flavor: "感覚が現実をつかまえる空気。確かさを保ちたがる質。",
                short: "確かさを保ちやすい。",
                keywords: Object.freeze(["身体", "感覚", "価値", "定着", "保持"]),
            }),

            by_body: Object.freeze({
                // --------------------------
                // sun
                // --------------------------
                sun: Object.freeze({
                    role: "存在の核と基準",
                    core: "自分の“価値基準”を保ちたい意志",
                    tension: "変えたくない{drive}と、更新が必要な現実の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["基準", "価値", "確かさ", "手応え", "保持"]),
                        B: Object.freeze(["更新", "変化", "現実要請", "修正", "入れ替え"]),
                        expression: Object.freeze(["表現", "選び方", "基準の出し方", "立ち方", "継続の仕方"]),
                        process: Object.freeze(["保ちながら", "積み上げながら", "定着させながら", "手応えを確かめながら"]),
                        clarity: Object.freeze(["更新点を少しずつ入れつつ", "変える範囲を限定しつつ", "手応えを残しつつ", "価値の再定義を挟みつつ"]),
                        tendency: Object.freeze(["守りが強く出やすい", "変化に慎重", "継続が強い", "動き出しが遅く見えやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // moon
                // --------------------------
                moon: Object.freeze({
                    role: "反応と安心の回路",
                    core: "身体が安心できる形に落ち着きたい反応",
                    tension: "守りたい{drive}と、変化の気配への{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["身体", "安心", "落ち着き", "快/不快", "定位置"]),
                        B: Object.freeze(["変化気配", "不確かさ", "侵入", "揺れ", "乱れ"]),
                        expression: Object.freeze(["反応", "守り方", "安心の取り方", "距離の置き方", "抱え方"]),
                        process: Object.freeze(["落ち着かせながら", "守りながら", "定位置に戻しながら", "体感を整えながら"]),
                        clarity: Object.freeze(["変化を段階化しつつ", "安心条件を先に確保しつつ", "侵入点を閉じつつ", "揺れを減衰させつつ"]),
                        tendency: Object.freeze(["鈍く見えるほど慎重", "安心が身体側に寄る", "変化に抵抗が出やすい", "守りが固まりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "settle" }),
                }),

                // --------------------------
                // mercury
                // --------------------------
                mercury: Object.freeze({
                    role: "言葉と理解の通路",
                    core: "確かさを確認してから言葉にしたい思考",
                    tension: "ゆっくり確かめたい{drive}と、急かされる状況の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["確認", "実感", "具体", "検証", "手触り"]),
                        B: Object.freeze(["急かし", "締切", "外テンポ", "即答圧", "早口世界"]),
                        expression: Object.freeze(["言葉", "説明", "まとめ方", "言い切り方", "対話テンポ"]),
                        process: Object.freeze(["確かめながら", "具体に落としながら", "手触りを拾いながら", "検証しながら"]),
                        clarity: Object.freeze(["答えを急がず置きつつ", "確認工程を見せつつ", "最低限だけ先に言いつつ", "後で増補できる形にしつつ"]),
                        tendency: Object.freeze(["遅いより確実", "具体が増えやすい", "慎重に聞こえやすい", "急かされると固まりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "language", tryingKey: "settle" }),
                }),

                // --------------------------
                // venus
                // --------------------------
                venus: Object.freeze({
                    role: "価値と好みの基準",
                    core: "触れた瞬間の“好き”を、じわっと確かにしたい",
                    tension: "保ちたい{drive}と、惹かれ直す刺激（更新）の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["好き", "質感", "手触り", "心地よさ", "所有感"]),
                        B: Object.freeze(["刺激", "新しさ", "揺さぶり", "更新", "変化欲"]),
                        expression: Object.freeze(["惹かれ方", "選び方", "距離感", "好みの出し方", "関係の育て方"]),
                        process: Object.freeze(["育てながら", "味わいながら", "確かめながら", "定着させながら"]),
                        clarity: Object.freeze(["心地よさを優先しつつ", "刺激を少量混ぜつつ", "更新を怖くしすぎず", "好みの再確認を挟みつつ"]),
                        tendency: Object.freeze(["長く好きになりやすい", "質で選びやすい", "変化に慎重", "一度決めると強い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // mars
                // --------------------------
                mars: Object.freeze({
                    role: "推進と境界のエンジン",
                    core: "一度踏むと、粘り強く押し続ける推進",
                    tension: "止まりたくない{drive}と、動かしたくない保守の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["粘り", "継続", "押し", "持久", "やり抜き"]),
                        B: Object.freeze(["保守", "固定", "動かなさ", "抵抗", "変えない"]),
                        expression: Object.freeze(["行動", "進め方", "押し方", "止め方", "境界の守り方"]),
                        process: Object.freeze(["押し続けながら", "粘りながら", "積みながら", "崩さず進めながら"]),
                        clarity: Object.freeze(["動かす点を限定しつつ", "抵抗点を見極めつつ", "速度より持久で行きつつ", "譲れない線を引きつつ"]),
                        tendency: Object.freeze(["遅いが強い", "一度始まると止まりにくい", "頑固に見えやすい", "押し返されると固くなる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // jupiter
                // --------------------------
                jupiter: Object.freeze({
                    role: "拡大と意味づけ",
                    core: "確かな価値を増やすことで、豊かさを広げたい",
                    tension: "増やしたい{drive}と、維持コスト（手間/管理）の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["増やす", "豊かさ", "蓄え", "価値拡大", "資源"]),
                        B: Object.freeze(["維持", "管理", "手間", "コスト", "守り"]),
                        expression: Object.freeze(["広げ方", "増やし方", "選び方", "扱い方", "保ち方"]),
                        process: Object.freeze(["積み増しながら", "育てながら", "増やしながら", "価値を固めながら"]),
                        clarity: Object.freeze(["維持設計を入れつつ", "管理できる範囲で広げつつ", "手間を見積もりつつ", "増やしすぎを抑えつつ"]),
                        tendency: Object.freeze(["堅実に増えやすい", "長期で強い", "増えると重くなりやすい", "手放しが苦手になりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // saturn
                // --------------------------
                saturn: Object.freeze({
                    role: "枠と時間の設計",
                    core: "形と手順で安定を作りたい",
                    tension: "守りたい{drive}と、修正が避けられない現実の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["手順", "形", "枠", "安定", "規律"]),
                        B: Object.freeze(["修正", "現実圧", "変更", "再設計", "崩れ"]),
                        expression: Object.freeze(["整え方", "固め方", "守り方", "組み直し方", "積み方"]),
                        process: Object.freeze(["固めながら", "手順を通しながら", "枠で支えながら", "時間をかけながら"]),
                        clarity: Object.freeze(["修正点を小分けにしつつ", "崩れる前に手当てしつつ", "再設計を最小にしつつ", "持続優先で組みつつ"]),
                        tendency: Object.freeze(["堅いが強い", "崩れると立て直しに時間が要る", "守りがルール化しやすい", "頑丈さが出やすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // uranus
                // --------------------------
                uranus: Object.freeze({
                    role: "更新とズレのスイッチ",
                    core: "突然、価値基準を入れ替えたくなる更新",
                    tension: "守りたい{drive}と、切り替えたい自由の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["入れ替え", "刷新", "価値転換", "断捨離スイッチ", "更新"]),
                        B: Object.freeze(["手応え", "保持", "慣れ", "安定", "愛着"]),
                        expression: Object.freeze(["変え方", "手放し方", "更新の出し方", "生活の組み替え", "選び直し"]),
                        process: Object.freeze(["入れ替えながら", "手放しながら", "切り替えながら", "更新しながら"]),
                        clarity: Object.freeze(["手応えを残しつつ", "影響範囲を限定しつつ", "切り替えの理由を整理しつつ", "反動買いを避けつつ"]),
                        tendency: Object.freeze(["急に変える", "手放しが極端になりやすい", "価値観が跳ぶ", "周囲が驚きやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // neptune
                // --------------------------
                neptune: Object.freeze({
                    role: "溶解と共鳴の水脈",
                    core: "感覚が“理想の心地よさ”に溶けやすい",
                    tension: "現実の手触りへの{drive}と、理想の余韻の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["心地よさ", "余韻", "理想", "夢の手触り", "陶酔"]),
                        B: Object.freeze(["現実手触り", "具体", "制約", "地に足", "実務"]),
                        expression: Object.freeze(["雰囲気", "選び方", "味わい方", "輪郭の置き方", "現実化の仕方"]),
                        process: Object.freeze(["にじませながら", "味わいながら", "溶かしながら", "余韻で動かしながら"]),
                        clarity: Object.freeze(["具体を足しつつ", "現実線を引きつつ", "理想を薄めすぎず", "誤差を許容しつつ"]),
                        tendency: Object.freeze(["理想が濃くなりやすい", "現実の粗が気になりやすい", "甘く見積もりやすい", "逃避に見えやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "dissolve" }),
                }),

                // --------------------------
                // pluto
                // --------------------------
                pluto: Object.freeze({
                    role: "深層の圧と再編",
                    core: "所有・価値・身体に“圧”が濃くかかりやすい",
                    tension: "守りたい{drive}と、壊してでも変える再編の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["執着", "所有圧", "支配", "死守", "濃度"]),
                        B: Object.freeze(["再編", "破壊→再生", "入れ替え", "断ち切り", "刷新"]),
                        expression: Object.freeze(["守り方", "手放し方", "再編の仕方", "価値の再定義", "境界の強度"]),
                        process: Object.freeze(["死守しながら", "圧をかけながら", "再編しながら", "入れ替えながら"]),
                        clarity: Object.freeze(["何を守るかを限定しつつ", "執着の対象を見極めつつ", "壊す範囲を制御しつつ", "再生の出口を確保しつつ"]),
                        tendency: Object.freeze(["守りが極端", "手放しが難しい", "入れ替えると一気", "価値観が根こそぎ変わりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // chiron
                // --------------------------
                chiron: Object.freeze({
                    role: "傷から学びへ向かう入口",
                    core: "身体感覚・価値・所有の痛点が入口として出やすい",
                    tension: "守りたい{drive}と、触れられる怖さの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["痛点", "欠乏感", "価値の傷", "身体の違和感", "奪われ不安"]),
                        B: Object.freeze(["防衛", "拒否", "閉じる", "固まる", "触れさせない"]),
                        expression: Object.freeze(["反応", "守り方", "距離", "抱え方", "境界の置き方"]),
                        process: Object.freeze(["守りながら", "固めながら", "閉じながら", "触れさせないまま進みながら"]),
                        clarity: Object.freeze(["安全域を先に作りつつ", "痛点を具体化しつつ", "奪われ不安を言語化しつつ", "過剰防衛を緩めつつ"]),
                        tendency: Object.freeze(["触れられると強く反応", "固まりやすい", "守りが過剰になりやすい", "信頼が育つと強い回復力"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "settle" }),
                }),

                // --------------------------
                // Lilith
                // --------------------------
                Lilith: Object.freeze({
                    role: "言語化されなかった主権",
                    core: "価値や身体に触れられると“NO”が強く出やすい",
                    tension: "守る{drive}と、関係・共有の圧の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["NO", "拒否", "領域", "不可侵", "守秘"]),
                        B: Object.freeze(["共有圧", "干渉", "侵入", "触れられ", "奪われ感"]),
                        expression: Object.freeze(["反射", "境界", "距離", "言い方", "閉じ方"]),
                        process: Object.freeze(["閉じながら", "拒否で守りながら", "境界を固めながら", "触れさせないことで保ちながら"]),
                        clarity: Object.freeze(["不可侵領域を明確にしつつ", "共有範囲を限定しつつ", "拒否の理由を言語化しつつ", "過剰に切りすぎず"]),
                        tendency: Object.freeze(["強く拒否が出やすい", "触れられるほど固くなる", "誤解されやすい", "安全だと急に柔らかくなる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "settle" }),
                }),

                // --------------------------
                // asc
                // --------------------------
                asc: Object.freeze({
                    role: "入口と印象と身体感覚",
                    core: "落ち着きと手応えを先に置く入口",
                    tension: "ゆっくりしたい{drive}と、外の速さの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["落ち着き", "安定感", "手触り", "静かな圧", "マイペース"]),
                        B: Object.freeze(["外テンポ", "急かし", "即断圧", "スピード感", "変化圧"]),
                        expression: Object.freeze(["振る舞い", "第一印象", "距離感", "場の入り方", "反応速度"]),
                        process: Object.freeze(["落ち着いて入りながら", "手応えを確かめながら", "ゆっくり開きながら", "安定を置きながら"]),
                        clarity: Object.freeze(["外の速度に飲まれず", "必要時だけ速度を上げつつ", "安心条件を先に確保しつつ", "無理な変化を避けつつ"]),
                        tendency: Object.freeze(["安心感が出やすい", "動き出しが遅く見えやすい", "頑丈に見えやすい", "急かされると固まる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),
            }),
        }),


        // ==========================================================
        // ♊ gemini 双子座
        // ==========================================================
        gemini: Object.freeze({
            label_ja: "双子座",
            axis: "情報・交換・軽さ",
            base: Object.freeze({
                flavor: "言葉と情報が行き来する空気。接続が増えやすい質。",
                short: "行き来が増えやすい。",
                keywords: Object.freeze(["情報", "交換", "会話", "切り替え", "接続"]),
            }),
            by_body: Object.freeze({
                sun: Object.freeze({
                    role: "存在の核と方向づけ",
                    core: "知りたい・つなぎたい、という中心の動機",
                    tension: "広げたい{drive}と、散らばる自分の輪郭の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["接続の動機", "知りたい衝動", "回路を増やす中心"]),
                        B: Object.freeze(["散らばる輪郭", "焦点の不足", "中心の分散"]),
                        expression: Object.freeze(["表現", "選び方", "置き方"]),
                        process: Object.freeze(["行き来しながら", "繋ぎ直しながら", "切り替えながら"]),
                        clarity: Object.freeze(["中心を拾い直しつつ", "焦点を合わせつつ"]),
                        tendency: Object.freeze(["増えやすい", "散りやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                moon: Object.freeze({
                    role: "反応と安心の回路",
                    core: "軽く話せる状態に安心が向きやすい",
                    tension: "深く触れたくない{drive}と、触れてしまう状況の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["軽さの安心", "話せる余白", "気楽な回路"]),
                        B: Object.freeze(["深度差", "触れてしまう接触", "避けたい濃度"]),
                        expression: Object.freeze(["反応", "揺れ方", "安心の取り方"]),
                        process: Object.freeze(["軽く保ちながら", "距離を変えながら", "触れ方を試しながら"]),
                        clarity: Object.freeze(["深さの配分を測りつつ", "境界を調整しつつ"]),
                        tendency: Object.freeze(["軽くなりやすい", "揺れやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                mercury: Object.freeze({
                    role: "言葉と理解の通路",
                    core: "言葉で回路を増やしたい思考",
                    tension: "速く回したい{drive}と、理解の深さの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["言葉の回路", "接続する思考", "会話で増殖する理解"]),
                        B: Object.freeze(["理解の深さ", "沈む読み取り", "深度の要求"]),
                        expression: Object.freeze(["言葉", "対話のテンポ", "伝え方"]),
                        process: Object.freeze(["回転させながら", "切り替えながら", "つなぎ替えながら"]),
                        clarity: Object.freeze(["速さと深さを調整しつつ", "要点の輪郭を拾いつつ"]),
                        tendency: Object.freeze(["速くなりやすい", "切り替わりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "language", tryingKey: "try" }),
                }),
            }),
        }),


        // ==========================================================
        // ♋ cancer 蟹座 — FULL (sun..pluto + chiron/Lilith/asc)
        // ==========================================================
        cancer: Object.freeze({
            label_ja: "蟹座",
            axis: "居場所・保護・親密",
            base: Object.freeze({
                flavor: "居場所の輪郭が触れやすい空気。守りと親密さが前に出る質。",
                short: "守りが前に出やすい。",
                keywords: Object.freeze(["居場所", "保護", "親密", "安心", "包む"]),
            }),

            by_body: Object.freeze({
                // --------------------------
                // sun
                // --------------------------
                sun: Object.freeze({
                    role: "存在の核と基準",
                    core: "守りたいものを中心に据えたい意志",
                    tension: "内側を守りたい{drive}と、外へ開く必要の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["居場所", "守る核", "内側の基準", "帰る場所", "身内の輪郭"]),
                        B: Object.freeze(["外圧", "公開", "開く必要", "他者都合", "露出"]),
                        expression: Object.freeze(["表現", "立ち位置", "見せ方", "境界の置き方", "関わり方"]),
                        process: Object.freeze(["守りを置きながら", "包みながら", "内側を整えながら", "温度を保ちながら"]),
                        clarity: Object.freeze(["開く範囲を限定しつつ", "内側の優先度を守りつつ", "外向きの入口を作りつつ", "親密さの条件を明確にしつつ"]),
                        tendency: Object.freeze(["内側優先になりやすい", "守りが濃く出やすい", "身内に厚くなりやすい", "外では慎重になりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // moon
                // --------------------------
                moon: Object.freeze({
                    role: "反応と安心の回路",
                    core: "親密さの中で安心したい反応",
                    tension: "守りたい{drive}と、侵入されたくない境界の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["安心", "親密", "ぬくもり", "帰属", "守られている感覚"]),
                        B: Object.freeze(["侵入", "踏み込み", "境界の痛点", "距離の乱れ", "見られすぎ"]),
                        expression: Object.freeze(["反応", "守り方", "揺れ方", "距離の取り方", "安心の取り方"]),
                        process: Object.freeze(["守りながら", "包み直しながら", "距離を測りながら", "内側へ戻しながら"]),
                        clarity: Object.freeze(["侵入点を閉じつつ", "親密さの条件を整えつつ", "近さの度合いを調整しつつ", "温度差を減衰させつつ"]),
                        tendency: Object.freeze(["身内モードが出やすい", "防衛が速い", "甘さと硬さが同居しやすい", "安心が崩れると閉じやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "settle" }),
                }),

                // --------------------------
                // mercury
                // --------------------------
                mercury: Object.freeze({
                    role: "言葉と理解の通路",
                    core: "気持ちを含んだ言葉にしたい思考",
                    tension: "守りとして伝えたい{drive}と、言葉にすると崩れる繊細さの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["温度の言葉", "気持ちの含み", "察しの伝達", "やわらかい説明", "気遣いの文脈"]),
                        B: Object.freeze(["言語化の崩れ", "言った瞬間の露出", "誤解", "硬い表現", "説明責任"]),
                        expression: Object.freeze(["言葉", "伝え方", "まとめ方", "対話の呼吸", "説明の輪郭"]),
                        process: Object.freeze(["温度を乗せながら", "含みを残しながら", "遠回しに置きながら", "察しを混ぜながら"]),
                        clarity: Object.freeze(["露出しすぎない言い方を選びつつ", "誤解ポイントを避けつつ", "核心は守りつつ外側だけ説明しつつ", "言葉の硬度を調整しつつ"]),
                        tendency: Object.freeze(["婉曲になりやすい", "含みが増えやすい", "守るほど言いにくくなりやすい", "言葉にした後で気になりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "language", tryingKey: "try" }),
                }),

                // --------------------------
                // venus
                // --------------------------
                venus: Object.freeze({
                    role: "価値と好みの基準",
                    core: "安心できる関係と空間を“好き”として育てたい",
                    tension: "包みたい{drive}と、近づきすぎることで重くなる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["ぬくもり", "家庭感", "愛着", "育てる好き", "手料理みたいな好み"]),
                        B: Object.freeze(["重さ", "依存気配", "近すぎ", "境界の薄まり", "湿度過多"]),
                        expression: Object.freeze(["惹かれ方", "距離感", "関係の育て方", "好みの出し方", "守り方"]),
                        process: Object.freeze(["育てながら", "包みながら", "安心を足しながら", "身内感を作りながら"]),
                        clarity: Object.freeze(["近さの段階を作りつつ", "重さを分散しつつ", "境界を薄めすぎず", "甘さと自立を両立しつつ"]),
                        tendency: Object.freeze(["長く愛着が残りやすい", "内輪に濃くなりやすい", "好きが世話に変わりやすい", "近いほど揺れやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // mars
                // --------------------------
                mars: Object.freeze({
                    role: "推進と境界のエンジン",
                    core: "守るために動く推進（防衛の行動）",
                    tension: "守りたい{drive}と、直接ぶつけたくない回避の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["防衛", "守りの行動", "身内の盾", "先回り", "保護の推進"]),
                        B: Object.freeze(["回避", "遠回し", "衝突回避", "言わない戦", "受け身の反撃"]),
                        expression: Object.freeze(["行動", "出方", "守り方", "境界の置き方", "怒りの出方"]),
                        process: Object.freeze(["守りで動きながら", "先回りしながら", "かばいながら", "内側へ引きながら"]),
                        clarity: Object.freeze(["衝突点を避けつつ", "言葉と行動の配分を調整しつつ", "守る範囲を限定しつつ", "防衛を過剰にしすぎず"]),
                        tendency: Object.freeze(["守ると強い", "直接より間接になりやすい", "溜めてから出やすい", "身内にだけ熱く出やすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // jupiter
                // --------------------------
                jupiter: Object.freeze({
                    role: "拡大と意味づけ",
                    core: "守れる範囲を広げて、安心を増やしたい",
                    tension: "抱えたい{drive}と、抱えすぎて重くなる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["養う", "育む拡大", "安心を増やす", "保護圏", "身内の豊かさ"]),
                        B: Object.freeze(["抱えすぎ", "過保護", "重さ", "手が回らない", "境界の曖昧"]),
                        expression: Object.freeze(["広げ方", "増やし方", "守る範囲", "世話の配分", "意味づけ"]),
                        process: Object.freeze(["育てながら", "守りを広げながら", "安心を足しながら", "養いながら"]),
                        clarity: Object.freeze(["抱える量を見積もりつつ", "守る優先順位をつけつつ", "頼り合いのルールを作りつつ", "過保護を分散しつつ"]),
                        tendency: Object.freeze(["面倒見が増えやすい", "身内へ資源が寄りやすい", "抱えるほど強くなる", "重くなると引きこもりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // saturn
                // --------------------------
                saturn: Object.freeze({
                    role: "枠と時間の設計",
                    core: "居場所のルールと境界を作って守りたい",
                    tension: "守る{drive}と、情が動いて枠が崩れる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["家庭の枠", "境界線", "守る手順", "内側の規律", "責任の囲い"]),
                        B: Object.freeze(["情", "ほだされ", "例外", "揺れ", "情に流れる"]),
                        expression: Object.freeze(["整え方", "守り方", "ルール", "境界の強度", "距離の設計"]),
                        process: Object.freeze(["枠を作りながら", "境界を引きながら", "内側を守りながら", "手順を通しながら"]),
                        clarity: Object.freeze(["例外を最小にしつつ", "情と枠の両方を残しつつ", "守る線を明確にしつつ", "責任の配分を決めつつ"]),
                        tendency: Object.freeze(["身内ルールが強くなる", "守るほど厳しくなりやすい", "境界が硬くなりやすい", "崩れると立て直しに時間が要る"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // uranus
                // --------------------------
                uranus: Object.freeze({
                    role: "更新とズレのスイッチ",
                    core: "居場所の作り方を急に変えたくなる更新",
                    tension: "安心を保ちたい{drive}と、突然の切り替え衝動の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["更新", "模様替えスイッチ", "関係の組み替え", "距離の再設定", "脱・慣れ"]),
                        B: Object.freeze(["安心維持", "慣れ", "定位置", "帰属", "保守"]),
                        expression: Object.freeze(["変え方", "離れ方", "戻り方", "新しい居場所", "距離の取り直し"]),
                        process: Object.freeze(["切り替えながら", "距離を変えながら", "居場所を組み替えながら", "境界を引き直しながら"]),
                        clarity: Object.freeze(["戻れる導線を残しつつ", "更新の影響範囲を限定しつつ", "安心の核は残しつつ", "周囲の温度を見つつ"]),
                        tendency: Object.freeze(["突然距離を変えやすい", "身内の形が更新されやすい", "安心の再定義が起きやすい", "周囲が驚きやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // neptune
                // --------------------------
                neptune: Object.freeze({
                    role: "溶解と共鳴の水脈",
                    core: "共鳴で包みたくなり、境界がゆるみやすい",
                    tension: "寄り添いの{drive}と、守る輪郭の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["共鳴", "包む霧", "情の波", "にじみ", "察しすぎ"]),
                        B: Object.freeze(["輪郭", "境界", "現実線", "距離", "区別"]),
                        expression: Object.freeze(["雰囲気", "寄り添い方", "守りのにじませ方", "言外", "受信の出方"]),
                        process: Object.freeze(["にじませながら", "包みながら", "共鳴しながら", "溶かしながら"]),
                        clarity: Object.freeze(["区別を残しつつ", "受け取りすぎを減らしつつ", "境界を薄めすぎず", "現実線を引きつつ"]),
                        tendency: Object.freeze(["共感が増えやすい", "背負いやすい", "境界が溶けやすい", "察し疲れが出やすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "dissolve" }),
                }),

                // --------------------------
                // pluto
                // --------------------------
                pluto: Object.freeze({
                    role: "深層の圧と再編",
                    core: "親密さ・身内・居場所に“圧”が濃くかかりやすい",
                    tension: "守りたい{drive}と、支配/依存の影の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["結束の圧", "身内の濃度", "根っこ", "帰属の極点", "守りの強度"]),
                        B: Object.freeze(["支配", "依存", "離れられなさ", "情の拘束", "黒白化"]),
                        expression: Object.freeze(["結び方", "切り方", "再編の仕方", "境界の強度", "近さの扱い"]),
                        process: Object.freeze(["濃度を上げながら", "結束させながら", "再編しながら", "深部へ寄せながら"]),
                        clarity: Object.freeze(["近さのルールを作りつつ", "依存点を見極めつつ", "結びつきを守りつつ支配を避けつつ", "極端化を抑えつつ"]),
                        tendency: Object.freeze(["身内が濃くなりやすい", "切ると極端になりやすい", "関係の再編が起きやすい", "近さが圧になりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // chiron
                // --------------------------
                chiron: Object.freeze({
                    role: "傷から学びへ向かう入口",
                    core: "居場所・家族・安心の痛点が入口として出やすい",
                    tension: "守りたい{drive}と、触れられる怖さ（不安）の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["居場所の痛点", "見捨て不安", "帰属の傷", "保護の欠乏", "親密の引っかかり"]),
                        B: Object.freeze(["警戒", "防衛", "閉じる", "距離を取る", "疑い"]),
                        expression: Object.freeze(["反応", "守り方", "距離", "甘え方", "触れ方"]),
                        process: Object.freeze(["守りながら", "警戒しながら", "閉じながら", "触れつつ引きながら"]),
                        clarity: Object.freeze(["安全条件を先に置きつつ", "痛点を具体化しつつ", "不安と事実を切り分けつつ", "過剰防衛を緩めつつ"]),
                        tendency: Object.freeze(["親密ほど反応が出やすい", "疑いが先に立ちやすい", "安心があると急に柔らかくなる", "傷が学び口になりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "settle" }),
                }),

                // --------------------------
                // Lilith
                // --------------------------
                Lilith: Object.freeze({
                    role: "言語化されなかった主権",
                    core: "親密圏に踏み込まれると“NO”が濃く出やすい",
                    tension: "包みたい{drive}と、不可侵を守る反射の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["不可侵", "NO", "主権の殻", "拒否", "内側の秘密"]),
                        B: Object.freeze(["踏み込み", "過干渉", "情の圧", "侵入", "距離の破壊"]),
                        expression: Object.freeze(["反射", "境界", "距離", "言い方", "閉じ方"]),
                        process: Object.freeze(["殻で守りながら", "拒否で切りながら", "距離を取ることで保ちながら", "閉じ直しながら"]),
                        clarity: Object.freeze(["不可侵領域を明確にしつつ", "情と干渉を切り分けつつ", "拒否の理由を言語化しつつ", "切りすぎを抑えつつ"]),
                        tendency: Object.freeze(["急に閉じやすい", "干渉に敏感", "誤解されやすい", "安全だと急に近づける"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // asc
                // --------------------------
                asc: Object.freeze({
                    role: "入口と印象と身体感覚",
                    core: "やわらかく包む入口（安心の温度で入る）",
                    tension: "近づきやすさへの{drive}と、内側を守る引きの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["やわらかい入口", "包む印象", "親しみ", "受け止める温度", "安心の匂い"]),
                        B: Object.freeze(["引き", "内側の守り", "距離調整", "境界線", "急な閉じ"]),
                        expression: Object.freeze(["振る舞い", "場の入り方", "距離感", "第一声", "関わり方"]),
                        process: Object.freeze(["包みながら入り", "温度を合わせながら", "受け止めながら", "様子を見ながら"]),
                        clarity: Object.freeze(["近さを段階化しつつ", "境界を先に置きつつ", "必要なときだけ開きつつ", "内側の安全を確保しつつ"]),
                        tendency: Object.freeze(["親しみが出やすい", "守りも同時に出やすい", "近いのに急に引くように見えやすい", "身内判定が早い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),
            }),
        }),


        // ==========================================================
        // ♌ leo 獅子座 — FULL (sun..pluto + chiron/Lilith/asc)
        // ==========================================================
        leo: Object.freeze({
            label_ja: "獅子座",
            axis: "光・誇り・自己表現",
            base: Object.freeze({
                flavor: "中心に光が集まりやすい空気。表現・存在感・誇りが“芯”になりやすい質。",
                short: "表現と誇りが前に出やすい。",
                keywords: Object.freeze(["光", "誇り", "自己表現", "創造", "中心"]),
            }),

            by_body: Object.freeze({
                // --------------------------
                // sun
                // --------------------------
                sun: Object.freeze({
                    role: "存在の核と方向",
                    core: "光を出す・自分として立つ意志",
                    tension: "堂々と出したい{drive}と、出しすぎが重くなる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["誇り", "輝き", "堂々", "創造", "中心"]),
                        B: Object.freeze(["過剰", "自己主張", "暑苦しさ", "プライド硬直", "独壇場"]),
                        expression: Object.freeze(["表現", "打ち出し方", "見せ方", "名乗り方", "中心の置き方"]),
                        process: Object.freeze(["光を当てながら", "堂々と出しながら", "創造しながら", "中心を作りながら", "熱を通しながら"]),
                        clarity: Object.freeze(["見せる範囲を選びつつ", "熱量を調整しつつ", "誇りを守りつつ", "周囲の余白も残しつつ"]),
                        tendency: Object.freeze(["存在感が増えやすい", "表現が太くなりやすい", "自信が出やすい", "出しすぎると反発が起きやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // moon
                // --------------------------
                moon: Object.freeze({
                    role: "反応と安心の回路",
                    core: "認められる・尊重されると安心が増える反応",
                    tension: "評価に触れやすい{drive}と、無視される不安の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["承認", "尊重", "あたたかさ", "誇り", "ハート"]),
                        B: Object.freeze(["無視", "軽視", "冷え", "恥", "拗ね"]),
                        expression: Object.freeze(["反応", "安心の取り方", "甘え方", "守り方", "距離の取り方"]),
                        process: Object.freeze(["あたためながら", "認めながら", "誇りを保ちながら", "心を戻しながら"]),
                        clarity: Object.freeze(["評価と自己価値を分けつつ", "反応を急がずに置きつつ", "尊重の言葉を足しつつ", "恥を責めずにほどきつつ"]),
                        tendency: Object.freeze(["反応がドラマ化しやすい", "認められると回復が速い", "軽視に敏感", "拗ねると長引きやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // mercury
                // --------------------------
                mercury: Object.freeze({
                    role: "言葉と理解の通路",
                    core: "語ることで光を通す思考",
                    tension: "堂々と語りたい{drive}と、聞かれない痛みの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["宣言", "物語", "名乗り", "堂々", "表現語彙"]),
                        B: Object.freeze(["空回り", "独演", "過剰演出", "聞き手不在", "言い切り過ぎ"]),
                        expression: Object.freeze(["言葉", "語り方", "まとめ方", "伝え方", "名乗り"]),
                        process: Object.freeze(["語りながら", "物語にしながら", "宣言しながら", "光を通しながら"]),
                        clarity: Object.freeze(["主語を整えつつ", "結論を短く置きつつ", "相手の受け皿も確認しつつ", "言い切りを少し緩めつつ"]),
                        tendency: Object.freeze(["言葉が強くなりやすい", "表現が魅力になりやすい", "独演に見えやすい", "聞かれると伸びる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "language", tryingKey: "try" }),
                }),

                // --------------------------
                // venus
                // --------------------------
                venus: Object.freeze({
                    role: "価値と好みの基準",
                    core: "華やかさ・あたたかさ・誇りある美に惹かれやすい",
                    tension: "輝きたい{drive}と、見栄に見えるリスクの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["華", "あたたかさ", "誇り", "堂々", "存在感"]),
                        B: Object.freeze(["見栄", "派手すぎ", "自己中心", "過剰消費", "嫉妬"]),
                        expression: Object.freeze(["惹かれ方", "魅せ方", "選び方", "愛し方", "距離感"]),
                        process: Object.freeze(["魅せながら", "あたためながら", "誇りを通しながら", "華を添えながら"]),
                        clarity: Object.freeze(["誇りと見栄を分けつつ", "華の量を調整しつつ", "相手の光も立てつつ", "品の線を守りつつ"]),
                        tendency: Object.freeze(["魅力が増えやすい", "愛情表現が太くなりやすい", "嫉妬が出やすい", "尊重があると安定しやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // mars
                // --------------------------
                mars: Object.freeze({
                    role: "推進と境界のエンジン",
                    core: "熱で進む推進力。堂々と前に出る",
                    tension: "前に出たい{drive}と、押しの強さになる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["推進", "情熱", "リード", "突破", "勇気"]),
                        B: Object.freeze(["押し", "強引", "競り合い", "短気", "勝ち負け"]),
                        expression: Object.freeze(["行動", "進め方", "攻め方", "守り方", "リードの取り方"]),
                        process: Object.freeze(["熱を入れながら", "前に出ながら", "突破しながら", "リードしながら"]),
                        clarity: Object.freeze(["押しすぎを引き算しつつ", "勝ち負けを置きつつ", "相手のペースも見つつ", "出口を作りつつ"]),
                        tendency: Object.freeze(["決断が速くなりやすい", "前進が強い", "衝突しやすい", "熱が乗ると止まりにくい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // jupiter
                // --------------------------
                jupiter: Object.freeze({
                    role: "拡大と意味づけ",
                    core: "自分の光を広げていく拡大",
                    tension: "広げたい{drive}と、過信や盛りすぎの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["拡大", "自信", "祝福", "舞台", "広がり"]),
                        B: Object.freeze(["過信", "盛る", "誇張", "慢心", "燃え尽き"]),
                        expression: Object.freeze(["広げ方", "伸ばし方", "見せ方", "巻き込み方", "意味づけ"]),
                        process: Object.freeze(["舞台を広げながら", "光を拡げながら", "祝福を増やしながら", "巻き込みながら"]),
                        clarity: Object.freeze(["盛りすぎを控えつつ", "現実の足場も作りつつ", "熱量配分をしつつ", "役割を分けつつ"]),
                        tendency: Object.freeze(["場が大きくなりやすい", "期待が集まりやすい", "過信すると失速しやすい", "祝福が循環すると強い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // saturn
                // --------------------------
                saturn: Object.freeze({
                    role: "枠と時間の設計",
                    core: "誇りを守るための枠を作る",
                    tension: "堂々と出たい{drive}と、責任が重くなる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["責任", "役割", "品格", "持続", "誇りの枠"]),
                        B: Object.freeze(["重圧", "固さ", "萎縮", "恥の回避", "頑固"]),
                        expression: Object.freeze(["守り方", "支え方", "続け方", "表に立つ姿勢", "役割の背負い方"]),
                        process: Object.freeze(["枠で支えながら", "品格を保ちながら", "責任を背負いながら", "持続させながら"]),
                        clarity: Object.freeze(["背負う範囲を決めつつ", "責任を分担しつつ", "恥を恐れずに調整しつつ", "続けられる形にしつつ"]),
                        tendency: Object.freeze(["格が出やすい", "責任感が強まる", "硬く見えやすい", "重くなると出られなくなる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // uranus
                // --------------------------
                uranus: Object.freeze({
                    role: "更新とズレのスイッチ",
                    core: "型破りな表現で光を更新したくなる",
                    tension: "目立つ更新への{drive}と、浮いて見えるズレの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["刷新", "型破り", "新演出", "突発", "意外性"]),
                        B: Object.freeze(["浮き", "違和感", "孤立", "炎上", "制御不能"]),
                        expression: Object.freeze(["変え方", "見せ方", "演出", "出方", "戻し方"]),
                        process: Object.freeze(["更新しながら", "型を崩しながら", "意外性を入れながら", "飛び出しながら"]),
                        clarity: Object.freeze(["安全な範囲で試しつつ", "戻る導線を残しつつ", "受け手の温度も見つつ", "炎上リスクを下げつつ"]),
                        tendency: Object.freeze(["急に目立ちたくなる", "表現が尖りやすい", "浮くと孤立しやすい", "ハマると一気に突破する"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // neptune
                // --------------------------
                neptune: Object.freeze({
                    role: "溶解と共鳴の水脈",
                    core: "光の理想がにじみ、雰囲気で魅せやすい",
                    tension: "理想の輝きへの{drive}と、空虚さや幻っぽさの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["理想", "雰囲気", "夢", "憧れ", "余韻"]),
                        B: Object.freeze(["空虚", "幻", "盛りすぎ", "現実逃避", "誤解"]),
                        expression: Object.freeze(["雰囲気", "見せ方", "余韻の置き方", "語らなさ", "神秘"]),
                        process: Object.freeze(["にじませながら", "雰囲気で通しながら", "余韻で魅せながら", "理想を重ねながら"]),
                        clarity: Object.freeze(["現実の足場を置きつつ", "誤解ポイントを避けつつ", "盛りすぎを控えつつ", "輪郭を少し残しつつ"]),
                        tendency: Object.freeze(["魅力が幻想化しやすい", "憧れを集めやすい", "空虚だと落ちやすい", "余韻があると強い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "dissolve" }),
                }),

                // --------------------------
                // pluto
                // --------------------------
                pluto: Object.freeze({
                    role: "深層の圧と再編",
                    core: "中心の座を根から作り直す圧",
                    tension: "支配になる{drive}と、創造の芯になる{drive}の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["核", "圧", "再編", "支配力", "変容"]),
                        B: Object.freeze(["独裁", "威圧", "強制", "怖さ", "破壊"]),
                        expression: Object.freeze(["立ち方", "中心の作り方", "背負い方", "影響の出し方", "切り替え"]),
                        process: Object.freeze(["核を作りながら", "再編しながら", "変容しながら", "圧を通しながら"]),
                        clarity: Object.freeze(["創造のための圧に限定しつつ", "怖さを出しすぎず", "影響範囲を見極めつつ", "手放す動線も作りつつ"]),
                        tendency: Object.freeze(["影響力が強まる", "中心が固定されやすい", "怖がられやすい", "芯が立つと一気に変わる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // chiron
                // --------------------------
                chiron: Object.freeze({
                    role: "傷から学びへ向かう入口",
                    core: "恥・評価・否定が痛点になりやすい",
                    tension: "堂々と出たい{drive}と、傷つきたくない防衛の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["恥", "否定", "評価", "傷", "心の引っ込み"]),
                        B: Object.freeze(["過剰防衛", "虚勢", "攻撃", "拗ね", "隠す"]),
                        expression: Object.freeze(["反応", "守り方", "立て直し方", "出方", "距離"]),
                        process: Object.freeze(["あたため直しながら", "誇りを戻しながら", "立て直しながら", "傷をほどきながら"]),
                        clarity: Object.freeze(["評価と存在を切り分けつつ", "小さく出る練習をしつつ", "尊重の場を選びつつ", "恥を責めずに扱いつつ"]),
                        tendency: Object.freeze(["傷が表現を止めやすい", "尊重があると回復が速い", "虚勢に出やすい", "学びに変わると強い光になる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // Lilith
                // --------------------------
                Lilith: Object.freeze({
                    role: "言語化されなかった主権",
                    core: "尊重されない場に対して“NO”が強く出る",
                    tension: "誇りを守る拒否への{drive}と、わがままと見られる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["尊厳", "NO", "拒否", "誇り", "主権"]),
                        B: Object.freeze(["軽視", "侮辱", "見下し", "支配", "恥を与える"]),
                        expression: Object.freeze(["反射", "言い方", "距離", "場の選び方", "止め方"]),
                        process: Object.freeze(["誇りで線を引きながら", "拒否で守りながら", "場を選びながら", "尊厳を保ちながら"]),
                        clarity: Object.freeze(["NOの理由を短く置きつつ", "尊重される場へ移りつつ", "攻撃にしない言い方を選びつつ", "誇りを守りつつ"]),
                        tendency: Object.freeze(["プライドが強く出やすい", "侮辱に敏感", "切ると速い", "尊重があると穏やかに強い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // asc
                // --------------------------
                asc: Object.freeze({
                    role: "入口と印象と身体感覚",
                    core: "あたたかい存在感。光で場に入る",
                    tension: "目立つ入口への{drive}と、期待を背負う{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["存在感", "あたたかさ", "堂々", "華", "ハートの入口"]),
                        B: Object.freeze(["注目圧", "期待", "見られ疲れ", "誤解", "圧迫感"]),
                        expression: Object.freeze(["振る舞い", "第一印象", "場の入り方", "第一声", "距離感"]),
                        process: Object.freeze(["光で入りながら", "あたためながら入っていきながら", "堂々と入りながら", "華を添えながら"]),
                        clarity: Object.freeze(["期待を背負いすぎず", "役割を選びつつ", "目立ちたくない時は引きつつ", "場の温度を見つつ"]),
                        tendency: Object.freeze(["目を引きやすい", "場を明るくしやすい", "重いと暑苦しく見えやすい", "尊重があると伸びる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),
            }),
        }),


        // ==========================================================
        // ♍ virgo 乙女座 — FULL (sun..pluto + chiron/Lilith/asc)
        // ==========================================================
        virgo: Object.freeze({
            label_ja: "乙女座",
            axis: "整える・分析・微調整",
            base: Object.freeze({
                flavor: "微差が見えやすい空気。整えることで安心を作りたがる質。",
                short: "微調整が前に出やすい。",
                keywords: Object.freeze(["整える", "分析", "改善", "微差", "手入れ"]),
            }),

            by_body: Object.freeze({
                // --------------------------
                // sun
                // --------------------------
                sun: Object.freeze({
                    role: "存在の核と方向づけ",
                    core: "役に立つ形へ整えたい中心の意志",
                    tension: "整えたい精度への{drive}と、整えすぎて硬くなる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["精度", "整備", "調整", "改善", "最適化"]),
                        B: Object.freeze(["硬さ", "過剰", "神経質さ", "許容幅", "疲弊"]),
                        expression: Object.freeze(["表現", "選び方", "出し方", "整え方", "仕上げ方"]),
                        process: Object.freeze(["手入れしながら", "整備しながら", "微差を拾いながら", "最適化しながら", "磨き込みながら"]),
                        clarity: Object.freeze(["許容幅を決めつつ", "完成ラインを置きつつ", "やりすぎを引き算しつつ", "疲れを先に回収しつつ"]),
                        tendency: Object.freeze(["精度が上がりやすい", "修正が止まりにくい", "厳しく見えやすい", "整うと安定しやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // moon
                // --------------------------
                moon: Object.freeze({
                    role: "反応と安心の回路",
                    core: "整っている状態に安心が向きやすい反応",
                    tension: "乱れへの敏感さと、受け流したい{drive}の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["整い", "秩序", "手順", "安心の条件", "微差感覚"]),
                        B: Object.freeze(["乱れ", "雑さ", "想定外", "誤差", "汚れ"]),
                        expression: Object.freeze(["反応", "守り方", "揺れ方", "安心の取り方", "距離の取り方"]),
                        process: Object.freeze(["整え直しながら", "手順に戻しながら", "微差を点検しながら", "落ち着かせながら"]),
                        clarity: Object.freeze(["誤差を許容しつつ", "直す範囲を限定しつつ", "安心条件を先に確保しつつ", "乱れを小分けにしつつ"]),
                        tendency: Object.freeze(["気になりやすい", "点検が増えやすい", "緊張が上がりやすい", "整うと安心が戻りやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // mercury
                // --------------------------
                mercury: Object.freeze({
                    role: "言葉と理解の通路",
                    core: "説明の精度を上げたい思考",
                    tension: "正確にしたい{drive}と、言葉が増えすぎる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["精密", "定義", "手順化", "検証", "言い分け"]),
                        B: Object.freeze(["過多", "冗長", "詰めすぎ", "読まれなさ", "息切れ"]),
                        expression: Object.freeze(["言葉", "説明", "まとめ方", "対話のテンポ", "注意点の置き方"]),
                        process: Object.freeze(["分解しながら", "定義しながら", "手順に落としながら", "検証しながら"]),
                        clarity: Object.freeze(["要点を先に置きつつ", "詳細を後段に回しつつ", "言葉を削りつつ", "伝達コストを見積もりつつ"]),
                        tendency: Object.freeze(["正確になりやすい", "注釈が増えやすい", "細かいと言われやすい", "要点だけだと不安になりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "language", tryingKey: "try" }),
                }),

                // --------------------------
                // venus
                // --------------------------
                venus: Object.freeze({
                    role: "価値と好みの基準",
                    core: "清潔さ・整い・丁寧さに惹かれやすい",
                    tension: "整った美しさへの{drive}と、遊びと崩しの必要の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["丁寧", "清潔", "品", "整った美", "手入れ"]),
                        B: Object.freeze(["崩し", "遊び", "雑味", "ゆるさ", "不完全"]),
                        expression: Object.freeze(["惹かれ方", "選び方", "距離感", "好みの出し方", "関係の整え方"]),
                        process: Object.freeze(["整えながら", "磨きながら", "手入れしながら", "丁寧に重ねながら"]),
                        clarity: Object.freeze(["崩しを少量混ぜつつ", "完璧主義を緩めつつ", "気持ちよさを優先しつつ", "余白を残しつつ"]),
                        tendency: Object.freeze(["選別が鋭くなりやすい", "好みが具体になりやすい", "欠点が目につきやすい", "整うと満足が深まりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // mars
                // --------------------------
                mars: Object.freeze({
                    role: "推進と境界のエンジン",
                    core: "手順で進める実行力が出やすい",
                    tension: "急ぐ必要への{drive}と、丁寧に詰めたい精度の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["実行", "手順", "段取り", "改善の手", "作業力"]),
                        B: Object.freeze(["急ぎ", "雑な前進", "焦り", "省略", "締切圧"]),
                        expression: Object.freeze(["行動", "進め方", "攻め方", "止め方", "仕事の組み方"]),
                        process: Object.freeze(["手順で進めながら", "点検しながら進みながら", "改善を挟みながら", "整備しながら"]),
                        clarity: Object.freeze(["省略点を選びつつ", "急ぐ部分と丁寧部分を分けつつ", "締切を区切りにしつつ", "完成ラインを決めつつ"]),
                        tendency: Object.freeze(["仕事が進むと強い", "詰めが効きやすい", "急ぐとイライラしやすい", "雑さが許せなくなりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // jupiter
                // --------------------------
                jupiter: Object.freeze({
                    role: "拡大と意味づけ",
                    core: "改善で成果を広げたい拡大",
                    tension: "良くしたい{drive}と、手数が増えすぎる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["改善拡大", "最適化", "成果", "効率", "品質向上"]),
                        B: Object.freeze(["手数", "過多", "管理負荷", "疲れ", "終わらなさ"]),
                        expression: Object.freeze(["広げ方", "伸ばし方", "増やし方", "見通し", "価値づけ"]),
                        process: Object.freeze(["改善しながら", "最適化しながら", "積み上げながら", "品質を上げながら"]),
                        clarity: Object.freeze(["優先順位を付けつつ", "改善対象を絞りつつ", "成果指標を置きつつ", "やりすぎを止めつつ"]),
                        tendency: Object.freeze(["良くなるが増えやすい", "改善が止まらない", "細部に強い", "全体が重くなりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // saturn
                // --------------------------
                saturn: Object.freeze({
                    role: "枠と時間の設計",
                    core: "ルールと手順で品質を保ちたい",
                    tension: "守る枠への{drive}と、例外対応の現実の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["手順", "規格", "ルール", "品質管理", "保守"]),
                        B: Object.freeze(["例外", "想定外", "乱れ", "臨機応変", "崩れ"]),
                        expression: Object.freeze(["整え方", "守り方", "運用", "点検", "再発防止"]),
                        process: Object.freeze(["枠で支えながら", "手順を通しながら", "点検しながら", "再発防止しながら"]),
                        clarity: Object.freeze(["例外の扱いを決めつつ", "運用負荷を見積もりつつ", "守る範囲を限定しつつ", "更新手順を用意しつつ"]),
                        tendency: Object.freeze(["安定が強い", "ルール化しやすい", "融通が利きにくく見えやすい", "崩れると立て直しが大仕事になりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // uranus
                // --------------------------
                uranus: Object.freeze({
                    role: "更新とズレのスイッチ",
                    core: "手順や仕様を急に入れ替えたくなる更新",
                    tension: "刷新したい{drive}と、運用安定の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["刷新", "仕様変更", "自動化", "置き換え", "ショートカット"]),
                        B: Object.freeze(["運用", "安定", "慣れ", "手順維持", "検証不足"]),
                        expression: Object.freeze(["変え方", "抜け道", "更新の出し方", "やり方の切替", "戻し方"]),
                        process: Object.freeze(["入れ替えながら", "ショートカットしながら", "更新しながら", "飛びながら"]),
                        clarity: Object.freeze(["検証を挟みつつ", "戻る導線を残しつつ", "影響範囲を限定しつつ", "周囲の理解を揃えつつ"]),
                        tendency: Object.freeze(["急に変えたくなる", "効率化が刺さりやすい", "周囲が追いつかないズレが出やすい", "戻す手順が必要になりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // neptune
                // --------------------------
                neptune: Object.freeze({
                    role: "溶解と共鳴の水脈",
                    core: "正しさが“にじみ”やすく、曖昧さが混ざりやすい",
                    tension: "精度を上げたい{drive}と、境界が薄まる揺れの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["にじみ", "余韻", "曖昧", "直感", "違和感センサー"]),
                        B: Object.freeze(["精度", "定義", "境界", "正誤", "輪郭"]),
                        expression: Object.freeze(["雰囲気", "言外", "置き方", "線引き", "伝達の揺れ"]),
                        process: Object.freeze(["にじませながら", "感覚で拾いながら", "余韻で判断しながら", "溶かしながら"]),
                        clarity: Object.freeze(["定義を一部残しつつ", "判断保留を許しつつ", "誤解ポイントを避けつつ", "確認工程を置きつつ"]),
                        tendency: Object.freeze(["違和感に敏感", "不明確がストレスになりやすい", "理想を追いやすい", "線引きが揺れやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "dissolve" }),
                }),

                // --------------------------
                // pluto
                // --------------------------
                pluto: Object.freeze({
                    role: "深層の圧と再編",
                    core: "細部に“圧”が乗り、根から直したくなる",
                    tension: "改善の徹底への{drive}と、壊しすぎる再編の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["徹底", "根治", "深掘り修正", "再設計", "臨界の精査"]),
                        B: Object.freeze(["壊しすぎ", "極端", "追い込み", "支配/被支配", "息苦しさ"]),
                        expression: Object.freeze(["直し方", "詰め方", "切り方", "再編の置き方", "品質の圧"]),
                        process: Object.freeze(["根から直しながら", "再設計しながら", "徹底しながら", "切り分けながら"]),
                        clarity: Object.freeze(["直す範囲を限定しつつ", "出口を先に作りつつ", "臨界点を見極めつつ", "追い込みすぎを止めつつ"]),
                        tendency: Object.freeze(["徹底が強い", "やり切ると大きく変わる", "追い込みに見えやすい", "一気に疲れが出やすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // chiron
                // --------------------------
                chiron: Object.freeze({
                    role: "傷から学びへ向かう入口",
                    core: "不備・ミス・不完全さが痛点として出やすい",
                    tension: "直したい{drive}と、責めたくない{drive}の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["痛点", "ミス", "不備", "不完全", "恥の反射"]),
                        B: Object.freeze(["自己責め", "過剰修正", "萎縮", "防衛", "隠す"]),
                        expression: Object.freeze(["反応", "守り方", "立て直し方", "距離", "触れ方"]),
                        process: Object.freeze(["直しながら", "点検しながら", "立て直しながら", "反応を見つつ"]),
                        clarity: Object.freeze(["責めと改善を切り分けつつ", "安全に直せる範囲を作りつつ", "再発防止を小さく入れつつ", "恥の反射を緩めつつ"]),
                        tendency: Object.freeze(["ミスに敏感", "早く直したくなる", "責めると固まりやすい", "学びに変わると回復が速い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // Lilith
                // --------------------------
                Lilith: Object.freeze({
                    role: "言語化されなかった主権",
                    core: "雑さやルール違反に対して“NO”が出やすい",
                    tension: "守りたい基準への{drive}と、合わせろと言われる圧の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["NO", "基準", "拒否", "規律", "線引き"]),
                        B: Object.freeze(["強要", "雑さ", "無秩序", "押し付け", "侵入"]),
                        expression: Object.freeze(["反射", "言い方", "距離", "境界", "止め方"]),
                        process: Object.freeze(["線を引きながら", "拒否で守りながら", "ルールで止めながら", "距離を取ることで保ちながら"]),
                        clarity: Object.freeze(["理由を短く言語化しつつ", "許せる範囲を定義しつつ", "過剰に切りすぎず", "基準を共有しつつ"]),
                        tendency: Object.freeze(["厳しく見えやすい", "指摘が鋭くなりやすい", "妥協が難しくなりやすい", "安全だと柔らかくなる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // asc
                // --------------------------
                asc: Object.freeze({
                    role: "入口と印象と身体感覚",
                    core: "整って見える入口。まず点検してから入る",
                    tension: "丁寧さへの{drive}と、外のスピード感の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["丁寧", "清潔感", "整い", "点検", "落ち着いた精度"]),
                        B: Object.freeze(["外テンポ", "急かし", "雑な圧", "即断", "スピード要求"]),
                        expression: Object.freeze(["振る舞い", "第一印象", "場の入り方", "距離感", "第一声"]),
                        process: Object.freeze(["点検しながら入っていきながら", "整えて入りながら", "丁寧に開きながら", "手順で入っていきながら"]),
                        clarity: Object.freeze(["必要時だけ速度を上げつつ", "雑さを受け取りすぎず", "境界を保ちつつ", "安心条件を先に確保しつつ"]),
                        tendency: Object.freeze(["きちんとして見えやすい", "近寄りにくく見えやすい", "信頼されやすい", "急かされると固くなる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),
            }),
        }),


        // ==========================================================
        // ♎ libra 天秤座 — FULL (sun..pluto + chiron/Lilith/asc)
        // ==========================================================
        libra: Object.freeze({
            label_ja: "天秤座",
            axis: "バランス・関係・調和",
            base: Object.freeze({
                flavor: "関係の“間”を整える空気。対話・公平・美意識で、衝突をやわらげながら形を作る質。",
                short: "関係の間合いを整えやすい。",
                keywords: Object.freeze(["調和", "バランス", "対話", "公平", "美意識"]),
            }),

            by_body: Object.freeze({
                // --------------------------
                // sun
                // --------------------------
                sun: Object.freeze({
                    role: "存在の核と方向づけ",
                    core: "関係の釣り合いを取ることで中心が定まる",
                    tension: "調和を取りたい{drive}と、優柔不断に見える{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["調和", "釣り合い", "公平", "対話", "品"]),
                        B: Object.freeze(["迷い", "どっちつかず", "迎合", "決めない", "表面化"]),
                        expression: Object.freeze(["判断", "選び方", "交渉", "距離", "合意形成"]),
                        process: Object.freeze(["整えながら", "対話しながら", "釣り合いを取りながら", "品を保ちながら"]),
                        clarity: Object.freeze(["基準を一つ置きつつ", "決める期限を作りつつ", "相手の事情も見つつ", "譲れる線を分けつつ"]),
                        tendency: Object.freeze(["関係が滑らかになりやすい", "決断が遅れやすい", "場の温度を下げやすい", "合意が取れると強い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // moon
                // --------------------------
                moon: Object.freeze({
                    role: "反応と安心の回路",
                    core: "空気が荒れないと安心が増える反応",
                    tension: "波風を避けたい{drive}と、本音を飲み込む{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["安心", "平穏", "やさしさ", "配慮", "空気"]),
                        B: Object.freeze(["我慢", "本音欠如", "気疲れ", "不満蓄積", "愛想笑い"]),
                        expression: Object.freeze(["反応", "気遣い", "距離", "本音の出し方", "場の保ち方"]),
                        process: Object.freeze(["なだめながら", "配慮しながら", "間合いを整えながら", "平穏を作りながら"]),
                        clarity: Object.freeze(["本音を小さく出しつつ", "我慢を可視化しつつ", "断る言葉を用意しつつ", "休む余白を作りつつ"]),
                        tendency: Object.freeze(["気遣いが増えやすい", "不満を溜めやすい", "荒れると消耗しやすい", "整うと回復が速い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // mercury
                // --------------------------
                mercury: Object.freeze({
                    role: "言葉と理解の通路",
                    core: "言葉で釣り合いを取る思考（対話・交渉）",
                    tension: "角を立てない言い方への{drive}と、曖昧になる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["対話", "調整", "言い換え", "交渉", "合意"]),
                        B: Object.freeze(["曖昧", "回りくどい", "核心回避", "結論不足", "言い逃れ"]),
                        expression: Object.freeze(["伝え方", "交渉", "言い方", "まとめ方", "結論"]),
                        process: Object.freeze(["言い換えながら", "調整しながら", "対話しながら", "合意を作りながら"]),
                        clarity: Object.freeze(["結論を一行置きつつ", "条件を箇条書きにしつつ", "曖昧語を減らしつつ", "相手の理解も確認しつつ"]),
                        tendency: Object.freeze(["交渉が上手くなりやすい", "結論を先延ばしにしやすい", "空気読みが増えやすい", "合意が取れると一気に進む"]),
                    }),
                    defaults: Object.freeze({ outputKey: "language", tryingKey: "try" }),
                }),

                // --------------------------
                // venus
                // --------------------------
                venus: Object.freeze({
                    role: "価値と好みの基準",
                    core: "美意識・品・調和に価値が集まる（天秤座の本丸）",
                    tension: "美しく整えたい{drive}と、体裁優先の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["美", "品", "調和", "洗練", "センス"]),
                        B: Object.freeze(["体裁", "外面", "無難", "迎合", "優等生"]),
                        expression: Object.freeze(["魅せ方", "選び方", "付き合い方", "距離", "整え方"]),
                        process: Object.freeze(["整えながら", "洗練させながら", "釣り合いを取りながら", "美を通しながら"]),
                        clarity: Object.freeze(["体裁と本心を分けつつ", "譲れない好みを一つ決めつつ", "無難に寄りすぎないようにしつつ", "関係の品を守りつつ"]),
                        tendency: Object.freeze(["魅力が上品に出やすい", "合わせ上手になりやすい", "外面が先に立ちやすい", "本音が出ると深くなる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // mars
                // --------------------------
                mars: Object.freeze({
                    role: "推進と境界のエンジン",
                    core: "衝突を避けつつ前進する“調整型の攻め”",
                    tension: "戦わない推進への{drive}と、決めきれない{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["調整推進", "協力", "折衷", "段取り", "交渉力"]),
                        B: Object.freeze(["決断不足", "腰が重い", "先延ばし", "イライラ", "受け身"]),
                        expression: Object.freeze(["動き方", "攻め方", "決め方", "境界", "折り合い"]),
                        process: Object.freeze(["整えながら進みながら", "協力しながら", "折衷しながら", "交渉しながら"]),
                        clarity: Object.freeze(["期限を切りつつ", "責任の所在を決めつつ", "衝突は避けつつ要点は通しつつ", "優先順位を一つ上げつつ"]),
                        tendency: Object.freeze(["協力で進みやすい", "単独だと止まりやすい", "イライラを飲み込みやすい", "合意が取れると速い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // jupiter
                // --------------------------
                jupiter: Object.freeze({
                    role: "拡大と意味づけ",
                    core: "関係・ネットワークが広がることで拡大する",
                    tension: "広げたい社交への{drive}と、薄さになる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["社交", "縁", "橋渡し", "協調", "広がり"]),
                        B: Object.freeze(["薄い", "八方美人", "表面", "優等生疲れ", "消耗"]),
                        expression: Object.freeze(["広げ方", "繋ぎ方", "紹介", "関係設計", "場作り"]),
                        process: Object.freeze(["橋渡ししながら", "繋ぎながら", "関係を整えながら", "場を作りながら"]),
                        clarity: Object.freeze(["深める縁を選びつつ", "広げる範囲を決めつつ", "紹介の条件を整えつつ", "消耗ラインを守りつつ"]),
                        tendency: Object.freeze(["縁が増えやすい", "好感が集まりやすい", "薄いと疲れやすい", "選別すると強い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // saturn
                // --------------------------
                saturn: Object.freeze({
                    role: "枠と時間の設計",
                    core: "公平なルールで関係を安定させる",
                    tension: "公平さの枠への{drive}と、冷たさに見える{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["公平", "ルール", "契約", "持続", "線引き"]),
                        B: Object.freeze(["冷たさ", "距離", "形式", "融通不足", "評価恐れ"]),
                        expression: Object.freeze(["合意", "契約", "線引き", "関係の枠", "続け方"]),
                        process: Object.freeze(["枠を作りながら", "線を引きながら", "合意を固定しながら", "持続させながら"]),
                        clarity: Object.freeze(["温度と言葉を足しつつ", "条件を明文化しつつ", "融通の余白も残しつつ", "冷たくならない配慮をしつつ"]),
                        tendency: Object.freeze(["関係が安定しやすい", "形式が増えやすい", "冷えやすい", "合意が強い土台になる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // uranus
                // --------------------------
                uranus: Object.freeze({
                    role: "更新とズレのスイッチ",
                    core: "関係の形を刷新したくなる（新しい距離・新しい合意）",
                    tension: "更新したい{drive}と、関係が不安定になる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["刷新", "新ルール", "自由な距離", "再交渉", "アップデート"]),
                        B: Object.freeze(["不安定", "急変", "断絶", "気分変化", "ズレ拡大"]),
                        expression: Object.freeze(["距離", "関係の更新", "合意の再定義", "離れ方", "戻し方"]),
                        process: Object.freeze(["更新しながら", "再交渉しながら", "距離を変えながら", "新ルールを入れながら"]),
                        clarity: Object.freeze(["急変しすぎないようにしつつ", "一度試す期間を作りつつ", "戻る導線も残しつつ", "相手の安全感も見つつ"]),
                        tendency: Object.freeze(["関係が変わりやすい", "新しい形が生まれやすい", "急だと崩れやすい", "合うと自由で強い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // neptune
                // --------------------------
                neptune: Object.freeze({
                    role: "溶解と共鳴の水脈",
                    core: "空気で調和する（雰囲気で丸くなる）",
                    tension: "丸めたい{drive}と、境界が溶ける{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["雰囲気", "共鳴", "やわらげる", "包む", "余韻"]),
                        B: Object.freeze(["曖昧", "境界溶解", "依存", "誤解", "現実逃避"]),
                        expression: Object.freeze(["空気", "曖昧さの扱い", "境界", "余韻", "言わない選択"]),
                        process: Object.freeze(["包みながら", "やわらげながら", "余韻を残しながら", "共鳴させながら"]),
                        clarity: Object.freeze(["境界を一言添えつつ", "曖昧を放置しすぎないようにしつつ", "誤解ポイントを潰しつつ", "現実の線も引きつつ"]),
                        tendency: Object.freeze(["衝突が減りやすい", "曖昧が増えやすい", "誤解が起きやすい", "線があると美しく収まる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "dissolve" }),
                }),

                // --------------------------
                // pluto
                // --------------------------
                pluto: Object.freeze({
                    role: "深層の圧と再編",
                    core: "関係の力学を根から組み替える圧",
                    tension: "公平にしたい再編への{drive}と、支配/依存になる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["再編", "力学", "対等", "深い合意", "関係の核"]),
                        B: Object.freeze(["支配", "依存", "裏取引", "圧", "断絶"]),
                        expression: Object.freeze(["関係の再定義", "合意", "距離", "力の扱い", "終わらせ方"]),
                        process: Object.freeze(["組み替えながら", "対等を作りながら", "深い合意を結びながら", "核を据えながら"]),
                        clarity: Object.freeze(["対等の条件を明文化しつつ", "圧を使いすぎないようにしつつ", "依存ポイントを見つつ", "終わらせる線も残しつつ"]),
                        tendency: Object.freeze(["関係が濃くなりやすい", "力学が表に出やすい", "支配/依存に傾きやすい", "対等に戻ると一気に整う"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // chiron
                // --------------------------
                chiron: Object.freeze({
                    role: "傷から学びへ向かう入口",
                    core: "不公平・評価・比較が痛点になりやすい",
                    tension: "公平でいたい{drive}と、比較で傷つく{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["不公平", "比較", "評価", "痛み", "関係の傷"]),
                        B: Object.freeze(["迎合", "我慢", "被害感", "自己否定", "決めない"]),
                        expression: Object.freeze(["反応", "線引き", "本音の出し方", "関係の修復", "距離"]),
                        process: Object.freeze(["釣り合いを戻しながら", "比較をほどきながら", "線を引き直しながら", "関係を整え直しながら"]),
                        clarity: Object.freeze(["比較を事実と感情で分けつつ", "不公平ポイントを言語化しつつ", "迎合を減らしつつ", "対等の条件を置きつつ"]),
                        tendency: Object.freeze(["比較で痛みが出やすい", "迎合で消耗しやすい", "対等が回復薬になる", "整うと安心が増える"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // Lilith
                // --------------------------
                Lilith: Object.freeze({
                    role: "言語化されなかった主権",
                    core: "不公平・無礼に対して“NO”が出る（品の主権）",
                    tension: "品を守る拒否への{drive}と、冷たい断絶に見える{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["品", "尊重", "NO", "対等", "主権"]),
                        B: Object.freeze(["無礼", "不公平", "軽視", "マウント", "雑な扱い"]),
                        expression: Object.freeze(["拒否", "言い方", "距離", "切り方", "戻し方"]),
                        process: Object.freeze(["品で線を引きながら", "対等を守りながら", "無礼を止めながら", "距離を調整しながら"]),
                        clarity: Object.freeze(["断る言葉を短く置きつつ", "冷たくなりすぎない温度も添えつつ", "対等の条件を示しつつ", "切る前に一段階置きつつ"]),
                        tendency: Object.freeze(["無礼に敏感", "切ると速い", "冷たいと誤解されやすい", "品の線があると強い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // asc
                // --------------------------
                asc: Object.freeze({
                    role: "入口と印象と身体感覚",
                    core: "感じがいい・整っている印象で場に入る",
                    tension: "好印象を保つ入口への{drive}と、無理して合わせる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["好印象", "品", "整い", "社交", "スマート"]),
                        B: Object.freeze(["無理", "合わせ疲れ", "本音欠如", "優等生感", "消耗"]),
                        expression: Object.freeze(["振る舞い", "第一声", "距離感", "合わせ方", "抜け方"]),
                        process: Object.freeze(["整えて入りながら", "感じよく入りながら", "社交で入りながら", "スマートに入りながら"]),
                        clarity: Object.freeze(["無理な合わせを減らしつつ", "本音の居場所も作りつつ", "抜ける導線を持ちつつ", "好印象のための我慢を減らしつつ"]),
                        tendency: Object.freeze(["好感を持たれやすい", "合わせすぎて疲れやすい", "本音が見えにくくなりやすい", "適度に抜くと最強"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),
            }),
        }),


        // ==========================================================
        // ♏ scorpio 蠍座 — FULL (sun..pluto + chiron/Lilith/asc)
        // ==========================================================
        scorpio: Object.freeze({
            label_ja: "蠍座",
            axis: "深さ・結び目・変容",
            base: Object.freeze({
                flavor: "奥まで触れる水脈。表面ではなく核に届く“深さ”で関係や事象を捉え、結び目をほどき直して変容させる質。",
                short: "核に触れ、結び目をほどき直しやすい。",
                keywords: Object.freeze(["深層", "結び", "洞察", "守秘", "変容"]),
            }),

            by_body: Object.freeze({
                // --------------------------
                // sun
                // --------------------------
                sun: Object.freeze({
                    role: "存在の核と方向づけ",
                    core: "核まで届く関与で中心が定まる",
                    tension: "深く関わりたい{drive}と、閉じる/疑う{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["核", "本質", "洞察", "集中", "誠実"]),
                        B: Object.freeze(["疑い", "閉鎖", "支配", "執着", "極端"]),
                        expression: Object.freeze(["関与", "選び方", "守り方", "距離", "覚悟"]),
                        process: Object.freeze(["奥へ進みながら", "掘り下げながら", "核を見ながら", "誠実さを保ちながら"]),
                        clarity: Object.freeze(["関与の範囲を決めつつ", "信頼の条件を言語化しつつ", "極端になりすぎないようにしつつ", "閉じる前に確認しつつ"]),
                        tendency: Object.freeze(["集中すると強い", "疑いが強まると止まりやすい", "覚悟が決まると一気に進む", "浅い関係は合いにくい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // moon
                // --------------------------
                moon: Object.freeze({
                    role: "反応と安心の回路",
                    core: "信頼できる深さがあると安心が増える反応",
                    tension: "安心したい{drive}と、裏切りを恐れる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["安心", "信頼", "深い絆", "守秘", "静けさ"]),
                        B: Object.freeze(["不信", "疑念", "警戒", "嫉妬", "孤立"]),
                        expression: Object.freeze(["反応", "守り", "距離", "本音", "境界"]),
                        process: Object.freeze(["確かめながら", "静かに見ながら", "深く結びながら", "守りながら"]),
                        clarity: Object.freeze(["疑いを事実確認に戻しつつ", "安心の条件を共有しつつ", "一人で抱えすぎないようにしつつ", "境界を短く置きつつ"]),
                        tendency: Object.freeze(["信頼があると回復が速い", "警戒が強いと疲れやすい", "本音は遅れて出やすい", "深い関係で安定する"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // mercury
                // --------------------------
                mercury: Object.freeze({
                    role: "言葉と理解の通路",
                    core: "表面を越えて核心を突く思考（洞察・追跡）",
                    tension: "核心に迫る言葉への{drive}と、詰めすぎる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["洞察", "核心", "分析", "裏取り", "真相"]),
                        B: Object.freeze(["詰問", "疑い", "皮肉", "秘密主義", "言わない"]),
                        expression: Object.freeze(["問い", "調査", "伝え方", "沈黙", "真実の扱い"]),
                        process: Object.freeze(["掘り下げながら", "裏を取りながら", "核心に寄せながら", "沈黙を使いながら"]),
                        clarity: Object.freeze(["問いを目的化しすぎないようにしつつ", "詰める前に前提を共有しつつ", "沈黙の理由を短く添えつつ", "必要なところだけ言語化しつつ"]),
                        tendency: Object.freeze(["本質に近づきやすい", "疑いが増えると尖りやすい", "沈黙が誤解を生みやすい", "言葉が刺さりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "language", tryingKey: "observe" }),
                }),

                // --------------------------
                // venus
                // --------------------------
                venus: Object.freeze({
                    role: "価値と好みの基準",
                    core: "浅さより深さ、広さより濃さに価値が集まる",
                    tension: "濃い関係を求める{drive}と、重さになる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["深い絆", "一途", "秘密", "濃度", "誠実"]),
                        B: Object.freeze(["重い", "束縛", "嫉妬", "独占", "疑い"]),
                        expression: Object.freeze(["愛し方", "選び方", "距離", "守り", "境界"]),
                        process: Object.freeze(["深めながら", "濃度を上げながら", "守りながら", "誠実さを確かめながら"]),
                        clarity: Object.freeze(["重さの線を自覚しつつ", "独占を合意に戻しつつ", "嫉妬を事実確認に戻しつつ", "守秘と共有の線を決めつつ"]),
                        tendency: Object.freeze(["一途さが魅力になりやすい", "不信だと一気に冷える", "深い関係で強い", "軽い関係は消耗しやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // mars
                // --------------------------
                mars: Object.freeze({
                    role: "推進と境界のエンジン",
                    core: "一点突破の集中で進む（やると決めたら強い）",
                    tension: "集中する推進への{drive}と、執着に変わる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["集中", "突破", "覚悟", "粘り", "深掘り"]),
                        B: Object.freeze(["執着", "報復心", "極端", "疑い", "消耗"]),
                        expression: Object.freeze(["動き方", "攻め方", "継続", "境界", "切り替え"]),
                        process: Object.freeze(["一点に絞りながら", "掘り進めながら", "粘りながら", "覚悟を保ちながら"]),
                        clarity: Object.freeze(["撤退ラインも置きつつ", "執着を目的にしないようにしつつ", "休みを挟みつつ", "信頼の条件を確認しつつ"]),
                        tendency: Object.freeze(["一撃の強さが出やすい", "切り替えが遅れやすい", "消耗しやすい", "決まると圧倒的"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // jupiter
                // --------------------------
                jupiter: Object.freeze({
                    role: "拡大と意味づけ",
                    core: "深掘りと変容が広がりを生む（濃い学びが増える）",
                    tension: "深めたい{drive}と、沼る{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["探究", "変容", "心理", "本質", "濃い学び"]),
                        B: Object.freeze(["沼", "偏り", "疑い", "極端", "閉じる"]),
                        expression: Object.freeze(["学び方", "掘り方", "共有", "影響力", "変化"]),
                        process: Object.freeze(["深めながら", "変容させながら", "掘り当てながら", "濃度を上げながら"]),
                        clarity: Object.freeze(["広げるテーマを一つ決めつつ", "沼の兆候を早めに見つつ", "アウトプットの窓口を作りつつ", "閉じすぎないようにしつつ"]),
                        tendency: Object.freeze(["探究が強みに直結しやすい", "偏ると視野が狭くなる", "深い学びが人を動かす", "共有すると循環する"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // saturn
                // --------------------------
                saturn: Object.freeze({
                    role: "枠と時間の設計",
                    core: "信頼と守秘の枠で関係を安定させる",
                    tension: "守りの枠への{drive}と、硬さ/疑いになる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["信頼", "守秘", "契約", "境界", "継続"]),
                        B: Object.freeze(["硬い", "不信", "閉鎖", "監視", "孤立"]),
                        expression: Object.freeze(["線引き", "約束", "継続", "守り", "責任"]),
                        process: Object.freeze(["境界を作りながら", "守りながら", "約束を固定しながら", "継続させながら"]),
                        clarity: Object.freeze(["監視にならないようにしつつ", "信頼の条件を明文化しつつ", "孤立しない導線も残しつつ", "硬さに温度を足しつつ"]),
                        tendency: Object.freeze(["関係が堅牢になりやすい", "閉じると孤立しやすい", "信頼があると長く続く", "枠が安心になる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // uranus
                // --------------------------
                uranus: Object.freeze({
                    role: "更新とズレのスイッチ",
                    core: "結び目を一気に切り替える更新（急な断捨離/急な再編）",
                    tension: "切り替えの速さへの{drive}と、断絶になる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["再編", "断捨離", "更新", "急転", "解放"]),
                        B: Object.freeze(["断絶", "急すぎる", "冷却", "破壊", "孤立"]),
                        expression: Object.freeze(["切り替え", "離れ方", "戻し方", "再定義", "更新"]),
                        process: Object.freeze(["切り替えながら", "ほどき直しながら", "再編しながら", "急転しながら"]),
                        clarity: Object.freeze(["急転前に一段階置きつつ", "断絶ではなく再定義に戻しつつ", "戻れる導線も残しつつ", "衝動を確認しつつ"]),
                        tendency: Object.freeze(["関係が一気に変わりやすい", "断捨離が進みやすい", "急だと後悔しやすい", "再編すると軽くなる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // neptune
                // --------------------------
                neptune: Object.freeze({
                    role: "溶解と共鳴の水脈",
                    core: "境界が溶けやすく、深い共鳴が起きやすい",
                    tension: "溶ける共鳴への{drive}と、依存/幻想になる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["共鳴", "溶解", "直感", "夢", "深い余韻"]),
                        B: Object.freeze(["依存", "幻想", "境界不明", "秘密", "逃避"]),
                        expression: Object.freeze(["距離", "境界", "余韻", "信頼", "現実の線"]),
                        process: Object.freeze(["溶けながら", "深く共鳴しながら", "余韻を残しながら", "境界を揺らしながら"]),
                        clarity: Object.freeze(["現実の線を言葉で置きつつ", "依存の兆候を見つつ", "秘密と共有を分けつつ", "逃避に寄りすぎないようにしつつ"]),
                        tendency: Object.freeze(["深い共鳴が起きやすい", "境界が溶けやすい", "依存に傾きやすい", "線があると美しくなる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "dissolve" }),
                }),

                // --------------------------
                // pluto
                // --------------------------
                pluto: Object.freeze({
                    role: "深層の圧と再編",
                    core: "変容の根本スイッチ（蠍座の支配星的な核）",
                    tension: "再生させる圧への{drive}と、支配/破壊になる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["変容", "再生", "核", "圧", "真実"]),
                        B: Object.freeze(["支配", "破壊", "執着", "報復", "極端"]),
                        expression: Object.freeze(["再定義", "終わらせ方", "再生", "力の扱い", "核の移し替え"]),
                        process: Object.freeze(["壊して組み替えながら", "終わらせて始めながら", "核を移し替えながら", "再生させながら"]),
                        clarity: Object.freeze(["支配に寄せないようにしつつ", "終わらせる基準を置きつつ", "再生の手順を作りつつ", "圧を目的化しないようにしつつ"]),
                        tendency: Object.freeze(["人生のテーマが動きやすい", "関係が極端になりやすい", "核が変わると一気に軽い", "再生力が強い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // chiron
                // --------------------------
                chiron: Object.freeze({
                    role: "傷から学びへ向かう入口",
                    core: "信頼・裏切り・秘密が痛点になりやすい",
                    tension: "信じたい{drive}と、疑いが残る{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["裏切り", "秘密", "信頼", "傷", "深い痛み"]),
                        B: Object.freeze(["疑い", "閉鎖", "監視", "孤立", "支配"]),
                        expression: Object.freeze(["反応", "守り", "境界", "信頼の再構築", "距離"]),
                        process: Object.freeze(["信頼を作り直しながら", "秘密の扱いを整えながら", "境界を引き直しながら", "痛みを学びに変えながら"]),
                        clarity: Object.freeze(["疑いを事実確認に戻しつつ", "信頼条件を明文化しつつ", "監視をやめる線を決めつつ", "孤立しない導線を作りつつ"]),
                        tendency: Object.freeze(["信頼テーマが浮上しやすい", "閉じると長引きやすい", "再構築すると強い", "境界が回復薬になる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // Lilith
                // --------------------------
                Lilith: Object.freeze({
                    role: "言語化されなかった主権",
                    core: "嘘・薄さ・裏切りに対して“NO”が出る（深さの主権）",
                    tension: "切る主権への{drive}と、断罪/破壊になる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["真実", "NO", "主権", "深さ", "守り"]),
                        B: Object.freeze(["嘘", "薄さ", "裏切り", "軽視", "二枚舌"]),
                        expression: Object.freeze(["拒否", "切る", "距離", "沈黙", "再交渉"]),
                        process: Object.freeze(["真実を守りながら", "切り分けながら", "深さを守りながら", "嘘を止めながら"]),
                        clarity: Object.freeze(["断罪にしない言葉を選びつつ", "切る前に条件提示を置きつつ", "破壊ではなく分離に戻しつつ", "沈黙の意図を短く添えつつ"]),
                        tendency: Object.freeze(["嘘に敏感", "切ると速い", "断罪に寄ると重い", "真実の線があると強い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // asc
                // --------------------------
                asc: Object.freeze({
                    role: "入口と印象と身体感覚",
                    core: "静かな圧・深い目線で場に入る",
                    tension: "近づきにくい印象への{drive}と、守りが強くなる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["静けさ", "深い目線", "圧", "落ち着き", "守秘"]),
                        B: Object.freeze(["近寄りがたい", "警戒", "重い", "閉じる", "誤解"]),
                        expression: Object.freeze(["振る舞い", "距離感", "第一声", "守り方", "開き方"]),
                        process: Object.freeze(["静かに入りながら", "様子を見ながら", "距離を保ちながら", "深さを保ちながら"]),
                        clarity: Object.freeze(["近寄りがたい印象を和らげつつ", "安心できる場を選びつつ", "開くタイミングを決めつつ", "誤解ポイントを言葉で置きつつ"]),
                        tendency: Object.freeze(["深い印象を持たれやすい", "警戒が強いと孤立しやすい", "信頼ができると急に近い", "場選びが重要"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),
            }),
        }),


        // ==========================================================
        // ♐ sagittarius 射手座 — FULL (sun..pluto + chiron/Lilith/asc)
        // ==========================================================
        sagittarius: Object.freeze({
            label_ja: "射手座",
            axis: "拡張・探求・視野",
            base: Object.freeze({
                flavor: "遠くを見る火。意味を引き上げ、世界を広げる“探求”で動く。経験・旅・学びを通して、視野の更新が起きやすい質。",
                short: "視野を広げ、意味を引き上げやすい。",
                keywords: Object.freeze(["探求", "拡張", "視野", "自由", "信念"]),
            }),

            by_body: Object.freeze({
                // --------------------------
                // sun
                // --------------------------
                sun: Object.freeze({
                    role: "存在の核と方向づけ",
                    core: "広い視野と信念が中心を作る",
                    tension: "自由に伸びたい中心への{drive}と、雑さ/言い切りの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["自由", "探求", "希望", "視野", "信念"]),
                        B: Object.freeze(["雑", "言い切り", "逃げ", "飽き", "無責任"]),
                        expression: Object.freeze(["方向", "選択", "言葉", "挑戦", "伸び方"]),
                        process: Object.freeze(["広げながら", "試しながら", "意味を見つけながら", "遠くを見ながら"]),
                        clarity: Object.freeze(["雑さを点検しつつ", "言い切りを仮説に戻しつつ", "足元の手順も置きつつ", "自由の範囲を決めつつ"]),
                        tendency: Object.freeze(["希望で動きやすい", "飽きると切り替えが早い", "言葉が強く出やすい", "視野が広いほど強い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // moon
                // --------------------------
                moon: Object.freeze({
                    role: "反応と安心の回路",
                    core: "閉じない空気・余白があると安心が増える反応",
                    tension: "自由でいたい心への{drive}と、縛られる恐れの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["安心", "余白", "自由", "希望", "風通し"]),
                        B: Object.freeze(["閉塞", "束縛", "退屈", "不信", "投げる"]),
                        expression: Object.freeze(["反応", "距離", "気分", "本音", "戻り方"]),
                        process: Object.freeze(["風を通しながら", "軽く動きながら", "広げながら", "余白を確保しながら"]),
                        clarity: Object.freeze(["縛りを言語化して避けつつ", "退屈を刺激に変えつつ", "投げる前に一段階置きつつ", "戻れる余白も残しつつ"]),
                        tendency: Object.freeze(["余白があると回復が速い", "束縛で反発が出やすい", "気分の切り替えが早い", "希望があると強い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "observe" }),
                }),

                // --------------------------
                // mercury
                // --------------------------
                mercury: Object.freeze({
                    role: "言葉と理解の通路",
                    core: "全体像を掴んで方向を示す思考（俯瞰・概念）",
                    tension: "大づかみの言葉への{drive}と、雑/飛躍の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["俯瞰", "概念", "哲学", "方向", "学び"]),
                        B: Object.freeze(["雑", "飛躍", "決めつけ", "説教", "置いてく"]),
                        expression: Object.freeze(["説明", "共有", "問い", "定義", "伝え方"]),
                        process: Object.freeze(["俯瞰しながら", "意味を引き上げながら", "学びを繋げながら", "方向を示しながら"]),
                        clarity: Object.freeze(["前提を短く添えつつ", "飛躍を一段戻しつつ", "説教にならない温度を足しつつ", "具体例を一つ置きつつ"]),
                        tendency: Object.freeze(["話が広がりやすい", "結論が早くなりやすい", "学びが循環しやすい", "方向づけが得意"]),
                    }),
                    defaults: Object.freeze({ outputKey: "language", tryingKey: "observe" }),
                }),

                // --------------------------
                // venus
                // --------------------------
                venus: Object.freeze({
                    role: "価値と好みの基準",
                    core: "自由・成長・可能性に価値が集まる",
                    tension: "伸びる関係を求める価値への{drive}と、飽き/軽さの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["自由", "成長", "希望", "冒険", "余白"]),
                        B: Object.freeze(["飽き", "軽い", "逃げ", "無責任", "約束が薄い"]),
                        expression: Object.freeze(["愛し方", "選び方", "距離", "約束", "遊び方"]),
                        process: Object.freeze(["伸ばしながら", "一緒に学びながら", "冒険しながら", "余白を保ちながら"]),
                        clarity: Object.freeze(["軽さを誠実に調整しつつ", "約束の粒度を決めつつ", "逃げを切り替えに戻しつつ", "飽きを更新に変えつつ"]),
                        tendency: Object.freeze(["楽しいと魅力が増す", "縛りで冷える", "新しい体験で育つ", "可能性に恋しやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // mars
                // --------------------------
                mars: Object.freeze({
                    role: "推進と境界のエンジン",
                    core: "遠くを狙って走る推進（挑戦・移動・拡張）",
                    tension: "勢いの推進への{drive}と、詰めの甘さ/暴走の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["挑戦", "加速", "移動", "冒険", "突破"]),
                        B: Object.freeze(["暴走", "詰めが甘い", "雑", "置いてく", "逃げ"]),
                        expression: Object.freeze(["動き方", "挑戦", "継続", "詰め", "止まり方"]),
                        process: Object.freeze(["走りながら", "広げながら", "試しながら", "遠くを狙いながら"]),
                        clarity: Object.freeze(["詰めの工程も作りつつ", "暴走前に速度調整しつつ", "置いてくを共有に戻しつつ", "撤退ラインも置きつつ"]),
                        tendency: Object.freeze(["勢いで進みやすい", "詰めが弱いと止まる", "移動で整う", "挑戦で燃える"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // jupiter
                // --------------------------
                jupiter: Object.freeze({
                    role: "拡大と意味づけ",
                    core: "射手座の主領域：学びと拡張が自然に増える",
                    tension: "拡大の勢いへの{drive}と、過信/言い切りの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["拡大", "学び", "幸運", "視野", "意味"]),
                        B: Object.freeze(["過信", "言い切り", "誇張", "散漫", "雑"]),
                        expression: Object.freeze(["広げ方", "学び", "伝播", "挑戦", "信念"]),
                        process: Object.freeze(["広げながら", "学びながら", "伝えながら", "遠くに伸ばしながら"]),
                        clarity: Object.freeze(["誇張を点検しつつ", "散漫をテーマで束ねつつ", "言い切りを仮説に戻しつつ", "足元の検証も入れつつ"]),
                        tendency: Object.freeze(["学ぶほど運が増える", "視野が広いと強い", "過信で雑になりやすい", "意味づけが上手い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // saturn
                // --------------------------
                saturn: Object.freeze({
                    role: "枠と時間の設計",
                    core: "自由を守るためのルールを作る（長距離走の設計）",
                    tension: "自由の枠への{drive}と、窮屈/説教の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["設計", "継続", "規律", "学びの積み上げ", "長期"]),
                        B: Object.freeze(["窮屈", "説教", "硬い信念", "否定", "縛り"]),
                        expression: Object.freeze(["ルール", "継続", "学び方", "守り", "距離"]),
                        process: Object.freeze(["長期で積み上げながら", "自由を守りながら", "ルールを整えながら", "道を作りながら"]),
                        clarity: Object.freeze(["説教温度を下げつつ", "縛りを目的化しないようにしつつ", "自由の定義を共有しつつ", "長期計画を小分けにしつつ"]),
                        tendency: Object.freeze(["続けると強い", "信念が硬いと当たりやすい", "枠があると自由が増える", "学びが成果になる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // uranus
                // --------------------------
                uranus: Object.freeze({
                    role: "更新とズレのスイッチ",
                    core: "世界観が更新されやすい（急に視野が変わる）",
                    tension: "更新の速さへの{drive}と、落ち着かない{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["更新", "自由", "新世界", "飛躍", "発見"]),
                        B: Object.freeze(["落ち着かない", "散漫", "飽き", "断絶", "突発"]),
                        expression: Object.freeze(["切り替え", "学び直し", "移動", "再定義", "実験"]),
                        process: Object.freeze(["視野を更新しながら", "飛びながら", "実験しながら", "切り替えながら"]),
                        clarity: Object.freeze(["落ち着く場所も確保しつつ", "断絶を共有に戻しつつ", "実験期間を決めつつ", "散漫をテーマで束ねつつ"]),
                        tendency: Object.freeze(["急に方向転換しやすい", "新しい景色で復活する", "飽きが早い", "発見が多い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // neptune
                // --------------------------
                neptune: Object.freeze({
                    role: "溶解と共鳴の水脈",
                    core: "理想や物語で世界が広がる（遠くへ飛ぶ夢）",
                    tension: "理想の拡張への{drive}と、現実離れ/逃避の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["理想", "夢", "物語", "共鳴", "希望"]),
                        B: Object.freeze(["現実離れ", "逃避", "誇張", "曖昧", "散漫"]),
                        expression: Object.freeze(["理想", "距離", "現実の線", "共有", "余韻"]),
                        process: Object.freeze(["遠くへ飛びながら", "理想を広げながら", "物語を描きながら", "余韻を残しながら"]),
                        clarity: Object.freeze(["現実の線を一つ置きつつ", "逃避を休息に戻しつつ", "誇張を点検しつつ", "曖昧を短く補助しつつ"]),
                        tendency: Object.freeze(["理想が推進になる", "現実から離れやすい", "物語で人が動く", "線があると強い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "dissolve" }),
                }),

                // --------------------------
                // pluto
                // --------------------------
                pluto: Object.freeze({
                    role: "深層の圧と再編",
                    core: "信念が入れ替わる変容（世界観の再編）",
                    tension: "変容の圧への{drive}と、断定/排他の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["変容", "信念", "再編", "真実", "覚悟"]),
                        B: Object.freeze(["断定", "排他", "極端", "支配", "燃え尽き"]),
                        expression: Object.freeze(["世界観", "選別", "再定義", "終わらせ方", "再出発"]),
                        process: Object.freeze(["世界観を組み替えながら", "信念を更新しながら", "選別しながら", "再出発しながら"]),
                        clarity: Object.freeze(["断定を仮説に戻しつつ", "排他を境界に戻しつつ", "燃え尽き前に休みを入れつつ", "再出発の条件を決めつつ"]),
                        tendency: Object.freeze(["信念が変わると人生が動く", "極端になりやすい", "選別が進む", "再出発が強い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // chiron
                // --------------------------
                chiron: Object.freeze({
                    role: "傷から学びへ向かう入口",
                    core: "信念・正しさ・自由の領域が痛点になりやすい",
                    tension: "信じたい心への{drive}と、否定された痛みの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["信念", "正しさ", "自由", "学び", "理想"]),
                        B: Object.freeze(["否定", "説教", "恥", "硬い正義", "孤立"]),
                        expression: Object.freeze(["言葉", "距離", "学び直し", "共有", "柔らかさ"]),
                        process: Object.freeze(["学び直しながら", "言葉を更新しながら", "自由を取り戻しながら", "柔らかくしながら"]),
                        clarity: Object.freeze(["正しさを押し付けにしないようにしつつ", "否定を事実と感情に分けつつ", "学びを小さく試しつつ", "孤立しない対話を残しつつ"]),
                        tendency: Object.freeze(["正しさで傷つきやすい", "柔らかくすると回復する", "学び直しで強くなる", "自由が回復薬になる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // Lilith
                // --------------------------
                Lilith: Object.freeze({
                    role: "言語化されなかった主権",
                    core: "束縛・停滞・偽善に対して“NO”が出る（自由の主権）",
                    tension: "自由の主権への{drive}と、反発/断絶になる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["NO", "自由", "主権", "本音", "突破"]),
                        B: Object.freeze(["束縛", "停滞", "偽善", "説教", "狭さ"]),
                        expression: Object.freeze(["拒否", "離れる", "再交渉", "突破", "新天地"]),
                        process: Object.freeze(["抜け道を作りながら", "突破しながら", "新天地を探しながら", "自由を守りながら"]),
                        clarity: Object.freeze(["反発を目的化しないようにしつつ", "断絶より再交渉を一段置きつつ", "狭さを条件提示に戻しつつ", "本音を短く出しつつ"]),
                        tendency: Object.freeze(["縛りに敏感", "抜け道が見える", "反発が強いと孤立しやすい", "新天地で復活する"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "try" }),
                }),

                // --------------------------
                // asc
                // --------------------------
                asc: Object.freeze({
                    role: "入口と印象と身体感覚",
                    core: "明るい伸び・遠くを見る雰囲気で場に入る",
                    tension: "軽さの印象への{drive}と、無責任に見える{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["明るさ", "伸び", "風通し", "好奇心", "軽快"]),
                        B: Object.freeze(["軽い", "雑", "無責任", "落ち着かない", "飽き"]),
                        expression: Object.freeze(["振る舞い", "第一声", "距離感", "場選び", "落ち着き"]),
                        process: Object.freeze(["軽く入りながら", "場を広げながら", "好奇心で動きながら", "遠くを見ながら"]),
                        clarity: Object.freeze(["無責任に見える点を補助しつつ", "雑さを一段整えつつ", "落ち着く拠点も持ちつつ", "飽きの扱いを共有しつつ"]),
                        tendency: Object.freeze(["話しかけやすい印象になりやすい", "落ち着きが薄いと誤解されやすい", "好奇心で場が動く", "拠点があると強い"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),
            }),
        }),


        // ==========================================================
        // ♑ capricorn 山羊座 — FULL (sun..pluto + chiron/Lilith/asc)
        // ==========================================================
        capricorn: Object.freeze({
            label_ja: "山羊座",
            axis: "構造・責任・積み上げ",
            base: Object.freeze({
                flavor: "時間と形を優先して現実を組む土。成果・責任・持続のために、段取りと耐久で進める質。",
                short: "形と時間で積み上げやすい。",
                keywords: Object.freeze(["構造", "責任", "積み上げ", "現実", "耐久"]),
            }),

            by_body: Object.freeze({
                // --------------------------
                // sun
                // --------------------------
                sun: Object.freeze({
                    role: "存在の核と方向づけ",
                    core: "形にして責任を引き受けることで中心を立てたい",
                    tension: "背負う強さへの{drive}と、背負いすぎ（重さ）の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["責任", "骨格", "現実化", "到達", "積み上げ"]),
                        B: Object.freeze(["重さ", "背負いすぎ", "硬直", "怖さ", "遅れ"]),
                        expression: Object.freeze(["立ち方", "選び方", "進め方", "約束", "成果"]),
                        process: Object.freeze(["積み上げながら", "形にしながら", "責任を引き受けながら", "段取りで進めながら"]),
                        clarity: Object.freeze(["背負う範囲を区切りつつ", "硬直を緩めつつ", "遅れを工程に戻しつつ", "到達点を小分けにしつつ"]),
                        tendency: Object.freeze(["責任感が前に出やすい", "遅いが確実", "成果で安定する", "抱えすぎると硬くなる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // moon
                // --------------------------
                moon: Object.freeze({
                    role: "反応と安心の回路",
                    core: "見通しと段取りがあると安心が増える反応",
                    tension: "崩したくない安定への{drive}と、想定外の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["見通し", "段取り", "安定", "管理", "秩序"]),
                        B: Object.freeze(["想定外", "崩れ", "不確か", "遅延", "無力感"]),
                        expression: Object.freeze(["反応", "守り方", "不安の出方", "戻し方", "境界"]),
                        process: Object.freeze(["段取りを整えながら", "見通しを確保しながら", "管理しながら", "崩れを戻しながら"]),
                        clarity: Object.freeze(["想定外を分解しつつ", "遅延を工程に戻しつつ", "守る点を限定しつつ", "完璧を目標にしすぎず"]),
                        tendency: Object.freeze(["不安が管理へ寄りやすい", "崩れで反応が硬くなりやすい", "見通しが戻ると回復が早い", "無力感が出ると黙りやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "settle" }),
                }),

                // --------------------------
                // mercury
                // --------------------------
                mercury: Object.freeze({
                    role: "言葉と理解の通路",
                    core: "結論と手順で現実に落としたい思考",
                    tension: "実務の言葉への{drive}と、温度が削げる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["結論", "手順", "現実", "要点", "説明"]),
                        B: Object.freeze(["温度が削げる", "冷たく見える", "固い", "余白不足", "圧"]),
                        expression: Object.freeze(["言葉", "まとめ方", "伝え方", "線引き", "会話テンポ"]),
                        process: Object.freeze(["手順で組みながら", "結論から置きながら", "現実に落としながら", "要点を詰めながら"]),
                        clarity: Object.freeze(["温度を一文添えつつ", "余白を残しつつ", "圧を指示ではなく共有に戻しつつ", "段階を書き分けつつ"]),
                        tendency: Object.freeze(["実務的に強い", "短く固くなりやすい", "決まると早い", "温度調整が鍵になりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "language", tryingKey: "settle" }),
                }),

                // --------------------------
                // venus
                // --------------------------
                venus: Object.freeze({
                    role: "価値と好みの基準",
                    core: "信頼・継続・実績に価値が集まりやすい",
                    tension: "誠実さの価値への{drive}と、楽しさ/軽さが抜ける{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["信頼", "誠実", "実績", "継続", "品格"]),
                        B: Object.freeze(["堅さ", "楽しさ不足", "軽さの欠如", "息苦しさ", "評価疲れ"]),
                        expression: Object.freeze(["好み", "距離感", "関係の育て方", "選び方", "約束"]),
                        process: Object.freeze(["育てながら", "積み上げながら", "信頼を作りながら", "継続で固めながら"]),
                        clarity: Object.freeze(["楽しさを小さく混ぜつつ", "評価を目的にしすぎず", "軽さを逃げにしない形で入れつつ", "余白を予定に組み込みつつ"]),
                        tendency: Object.freeze(["長期で強い", "信頼が育つほど深まる", "堅くなりやすい", "価値基準が厳しくなりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // mars
                // --------------------------
                mars: Object.freeze({
                    role: "推進と境界のエンジン",
                    core: "目標に向けて粘り強く登る推進（耐久の火力）",
                    tension: "到達の推進への{drive}と、無理して折れる{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["登る", "耐久", "達成", "押す", "継続"]),
                        B: Object.freeze(["無理", "折れる", "疲労", "固着", "焦り"]),
                        expression: Object.freeze(["行動", "進め方", "詰め方", "止め方", "境界"]),
                        process: Object.freeze(["登り続けながら", "粘りながら", "詰めながら", "到達へ寄せながら"]),
                        clarity: Object.freeze(["無理の兆候を見つつ", "境界を先に引きつつ", "休みを工程として入れつつ", "焦りを短期目標に分解しつつ"]),
                        tendency: Object.freeze(["続けるほど強い", "我慢で進みやすい", "止め時が遅れやすい", "折れると回復に時間が要る"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // jupiter
                // --------------------------
                jupiter: Object.freeze({
                    role: "拡大と意味づけ",
                    core: "成果・社会性・実装で拡大する（現実拡張）",
                    tension: "拡大の野心への{drive}と、管理負荷/責任過多の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["成果", "社会性", "実装", "拡大", "到達"]),
                        B: Object.freeze(["管理負荷", "責任過多", "重い", "硬直", "燃え尽き"]),
                        expression: Object.freeze(["広げ方", "任せ方", "仕組み", "役割", "伸ばし方"]),
                        process: Object.freeze(["実装しながら", "仕組みにしながら", "役割を組みながら", "成果を積みながら"]),
                        clarity: Object.freeze(["管理範囲を絞りつつ", "任せる点を作りつつ", "燃え尽きを予防しつつ", "目的を成果だけにしすぎず"]),
                        tendency: Object.freeze(["現実的に伸びやすい", "責任が増えるほど強いが重い", "仕組み化が得意", "硬直すると停滞しやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // saturn
                // --------------------------
                saturn: Object.freeze({
                    role: "枠と時間の設計（主領域）",
                    core: "時間と枠で現実を作る（骨格を組む力）",
                    tension: "規律の強さへの{drive}と、締め付け/自己否定の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["規律", "枠", "時間", "骨格", "責任"]),
                        B: Object.freeze(["締め付け", "自己否定", "硬直", "怖さ", "遅れ"]),
                        expression: Object.freeze(["設計", "守り方", "続け方", "線引き", "約束"]),
                        process: Object.freeze(["枠で組みながら", "時間で積みながら", "規律を保ちながら", "責任を配分しながら"]),
                        clarity: Object.freeze(["締め付けを目的にしないようにしつつ", "自己否定を評価と切り分けつつ", "遅れを工程に戻しつつ", "柔らかい余白も入れつつ"]),
                        tendency: Object.freeze(["安定を作れる", "厳しさが強く出やすい", "続けるほど成果が出る", "硬くなると停滞しやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),

                // --------------------------
                // uranus
                // --------------------------
                uranus: Object.freeze({
                    role: "更新とズレのスイッチ",
                    core: "仕組みを更新して最適化したくなる",
                    tension: "更新の衝動への{drive}と、壊れない安定の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["最適化", "更新", "改革", "切り替え", "再設計"]),
                        B: Object.freeze(["壊れない安定", "慣れ", "保守", "反発", "不安"]),
                        expression: Object.freeze(["変え方", "導入", "置き換え", "ルール更新", "戻し方"]),
                        process: Object.freeze(["組み替えながら", "最適化しながら", "更新を試しながら", "再設計しながら"]),
                        clarity: Object.freeze(["壊れる範囲を限定しつつ", "影響範囲を測りつつ", "戻せる導線も残しつつ", "保守側の安心も確保しつつ"]),
                        tendency: Object.freeze(["改革が刺さると強い", "反発が出ると硬直しやすい", "更新で現実が軽くなる", "急な切替で混乱が出やすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // neptune
                // --------------------------
                neptune: Object.freeze({
                    role: "溶解と共鳴の水脈",
                    core: "理想を“形”にしたくなる（夢の実装）",
                    tension: "理想の余韻への{drive}と、現実の硬さの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["理想", "夢", "余韻", "共鳴", "意味"]),
                        B: Object.freeze(["現実の硬さ", "制約", "無情", "削げる", "乾く"]),
                        expression: Object.freeze(["理想の置き方", "現実化", "雰囲気", "意味づけ", "折衷"]),
                        process: Object.freeze(["理想を抱えながら", "意味を残しながら", "にじませながら", "現実に通しながら"]),
                        clarity: Object.freeze(["理想の核を守りつつ", "制約を条件化しつつ", "削げる点を別ルートで補いつつ", "乾きすぎない温度を足しつつ"]),
                        tendency: Object.freeze(["理想が燃料になる", "硬い現実で萎えやすい", "折衷ができると強い", "意味が消えると止まりやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "dissolve" }),
                }),

                // --------------------------
                // pluto
                // --------------------------
                pluto: Object.freeze({
                    role: "深層の圧と再編",
                    core: "権限・責任・構造の深部が再編されやすい",
                    tension: "支える圧への{drive}と、支配/極端の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["再編", "権限", "責任圧", "統制", "深部"]),
                        B: Object.freeze(["支配", "極端", "白黒", "圧迫", "恐れ"]),
                        expression: Object.freeze(["決め方", "任せ方", "切り方", "再配置", "終わらせ方"]),
                        process: Object.freeze(["再配置しながら", "統制を組み替えながら", "深部を触りながら", "仕切り直しながら"]),
                        clarity: Object.freeze(["支配を目的にしないようにしつつ", "白黒を条件に戻しつつ", "圧を分散しつつ", "終わらせ方を丁寧にしつつ"]),
                        tendency: Object.freeze(["根こそぎ再編が起きやすい", "圧が強く出やすい", "責任が集中しやすい", "決まると一気に進む"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "try" }),
                }),

                // --------------------------
                // chiron
                // --------------------------
                chiron: Object.freeze({
                    role: "傷から学びへ向かう入口",
                    core: "評価・責任・成果の領域が痛点として出やすい",
                    tension: "認められたい心への{drive}と、足りない感覚（自己否定）の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["評価", "成果", "責任", "到達", "役割"]),
                        B: Object.freeze(["足りない", "自己否定", "恥", "怖さ", "比較"]),
                        expression: Object.freeze(["反応", "抱え方", "守り", "回復", "再設計"]),
                        process: Object.freeze(["抱えながら", "学びに変えながら", "役割を組み替えながら", "回復導線を作りながら"]),
                        clarity: Object.freeze(["評価と自己価値を分けつつ", "比較を条件に戻しつつ", "足りない感覚を具体に分解しつつ", "回復を工程に入れつつ"]),
                        tendency: Object.freeze(["頑張りで埋めやすい", "評価で傷つきやすい", "回復すると強い責任感になる", "抱えすぎると折れやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "settle" }),
                }),

                // --------------------------
                // Lilith
                // --------------------------
                Lilith: Object.freeze({
                    role: "言語化されなかった主権",
                    core: "軽さ・甘さ・曖昧さに対して“NO”が出やすい（厳しさの主権）",
                    tension: "厳しさの主権への{drive}と、孤立/断絶の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["NO", "厳しさ", "線引き", "主権", "規律"]),
                        B: Object.freeze(["孤立", "断絶", "冷たさ", "圧", "許せない"]),
                        expression: Object.freeze(["拒否", "距離", "条件提示", "切り方", "再交渉"]),
                        process: Object.freeze(["線を引きながら", "条件を出しながら", "拒否で守りながら", "再交渉しながら"]),
                        clarity: Object.freeze(["拒否を条件提示に戻しつつ", "冷たさを意図と分けつつ", "断絶の前に一段階置きつつ", "許容範囲を明確にしつつ"]),
                        tendency: Object.freeze(["曖昧に厳しい", "冷たく見えやすい", "条件が整うと協力できる", "孤立しやすいが強い芯がある"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "settle" }),
                }),

                // --------------------------
                // asc
                // --------------------------
                asc: Object.freeze({
                    role: "入口と印象と身体感覚",
                    core: "落ち着きと責任感の雰囲気で場に入る",
                    tension: "堅さの印象への{drive}と、近寄りにくさの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["落ち着き", "堅実", "責任感", "静かな圧", "信頼"]),
                        B: Object.freeze(["近寄りにくい", "堅い", "冷たい誤解", "緊張", "壁"]),
                        expression: Object.freeze(["振る舞い", "第一声", "距離感", "場の入り方", "境界"]),
                        process: Object.freeze(["落ち着いて入りながら", "責任を置きながら", "堅実に始めながら", "静かに整えながら"]),
                        clarity: Object.freeze(["壁を説明に戻しつつ", "温度を一言足しつつ", "近さの段階を作りつつ", "信頼を時間で育てつつ"]),
                        tendency: Object.freeze(["信頼されやすい", "堅く見えやすい", "任されると強い", "距離が縮むと柔らかくなる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "settle" }),
                }),
            }),
        }),


        // ==========================================================
        // ♒ aquarius 水瓶座 — FULL (sun..pluto + chiron/Lilith/asc)
        // ==========================================================
        aquarius: Object.freeze({
            label_ja: "水瓶座",
            axis: "更新・俯瞰・自由",
            base: Object.freeze({
                flavor: "距離と視点を取り、仕組みを更新して未来へ通す風。個の自由と全体最適の間で、発想と再設計が動く質。",
                short: "俯瞰して更新しやすい。",
                keywords: Object.freeze(["更新", "俯瞰", "自由", "再設計", "未来"]),
            }),

            by_body: Object.freeze({
                // --------------------------
                // sun
                // --------------------------
                sun: Object.freeze({
                    role: "存在の核と方向づけ",
                    core: "自分の自由と全体の更新を両立させたい中心",
                    tension: "自由の維持への{drive}と、孤立/断絶の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["自由", "未来", "更新", "独立", "全体最適"]),
                        B: Object.freeze(["孤立", "断絶", "冷え", "置いていく", "反発"]),
                        expression: Object.freeze(["立ち方", "選び方", "距離", "提案", "改革"]),
                        process: Object.freeze(["俯瞰しながら", "更新しながら", "距離を取りながら", "再設計しながら"]),
                        clarity: Object.freeze(["孤立を目的にしないようにしつつ", "断絶の前に翻訳を挟みつつ", "冷えを意図と分けつつ", "反発の理由を構造に戻しつつ"]),
                        tendency: Object.freeze(["自立が強い", "未来志向になりやすい", "置いていく速度が出やすい", "理解されないと離れやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // moon
                // --------------------------
                moon: Object.freeze({
                    role: "反応と安心の回路",
                    core: "距離が取れていると安心しやすい反応",
                    tension: "干渉への反発への{drive}と、寂しさの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["距離", "余白", "自律", "俯瞰", "落ち着き"]),
                        B: Object.freeze(["干渉", "縛り", "反発", "寂しさ", "冷え"]),
                        expression: Object.freeze(["反応", "守り方", "境界", "安心の条件", "戻し方"]),
                        process: Object.freeze(["距離を確保しながら", "俯瞰しながら", "境界を整えながら", "余白を作りながら"]),
                        clarity: Object.freeze(["干渉を条件提示に戻しつつ", "縛りをルールに翻訳しつつ", "寂しさを切り捨てずに保持しつつ", "冷えを遮断ではなく調整にしつつ"]),
                        tendency: Object.freeze(["一人時間で回復しやすい", "縛りに敏感", "反発が強く出やすい", "急に温度が落ちやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "observe" }),
                }),

                // --------------------------
                // mercury
                // --------------------------
                mercury: Object.freeze({
                    role: "言葉と理解の通路",
                    core: "概念化して仕組みに落とす思考（抽象→設計）",
                    tension: "鋭さへの{drive}と、伝わらない/冷たい誤解の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["概念", "再設計", "発想", "合理", "俯瞰"]),
                        B: Object.freeze(["伝わらない", "冷たい誤解", "飛躍", "切り捨て", "距離"]),
                        expression: Object.freeze(["言葉", "まとめ方", "比喩", "説明", "翻訳"]),
                        process: Object.freeze(["抽象化しながら", "構造に落としながら", "再設計しながら", "全体を見ながら"]),
                        clarity: Object.freeze(["翻訳を一段足しつつ", "前提を共有しつつ", "鋭さを攻撃にしないようにしつつ", "飛躍を段階に分けつつ"]),
                        tendency: Object.freeze(["アイデアが出やすい", "言葉が速い", "前提が合わないと断絶しやすい", "冷たく見られやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "language", tryingKey: "observe" }),
                }),

                // --------------------------
                // venus
                // --------------------------
                venus: Object.freeze({
                    role: "価値と好みの基準",
                    core: "対等・自由・フラットさに価値が集まる",
                    tension: "自由の価値への{drive}と、密着/所有の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["対等", "自由", "フラット", "友情", "独立"]),
                        B: Object.freeze(["密着", "所有", "束縛", "重さ", "依存"]),
                        expression: Object.freeze(["好み", "距離感", "関係の形", "選び方", "約束"]),
                        process: Object.freeze(["対等でいながら", "自由を守りながら", "距離を調整しながら", "形を更新しながら"]),
                        clarity: Object.freeze(["束縛をルールに翻訳しつつ", "密着を選択制にしつつ", "重さを責任と切り分けつつ", "依存を役割分担に戻しつつ"]),
                        tendency: Object.freeze(["友達感覚が強い", "自由がないと冷めやすい", "対等だと長続きしやすい", "所有されると離れやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // mars
                // --------------------------
                mars: Object.freeze({
                    role: "推進と境界のエンジン",
                    core: "既存を壊して更新する推進（改革の火力）",
                    tension: "改革の勢いへの{drive}と、反発/{dyn}の摩耗",
                    fusion: Object.freeze({
                        A: Object.freeze(["改革", "更新", "切り替え", "突破", "実験"]),
                        B: Object.freeze(["反発", "摩擦", "分断", "摩耗", "暴走"]),
                        expression: Object.freeze(["行動", "変え方", "切り方", "導入", "止め方"]),
                        process: Object.freeze(["試しながら", "切り替えながら", "更新しながら", "突破しながら"]),
                        clarity: Object.freeze(["反発の理由を拾いつつ", "影響範囲を限定しつつ", "戻せる導線を残しつつ", "暴走を速度調整に戻しつつ"]),
                        tendency: Object.freeze(["新しい方へ動きやすい", "急に切る", "実験が強い", "摩擦で疲れやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // jupiter
                // --------------------------
                jupiter: Object.freeze({
                    role: "拡大と意味づけ",
                    core: "ネットワーク・未来像・思想で拡大する",
                    tension: "拡大の理想への{drive}と、現実とのズレの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["ネットワーク", "未来像", "思想", "拡張", "共有"]),
                        B: Object.freeze(["現実とのズレ", "空回り", "机上", "反発", "孤立"]),
                        expression: Object.freeze(["広げ方", "繋げ方", "理念", "企画", "伝播"]),
                        process: Object.freeze(["繋げながら", "共有しながら", "未来像を描きながら", "拡張しながら"]),
                        clarity: Object.freeze(["現実の手順を足しつつ", "机上を実装に戻しつつ", "反発を前提調整にしつつ", "孤立を協業に戻しつつ"]),
                        tendency: Object.freeze(["仲間が増えると強い", "理念が先行しやすい", "現実の詰めで安定する", "孤立すると拡大が止まる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // saturn
                // --------------------------
                saturn: Object.freeze({
                    role: "枠と時間の設計",
                    core: "自由を保つためのルールを組みたい（自律の枠）",
                    tension: "自律の枠への{drive}と、窮屈さ/疎外の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["自律", "ルール", "枠", "独立", "持続"]),
                        B: Object.freeze(["窮屈", "疎外", "冷え", "硬直", "孤立"]),
                        expression: Object.freeze(["設計", "線引き", "継続", "分担", "ルール化"]),
                        process: Object.freeze(["ルールを整えながら", "自律を守りながら", "分担しながら", "枠を作りながら"]),
                        clarity: Object.freeze(["窮屈を目的にしないようにしつつ", "疎外を対話に戻しつつ", "冷えを遮断ではなく運用にしつつ", "硬直を見直しで緩めつつ"]),
                        tendency: Object.freeze(["ルールで自由を守る", "疎外感が出やすい", "割り切りが強い", "孤立すると頑固になる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // uranus (主領域)
                // --------------------------
                uranus: Object.freeze({
                    role: "更新とズレのスイッチ（主領域）",
                    core: "常識を更新して新しい秩序を作りたい",
                    tension: "更新の衝動への{drive}と、社会/関係の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["更新", "解放", "革新", "新秩序", "実験"]),
                        B: Object.freeze(["摩擦", "反発", "浮く", "断絶", "不理解"]),
                        expression: Object.freeze(["変え方", "提案", "再設計", "導入", "合流"]),
                        process: Object.freeze(["更新しながら", "実験しながら", "仕組みを組み替えながら", "解放しながら"]),
                        clarity: Object.freeze(["反発を観測しつつ", "合流点を作りつつ", "浮く感覚を情報にしつつ", "断絶の前に翻訳を入れつつ"]),
                        tendency: Object.freeze(["突然の切替が起きやすい", "革新が刺さると強い", "不理解で孤立しやすい", "合流点があると加速する"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // neptune
                // --------------------------
                neptune: Object.freeze({
                    role: "溶解と共鳴の水脈",
                    core: "境界を薄めて“みんな”に繋げたくなる",
                    tension: "普遍性への{drive}と、具体が抜ける{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["普遍性", "共鳴", "理想", "開放", "つながり"]),
                        B: Object.freeze(["具体不足", "現実が抜ける", "空洞", "逃避", "散る"]),
                        expression: Object.freeze(["理想の語り", "共有", "境界", "意味づけ", "統合"]),
                        process: Object.freeze(["開きながら", "溶かしながら", "共有しながら", "つなげながら"]),
                        clarity: Object.freeze(["具体を一段足しつつ", "逃避を休息と分けつつ", "散る前に焦点を置きつつ", "境界を運用で作りつつ"]),
                        tendency: Object.freeze(["理想が大きくなる", "具体がないと空回り", "共鳴は広い", "散りやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "dissolve" }),
                }),

                // --------------------------
                // pluto
                // --------------------------
                pluto: Object.freeze({
                    role: "深層の圧と再編",
                    core: "集団・制度・権限の深部が再編されやすい",
                    tension: "改革の圧への{drive}と、極端/排除の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["制度再編", "集団", "刷新圧", "権限", "転換"]),
                        B: Object.freeze(["極端", "排除", "分断", "圧迫", "過激"]),
                        expression: Object.freeze(["変える", "終わらせる", "再配置", "合流", "切断"]),
                        process: Object.freeze(["再編しながら", "刷新しながら", "転換しながら", "組み替えながら"]),
                        clarity: Object.freeze(["排除を目的にしないようにしつつ", "分断を条件提示に戻しつつ", "過激を速度調整に戻しつつ", "合流点を残しつつ"]),
                        tendency: Object.freeze(["制度レベルで動かしたくなる", "極端になりやすい", "分断が出やすい", "合流があると大転換が進む"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // chiron
                // --------------------------
                chiron: Object.freeze({
                    role: "傷から学びへ向かう入口",
                    core: "『理解されない/浮く』が痛点になりやすい",
                    tension: "独自性への{drive}と、孤立（わかってもらえなさ）の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["独自性", "発想", "自由", "視点", "違い"]),
                        B: Object.freeze(["理解されない", "孤立", "浮く", "疎外", "諦め"]),
                        expression: Object.freeze(["反応", "守り", "説明", "翻訳", "合流"]),
                        process: Object.freeze(["翻訳しながら", "合流点を作りながら", "違いを保持しながら", "接続しながら"]),
                        clarity: Object.freeze(["理解されなさを情報にしつつ", "疎外を対話に戻しつつ", "諦めを離脱ではなく調整にしつつ", "違いを価値に戻しつつ"]),
                        tendency: Object.freeze(["黙る/離れるで守りやすい", "翻訳があると癒えやすい", "独自性が強みになる", "孤立すると頑固になる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "observe" }),
                }),

                // --------------------------
                // Lilith
                // --------------------------
                Lilith: Object.freeze({
                    role: "言語化されなかった主権",
                    core: "『縛られない』が強い主権として立つ（自由の野性）",
                    tension: "自由の主権への{drive}と、切断/拒絶の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["自由", "拒否", "自律", "反骨", "独立"]),
                        B: Object.freeze(["切断", "拒絶", "冷え", "断絶", "孤立"]),
                        expression: Object.freeze(["NO", "距離", "離脱", "再交渉", "線引き"]),
                        process: Object.freeze(["拒否しながら", "離れながら", "線を引きながら", "再交渉しながら"]),
                        clarity: Object.freeze(["切断の前に条件提示を挟みつつ", "拒絶を攻撃にしないようにしつつ", "冷えを意図と分けつつ", "孤立を選択として自覚しつつ"]),
                        tendency: Object.freeze(["縛りに強く反応する", "急に切る", "自由は守れる", "孤立が増えやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "observe" }),
                }),

                // --------------------------
                // asc
                // --------------------------
                asc: Object.freeze({
                    role: "入口と印象と身体感覚",
                    core: "フラットで風通しよく、少し距離のある印象で入る",
                    tension: "軽さ/クールさの印象への{drive}と、近寄りにくさの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["フラット", "風通し", "知性", "自由", "軽やかさ"]),
                        B: Object.freeze(["近寄りにくい", "冷たい誤解", "距離", "浮く", "断絶"]),
                        expression: Object.freeze(["振る舞い", "第一声", "距離感", "場の入り方", "接続"]),
                        process: Object.freeze(["俯瞰して入りながら", "フラットに入りながら", "距離を調整しながら", "風通しを作りながら"]),
                        clarity: Object.freeze(["温度を一言足しつつ", "距離の理由を明確にしつつ", "近さの段階を作りつつ", "接続の導線を置きつつ"]),
                        tendency: Object.freeze(["軽く見えるが芯がある", "距離が出やすい", "知的に見られやすい", "接続があると一気に親しみが出る"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),
            }),
        }),


        // ==========================================================
        // ♒ aquarius 水瓶座 — FULL (sun..pluto + chiron/Lilith/asc)
        // ==========================================================
        aquarius: Object.freeze({
            label_ja: "水瓶座",
            axis: "更新・俯瞰・自由",
            base: Object.freeze({
                flavor: "距離と視点を取り、仕組みを更新して未来へ通す風。個の自由と全体最適の間で、発想と再設計が動く質。",
                short: "俯瞰して更新しやすい。",
                keywords: Object.freeze(["更新", "俯瞰", "自由", "再設計", "未来"]),
            }),

            by_body: Object.freeze({
                // --------------------------
                // sun
                // --------------------------
                sun: Object.freeze({
                    role: "存在の核と方向づけ",
                    core: "自分の自由と全体の更新を両立させたい中心",
                    tension: "自由の維持への{drive}と、孤立/断絶の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["自由", "未来", "更新", "独立", "全体最適"]),
                        B: Object.freeze(["孤立", "断絶", "冷え", "置いていく", "反発"]),
                        expression: Object.freeze(["立ち方", "選び方", "距離", "提案", "改革"]),
                        process: Object.freeze(["俯瞰しながら", "更新しながら", "距離を取りながら", "再設計しながら"]),
                        clarity: Object.freeze(["孤立を目的にしないようにしつつ", "断絶の前に翻訳を挟みつつ", "冷えを意図と分けつつ", "反発の理由を構造に戻しつつ"]),
                        tendency: Object.freeze(["自立が強い", "未来志向になりやすい", "置いていく速度が出やすい", "理解されないと離れやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // moon
                // --------------------------
                moon: Object.freeze({
                    role: "反応と安心の回路",
                    core: "距離が取れていると安心しやすい反応",
                    tension: "干渉への反発への{drive}と、寂しさの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["距離", "余白", "自律", "俯瞰", "落ち着き"]),
                        B: Object.freeze(["干渉", "縛り", "反発", "寂しさ", "冷え"]),
                        expression: Object.freeze(["反応", "守り方", "境界", "安心の条件", "戻し方"]),
                        process: Object.freeze(["距離を確保しながら", "俯瞰しながら", "境界を整えながら", "余白を作りながら"]),
                        clarity: Object.freeze(["干渉を条件提示に戻しつつ", "縛りをルールに翻訳しつつ", "寂しさを切り捨てずに保持しつつ", "冷えを遮断ではなく調整にしつつ"]),
                        tendency: Object.freeze(["一人時間で回復しやすい", "縛りに敏感", "反発が強く出やすい", "急に温度が落ちやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "observe" }),
                }),

                // --------------------------
                // mercury
                // --------------------------
                mercury: Object.freeze({
                    role: "言葉と理解の通路",
                    core: "概念化して仕組みに落とす思考（抽象→設計）",
                    tension: "鋭さへの{drive}と、伝わらない/冷たい誤解の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["概念", "再設計", "発想", "合理", "俯瞰"]),
                        B: Object.freeze(["伝わらない", "冷たい誤解", "飛躍", "切り捨て", "距離"]),
                        expression: Object.freeze(["言葉", "まとめ方", "比喩", "説明", "翻訳"]),
                        process: Object.freeze(["抽象化しながら", "構造に落としながら", "再設計しながら", "全体を見ながら"]),
                        clarity: Object.freeze(["翻訳を一段足しつつ", "前提を共有しつつ", "鋭さを攻撃にしないようにしつつ", "飛躍を段階に分けつつ"]),
                        tendency: Object.freeze(["アイデアが出やすい", "言葉が速い", "前提が合わないと断絶しやすい", "冷たく見られやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "language", tryingKey: "observe" }),
                }),

                // --------------------------
                // venus
                // --------------------------
                venus: Object.freeze({
                    role: "価値と好みの基準",
                    core: "対等・自由・フラットさに価値が集まる",
                    tension: "自由の価値への{drive}と、密着/所有の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["対等", "自由", "フラット", "友情", "独立"]),
                        B: Object.freeze(["密着", "所有", "束縛", "重さ", "依存"]),
                        expression: Object.freeze(["好み", "距離感", "関係の形", "選び方", "約束"]),
                        process: Object.freeze(["対等でいながら", "自由を守りながら", "距離を調整しながら", "形を更新しながら"]),
                        clarity: Object.freeze(["束縛をルールに翻訳しつつ", "密着を選択制にしつつ", "重さを責任と切り分けつつ", "依存を役割分担に戻しつつ"]),
                        tendency: Object.freeze(["友達感覚が強い", "自由がないと冷めやすい", "対等だと長続きしやすい", "所有されると離れやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // mars
                // --------------------------
                mars: Object.freeze({
                    role: "推進と境界のエンジン",
                    core: "既存を壊して更新する推進（改革の火力）",
                    tension: "改革の勢いへの{drive}と、反発/{dyn}の摩耗",
                    fusion: Object.freeze({
                        A: Object.freeze(["改革", "更新", "切り替え", "突破", "実験"]),
                        B: Object.freeze(["反発", "摩擦", "分断", "摩耗", "暴走"]),
                        expression: Object.freeze(["行動", "変え方", "切り方", "導入", "止め方"]),
                        process: Object.freeze(["試しながら", "切り替えながら", "更新しながら", "突破しながら"]),
                        clarity: Object.freeze(["反発の理由を拾いつつ", "影響範囲を限定しつつ", "戻せる導線を残しつつ", "暴走を速度調整に戻しつつ"]),
                        tendency: Object.freeze(["新しい方へ動きやすい", "急に切る", "実験が強い", "摩擦で疲れやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // jupiter
                // --------------------------
                jupiter: Object.freeze({
                    role: "拡大と意味づけ",
                    core: "ネットワーク・未来像・思想で拡大する",
                    tension: "拡大の理想への{drive}と、現実とのズレの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["ネットワーク", "未来像", "思想", "拡張", "共有"]),
                        B: Object.freeze(["現実とのズレ", "空回り", "机上", "反発", "孤立"]),
                        expression: Object.freeze(["広げ方", "繋げ方", "理念", "企画", "伝播"]),
                        process: Object.freeze(["繋げながら", "共有しながら", "未来像を描きながら", "拡張しながら"]),
                        clarity: Object.freeze(["現実の手順を足しつつ", "机上を実装に戻しつつ", "反発を前提調整にしつつ", "孤立を協業に戻しつつ"]),
                        tendency: Object.freeze(["仲間が増えると強い", "理念が先行しやすい", "現実の詰めで安定する", "孤立すると拡大が止まる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // saturn
                // --------------------------
                saturn: Object.freeze({
                    role: "枠と時間の設計",
                    core: "自由を保つためのルールを組みたい（自律の枠）",
                    tension: "自律の枠への{drive}と、窮屈さ/疎外の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["自律", "ルール", "枠", "独立", "持続"]),
                        B: Object.freeze(["窮屈", "疎外", "冷え", "硬直", "孤立"]),
                        expression: Object.freeze(["設計", "線引き", "継続", "分担", "ルール化"]),
                        process: Object.freeze(["ルールを整えながら", "自律を守りながら", "分担しながら", "枠を作りながら"]),
                        clarity: Object.freeze(["窮屈を目的にしないようにしつつ", "疎外を対話に戻しつつ", "冷えを遮断ではなく運用にしつつ", "硬直を見直しで緩めつつ"]),
                        tendency: Object.freeze(["ルールで自由を守る", "疎外感が出やすい", "割り切りが強い", "孤立すると頑固になる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // uranus (主領域)
                // --------------------------
                uranus: Object.freeze({
                    role: "更新とズレのスイッチ（主領域）",
                    core: "常識を更新して新しい秩序を作りたい",
                    tension: "更新の衝動への{drive}と、社会/関係の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["更新", "解放", "革新", "新秩序", "実験"]),
                        B: Object.freeze(["摩擦", "反発", "浮く", "断絶", "不理解"]),
                        expression: Object.freeze(["変え方", "提案", "再設計", "導入", "合流"]),
                        process: Object.freeze(["更新しながら", "実験しながら", "仕組みを組み替えながら", "解放しながら"]),
                        clarity: Object.freeze(["反発を観測しつつ", "合流点を作りつつ", "浮く感覚を情報にしつつ", "断絶の前に翻訳を入れつつ"]),
                        tendency: Object.freeze(["突然の切替が起きやすい", "革新が刺さると強い", "不理解で孤立しやすい", "合流点があると加速する"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // neptune
                // --------------------------
                neptune: Object.freeze({
                    role: "溶解と共鳴の水脈",
                    core: "境界を薄めて“みんな”に繋げたくなる",
                    tension: "普遍性への{drive}と、具体が抜ける{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["普遍性", "共鳴", "理想", "開放", "つながり"]),
                        B: Object.freeze(["具体不足", "現実が抜ける", "空洞", "逃避", "散る"]),
                        expression: Object.freeze(["理想の語り", "共有", "境界", "意味づけ", "統合"]),
                        process: Object.freeze(["開きながら", "溶かしながら", "共有しながら", "つなげながら"]),
                        clarity: Object.freeze(["具体を一段足しつつ", "逃避を休息と分けつつ", "散る前に焦点を置きつつ", "境界を運用で作りつつ"]),
                        tendency: Object.freeze(["理想が大きくなる", "具体がないと空回り", "共鳴は広い", "散りやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "dissolve" }),
                }),

                // --------------------------
                // pluto
                // --------------------------
                pluto: Object.freeze({
                    role: "深層の圧と再編",
                    core: "集団・制度・権限の深部が再編されやすい",
                    tension: "改革の圧への{drive}と、極端/排除の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["制度再編", "集団", "刷新圧", "権限", "転換"]),
                        B: Object.freeze(["極端", "排除", "分断", "圧迫", "過激"]),
                        expression: Object.freeze(["変える", "終わらせる", "再配置", "合流", "切断"]),
                        process: Object.freeze(["再編しながら", "刷新しながら", "転換しながら", "組み替えながら"]),
                        clarity: Object.freeze(["排除を目的にしないようにしつつ", "分断を条件提示に戻しつつ", "過激を速度調整に戻しつつ", "合流点を残しつつ"]),
                        tendency: Object.freeze(["制度レベルで　動かしたくなる", "極端になりやすい", "分断が出やすい", "合流があると大転換が進む"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),

                // --------------------------
                // chiron
                // --------------------------
                chiron: Object.freeze({
                    role: "傷から学びへ向かう入口",
                    core: "『理解されない/浮く』が痛点になりやすい",
                    tension: "独自性への{drive}と、孤立（わかってもらえなさ）の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["独自性", "発想", "自由", "視点", "違い"]),
                        B: Object.freeze(["理解されない", "孤立", "浮く", "疎外", "諦め"]),
                        expression: Object.freeze(["反応", "守り", "説明", "翻訳", "合流"]),
                        process: Object.freeze(["翻訳しながら", "合流点を作りながら", "違いを保持しながら", "接続しながら"]),
                        clarity: Object.freeze(["理解されなさを情報にしつつ", "疎外を対話に戻しつつ", "諦めを離脱ではなく調整にしつつ", "違いを価値に戻しつつ"]),
                        tendency: Object.freeze(["黙る/離れるで守りやすい", "翻訳があると癒えやすい", "独自性が強みになる", "孤立すると頑固になる"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "observe" }),
                }),

                // --------------------------
                // Lilith
                // --------------------------
                Lilith: Object.freeze({
                    role: "言語化されなかった主権",
                    core: "『縛られない』が強い主権として立つ（自由の野性）",
                    tension: "自由の主権への{drive}と、切断/拒絶の{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["自由", "拒否", "自律", "反骨", "独立"]),
                        B: Object.freeze(["切断", "拒絶", "冷え", "断絶", "孤立"]),
                        expression: Object.freeze(["NO", "距離", "離脱", "再交渉", "線引き"]),
                        process: Object.freeze(["拒否しながら", "離れながら", "線を引きながら", "再交渉しながら"]),
                        clarity: Object.freeze(["切断の前に条件提示を挟みつつ", "拒絶を攻撃にしないようにしつつ", "冷えを意図と分けつつ", "孤立を選択として自覚しつつ"]),
                        tendency: Object.freeze(["縛りに強く反応する", "急に切る", "自由は守れる", "孤立が増えやすい"]),
                    }),
                    defaults: Object.freeze({ outputKey: "reaction", tryingKey: "observe" }),
                }),

                // --------------------------
                // asc
                // --------------------------
                asc: Object.freeze({
                    role: "入口と印象と身体感覚",
                    core: "フラットで風通しよく、少し距離のある印象で入る",
                    tension: "軽さ/クールさの印象への{drive}と、近寄りにくさの{dyn}",
                    fusion: Object.freeze({
                        A: Object.freeze(["フラット", "風通し", "知性", "自由", "軽やかさ"]),
                        B: Object.freeze(["近寄りにくい", "冷たい誤解", "距離", "浮く", "断絶"]),
                        expression: Object.freeze(["振る舞い", "第一声", "距離感", "場の入り方", "接続"]),
                        process: Object.freeze(["俯瞰して入りながら", "フラットに入りながら", "距離を調整しながら", "風通しを作りながら"]),
                        clarity: Object.freeze(["温度を一言足しつつ", "距離の理由を明確にしつつ", "近さの段階を作りつつ", "接続の導線を置きつつ"]),
                        tendency: Object.freeze(["軽く見えるが芯がある", "距離が出やすい", "知的に見られやすい", "接続があると一気に親しみが出る"]),
                    }),
                    defaults: Object.freeze({ outputKey: "expression", tryingKey: "observe" }),
                }),
            }),
        }),

    }),
});

module.exports = { SIGN_FLAVOR_V1 };
