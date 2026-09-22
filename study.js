'use strict';

/* ==========================================================================
   用語集ページ / 聴牌トレーニングページ
   牌の描画と待ち計算は mahjong.js に任せる。
   ========================================================================== */

/* --------------------------------------------------------------------------
   用語集
     hand を書いておくと、その牌姿を図で表示する。
     waits: true を付けると、待ち牌を自動計算して並べる。
   -------------------------------------------------------------------------- */

const GLOSSARY = [
  {
    category: '大会規定の用語',
    note: '第3回マイマイカップの規定に出てくる言葉です。',
    terms: [
      { term: '配給原点（はいきゅうげんてん）', desc: '対局開始時に配られる持ち点。本大会は25,000点です。' },
      { term: '返し点（かえしてん）', desc: '精算の基準となる点数。本大会は30,000点で、ここから引いた差が素点になります。25,000点のまま終わると −5、33,000点なら +3 です。' },
      { term: '素点（そてん）', desc: '(最終点 − 返し点) ÷ 1000 で求めるポイント。1,000点＝1ptとして扱います。' },
      { term: 'ウマ', desc: '着順に応じて加減するポイント。本大会は 1位 +20 / 2位 +10 / 3位 −10 / 4位 −20 です。' },
      { term: 'オカ', desc: '配給原点と返し点の差を1位が総取りする方式。本大会では採用していません（設定で切り替えられます）。' },
      { term: 'アリアリ', desc: '「喰いタンあり・後付けあり」の略。鳴いてもタンヤオが成立し、後から役を確定させる手順も認められます。' },
      { term: '喰いタン（くいタン）', desc: '鳴いた状態でも成立するタンヤオのこと。' },
      { term: '後付け（あとづけ）', desc: '先に鳴いておき、あとから役を確定させる進め方。' },
      { term: 'トビ', desc: '持ち点がマイナスになった時点で対局終了となるルール。本大会はトビありです。' },
      { term: '九種九牌（きゅうしゅきゅうはい）', desc: '配牌時に么九牌が9種類以上あるとき、手を倒して流局にできる権利。本大会では流局となり親は連荘します。' },
      { term: '四風連打（スーフーレンダ）', desc: '1巡目に4人が同じ風牌を捨てると流局になるルール。本大会では親が連荘します。' },
      { term: '連荘（レンチャン）', desc: '親が続けて親のままになること。' },
      { term: 'チョンボ', desc: '誤ロン・誤ツモなどの反則。本大会では点数の減点はなく、卓の全員にチップ1枚を支払います。' },
      { term: 'やきとり', desc: '一度もアガれずに終わること。本大会では同卓の全員にチップ1枚を支払います。' },
      { term: '供託（きょうたく）', desc: 'リーチ棒など、場に出されたまま次のアガリ者が回収する点棒のこと。' },
    ],
  },
  {
    category: '基本の用語',
    terms: [
      { term: '親（おや）／子（こ）', desc: '親は東家のこと。アガると点数が1.5倍になり、ツモられると多く払います。残りの3人が子です。' },
      { term: '東家・南家・西家・北家', desc: '席順のこと。東家が親で、南家 → 西家 → 北家 の順に手番が回ります。' },
      { term: '配牌（はいパイ）', desc: '対局開始時に配られる13枚の牌。' },
      { term: 'ツモ', desc: '山から牌を引くこと。引いた牌でアガることも「ツモ」と言います。' },
      { term: 'ロン', desc: '他家が捨てた牌でアガること。' },
      { term: 'テンパイ（聴牌）', desc: 'あと1枚でアガりになる状態。このアプリの「聴牌トレーニング」で練習できます。' },
      { term: 'ノーテン', desc: '流局時にテンパイしていない状態。' },
      { term: 'フリテン', desc: '自分の待ち牌を自分で捨てている状態。ロンできず、ツモでしかアガれません。' },
      { term: '門前（メンゼン）', desc: '一度も鳴いていない状態。リーチはこの状態でのみ宣言できます。' },
      { term: '鳴き（なき）', desc: '他家の捨て牌をもらって面子を作ること。ポン（刻子）・チー（順子・上家のみ）・カン（槓子）があります。' },
      { term: 'リーチ', desc: '門前でテンパイしたときに1,000点を場に出して宣言する役。以降は手を変えられません。' },
      { term: '一発（イッパツ）', desc: 'リーチ後1巡以内にアガること。本大会ではチップの対象です。' },
      { term: 'ドラ', desc: 'あるだけ点数が上がるボーナス牌。役ではないので、ドラだけではアガれません。' },
      { term: '裏ドラ（うらドラ）', desc: 'リーチがアガったときだけ開かれる追加のドラ。本大会では現物がチップの対象です。' },
      { term: '赤ドラ（あかドラ）', desc: '赤く塗られた5の牌。1枚につきドラ1枚ぶんです。本大会ではチップの対象です。' },
      { term: '流局（りゅうきょく）', desc: '誰もアガらずに牌が尽きて終わること。テンパイしていた人としていない人で点数のやりとりがあります。' },
    ],
  },
  {
    category: '待ちの形',
    note: 'よく出てくる待ちの形です。灰色の牌がアガり牌を表します。',
    terms: [
      // pad は待ちを計算するために13枚へ補完する牌。図には hand の部分だけを描く。
      { term: '両面待ち（リャンメン）', desc: '連続した2枚の両側で待つ形。待ちが2種類あり、もっとも有利な待ちです。', hand: '34p', pad: '123m456m789m11s', waits: true },
      { term: '嵌張待ち（カンチャン）', desc: '数字が1つ飛んだ間の牌を待つ形。待ちは1種類です。', hand: '35p', pad: '123m456m789m11s', waits: true },
      { term: '辺張待ち（ペンチャン）', desc: '1・2で3を待つ、8・9で7を待つ形。待ちは1種類です。', hand: '12p', pad: '123m456m789m11s', waits: true },
      { term: '単騎待ち（タンキ）', desc: '1枚だけを雀頭として待つ形。どの牌でも単騎にできます。', hand: '5p', pad: '123m456m789m123s', waits: true },
      { term: 'シャンポン待ち', desc: '対子が2つあり、どちらかが刻子になるのを待つ形。待ちは2種類です。', hand: '33p77p', pad: '123m456m789m', waits: true },
      { term: 'ノベタン', desc: '4枚の連続した牌で、両端の単騎を待つ形。', hand: '3456p', pad: '123m456m789m', waits: true },
      { term: '三面張（サンメンチャン）', desc: '待ちが3種類ある形。牌が多く残るので有利です。', hand: '34567p', pad: '123m456m11s', waits: true },
    ],
  },
  {
    category: '主な役',
    note: '本大会は「符計算なし」の固定点数制です。翻数だけ数えれば点数が決まります。',
    terms: [
      { term: 'リーチ（1翻）', desc: '門前でテンパイして宣言する、もっとも基本的な役。' },
      { term: 'タンヤオ（1翻）', desc: '1・9・字牌を一切使わない手。本大会は喰いタンありなので鳴いても成立します。', hand: '234m567m345p22s678s' },
      { term: '平和（ピンフ・1翻）', desc: '4つとも順子、雀頭が役牌でなく、両面待ちでアガる形。', hand: '123m456m789m22p34s' },
      { term: '役牌（ヤクハイ・1翻）', desc: '三元牌（白・發・中）または自分の風・場風の刻子。', hand: '555z123m456m789m22p' },
      { term: '一盃口（イーペーコー・1翻）', desc: '同じ順子を2組そろえる形。門前限定です。', hand: '223344m567p789p11s' },
      { term: '三色同順（サンショク・2翻）', desc: '同じ数字の順子を萬子・筒子・索子でそろえる形。鳴くと1翻です。', hand: '345m345p345s678m11z' },
      { term: '一気通貫（イッツー・2翻）', desc: '同じ種類で 123・456・789 をそろえる形。鳴くと1翻です。', hand: '123456789m345p11s' },
      { term: '七対子（チートイツ・2翻）', desc: '異なる7種類の対子で作る特殊な形。', hand: '1133m5577p2299s33z' },
      { term: '対々和（トイトイ・2翻）', desc: '4つとも刻子でそろえる形。', hand: '111m333p555s777z22m' },
      { term: '混一色（ホンイツ・3翻）', desc: '1種類の数牌と字牌だけで作る形。鳴くと2翻です。', hand: '123456789m111z22z' },
      { term: '清一色（チンイツ・6翻）', desc: '1種類の数牌だけで作る形。鳴くと5翻です。', hand: '111234567899m99m' },
      { term: '国士無双（役満）', desc: '么九牌13種すべてと、そのうち1枚の対子で作る役満。', hand: '19m19p19s1234567z', waits: true },
      { term: '四暗刻（スーアンコウ・役満）', desc: '門前で4つの暗刻をそろえる役満。単騎待ちはダブル役満の扱いです。', hand: '111m333m555p777s22z' },
      { term: '大三元（ダイサンゲン・役満）', desc: '白・發・中をすべて刻子でそろえる役満。', hand: '555z666z777z123m11p' },
    ],
  },
  {
    category: '点数の呼び方',
    note: '本大会の点数早見表に対応しています。',
    terms: [
      { term: '満貫（マンガン）', desc: '子 8,000点／親 12,000点。本大会では4翻以上が満貫です。' },
      { term: '跳満（ハネマン）', desc: '子 12,000点／親 18,000点。' },
      { term: '倍満（バイマン）', desc: '子 16,000点／親 24,000点。' },
      { term: '三倍満（サンバイマン）', desc: '子 24,000点／親 36,000点。' },
      { term: '役満（ヤクマン）', desc: '子 32,000点／親 48,000点。本大会では成立時に参加者全員からチップ3枚オールです。' },
      { term: 'ダブル役満', desc: '本大会では 四暗刻単騎・国士13面・大四喜・天和・地和 が対象です。' },
    ],
  },
];

