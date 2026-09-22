'use strict';

/* ==========================================================================
   麻雀の牌モデル・SVG描画・待ち計算
   用語集ページと聴牌トレーニングページから使う共通エンジン。
   外部ライブラリや画像ファイルには依存せず、牌はすべてSVGで描画する。
   ========================================================================== */

/* --------------------------------------------------------------------------
   牌のインデックス
     0- 8 : 一萬〜九萬
     9-17 : 一筒〜九筒
    18-26 : 一索〜九索
    27-33 : 東 南 西 北 白 發 中
   -------------------------------------------------------------------------- */

const TILE_COUNT = 34;
const HONOR_NAMES = ['東', '南', '西', '北', '白', '發', '中'];
const KANJI_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SUIT_KEYS = ['m', 'p', 's', 'z'];

/** 牌のインデックス → 表記（例: '3p'） */
function tileToCode(t) {
  if (t < 27) return String((t % 9) + 1) + SUIT_KEYS[Math.floor(t / 9)];
  return String(t - 27 + 1) + 'z';
}

/** 表記 → 牌のインデックス（例: '3p' → 11） */
function codeToTile(code) {
  const n = Number(code[0]);
  const s = SUIT_KEYS.indexOf(code[1]);
  if (!Number.isFinite(n) || s < 0) return -1;
  if (s === 3) return (n >= 1 && n <= 7) ? 27 + n - 1 : -1;
  return (n >= 1 && n <= 9) ? s * 9 + n - 1 : -1;
}

/** 読み上げ・ラベル用の名前（例: '三筒'） */
function tileName(t) {
  if (t >= 27) return HONOR_NAMES[t - 27];
  const n = (t % 9) + 1;
  const suit = ['萬', '筒', '索'][Math.floor(t / 9)];
  return KANJI_NUM[n - 1] + suit;
}

/**
 * '123m456p789s11z' 形式を牌インデックスの配列に変換する。
 * 不正な文字が含まれる場合は空配列を返す。
 */
function parseHand(notation) {
  const tiles = [];
  let digits = '';
  for (const ch of String(notation).replace(/\s/g, '')) {
    if (ch >= '0' && ch <= '9') {
      digits += ch;
    } else if (SUIT_KEYS.includes(ch)) {
      for (const d of digits) {
        const t = codeToTile(d + ch);
        if (t < 0) return [];
        tiles.push(t);
      }
      digits = '';
    } else {
      return [];
    }
  }
  return digits.length ? [] : tiles;
}

/** 牌インデックスの配列 → 各牌の枚数（長さ34） */
function toCounts(tiles) {
  const counts = new Array(TILE_COUNT).fill(0);
  for (const t of tiles) counts[t]++;
  return counts;
}

function sortTiles(tiles) {
  return [...tiles].sort((a, b) => a - b);
}

/* --------------------------------------------------------------------------
   和了形の判定
   -------------------------------------------------------------------------- */

/**
 * 面子（順子・刻子）だけで need 組ぶん取り切れるかを再帰で調べる。
 * counts は破壊的に使うが、呼び出し後は元に戻る。
 */
function canFormMelds(counts, need) {
  if (need === 0) return counts.every(c => c === 0);

  let i = 0;
  while (i < TILE_COUNT && counts[i] === 0) i++;
  if (i === TILE_COUNT) return false;

  // 刻子として取る
  if (counts[i] >= 3) {
    counts[i] -= 3;
    const ok = canFormMelds(counts, need - 1);
    counts[i] += 3;
    if (ok) return true;
  }

  // 順子として取る（字牌は不可。9を跨がないこと）
  if (i < 27 && (i % 9) <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
    counts[i]--; counts[i + 1]--; counts[i + 2]--;
    const ok = canFormMelds(counts, need - 1);
    counts[i]++; counts[i + 1]++; counts[i + 2]++;
    if (ok) return true;
  }

  return false;
}

/** 七対子（異なる7種が2枚ずつ） */
function isSevenPairs(counts) {
  let pairs = 0;
  for (const c of counts) {
    if (c === 0) continue;
    if (c !== 2) return false;
    pairs++;
  }
  return pairs === 7;
}

