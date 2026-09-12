'use strict';

/* ==========================================================================
   麻雀大会 スコア計算アプリ
   - 素点 + オカ + ウマ（馬）計算
   - 卓組み自動生成（1回戦:抽選 / 2回戦:順位卓 / 3回戦以降:総合順位順）
   - 総合順位はリアルタイム更新
   ========================================================================== */

const STORAGE_KEY = 'maimai-cup-scorer-v1';
const SEAT_LABELS = ['東', '南', '西', '北'];
const SEATS = 4;

const DEFAULT_SETTINGS = {
  title: '第3回 マイマイカップ',
  roundCount: 4,
  startPoints: 25000,   // 配給原点
  returnPoints: 30000,  // 返し点
  uma: [20, 10, -10, -20],
  useRawScore: true,    // 素点をポイントに加算するか
  useOka: false,        // オカ（返し点 - 配給原点）× 人数 を1位に加算
  rounding: 'round',    // 'round'(四捨五入) | 'go'(五捨六入) | 'none'(小数第1位)
  zeroSumAdjust: true,  // 端数処理で生じた丸め誤差を1位で吸収する
  chipValue: 300,       // チップ1枚あたりの金額（円）
  prizes: [30000, 18000, 10000, 7000, 5000],
};

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */

let state = null;
/** 卓組み手動入れ替え用の選択状態 { roundIndex, tableId|null, seatIdx|null, playerId } */
let swapSel = null;
let currentView = 'match';
let currentRound = 0; // 0-based

function defaultState() {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, uma: [...DEFAULT_SETTINGS.uma], prizes: [...DEFAULT_SETTINGS.prizes] },
    players: [],
    rounds: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const s = defaultState();
    s.settings = { ...s.settings, ...(parsed.settings || {}) };
    if (!Array.isArray(s.settings.uma) || s.settings.uma.length !== 4) s.settings.uma = [...DEFAULT_SETTINGS.uma];
    if (!Array.isArray(s.settings.prizes)) s.settings.prizes = [...DEFAULT_SETTINGS.prizes];
    s.players = Array.isArray(parsed.players) ? parsed.players : [];
    s.rounds = Array.isArray(parsed.rounds) ? parsed.rounds : [];
    return s;
  } catch (err) {
    console.warn('保存データを読み込めませんでした', err);
    return defaultState();
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('保存に失敗しました', err);
  }
}

/* --------------------------------------------------------------------------
   Utilities
   -------------------------------------------------------------------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return node;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 端数処理。'round'=四捨五入 / 'go'=五捨六入 / 'none'=小数第1位まで */
function applyRounding(v, mode) {
  if (mode === 'none') return Math.round(v * 10) / 10;
  const sign = v < 0 ? -1 : 1;
  const abs = Math.abs(v);
  // 浮動小数の誤差対策として微小値を足す
  if (mode === 'go') return sign * Math.floor(abs + 0.4 + 1e-9);
  return sign * Math.floor(abs + 0.5 + 1e-9);
}

function fmtPt(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const rounded = Math.round(v * 10) / 10;
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return rounded > 0 ? '+' + body : body;
}

function ptClass(v) {
  if (v === null || v === undefined || Number.isNaN(v) || v === 0) return '';
  return v > 0 ? 'pos' : 'neg';
}

function fmtScore(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '';
  return v.toLocaleString('ja-JP');
}

function fmtYen(v) {
  return (v < 0 ? '-' : '') + '¥' + Math.abs(Math.round(v)).toLocaleString('ja-JP');
}

let toastTimer = null;
function toast(msg) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = msg;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 2200);
}

/* --------------------------------------------------------------------------
   Domain: players / rounds
   -------------------------------------------------------------------------- */

function playerById(id) {
  return state.players.find(p => p.id === id) || null;
}

function playerName(id) {
  const p = playerById(id);
  return p ? p.name : '（不明）';
}

function ensureRound(index) {
  while (state.rounds.length <= index) {
    state.rounds.push({ index: state.rounds.length, method: null, tables: [], byes: [] });
  }
  return state.rounds[index];
}

function defaultMethodFor(roundIndex) {
  if (roundIndex === 0) return 'random';  // 1回戦: 抽選
  if (roundIndex === 1) return 'rank';    // 2回戦: 順位卓（前回着順）
  return 'total';                         // 3回戦以降: 総合順位順
}

const METHOD_LABELS = {
  random: 'ランダム抽選',
  rank: '順位卓（前回の着順順）',
  total: '総合順位順',
  manual: '手動',
};

/* --------------------------------------------------------------------------
   Scoring engine
   -------------------------------------------------------------------------- */

/**
 * 1卓分の計算。
 * 同点の場合は席順（東→南→西→北）が上位。
 * @returns {{complete:boolean, sum:number, expected:number, results:Array}}
 */