/* --------------------------------------------------------------------------
   聴牌トレーニングの問題
     答え（待ち牌）はコード側で計算するため、ここには書かない。
     shape は解説用のラベル。
   -------------------------------------------------------------------------- */

const TENPAI_PROBLEMS = [
  // 入門
  { level: '入門', hand: '123456789m23p11s', shape: '両面待ち', hint: '筒子の2枚に注目してみましょう。' },
  { level: '入門', hand: '123456789m13p11s', shape: '嵌張待ち', hint: '数字が1つ飛んでいます。' },
  { level: '入門', hand: '123456789m12p11s', shape: '辺張待ち', hint: '1と2の並びで待てるのは1種類だけです。' },
  { level: '入門', hand: '123456789m123p1s', shape: '単騎待ち', hint: '面子は足りています。雀頭がまだです。' },
  { level: '入門', hand: '123456789m11p11s', shape: 'シャンポン待ち', hint: '対子が2つあります。' },
  { level: '入門', hand: '123m456m789m22p35s', shape: '嵌張待ち', hint: '索子が1つ飛んでいます。' },
  { level: '入門', hand: '234m567m99p123s45s', shape: '両面待ち', hint: '索子の45に注目。' },
  { level: '入門', hand: '111m234m567p22s78s', shape: '両面待ち', hint: '索子の78に注目。' },
  { level: '入門', hand: '456m789m123p55s89s', shape: '辺張待ち', hint: '89の並びで待てるのは1種類です。' },
  { level: '入門', hand: '333m456m789m12p99s', shape: '辺張待ち', hint: '筒子の12に注目。' },
  { level: '入門', hand: '22m345m678m345p12s', shape: '辺張待ち', hint: '索子の12に注目。' },
  // 中級
  { level: '中級', hand: '123456789m1234p', shape: 'ノベタン', hint: '4枚の連続。両端が単騎になります。' },
  { level: '中級', hand: '123m456m11p34567s', shape: '三面張', hint: '索子の5枚つながりに注目。' },
  { level: '中級', hand: '1133m5577p2299s3z', shape: '七対子の単騎', hint: '対子が6つ。あと1枚は？' },
  { level: '中級', hand: '22334455m789p11s', shape: '一盃口＋シャンポンの複合', hint: '萬子の並びは複数の切り方ができます。' },
  { level: '中級', hand: '345m345p345s11z67s', shape: '三面張', hint: '索子の67に注目。三色も見えています。' },
  { level: '中級', hand: '234m22z345678p99s', shape: 'シャンポン＋両面', hint: '対子が2つあります。字牌も待ちに入ります。' },
  { level: '中級', hand: '111m456m789m2233p', shape: '複合形', hint: '筒子の2233は2通りの解釈ができます。' },
  { level: '中級', hand: '345m678m11p22s345s', shape: 'シャンポン待ち', hint: '対子が2つあります。' },
  { level: '中級', hand: '22334m567p789p11s', shape: '複合形', hint: '萬子の22334を落ち着いて分けましょう。' },
  { level: '中級', hand: '111m999m345p22s67s', shape: '両面待ち', hint: '索子の67に注目。' },
  { level: '中級', hand: '567m123p789p22s34s', shape: '両面待ち', hint: '索子の34に注目。' },
  { level: '中級', hand: '111m22m345p678p99s', shape: 'シャンポン待ち', hint: '萬子と索子に対子があります。' },
  { level: '中級', hand: '789m123m45m11p234s', shape: '両面待ち', hint: '萬子の45に注目。' },
  { level: '中級', hand: '567m678m11p33s456s', shape: 'シャンポン待ち', hint: '筒子と索子に対子があります。' },
  { level: '中級', hand: '234m22p345p11s678s', shape: 'シャンポン待ち', hint: '対子が2つあります。' },
  // 上級
  { level: '上級', hand: '123m789m11123p99s', shape: '複合形（3種）', hint: '筒子の11123は雀頭にも面子にもなります。' },
  { level: '上級', hand: '567m11p234567p33s', shape: '複合形', hint: '筒子が長くつながっています。' },
  { level: '上級', hand: '345678m234p11s99s', shape: '対子2つの単騎', hint: '面子は足りています。' },
  { level: '上級', hand: '111m22p33345678s', shape: '多面張（4種）', hint: '索子の8枚を落ち着いて分解しましょう。' },
  { level: '上級', hand: '123m456m78m11p234s', shape: '三面張', hint: '萬子の78が鍵です。' },
  { level: '上級', hand: '12m345m678m99p234s', shape: '三面張', hint: '萬子の並びを組み替えてみましょう。' },
  { level: '中級', hand: '456m11p234p567p89s', shape: '辺張待ち', hint: '索子の89に注目。' },
  { level: '中級', hand: '234m345p456s77z89m', shape: '辺張待ち', hint: '萬子の89に注目。' },
  { level: '上級', hand: '1112345678999m', shape: '九蓮宝燈（9面待ち）', hint: '同じ種類の牌だけ。何でも当たります。' },
  { level: '上級', hand: '19m19p19s1234567z', shape: '国士無双十三面待ち', hint: '么九牌が13種すべてそろっています。' },
];

