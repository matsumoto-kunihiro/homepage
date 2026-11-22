// =============================================================
//  情報取り込みスクリプト
//  酒田市HP・マチイロ・まいぷれ酒田 から最新情報を集めて
//  data/data.json に保存します。
//  GitHub Actions が1日数回自動で実行します（手動実行: node scripts/update.mjs）
//  ※ Node.js 18 以上が必要（追加ライブラリは不要）
// =============================================================

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'data.json');

const UA = 'Mozilla/5.0 (compatible; SakataInfoBot/1.0; personal non-commercial site)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 共通ユーティリティ ----------

async function fetchText(url, { retries = 2 } = {}) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'ja' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i >= retries) throw new Error(`${url}: ${e.message}`);
      await sleep(2000 * (i + 1));
    }
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s = '') {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
function text(html = '') {
  return decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/[ \t　]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** 日本時間の「今日」 */
function todayJST() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

// ---------- ② 酒田市HP 新着情報 ----------

const CITY_BASE = 'https://www.city.sakata.lg.jp';
const CITY_CATEGORY = {
  kurashi: 'くらし',
  kosodate: '子育て・教育',
  kenko: '健康・福祉',
  jyutaku: '住まい・環境',
  bunka: '文化・スポーツ',
  sangyo: '産業・観光',
  shisei: '市政',
  bousai: '防災',
  event: 'イベント',
  category: '募集',
};

async function getCityNews() {
  const html = await fetchText(`${CITY_BASE}/allNewsList.html`);
  const block = html.match(/<ul class="info-list[^"]*">([\s\S]*?)<\/ul>/);
  if (!block) throw new Error('酒田市HP: 新着一覧が見つかりません（ページ構成が変わった可能性）');
  const items = [];
  const re = /<li>\s*<span class="date">(\d{4})年(\d{1,2})月(\d{1,2})日<\/span>\s*<span>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of block[1].matchAll(re)) {
    const url = new URL(decode(m[4]), CITY_BASE).href;
    const top = new URL(url).pathname.split('/')[1] || '';
    items.push({
      date: iso(m[1], m[2], m[3]),
      title: text(m[5]),
      url,
      category: CITY_CATEGORY[top] || 'お知らせ',
    });
    if (items.length >= 40) break;
  }
  if (!items.length) throw new Error('酒田市HP: 記事が0件でした');
  return items;
}

// ---------- ③-a マチイロ（私の街さかた）イベント ----------

const MACHIIRO_LP = 'https://machiiro.town/lp/yamagata_sakata';

async function getMachiiro(genreId, perPage = 20) {
  const url = `${MACHIIRO_LP}/rss_items?ms_genre_id=${genreId}&offset=0&per_page=${perPage}`;
  const json = JSON.parse(await fetchText(url));
  const items = [];
  const re = /<a class="lp-news-item[^"]*" href="([^"]+)"[\s\S]*?(?:<img src="[^"]*\/original\/([^"\/]+?)\.\w+"[\s\S]*?)?<span class="lp-news-item__date">(\d{4})\/(\d{1,2})\/(\d{1,2})[\s\S]*?<p class="lp-news-item__title">([\s\S]*?)<\/p>/g;
  for (const m of (json.html || '').matchAll(re)) {
    // サムネイル名 "05_福祉_その他" → "福祉"
    let genre = '';
    if (m[2]) {
      const parts = decode(decodeURIComponent(m[2])).split('_');
      genre = parts[1] || '';
    }
    items.push({
      date: iso(m[3], m[4], m[5]),
      title: text(m[6]),
      url: decode(m[1]),
      genre,
    });
  }
  return items;
}

// ---------- ③-b まいぷれ酒田 イベントカレンダー ----------

const MYPL_BASE = 'https://sakata.mypl.net';

function parseMyplCalendar(html, today, events) {
  const rowRe = /<tr[^>]*>\s*<th>\s*<p class="evnet_list_m">(\d{1,2})月<\/p>\s*<p class="evnet_list_date">(\d{1,2})<\/p>[\s\S]*?<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g;
  const liRe = /<li class="event_list_li">([\s\S]*?)<\/li>/g;
  for (const row of html.matchAll(rowRe)) {
    const mon = Number(row[1]);
    const day = Number(row[2]);
    // 年をまたぐ場合（12月に1月の予定を見る等）の補正
    const year = mon < today.m - 6 ? today.y + 1 : mon > today.m + 6 ? today.y - 1 : today.y;
    const date = iso(year, mon, day);
    for (const li of row[3].matchAll(liRe)) {
      const body = li[1];
      const cat = text((body.match(/<span class="select_index[^"]*">([\s\S]*?)<\/span>/) || [])[1]);
      const shop = text((body.match(/<span class="fontMS">([\s\S]*?)<\/span>/) || [])[1]).replace(/^「|」$/g, '');
      const a = body.match(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!a) continue;
      const url = new URL(decode(a[1]), MYPL_BASE).href;
      const ev = events.get(url) || { title: text(a[2]), url, category: cat, shop, dates: [] };
      if (!ev.dates.includes(date)) ev.dates.push(date);
      events.set(url, ev);
    }
  }
}

function parseMyplDetail(html) {
  const row = (label) => {
    const m = html.match(new RegExp(`<th[^>]*>${label}</th>\\s*<td>([\\s\\S]*?)</td>`));
    return m ? text(m[1]) : '';
  };
  return {
    dateText: row('開催日').replace(/\n/g, ' '),
    place: row('開催場所').split('\n')[0] || '',
    price: row('料金').split('\n')[0] || '',
  };
}

async function getMypl(prev = []) {
  const today = todayJST();
  const events = new Map();
  // 1ページ目＝本日から約10日分、2ページ目でさらに先まで
  for (const pg of [1, 2, 3]) {
    const url = pg === 1 ? `${MYPL_BASE}/event/` : `${MYPL_BASE}/event?pg=${pg}`;
    try {
      const html = await fetchText(url);
      const before = events.size;
      parseMyplCalendar(html, today, events);
      if (pg === 1 && events.size === 0) throw new Error('まいぷれ: イベントが見つかりません（ページ構成が変わった可能性）');
      if (events.size === before && pg > 1) break;
    } catch (e) {
      if (pg === 1) throw e;
      console.warn('  まいぷれ追加ページ取得失敗:', e.message);
      break;
    }
    await sleep(1500);
  }

  // 詳細ページ（開催場所・時間）は一般イベントのみ取得。前回取得分は再利用してアクセスを減らす
  const prevMap = new Map(prev.map((e) => [e.url, e]));
  const list = [...events.values()];
  for (const ev of list) {
    ev.dates.sort();
    ev.start = ev.dates[0];
    ev.end = ev.dates[ev.dates.length - 1];
    if (!/\/event\/\d+\/?$/.test(ev.url)) continue;
    const cached = prevMap.get(ev.url);
    if (cached && cached.place !== undefined && cached.dateText) {
      Object.assign(ev, { dateText: cached.dateText, place: cached.place, price: cached.price });
      continue;
    }
    try {
      Object.assign(ev, parseMyplDetail(await fetchText(ev.url, { retries: 1 })));
    } catch (e) {
      console.warn('  詳細取得失敗:', ev.title, e.message);
    }
    await sleep(1200);
  }
  for (const ev of list) {
    delete ev.dates; // 開始日・終了日だけ残す
    // 詳細ページの「開催日」から本当の会期を読み取る（カレンダーは約3週間分しか載らないため）
    const p = (ev.dateText || '').match(/(\d{4})年(\d{1,2})月(\d{1,2})日[^～〜~]*?[～〜~]\s*(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/);
    if (p) {
      ev.periodStart = iso(p[1], p[2], p[3]);
      ev.periodEnd = iso(p[4] || p[1], p[5], p[6]);
    } else {
      const s = (ev.dateText || '').match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (s) ev.periodStart = ev.periodEnd = iso(s[1], s[2], s[3]);
    }
    // 定期開催などで「開催日」欄とカレンダーの日付が食い違う場合は会期を使わない
    if (ev.periodStart && !(ev.periodStart <= ev.start && ev.periodEnd >= ev.end)) {
      delete ev.periodStart;
      delete ev.periodEnd;
    }
    if (ev.dateText && ev.dateText.length > 90) ev.dateText = ev.dateText.slice(0, 88) + '…';
  }
  list.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  return list;
}

// ---------- メイン ----------

async function main() {
  let prev = {};
  try {
    prev = JSON.parse(await readFile(OUT, 'utf8'));
  } catch {}

  const out = {
    updatedAt: new Date().toISOString(),
    sources: {},
    cityNews: prev.cityNews || [],
    machiiroEvents: prev.machiiroEvents || [],
    myplEvents: prev.myplEvents || [],
  };

  const jobs = [
    ['cityNews', '酒田市HP 新着情報', () => getCityNews()],
    ['machiiroEvents', 'マチイロ イベント', () => getMachiiro(1, 20)],
    ['myplEvents', 'まいぷれ酒田 イベント', () => getMypl(prev.myplEvents || [])],
  ];

  let okCount = 0;
  for (const [key, label, fn] of jobs) {
    process.stdout.write(`取得中: ${label} ... `);
    try {
      out[key] = await fn();
      out.sources[key] = { ok: true, at: out.updatedAt, count: out[key].length };
      okCount++;
      console.log(`${out[key].length}件`);
    } catch (e) {
      // 失敗しても前回のデータを残す（ページが空になるのを防ぐ）
      out.sources[key] = { ok: false, at: prev.sources?.[key]?.at || null, error: e.message };
      console.log(`失敗（前回データを維持）: ${e.message}`);
    }
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`保存しました: ${OUT}`);
  if (okCount === 0) process.exitCode = 1;
}

main();