function computeTable(table) {
  const st = state.settings;
  const scores = table.scores || [];
  const results = [];
  for (let i = 0; i < SEATS; i++) results.push({ rank: null, base: 0, uma: 0, pt: null });

  const filledCount = scores.filter(s => typeof s === 'number' && Number.isFinite(s)).length;
  const sum = scores.reduce((a, s) => a + (typeof s === 'number' && Number.isFinite(s) ? s : 0), 0);
  const expected = st.startPoints * SEATS;
  const complete = filledCount === SEATS;

  if (!complete) return { complete, sum, expected, filledCount, results };

  const order = [0, 1, 2, 3].sort((a, b) => (scores[b] - scores[a]) || (a - b));
  let exactTotal = 0;   // 端数処理をかける前の、卓全体の理論値
  order.forEach((seatIdx, rank) => {
    let base = 0;
    if (st.useRawScore) {
      // 素点pt = (最終点 − 返し点) ÷ 1000   例) 33,000点 → +3 ／ 25,000点 → −5
      base = (scores[seatIdx] - st.returnPoints) / 1000;
      if (st.useOka && rank === 0) base += ((st.returnPoints - st.startPoints) * SEATS) / 1000;
      exactTotal += base;
      base = applyRounding(base, st.rounding);
    }
    const uma = Number(st.uma[rank]) || 0;
    exactTotal += uma;
    results[seatIdx] = { rank, base, uma, pt: base + uma };
  });

  // 端数処理で生じた丸め誤差だけを1位に寄せ、卓の合計を理論値どおりにそろえる。
  // 「合計0」に合わせるのではないので、オカなし（合計 −20 など）の設定でも
  // 1位に余分なポイントが入らない。
  if (st.useRawScore && st.zeroSumAdjust) {
    const rounded = results.reduce((a, r) => a + r.pt, 0);
    const diff = Math.round((rounded - exactTotal) * 10) / 10;
    if (Math.abs(diff) > 1e-9) {
      const topSeat = order[0];
      results[topSeat].base = Math.round((results[topSeat].base - diff) * 10) / 10;
      results[topSeat].pt = Math.round((results[topSeat].pt - diff) * 10) / 10;
    }
  }

  return { complete, sum, expected, exactTotal, filledCount, results };
}

/**
 * 全ラウンドを集計して、プレイヤーごとの成績を返す。
 * リアルタイム更新のため、入力が揃った卓から順次反映される。
 */
function computeStandings() {
  const byPlayer = new Map();
  for (const p of state.players) {
    byPlayer.set(p.id, {
      player: p,
      rounds: [],            // 各回戦 { pt, rank, score, bye }
      totalPt: 0,
      totalScore: 0,
      played: 0,
      byes: 0,
      rankCounts: [0, 0, 0, 0],
      tobi: 0,
    });
  }

  state.rounds.forEach((round, ri) => {
    for (const entry of byPlayer.values()) entry.rounds[ri] = null;

    for (const table of round.tables) {
      const calc = computeTable(table);
      table.seats.forEach((pid, seatIdx) => {
        const entry = byPlayer.get(pid);
        if (!entry) return;
        const r = calc.results[seatIdx];
        const score = table.scores[seatIdx];
        const record = {
          pt: calc.complete ? r.pt : null,
          rank: calc.complete ? r.rank : null,
          score: typeof score === 'number' && Number.isFinite(score) ? score : null,
          bye: false,
          tableId: table.id,
        };
        entry.rounds[ri] = record;
        if (calc.complete) {
          entry.totalPt += r.pt;
          entry.totalScore += score;
          entry.played += 1;
          entry.rankCounts[r.rank] += 1;
          if (score < 0) entry.tobi += 1;
        }
      });
    }

    for (const pid of round.byes || []) {
      const entry = byPlayer.get(pid);
      if (!entry) continue;
      entry.rounds[ri] = { pt: null, rank: null, score: null, bye: true, tableId: null };
      entry.byes += 1;
    }
  });

  const list = Array.from(byPlayer.values());
  list.sort((a, b) =>
    (b.totalPt - a.totalPt) ||
    (b.totalScore - a.totalScore) ||
    (b.rankCounts[0] - a.rankCounts[0]) ||
    (avgRank(a) - avgRank(b)) ||
    a.player.name.localeCompare(b.player.name, 'ja')
  );

  // 同点は同順位表示（order は画面に並ぶ順そのもの）
  let lastKey = null;
  let lastRank = 0;
  list.forEach((entry, i) => {
    entry.order = i;
    const key = entry.totalPt.toFixed(4) + '/' + entry.totalScore;
    if (key === lastKey) {
      entry.rank = lastRank;
    } else {
      entry.rank = i + 1;
      lastRank = i + 1;
      lastKey = key;
    }
  });

  return list;
}

function avgRank(entry) {
  if (!entry.played) return 99;
  let total = 0;
  entry.rankCounts.forEach((c, i) => { total += c * (i + 1); });
  return total / entry.played;
}

function standingsMap() {
  const map = new Map();
  for (const entry of computeStandings()) map.set(entry.player.id, entry);
  return map;
}

/* --------------------------------------------------------------------------
   卓組み生成
   -------------------------------------------------------------------------- */

/**
 * 指定ラウンドの卓組みを生成する。
 * random : ランダム抽選
 * rank   : 前回の着順順（1位同士・2位同士…）。同着順内は総合ポイント順。
 * total  : その時点の総合順位順（1〜4位 / 5〜8位 …）
 */