/* イーシャンテンの問題。答え（受け入れ牌）はコード側で計算する。 */
const SHANTEN_PROBLEMS = [
  // 入門
  { level: '入門', hand: '123m456m11p22p35s9s', shape: '対子2つ＋嵌張', hint: '9索は孤立しています。' },
  { level: '入門', hand: '345m678m11p35p22s9s', shape: '対子2つ＋嵌張', hint: '筒子の35が嵌張です。' },
  { level: '入門', hand: '234m567m11p22s46s9s', shape: '対子2つ＋嵌張', hint: '索子の46が嵌張です。' },
  { level: '入門', hand: '22m33m456p789p12s4s', shape: '対子2つ＋搭子', hint: '萬子の対子がどちらか刻子になれば。' },
  { level: '入門', hand: '123m456m22p34s67s9m', shape: '雀頭＋両面2つ', hint: '索子の34と67、どちらが埋まっても。' },
  // 中級
  { level: '中級', hand: '123m456m11p22p34s7s', shape: '対子2つ＋両面', hint: '筒子の対子と索子の両面。' },
  { level: '中級', hand: '123m45m67m11p22p33s', shape: '搭子過多', hint: 'ブロックが多すぎます。' },
  { level: '中級', hand: '567m11m22p345p67s9s', shape: '対子2つ＋両面', hint: '索子の67が両面です。' },
  { level: '中級', hand: '456m789m123p45s7s8p', shape: '両面＋浮き牌', hint: '8筒と7索の扱いを考えましょう。' },
  { level: '中級', hand: '123m456m789m12p13s', shape: '面子3つ＋搭子2つ', hint: '雀頭がまだありません。' },
  // 上級
  { level: '上級', hand: '123m456m789m12p45s', shape: '完全一向聴', hint: '面子3つ、搭子2つ。雀頭がない形です。' },
  { level: '上級', hand: '123m456m789m11p25s', shape: '雀頭あり＋浮き牌', hint: '索子の2と5、どちらも使えます。' },
  { level: '上級', hand: '22334455m789p1s5s', shape: '一盃口含みの多面', hint: '萬子の並びが複雑です。' },
  { level: '上級', hand: '345m345p345s11z2s8s', shape: '三色＋浮き牌', hint: '索子がどこでも伸びます。' },
  { level: '上級', hand: '19m19p19s12345z12m', shape: '国士無双の一向聴', hint: '足りない字牌は2つ。' },
  { level: '上級', hand: '19m19p19s123456z2m', shape: '国士無双（十三面の一歩手前）', hint: '么九牌が12種そろっています。' },
];