const TERMINALS_HONORS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/** 国士無双（么九牌13種すべて + いずれか1枚が対子） */
function isThirteenOrphans(counts) {
  let pair = 0;
  for (let t = 0; t < TILE_COUNT; t++) {
    const isYaochu = TERMINALS_HONORS.includes(t);
    if (!isYaochu && counts[t] > 0) return false;
    if (isYaochu) {
      if (counts[t] === 0) return false;
      if (counts[t] === 2) pair++;
      else if (counts[t] !== 1) return false;
    }
  }
  return pair === 1;
}

/** 14枚が和了形かどうか（門前の手のみを対象とする） */
function isWinningHand(counts) {
  const total = counts.reduce((a, c) => a + c, 0);
  if (total !== 14) return false;
  if (isSevenPairs(counts)) return true;
  if (isThirteenOrphans(counts)) return true;

  for (let p = 0; p < TILE_COUNT; p++) {
    if (counts[p] < 2) continue;
    counts[p] -= 2;
    const ok = canFormMelds(counts, 4);
    counts[p] += 2;
    if (ok) return true;
  }
  return false;
}

/**
 * 13枚の手牌に対する待ち（アガリ牌）を求める。
 * @returns {number[]} 牌インデックスの配列（昇順）。聴牌していなければ空配列。
 */
function findWaits(tiles) {
  if (tiles.length !== 13) return [];
  const counts = toCounts(tiles);
  if (counts.some(c => c > 4)) return [];

  const waits = [];
  for (let t = 0; t < TILE_COUNT; t++) {
    if (counts[t] >= 4) continue;   // 4枚使い切っている牌は待てない
    counts[t]++;
    if (isWinningHand(counts)) waits.push(t);
    counts[t]--;
  }
  return waits;
}

/** 13枚が聴牌しているか */
function isTenpai(tiles) {
  return findWaits(tiles).length > 0;
}

/* --------------------------------------------------------------------------
   牌のSVG描画
   -------------------------------------------------------------------------- */

const TILE_W = 36;
const TILE_H = 52;

// 筒子・索子の並べ方。各行に何個置くかを表す。3だけは斜めに並べる。
const PIP_ROWS = {
  1: [1], 2: [1, 1], 4: [2, 2], 5: [2, 1, 2],
  6: [2, 2, 2], 7: [3, 2, 2], 8: [2, 2, 2, 2], 9: [3, 3, 3],
};
const PIP_ROWS_SOU = { ...PIP_ROWS, 7: [1, 3, 3] };

/** 行ごとの個数指定から、各シンボルの中心座標を求める */
function pipPositions(rows, areaX, areaY, areaW, areaH) {
  const pts = [];
  const rowH = areaH / rows.length;
  rows.forEach((n, r) => {
    const cy = areaY + rowH * (r + 0.5);
    const colW = areaW / n;
    for (let c = 0; c < n; c++) {
      pts.push({ x: areaX + colW * (c + 0.5), y: cy, cols: n });
    }
  });
  return pts;
}

/** 3の斜め並び */
function diagonalPositions(areaX, areaY, areaW, areaH) {
  return [
    { x: areaX + areaW * 0.25, y: areaY + areaH * 0.2, cols: 3 },
    { x: areaX + areaW * 0.5, y: areaY + areaH * 0.5, cols: 3 },
    { x: areaX + areaW * 0.75, y: areaY + areaH * 0.8, cols: 3 },
  ];
}