function generateRound(roundIndex, method) {
  const round = ensureRound(roundIndex);
  const standings = standingsMap();
  const active = state.players.filter(p => !p.inactive);

  if (active.length < SEATS) {
    toast('プレイヤーが4人未満です');
    return false;
  }

  let ordered;
  if (method === 'random') {
    ordered = shuffle(active);
  } else if (method === 'rank') {
    const prev = roundIndex > 0 ? state.rounds[roundIndex - 1] : null;
    const prevRank = new Map();
    if (prev) {
      for (const table of prev.tables) {
        const calc = computeTable(table);
        if (!calc.complete) continue;
        table.seats.forEach((pid, seatIdx) => prevRank.set(pid, calc.results[seatIdx].rank));
      }
    }
    if (prevRank.size === 0) {
      toast('前回の結果が未入力のため、総合順位順で組みました');
      ordered = sortByTotal(active, standings);
    } else {
      ordered = [...active].sort((a, b) => {
        const ra = prevRank.has(a.id) ? prevRank.get(a.id) : 99;
        const rb = prevRank.has(b.id) ? prevRank.get(b.id) : 99;
        if (ra !== rb) return ra - rb;
        return compareTotal(a, b, standings);
      });
    }
  } else {
    ordered = sortByTotal(active, standings);
  }

  // 4で割り切れない場合は抜け番を決める（抜け番回数が少ない人を優先）
  const remainder = ordered.length % SEATS;
  let byes = [];
  if (remainder > 0) {
    const candidates = [...ordered].sort((a, b) => {
      const ba = standings.get(a.id)?.byes ?? 0;
      const bb = standings.get(b.id)?.byes ?? 0;
      if (ba !== bb) return ba - bb;
      return Math.random() - 0.5;
    });
    byes = candidates.slice(0, remainder).map(p => p.id);
    ordered = ordered.filter(p => !byes.includes(p.id));
  }

  const groups = chunk(ordered, SEATS);
  round.method = method;
  round.byes = byes;
  round.tables = groups.map((group, i) => ({
    id: uid(),
    no: i + 1,
    seats: group.map(p => p.id),
    scores: [null, null, null, null],
    locked: false,
  }));

  swapSel = null;
  save();
  return true;
}

function sortByTotal(players, standings) {
  return [...players].sort((a, b) => compareTotal(a, b, standings));
}

function compareTotal(a, b, standings) {
  // 同点で順位が並んだ場合も、順位表の表示順と卓組みがズレないよう order で比較する
  const ea = standings.get(a.id);
  const eb = standings.get(b.id);
  const oa = ea ? ea.order : Number.MAX_SAFE_INTEGER;
  const ob = eb ? eb.order : Number.MAX_SAFE_INTEGER;
  if (oa !== ob) return oa - ob;
  return a.name.localeCompare(b.name, 'ja');
}

/* --------------------------------------------------------------------------
   View: 対局（卓組み + スコア入力）
   -------------------------------------------------------------------------- */

function renderMatch() {
  const root = $('#view-match');
  root.textContent = '';

  if (state.players.length === 0) {
    root.appendChild(el('div', { class: 'card' },
      el('div', { class: 'empty' },
        el('div', { text: 'まずはプレイヤーを登録してください' }),
        el('div', { style: 'margin-top:12px' },
          el('button', { class: 'btn primary', onclick: () => switchView('players') }, 'プレイヤー登録へ')
        )
      )
    ));
    return;
  }

  root.appendChild(renderRoundBar());

  const round = ensureRound(currentRound);
  root.appendChild(renderRoundControls(round));

  if (round.tables.length === 0) {
    root.appendChild(el('div', { class: 'card' },
      el('div', { class: 'empty' },
        `${currentRound + 1}回戦の卓組みはまだ作成されていません`,
        el('div', { class: 'hint', style: 'margin-top:8px' },
          `推奨: ${METHOD_LABELS[defaultMethodFor(currentRound)]}`)
      )
    ));
  } else {
    round.tables.forEach(table => root.appendChild(renderTableCard(round, table)));
    if ((round.byes || []).length) root.appendChild(renderByeCard(round));
  }

  root.appendChild(renderMiniStandings());
}

function renderRoundBar() {
  const bar = el('div', { class: 'round-bar' });
  const count = Math.max(state.settings.roundCount, state.rounds.length);
  for (let i = 0; i < count; i++) {
    const round = state.rounds[i];
    let dot = '';
    if (round && round.tables.length) {
      const done = round.tables.every(t => computeTable(t).complete);
      dot = done ? '✅' : '✏️';
    }
    bar.appendChild(el('button', {
      class: 'round-chip' + (i === currentRound ? ' is-active' : ''),
      onclick: () => { currentRound = i; swapSel = null; renderMatch(); },
    }, `${i + 1}回戦`, dot ? el('span', { class: 'dot', text: dot }) : null));
  }
  return bar;
}

function renderRoundControls(round) {
  const method = round.method || defaultMethodFor(round.index);
  const select = el('select', { class: 'grow', id: 'method-select' },
    ...Object.entries(METHOD_LABELS)
      .filter(([key]) => key !== 'manual')
      .map(([key, label]) => el('option', { value: key, selected: key === method }, label))
  );

  const hasScores = round.tables.some(t => t.scores.some(s => s !== null && s !== undefined));

  const genBtn = el('button', { class: 'btn primary', onclick: () => {
    if (round.tables.length && hasScores &&
        !confirm('入力済みのスコアが消えます。卓組みを作り直しますか？')) return;
    if (generateRound(round.index, select.value)) {
      renderMatch();
      toast(`${round.index + 1}回戦の卓組みを作成しました`);
    }
  } }, round.tables.length ? '作り直す' : '卓組みを作成');

  const body = el('div', { class: 'card-body' },
    el('div', { class: 'row' }, select, genBtn),
    el('p', { class: 'hint' },
      round.index === 0 ? '1回戦はランダム抽選です。'
        : round.index === 1 ? '2回戦は前回の着順ごと（1位同士・2位同士…）に卓を組みます。'
          : '3回戦以降はその時点の総合順位順（1〜4位／5〜8位…）に卓を組みます。'),
    round.tables.length
      ? el('p', { class: 'hint' }, `方式: ${METHOD_LABELS[round.method] || '—'} ／ 名前をタップ → もう一人をタップで席を入れ替えできます`)
      : null
  );

  return el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('span', {}, `${round.index + 1}回戦 卓組み`),
      el('span', { class: 'pill' }, `${state.players.filter(p => !p.inactive).length}人`)
    ),
    body
  );
}