const LEVELS = ['入門', '中級', '上級'];

/* --------------------------------------------------------------------------
   画面の状態（対局データとは無関係なので保存しない）
   -------------------------------------------------------------------------- */

let studyTab = 'glossary';        // 'glossary' | 'tenpai' | 'shanten'
let glossaryFilter = '';

/** トレーニングの設定。聴牌とイーシャンテンで共通の仕組みを使う。 */
const TRAINERS = {
  tenpai: {
    title: '聴牌トレーニング',
    problems: () => TENPAI_PROBLEMS,
    question: '何待ち？',
    lead: '13枚の手牌を見て、アガリ牌（待ち）をすべて選んでください。',
    pickLabel: 'アガリ牌を選ぶ',
    answerLabel: 'アガリ牌',
    // 答えは毎回計算する（問題データに正解を持たせない）
    solve: (tiles) => findWaits(tiles),
    summary: (tiles, ans) => `${ans.length}種（${ans.map(tileName).join('・')}）`,
  },
  shanten: {
    title: 'イーシャンテントレーニング',
    problems: () => SHANTEN_PROBLEMS,
    question: '何を引けばテンパイ？',
    lead: 'イーシャンテン（あと1枚でテンパイ）の手牌です。引けばテンパイになる牌をすべて選んでください。',
    pickLabel: '受け入れ牌を選ぶ',
    answerLabel: '受け入れ',
    solve: (tiles) => tenpaiAcceptance(tiles),
    summary: (tiles, ans) =>
      `${ans.length}種 ${acceptanceWidth(tiles, ans)}枚（${ans.map(tileName).join('・')}）`,
  },
};