function pinSymbol(x, y, r, isOne) {
  if (isOne) {
    return `<circle cx="${x}" cy="${y}" r="${r * 2.1}" fill="#fff" stroke="#1d4ed8" stroke-width="2"/>` +
           `<circle cx="${x}" cy="${y}" r="${r * 1.2}" fill="#c0392b"/>` +
           `<circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="#fff"/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#1d4ed8" stroke="#14306e" stroke-width="0.6"/>` +
         `<circle cx="${x}" cy="${y - r * 0.25}" r="${r * 0.34}" fill="#8fb4ff"/>`;
}

function souSymbol(x, y, w, h) {
  const half = h / 2;
  return `<rect x="${x - w / 2}" y="${y - half}" width="${w}" height="${h}" rx="${w / 2}" ` +
         `fill="#1f7a3d" stroke="#0f4a24" stroke-width="0.6"/>` +
         `<rect x="${x - w / 2}" y="${y - h * 0.1}" width="${w}" height="${h * 0.2}" fill="#0f4a24" opacity="0.65"/>`;
}

/**
 * 牌1枚のSVGを文字列で返す。
 * @param {number} t 牌インデックス
 * @param {object} [opt] { size: 拡大率, dim: 薄く表示, highlight: 強調 }
 */
function tileSvg(t, opt = {}) {
  const parts = [];
  const pad = 3.2;
  const ax = pad + 2.2, ay = pad + 3.4;
  const aw = TILE_W - (ax * 2), ah = TILE_H - (ay * 2);

  if (t >= 27) {
    // 字牌
    const name = HONOR_NAMES[t - 27];
    if (name === '白') {
      parts.push(`<rect x="${ax + 2}" y="${ay + 3}" width="${aw - 4}" height="${ah - 6}" rx="2" fill="none" stroke="#2b4a58" stroke-width="1.6"/>`);
    } else {
      const color = name === '中' ? '#c0392b' : name === '發' ? '#1f7a3d' : '#20303a';
      parts.push(`<text x="${TILE_W / 2}" y="${TILE_H / 2}" text-anchor="middle" dominant-baseline="central" ` +
        `font-size="25" font-weight="700" fill="${color}" ` +
        `font-family="'Hiragino Mincho ProN','Yu Mincho',serif">${name}</text>`);
    }
  } else {
    const suit = Math.floor(t / 9);
    const n = (t % 9) + 1;
    if (suit === 0) {
      // 萬子: 漢数字 + 萬
      parts.push(`<text x="${TILE_W / 2}" y="${TILE_H * 0.36}" text-anchor="middle" dominant-baseline="central" ` +
        `font-size="17" font-weight="700" fill="#20303a" ` +
        `font-family="'Hiragino Mincho ProN','Yu Mincho',serif">${KANJI_NUM[n - 1]}</text>`);
      parts.push(`<text x="${TILE_W / 2}" y="${TILE_H * 0.7}" text-anchor="middle" dominant-baseline="central" ` +
        `font-size="16" font-weight="700" fill="#c0392b" ` +
        `font-family="'Hiragino Mincho ProN','Yu Mincho',serif">萬</text>`);
    } else if (suit === 1) {
      // 筒子
      const pts = n === 3 ? diagonalPositions(ax, ay, aw, ah)
        : pipPositions(PIP_ROWS[n], ax, ay, aw, ah);
      const r = n === 1 ? 4 : (n >= 7 ? 3.1 : 4);
      pts.forEach(p => parts.push(pinSymbol(p.x, p.y, n === 1 ? 4 : r, n === 1)));
    } else {
      // 索子
      const pts = n === 3 ? diagonalPositions(ax, ay, aw, ah)
        : pipPositions(PIP_ROWS_SOU[n], ax, ay, aw, ah);
      pts.forEach(p => {
        const w = p.cols >= 3 ? 4.6 : 5.6;
        const h = n === 1 ? 20 : (PIP_ROWS_SOU[n] && PIP_ROWS_SOU[n].length >= 4 ? 8.2 : 10.5);
        parts.push(souSymbol(p.x, p.y, w, n === 3 ? 10.5 : h));
      });
    }
  }

  const cls = ['mj-tile'];
  if (opt.dim) cls.push('is-dim');
  if (opt.highlight) cls.push('is-highlight');

  return `<svg class="${cls.join(' ')}" viewBox="0 0 ${TILE_W} ${TILE_H}" ` +
    `role="img" aria-label="${tileName(t)}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="0.8" y="0.8" width="${TILE_W - 1.6}" height="${TILE_H - 1.6}" rx="4.5" ` +
    `fill="#fdfcf5" stroke="#b9bfae" stroke-width="1.2"/>` +
    `<rect x="2.2" y="2.2" width="${TILE_W - 4.4}" height="${TILE_H - 4.4}" rx="3.2" fill="none" stroke="#e8e6d6" stroke-width="0.8"/>` +
    parts.join('') +
    `</svg>`;
}

/** 手牌をまとめて描画する */
function handSvg(tiles, opt = {}) {
  const sorted = opt.keepOrder ? tiles : sortTiles(tiles);
  const marks = opt.highlight || [];
  return `<span class="mj-hand">` +
    sorted.map(t => tileSvg(t, { highlight: marks.includes(t) })).join('') +
    `</span>`;
}

/* --------------------------------------------------------------------------
   Node（テスト）からも読み込めるようにする
   -------------------------------------------------------------------------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TILE_COUNT, tileToCode, codeToTile, tileName, parseHand, toCounts, sortTiles,
    canFormMelds, isSevenPairs, isThirteenOrphans, isWinningHand, findWaits, isTenpai,
    tileSvg, handSvg,
  };
}