function renderTableCard(round, table) {
  const calc = computeTable(table);
  const tbody = el('tbody');

  table.seats.forEach((pid, seatIdx) => {
    const res = calc.results[seatIdx];
    const selected = swapSel && swapSel.tableId === table.id && swapSel.seatIdx === seatIdx;

    const scoreInput = el('input', {
      type: 'number',
      inputmode: 'numeric',
      step: '100',
      placeholder: '点数',
      value: table.scores[seatIdx] === null || table.scores[seatIdx] === undefined ? '' : table.scores[seatIdx],
      disabled: table.locked,
      dataset: { tableId: table.id, seatIdx: String(seatIdx) },
      oninput: (ev) => onScoreInput(table, seatIdx, ev.target.value),
    });

    tbody.appendChild(el('tr', { class: selected ? 'is-selected' : '' },
      el('td', {}, el('span', { class: 'seat-badge', text: SEAT_LABELS[seatIdx] })),
      el('td', {},
        el('button', {
          class: 'pname',
          onclick: () => onSwapClick(round, table.id, seatIdx, pid),
        }, playerName(pid))
      ),
      el('td', { class: 'score-cell' }, scoreInput),
      el('td', { class: 'rank-cell', dataset: { rankFor: `${table.id}:${seatIdx}` } },
        res.rank === null ? '' : el('span', { class: `rank-badge rank-${res.rank + 1}` }, `${res.rank + 1}位`)),
      el('td', { class: `pt-cell num ${ptClass(res.pt)}`, dataset: { ptFor: `${table.id}:${seatIdx}` } },
        fmtPt(res.pt))
    ));
  });

  const diff = calc.sum - calc.expected;
  const sumRow = el('div', { class: 'sum-row', dataset: { sumFor: table.id } }, ...sumRowContent(calc));

  const actions = el('div', { class: 'row', style: 'margin-top:10px' },
    el('button', {
      class: 'btn small',
      onclick: () => { autoFill(table); },
    }, '残り1人を自動計算'),
    el('button', {
      class: 'btn small',
      onclick: () => { table.scores = [null, null, null, null]; save(); renderMatch(); },
    }, '点数クリア'),
    el('span', { class: 'spacer' }),
    el('button', {
      class: 'btn small' + (table.locked ? ' primary' : ''),
      onclick: () => { table.locked = !table.locked; save(); renderMatch(); },
    }, table.locked ? '🔒 確定済み' : '確定する')
  );

  return el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('span', {}, `第${table.no}卓`),
      calc.complete
        ? el('span', { class: diff === 0 ? 'pill ok' : 'pill warn' }, diff === 0 ? '入力完了' : '点数不一致')
        : el('span', { class: 'pill' }, `${calc.filledCount}/4 入力`)
    ),
    el('div', { class: 'card-body' },
      el('table', { class: 'seat-table' },
        el('thead', {}, el('tr', {},
          el('th', {}, '席'), el('th', {}, 'プレイヤー'), el('th', {}, '点数'), el('th', {}, '着順'), el('th', {}, 'pt')
        )),
        tbody
      ),
      sumRow,
      actions
    )
  );
}

function sumRowContent(calc) {
  const diff = calc.sum - calc.expected;
  return [
    el('span', {}, `合計 ${fmtScore(calc.sum)} / ${fmtScore(calc.expected)}`),
    el('span', { class: diff === 0 ? 'good' : 'bad' },
      diff === 0 ? '±0' : `差分 ${diff > 0 ? '+' : ''}${fmtScore(diff)}`)
  ];
}

function renderByeCard(round) {
  return el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('span', {}, '抜け番'), el('span', { class: 'pill warn' }, `${round.byes.length}人`)),
    el('div', { class: 'card-body' },
      el('div', { class: 'row' },
        ...round.byes.map((pid, i) => el('button', {
          class: 'btn small' + (swapSel && swapSel.tableId === null && swapSel.byeIdx === i ? ' primary' : ''),
          onclick: () => onSwapClick(round, null, i, pid),
        }, playerName(pid)))
      ),
      el('p', { class: 'hint' }, 'この回戦は対局しません（ポイントは加算されません）。名前をタップして席と入れ替えできます。')
    )
  );
}