/** モードごとに進捗を分けて持つ */
const trainerState = {
  tenpai: newTrainerState(),
  shanten: newTrainerState(),
};

function newTrainerState() {
  return {
    level: '入門',
    index: 0,
    selection: new Set(),
    answered: false,
    hintShown: false,
    score: { correct: 0, total: 0 },
  };
}

/* --------------------------------------------------------------------------
   共通パーツ
   -------------------------------------------------------------------------- */

/** 牌の並びを描画した要素を作る */
function tilesEl(tiles, opt) {
  const span = el('span', { class: 'mj-hand' });
  span.innerHTML = handSvg(tiles, opt).replace(/^<span class="mj-hand">|<\/span>$/g, '');
  return span;
}

/* --------------------------------------------------------------------------
   用語集
   -------------------------------------------------------------------------- */

function renderGlossary(root) {
  const search = el('input', {
    type: 'text',
    placeholder: '用語を検索（例: ウマ、フリテン）',
    value: glossaryFilter,
    oninput: (ev) => {
      glossaryFilter = ev.target.value;
      const list = $('#glossary-list');
      if (list) { list.textContent = ''; buildGlossaryList(list); }
    },
  });

  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('span', {}, '用語集'),
      el('span', { class: 'pill' }, `${GLOSSARY.reduce((a, c) => a + c.terms.length, 0)}語`)
    ),
    el('div', { class: 'card-body' },
      search,
      el('p', { class: 'hint' }, '大会規定の言葉から役の名前まで。牌の図がある項目はそのまま見られます。')
    )
  ));

  const list = el('div', { id: 'glossary-list' });
  buildGlossaryList(list);
  root.appendChild(list);
}