function renderMiniStandings() {
  const list = computeStandings();
  const top = list.slice(0, 5);
  return el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('span', {}, '総合順位（速報）'),
      el('button', { class: 'btn small ghost', onclick: () => switchView('standings') }, 'すべて見る →')
    ),
    el('div', { class: 'card-body' },
      top.length === 0
        ? el('div', { class: 'hint' }, 'まだ結果がありません')
        : el('table', { class: 'standings' },
          el('tbody', {}, ...top.map(entry => el('tr', { class: entry.rank === 1 ? 'top1' : '' },
            el('td', { class: 'rk-col' }, `${entry.rank}`),
            el('td', { class: 'name-col' }, entry.player.name),
            el('td', { class: `total-col num ${ptClass(entry.totalPt)}` }, fmtPt(entry.totalPt))
          )))
        )
    )
  );
}

/* ---- 対局タブ イベント ---- */

function onScoreInput(table, seatIdx, raw) {
  const trimmed = String(raw).trim();
  table.scores[seatIdx] = trimmed === '' ? null : Number(trimmed);
  if (table.scores[seatIdx] !== null && !Number.isFinite(table.scores[seatIdx])) {
    table.scores[seatIdx] = null;
  }
  save();
  refreshComputed();
}

/** 入力欄のフォーカスを保ったまま、計算結果の表示だけを更新する */
function refreshComputed() {
  const round = state.rounds[currentRound];
  if (round) {
    for (const table of round.tables) {
      const calc = computeTable(table);
      for (let seatIdx = 0; seatIdx < SEATS; seatIdx++) {
        const res = calc.results[seatIdx];
        const rankCell = $(`[data-rank-for="${table.id}:${seatIdx}"]`);
        if (rankCell) {
          rankCell.textContent = '';
          if (res.rank !== null) {
            rankCell.appendChild(el('span', { class: `rank-badge rank-${res.rank + 1}` }, `${res.rank + 1}位`));
          }
        }
        const ptCell = $(`[data-pt-for="${table.id}:${seatIdx}"]`);
        if (ptCell) {
          ptCell.textContent = fmtPt(res.pt);
          ptCell.className = `pt-cell num ${ptClass(res.pt)}`;
        }
      }
      const sumCell = $(`[data-sum-for="${table.id}"]`);
      if (sumCell) {
        sumCell.textContent = '';
        sumRowContent(calc).forEach(n => sumCell.appendChild(n));
      }
    }
  }
  // 総合順位はリアルタイム反映
  renderStandings();
  const mini = $('#view-match .card:last-child');
  if (mini && currentView === 'match') {
    const fresh = renderMiniStandings();
    mini.replaceWith(fresh);
  }
}

function autoFill(table) {
  const missing = [];
  table.scores.forEach((s, i) => {
    if (!(typeof s === 'number' && Number.isFinite(s))) missing.push(i);
  });
  if (missing.length !== 1) {
    toast('未入力がちょうど1人のときに使えます');
    return;
  }
  const expected = state.settings.startPoints * SEATS;
  const sum = table.scores.reduce((a, s) => a + (typeof s === 'number' && Number.isFinite(s) ? s : 0), 0);
  table.scores[missing[0]] = expected - sum;
  save();
  renderMatch();
}

function onSwapClick(round, tableId, idx, playerId) {
  if (!swapSel) {
    swapSel = { tableId, seatIdx: tableId === null ? null : idx, byeIdx: tableId === null ? idx : null, playerId };
    renderMatch();
    toast('入れ替える相手をタップしてください');
    return;
  }
  if (swapSel.playerId === playerId) {
    swapSel = null;
    renderMatch();
    return;
  }

  const setAt = (sel, pid) => {
    if (sel.tableId === null) {
      round.byes[sel.byeIdx] = pid;
    } else {
      const t = round.tables.find(x => x.id === sel.tableId);
      t.seats[sel.seatIdx] = pid;
    }
  };
  const target = { tableId, seatIdx: tableId === null ? null : idx, byeIdx: tableId === null ? idx : null, playerId };
  setAt(swapSel, target.playerId);
  setAt(target, swapSel.playerId);

  swapSel = null;
  round.method = 'manual';
  save();
  renderMatch();
  toast('席を入れ替えました');
}

/* --------------------------------------------------------------------------
   View: 総合順位
   -------------------------------------------------------------------------- */

function renderStandings() {
  const root = $('#view-standings');
  root.textContent = '';

  const list = computeStandings();
  if (list.length === 0) {
    root.appendChild(el('div', { class: 'card' }, el('div', { class: 'empty' }, 'プレイヤーが登録されていません')));
    return;
  }

  const roundCount = Math.max(state.settings.roundCount, state.rounds.length);
  const st = state.settings;

  const head = el('tr', {},
    el('th', { class: 'rk-col' }, '順'),
    el('th', { class: 'name-col' }, 'プレイヤー'),
    el('th', { class: 'total-col' }, '合計pt')
  );
  for (let i = 0; i < roundCount; i++) head.appendChild(el('th', {}, `${i + 1}回戦`));
  head.appendChild(el('th', {}, '素点計'));
  head.appendChild(el('th', {}, '平均着順'));
  head.appendChild(el('th', {}, '着順分布'));
  if (st.chipValue > 0) head.appendChild(el('th', {}, 'チップ'));
  head.appendChild(el('th', {}, '賞金'));

  const body = el('tbody');
  list.forEach(entry => {
    const tr = el('tr', { class: entry.rank === 1 ? 'top1' : '' },
      el('td', { class: 'rk-col' }, String(entry.rank)),
      el('td', { class: 'name-col' }, entry.player.name),
      el('td', { class: `total-col num ${ptClass(entry.totalPt)}` }, fmtPt(entry.totalPt))
    );
    for (let i = 0; i < roundCount; i++) {
      const rec = entry.rounds[i];
      if (!rec) { tr.appendChild(el('td', { class: 'num' }, '—')); continue; }
      if (rec.bye) { tr.appendChild(el('td', { class: 'num' }, '抜')); continue; }
      if (rec.pt === null) { tr.appendChild(el('td', { class: 'num' }, '…')); continue; }
      tr.appendChild(el('td', { class: `num ${ptClass(rec.pt)}` },
        fmtPt(rec.pt), el('span', { class: 'sub' }, `${rec.rank + 1}着`)));
    }
    tr.appendChild(el('td', { class: 'num' }, entry.played ? fmtScore(entry.totalScore) : '—'));
    tr.appendChild(el('td', { class: 'num' }, entry.played ? avgRank(entry).toFixed(2) : '—'));
    tr.appendChild(el('td', { class: 'num' }, entry.rankCounts.join('-')));
    if (st.chipValue > 0) {
      const chips = entry.player.chips || 0;
      tr.appendChild(el('td', { class: `num ${ptClass(chips)}` },
        `${chips > 0 ? '+' : ''}${chips}`, el('span', { class: 'sub' }, fmtYen(chips * st.chipValue))));
    }
    const prize = st.prizes[entry.rank - 1];
    tr.appendChild(el('td', { class: 'num' }, prize ? fmtYen(prize) : '—'));
    body.appendChild(tr);
  });

  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('span', {}, '総合順位（リアルタイム）'),
      el('span', { class: 'pill' }, `${completedRounds()} / ${st.roundCount} 回戦終了`)
    ),
    el('div', { class: 'card-body' },
      el('div', { class: 'standings-wrap' },
        el('table', { class: 'standings' }, el('thead', {}, head), body)
      ),
      el('p', { class: 'hint' }, '同点の場合は 素点合計 → 1位回数 → 平均着順 の順で上位を判定します。'),
      el('div', { class: 'row', style: 'margin-top:10px' },
        el('button', { class: 'btn small', onclick: exportCsv }, 'CSVで書き出す')
      )
    )
  ));
}

function completedRounds() {
  return state.rounds.filter(r => r.tables.length > 0 && r.tables.every(t => computeTable(t).complete)).length;
}