function buildGlossaryList(container) {
  const q = glossaryFilter.trim().toLowerCase();
  let shown = 0;

  for (const cat of GLOSSARY) {
    const matched = cat.terms.filter(t =>
      !q || t.term.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q));
    if (!matched.length) continue;
    shown += matched.length;

    const body = el('div', { class: 'card-body' });
    if (cat.note && !q) body.appendChild(el('p', { class: 'hint', style: 'margin:0 0 10px' }, cat.note));

    for (const t of matched) {
      const entry = el('div', { class: 'gl-entry' },
        el('div', { class: 'gl-term' }, t.term),
        el('div', { class: 'gl-desc' }, t.desc)
      );
      if (t.hand) {
        const tiles = parseHand(t.hand);
        entry.appendChild(el('div', { class: 'gl-tiles' }, tilesEl(tiles, { keepOrder: true })));
        if (t.waits) {
          const full = t.pad ? tiles.concat(parseHand(t.pad)) : tiles;
          const w = findWaits(full);
          if (w.length) {
            entry.appendChild(el('div', { class: 'gl-waits' },
              el('span', { class: 'gl-waits-label' }, 'アガリ牌'),
              tilesEl(w, { keepOrder: true }),
              el('span', { class: 'gl-waits-name' }, w.map(tileName).join('・'))
            ));
          }
        }
      }
      body.appendChild(entry);
    }

    container.appendChild(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('span', {}, cat.category),
        el('span', { class: 'pill' }, `${matched.length}語`)),
      body
    ));
  }

  if (!shown) {
    container.appendChild(el('div', { class: 'card' },
      el('div', { class: 'empty' }, `「${glossaryFilter}」に一致する用語はありません`)));
  }
}

/* --------------------------------------------------------------------------
   トレーニング（聴牌 / イーシャンテン共通）
   -------------------------------------------------------------------------- */

function trainerMode() {
  return studyTab === 'shanten' ? 'shanten' : 'tenpai';
}

function trainerProblems(mode) {
  const st = trainerState[mode];
  const all = TRAINERS[mode].problems();
  return st.level === 'すべて' ? all : all.filter(p => p.level === st.level);
}

/** 現在の問題（テストからも参照する） */
function currentProblem() {
  const mode = trainerMode();
  const list = trainerProblems(mode);
  if (!list.length) return null;
  return list[trainerState[mode].index % list.length];
}

function renderTrainer(root, mode) {
  const cfg = TRAINERS[mode];
  const st = trainerState[mode];
  const list = trainerProblems(mode);

  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('span', {}, cfg.title),
      el('span', { class: 'pill' }, `${st.score.correct} / ${st.score.total} 正解`)
    ),
    el('div', { class: 'card-body' },
      el('div', { class: 'row' },
        ...['入門', '中級', '上級', 'すべて'].map(lv => el('button', {
          class: 'btn small' + (lv === st.level ? ' primary' : ''),
          onclick: () => {
            trainerState[mode] = { ...newTrainerState(), level: lv };
            renderStudy();
          },
        }, lv))
      ),
      el('p', { class: 'hint' }, cfg.lead)
    )
  ));

  const problem = list.length ? list[st.index % list.length] : null;
  if (!problem) {
    root.appendChild(el('div', { class: 'card' }, el('div', { class: 'empty' }, '問題がありません')));
    return;
  }

  const tiles = parseHand(problem.hand);
  const answer = cfg.solve(tiles);

  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('span', {}, `第${(st.index % list.length) + 1}問 / 全${list.length}問`),
      el('span', { class: 'pill' }, problem.level)
    ),
    el('div', { class: 'card-body' },
      el('div', { class: 'mj-hand-wrap' }, tilesEl(tiles)),
      el('p', { class: 'mj-question' }, cfg.question),
      st.hintShown && !st.answered
        ? el('p', { class: 'guide-note', style: 'margin:8px 0 0' }, 'ヒント: ' + problem.hint)
        : null
    )
  ));

  if (!st.answered) {
    root.appendChild(el('div', { class: 'card' },
      el('div', { class: 'card-head' },
        el('span', {}, cfg.pickLabel),
        el('span', { class: 'pill' }, `${st.selection.size}種 選択中`)
      ),
      el('div', { class: 'card-body' },
        buildTilePicker(st),
        el('div', { class: 'row', style: 'margin-top:12px' },
          el('button', {
            class: 'btn primary',
            disabled: st.selection.size === 0,
            onclick: () => {
              const picked = [...st.selection].sort((a, b) => a - b);
              st.answered = true;
              st.score.total += 1;
              if (JSON.stringify(picked) === JSON.stringify(answer)) st.score.correct += 1;
              renderStudy();
            },
          }, '答え合わせ'),
          el('button', {
            class: 'btn small',
            onclick: () => { st.selection = new Set(); renderStudy(); },
          }, '選択をクリア'),
          !st.hintShown
            ? el('button', { class: 'btn small ghost', onclick: () => { st.hintShown = true; renderStudy(); } }, 'ヒント')
            : null
        )
      )
    ));
  } else {
    root.appendChild(buildTrainerResult(mode, problem, tiles, answer, list));
  }
}