function exportCsv() {
  const list = computeStandings();
  const roundCount = Math.max(state.settings.roundCount, state.rounds.length);
  const header = ['順位', 'プレイヤー', '合計pt'];
  for (let i = 0; i < roundCount; i++) header.push(`${i + 1}回戦pt`, `${i + 1}回戦着順`);
  header.push('素点合計', '平均着順', 'チップ');

  const rows = [header];
  for (const entry of list) {
    const row = [entry.rank, entry.player.name, Math.round(entry.totalPt * 10) / 10];
    for (let i = 0; i < roundCount; i++) {
      const rec = entry.rounds[i];
      row.push(rec && rec.pt !== null ? Math.round(rec.pt * 10) / 10 : '');
      row.push(rec && rec.rank !== null ? rec.rank + 1 : (rec && rec.bye ? '抜け番' : ''));
    }
    row.push(entry.played ? entry.totalScore : '');
    row.push(entry.played ? avgRank(entry).toFixed(2) : '');
    row.push(entry.player.chips || 0);
    rows.push(row);
  }

  const csv = rows.map(r => r.map(cell => {
    const s = String(cell);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');

  downloadFile('﻿' + csv, `${state.settings.title}_順位表.csv`, 'text/csv;charset=utf-8');
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* --------------------------------------------------------------------------
   View: プレイヤー
   -------------------------------------------------------------------------- */

function renderPlayers() {
  const root = $('#view-players');
  root.textContent = '';

  const nameInput = el('input', {
    type: 'text',
    placeholder: '名前を入力',
    onkeydown: (ev) => { if (ev.key === 'Enter') addFromInput(); },
  });
  function addFromInput() {
    const name = nameInput.value.trim();
    if (!name) return;
    state.players.push({ id: uid(), name, chips: 0 });
    save();
    renderAll();
    $('#view-players input[type="text"]').focus();
  }

  const bulk = el('textarea', {
    placeholder: '改行区切りでまとめて貼り付け',
    rows: '4',
    style: 'width:100%;border:1px solid var(--line);border-radius:8px;padding:8px;background:#fff;font:inherit',
  });

  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('span', {}, 'プレイヤー登録'),
      el('span', { class: 'pill' }, `${state.players.length}人`)
    ),
    el('div', { class: 'card-body' },
      el('div', { class: 'row' },
        el('div', { class: 'grow' }, nameInput),
        el('button', { class: 'btn primary', onclick: addFromInput }, '追加')
      ),
      el('details', { style: 'margin-top:10px' },
        el('summary', { style: 'font-size:13px;color:var(--muted);cursor:pointer' }, 'まとめて追加'),
        el('div', { style: 'margin-top:8px' },
          bulk,
          el('button', {
            class: 'btn small', style: 'margin-top:6px',
            onclick: () => {
              const names = bulk.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
              if (!names.length) return;
              names.forEach(name => state.players.push({ id: uid(), name, chips: 0 }));
              save();
              renderAll();
              toast(`${names.length}人を追加しました`);
            },
          }, 'この内容で追加')
        )
      ),
      state.players.length % SEATS !== 0
        ? el('p', { class: 'hint' }, `⚠️ 現在${state.players.length}人です。4の倍数でない分は自動で抜け番になります。`)
        : null
    )
  ));

  if (state.players.length) {
    const listBody = el('div', { class: 'card-body' });
    state.players.forEach((p, i) => {
      listBody.appendChild(el('div', { class: 'player-row' },
        el('span', { class: 'idx' }, String(i + 1)),
        el('input', {
          type: 'text',
          value: p.name,
          class: 'grow',
          onchange: (ev) => { p.name = ev.target.value.trim() || p.name; save(); renderAll(); },
        }),
        state.settings.chipValue > 0
          ? el('span', { class: 'chip-ctl' },
            el('button', { class: 'btn small', onclick: () => { p.chips = (p.chips || 0) - 1; save(); renderAll(); } }, '−'),
            el('span', { class: 'val' }, String(p.chips || 0)),
            el('button', { class: 'btn small', onclick: () => { p.chips = (p.chips || 0) + 1; save(); renderAll(); } }, '＋')
          )
          : null,
        el('button', {
          class: 'btn small danger',
          onclick: () => {
            if (!confirm(`${p.name} を削除しますか？（卓組みからも外れます）`)) return;
            state.players = state.players.filter(x => x.id !== p.id);
            for (const round of state.rounds) {
              round.byes = (round.byes || []).filter(id => id !== p.id);
              round.tables = round.tables.filter(t => !t.seats.includes(p.id));
            }
            save();
            renderAll();
          },
        }, '削除')
      ));
    });

    root.appendChild(el('div', { class: 'card' },
      el('div', { class: 'card-head' },
        el('span', {}, '登録済みプレイヤー'),
        state.settings.chipValue > 0 ? el('span', { class: 'pill' }, `チップ ${state.settings.chipValue}円/枚`) : null
      ),
      listBody
    ));
  }
}

/* --------------------------------------------------------------------------
   View: 設定
   -------------------------------------------------------------------------- */

function renderSettings() {
  const root = $('#view-settings');
  root.textContent = '';
  const st = state.settings;

  const commit = (key, value) => {
    st[key] = value;
    save();
    renderAll();
  };

  const numField = (label, key, attrs = {}) => el('div', { class: 'field' },
    el('label', {}, label),
    el('input', {
      type: 'number', value: st[key], ...attrs,
      onchange: (ev) => {
        const v = Number(ev.target.value);
        commit(key, Number.isFinite(v) ? v : st[key]);
      },
    })
  );

  /* 大会設定 */
  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('span', {}, '大会設定')),
    el('div', { class: 'card-body' },
      el('div', { class: 'field' },
        el('label', {}, '大会名'),
        el('input', { type: 'text', value: st.title, onchange: (ev) => commit('title', ev.target.value.trim() || st.title) })
      ),
      el('div', { class: 'grid-2' },
        numField('回戦数', 'roundCount', { min: '1', max: '20', step: '1' }),
        numField('チップ単価（円）', 'chipValue', { min: '0', step: '50' })
      )
    )
  ));

  /* 計算ルール */
  const umaInputs = el('div', { class: 'grid-4' },
    ...[0, 1, 2, 3].map(i => el('div', { class: 'field', style: 'margin:0' },
      el('label', {}, `${i + 1}位`),
      el('input', {
        type: 'number', step: '1', value: st.uma[i],
        onchange: (ev) => {
          const v = Number(ev.target.value);
          if (Number.isFinite(v)) { st.uma[i] = v; save(); renderAll(); }
        },
      })
    ))
  );

  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('span', {}, '計算ルール（馬・オカ）')),
    el('div', { class: 'card-body' },
      el('div', { class: 'section-title' }, 'ウマ（順位点）'),
      umaInputs,
      el('div', { class: 'section-title' }, '素点'),
      el('label', { class: 'field-inline', style: 'margin-bottom:8px' },
        el('input', {
          type: 'checkbox', checked: st.useRawScore, style: 'width:auto',
          onchange: (ev) => commit('useRawScore', ev.target.checked),
        }),
        el('span', {}, '素点をポイントに加算する（オフ＝順位点のみ）')
      ),
      el('label', { class: 'field-inline', style: 'margin-bottom:8px' },
        el('input', {
          type: 'checkbox', checked: st.useOka, disabled: !st.useRawScore, style: 'width:auto',
          onchange: (ev) => commit('useOka', ev.target.checked),
        }),
        el('span', {}, 'オカあり（1位が (返し点−配給原点)×4 を獲得）※既定はオフ')
      ),
      el('div', { class: 'grid-2' },
        numField('配給原点', 'startPoints', { step: '1000' }),
        numField('返し点', 'returnPoints', { step: '1000' })
      ),
      el('label', { class: 'field-inline', style: 'margin-bottom:8px' },
        el('input', {
          type: 'checkbox', checked: st.zeroSumAdjust, disabled: !st.useRawScore, style: 'width:auto',
          onchange: (ev) => commit('zeroSumAdjust', ev.target.checked),
        }),
        el('span', {}, '端数補正（丸め誤差を1位で吸収）')
      ),
      el('div', { class: 'field' },
        el('label', {}, '端数処理'),
        el('select', {
          onchange: (ev) => commit('rounding', ev.target.value),
        },
        el('option', { value: 'round', selected: st.rounding === 'round' }, '四捨五入'),
        el('option', { value: 'go', selected: st.rounding === 'go' }, '五捨六入'),
        el('option', { value: 'none', selected: st.rounding === 'none' }, '端数そのまま（小数第1位）')
        )
      ),
      renderFormulaPreview()
    )
  ));

  /* 賞金 */
  const prizeRows = el('div', {});
  st.prizes.forEach((amount, i) => {
    prizeRows.appendChild(el('div', { class: 'row', style: 'margin-bottom:6px' },
      el('span', { style: 'width:48px;font-size:13px;color:var(--muted)' }, `${i + 1}位`),
      el('input', {
        type: 'number', step: '1000', value: amount, class: 'grow',
        onchange: (ev) => { st.prizes[i] = Number(ev.target.value) || 0; save(); renderStandings(); },
      }),
      el('button', {
        class: 'btn small danger',
        onclick: () => { st.prizes.splice(i, 1); save(); renderAll(); },
      }, '削除')
    ));
  });

  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('span', {}, '賞金')),
    el('div', { class: 'card-body' },
      prizeRows,
      el('button', { class: 'btn small', onclick: () => { st.prizes.push(0); save(); renderAll(); } }, '+ 順位を追加')
    )
  ));

  /* データ */
  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('span', {}, 'データ')),
    el('div', { class: 'card-body' },
      el('p', { class: 'hint', style: 'margin-bottom:10px' }, '入力内容はこの端末のブラウザに自動保存されます。'),
      el('div', { class: 'row' },
        el('button', {
          class: 'btn small',
          onclick: () => downloadFile(JSON.stringify(state, null, 2), `${st.title}_データ.json`, 'application/json'),
        }, 'バックアップ書き出し'),
        el('button', { class: 'btn small', onclick: importJson }, '読み込み'),
        el('button', {
          class: 'btn small danger',
          onclick: () => {
            if (!confirm('すべての対局結果を消去して最初からやり直しますか？')) return;
            state.rounds = [];
            state.players.forEach(p => { p.chips = 0; });
            currentRound = 0;
            save();
            renderAll();
            toast('リセットしました');
          },
        }, '対局結果をリセット')
      )
    )
  ));
}