function buildTilePicker(st) {
  const wrap = el('div', { class: 'mj-picker' });
  const groups = [
    { label: '萬子', from: 0, to: 8 },
    { label: '筒子', from: 9, to: 17 },
    { label: '索子', from: 18, to: 26 },
    { label: '字牌', from: 27, to: 33 },
  ];
  for (const g of groups) {
    const row = el('div', { class: 'mj-picker-row' });
    for (let t = g.from; t <= g.to; t++) {
      const btn = el('button', {
        type: 'button',
        class: 'mj-pick' + (st.selection.has(t) ? ' is-on' : ''),
        'aria-pressed': st.selection.has(t) ? 'true' : 'false',
        'aria-label': tileName(t),
        onclick: () => {
          if (st.selection.has(t)) st.selection.delete(t);
          else st.selection.add(t);
          renderStudy();
        },
      });
      btn.innerHTML = tileSvg(t);
      row.appendChild(btn);
    }
    wrap.appendChild(el('div', { class: 'mj-picker-group' },
      el('span', { class: 'mj-picker-label' }, g.label), row));
  }
  return wrap;
}

function buildTrainerResult(mode, problem, tiles, answer, list) {
  const cfg = TRAINERS[mode];
  const st = trainerState[mode];
  const picked = [...st.selection].sort((a, b) => a - b);
  const correct = JSON.stringify(picked) === JSON.stringify(answer);
  const missed = answer.filter(t => !st.selection.has(t));
  const extra = picked.filter(t => !answer.includes(t));

  const body = el('div', { class: 'card-body' },
    el('div', { class: 'mj-result-line' },
      el('span', { class: 'gl-waits-label' }, cfg.answerLabel),
      tilesEl(answer, { keepOrder: true })
    ),
    el('p', { class: 'mj-shape' }, cfg.summary(tiles, answer)),
    el('p', { class: 'mj-shape' }, `形: ${problem.shape}`)
  );

  if (!correct) {
    if (missed.length) {
      body.appendChild(el('div', { class: 'mj-result-line' },
        el('span', { class: 'gl-waits-label miss' }, '見落とし'),
        tilesEl(missed, { keepOrder: true })));
    }
    if (extra.length) {
      body.appendChild(el('div', { class: 'mj-result-line' },
        el('span', { class: 'gl-waits-label miss' }, '余分'),
        tilesEl(extra, { keepOrder: true })));
    }
  }

  body.appendChild(el('div', { class: 'row', style: 'margin-top:12px' },
    el('button', {
      class: 'btn primary',
      onclick: () => {
        st.index = (st.index + 1) % list.length;
        st.selection = new Set();
        st.answered = false;
        st.hintShown = false;
        renderStudy();
      },
    }, '次の問題 →'),
    el('button', {
      class: 'btn small',
      onclick: () => { trainerState[mode] = { ...newTrainerState(), level: st.level }; renderStudy(); },
    }, '最初から')
  ));

  return el('div', { class: 'card' },
    el('div', { class: 'card-head ' + (correct ? 'is-correct' : 'is-wrong') },
      el('span', {}, correct ? '◯ 正解' : '✕ 不正解'),
      el('span', { class: 'pill' }, `${st.score.correct} / ${st.score.total}`)
    ),
    body
  );
}

/* --------------------------------------------------------------------------
   タブ
   -------------------------------------------------------------------------- */

function renderStudy() {
  const root = $('#view-study');
  if (!root) return;
  root.textContent = '';

  const tabs = [
    ['glossary', '用語集'],
    ['tenpai', '聴牌トレ'],
    ['shanten', 'イーシャンテン'],
  ];
  root.appendChild(el('div', { class: 'subtabs' },
    ...tabs.map(([key, label]) => el('button', {
      class: 'subtab' + (studyTab === key ? ' is-active' : ''),
      onclick: () => { studyTab = key; renderStudy(); window.scrollTo({ top: 0 }); },
    }, label))
  ));

  if (studyTab === 'glossary') renderGlossary(root);
  else renderTrainer(root, trainerMode());
}