function renderFormulaPreview() {
  const st = state.settings;
  const demo = { id: '__demo__' };
  const sample = [42300, 28900, 21800, 7000];
  const table = { id: '__preview__', seats: [demo.id, demo.id, demo.id, demo.id], scores: sample, locked: false };
  const calc = computeTable(table);

  const rows = sample.map((score, i) => {
    const r = calc.results[i];
    return el('tr', {},
      el('td', { style: 'text-align:left' }, `${r.rank + 1}位`),
      el('td', { class: 'num' }, fmtScore(score)),
      el('td', { class: `num ${ptClass(r.base)}` }, st.useRawScore ? fmtPt(r.base) : '—'),
      el('td', { class: `num ${ptClass(r.uma)}` }, fmtPt(r.uma)),
      el('td', { class: `num ${ptClass(r.pt)}`, style: 'font-weight:700' }, fmtPt(r.pt))
    );
  }).sort((a, b) => a.firstChild.textContent.localeCompare(b.firstChild.textContent));

  const total = calc.results.reduce((a, r) => a + r.pt, 0);

  return el('div', { style: 'margin-top:12px' },
    el('div', { class: 'section-title' }, '計算例（プレビュー）'),
    el('table', { class: 'seat-table' },
      el('thead', {}, el('tr', {},
        el('th', { style: 'text-align:left' }, '着順'), el('th', {}, '点数'), el('th', {}, '素点pt'), el('th', {}, 'ウマ'), el('th', {}, '合計')
      )),
      el('tbody', {}, ...rows)
    ),
    el('p', { class: 'hint' },
      `4人の合計: ${fmtPt(total)}`,
      Math.abs(total) < 0.001
        ? '（ゼロサム）'
        : `（オカなしのため、1卓あたり合計 ${fmtPt(total)} になります）`)
  );
}

function importJson() {
  const input = el('input', { type: 'file', accept: 'application/json,.json' });
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || !Array.isArray(parsed.players)) throw new Error('形式が違います');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        state = load();
        currentRound = 0;
        renderAll();
        toast('読み込みました');
      } catch (err) {
        alert('読み込めませんでした: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

/* --------------------------------------------------------------------------
   App shell
   -------------------------------------------------------------------------- */

function switchView(view) {
  currentView = view;
  $$('#tabs .tab').forEach(btn => btn.classList.toggle('is-active', btn.dataset.view === view));
  $$('.view').forEach(sec => sec.classList.toggle('is-active', sec.id === `view-${view}`));
  window.scrollTo({ top: 0 });
}

function renderHeader() {
  $('#app-title').textContent = state.settings.title || '麻雀大会 スコア計算';
  const umaText = state.settings.uma.map(v => (v > 0 ? '+' : '') + v).join(' / ');
  const parts = [
    `全${state.settings.roundCount}回戦`,
    `${state.settings.startPoints / 1000}000点持ち ${state.settings.returnPoints / 1000}000点返し`,
    `ウマ ${umaText}`,
  ];
  $('#header-meta').textContent = parts.join(' ・ ');
}

function renderAll() {
  renderHeader();
  renderMatch();
  renderStandings();
  renderPlayers();
  renderSettings();
}

function init() {
  state = load();
  $$('#tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
