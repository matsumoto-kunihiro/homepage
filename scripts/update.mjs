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

// ---------- 期限（締切日・開催日）の読み取り ----------
//  タイトルや記事本文から「〇月〇日まで」「〇月〇日～〇月〇日」「日時 〇月〇日」などを探し、
//  いちばん遅い日付を「期限」とする。見つからなければ期限なし（＝表示し続ける）。

const todayISO = () => { const t = todayJST(); return iso(t.y, t.m, t.d); };
const addDaysISO = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// 日付1つ（令和/西暦の年は省略可）
const D = String.raw`(?:(令和|R)\s*(\d{1,2}|元)\s*年|(\d{4})\s*年)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日`;
const DOW = String.raw`(?:\s*[（(][^）)]{1,6}[）)])?`;

function toISO(m, base, off = 0) {
  // m = 正規表現の一致、off = D の最初のグループ位置
  const era = m[off + 1], ey = m[off + 2], yy = m[off + 3];
  const mon = Number(m[off + 4]), day = Number(m[off + 5]);
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  let y;
  if (era) y = 2018 + (ey === '元' ? 1 : Number(ey));
  else if (yy) y = Number(yy);
  else {
    // 年が書かれていない → 掲載日（base）に近い年と考える
    y = Number(base.slice(0, 4));
    const cand = iso(y, mon, day);
    if (cand < addDaysISO(base, -120)) y += 1;
    else if (cand > addDaysISO(base, 300)) y -= 1;
  }
  return iso(y, mon, day);
}

// strict=true（市のお知らせの本文用）：見出し付きの日付と「〇日まで」だけを使う。
//   「4月1日～9月30日に申請した方は…」のような説明文の期間で、続いている事業を消さないため。
function findDeadline(str, base, strict = false) {
  if (!str) return null;
  const found = [];
  const push = (v) => { if (v) found.push(v); };
  // ① 「〇月〇日まで」「〇月〇日（金）午後5時まで」「〇月〇日締切」
  for (const m of str.matchAll(new RegExp(D + DOW + String.raw`[^。\n月]{0,16}?(?:まで|迄|締め?切|〆切|必着)`, 'g'))) push(toISO(m, base));
  if (!strict) {
    // ② 「〇月〇日～〇月〇日」「〇月〇日から〇月〇日」→ 後ろの日付
    for (const m of str.matchAll(new RegExp(D + DOW + String.raw`[^。\n]{0,14}?(?:[～〜~－ー-]|から)\s*` + D, 'g'))) push(toISO(m, base, 5));
    // ③ 「〇月〇日から〇日」（月の省略）
    for (const m of str.matchAll(new RegExp(D + DOW + String.raw`\s*(?:[～〜~]|から)\s*(\d{1,2})\s*日`, 'g'))) {
      const s = toISO(m, base);
      if (s) push(s.slice(0, 8) + pad(Number(m[6])));
    }
  }
  // ④ 「日時」「開催日」「申込期間」「締切」などの見出しの後ろの日付
  for (const m of str.matchAll(/(?:日時|開催日時?|期日|日程|期間|会期|締め?切り?|〆切|期限)\s*[:：]?\s*([^\n]{0,60})/g)) {
    for (const d of m[1].matchAll(new RegExp(D, 'g'))) {
      // 「〇月〇日から当面の間」のような“始まりの日”は期限にしない
      const after = m[1].slice(d.index + d[0].length, d.index + d[0].length + 18);
      if (/^[^。\n]*?(から|以降|より)/.test(after) && !new RegExp(D).test(after)) continue;
      push(toISO(d, base));
    }
  }
  // ⑤ 「〇月〇日に開催」「〇月〇日開催」
  for (const m of str.matchAll(new RegExp(D + DOW + String.raw`\s*(?:に)?(?:開催|実施|行い)`, 'g'))) push(toISO(m, base));
  return found.length ? found.sort().at(-1) : null;
}

/** 記事ページの本文（更新日の後ろ〜お問い合わせの前）を取り出す */
function pageBody(html) {
  let t = text(html.replace(/<(script|style|nav|header|footer)[\s\S]*?<\/\1>/gi, ''));
  const s = t.search(/更新日[:：]?\s*\d{4}年/);
  if (s >= 0) t = t.slice(s);
  // 本文の終わり（ここから先はサイト共通の案内や開庁時間「12月29日～1月3日を除く」などなので読まない）
  const e = t.search(/おすすめ情報|PDF形式のファイルを開くには|\nお問い合わせ\n|このページに関するお問い合わせ|このページの情報は役に立ちましたか|このページの先頭へ|開庁時間/);
  if (e > 0) t = t.slice(0, e);
  return t.slice(0, 4000);
}

/**
 * 各記事に deadline（期限）を付ける。記事ページは前回の結果を再利用し、新しい記事だけ見に行く。
 * cache: url → { date, deadline }
 */
async function attachDeadlines(items, cache, { strict = false } = {}) {
  for (const it of items) {
    const c = cache.get(it.url);
    if (c && c.date === it.date && 'deadline' in c) { it.deadline = c.deadline; continue; }
    let dl = findDeadline(it.title, it.date);
    if (/^https:\/\/www\.city\.sakata\.lg\.jp\//.test(it.url)) {
      try {
        const body = pageBody(await fetchText(it.url, { retries: 1 }));
        const d2 = findDeadline(body, it.date, strict);
        if (d2 && (!dl || d2 > dl)) dl = d2;
      } catch (e) {
        console.warn('  記事ページ取得失敗:', it.title, e.message);
      }
      await sleep(1000);
    }
    it.deadline = dl;
    cache.set(it.url, { date: it.date, deadline: dl });
  }
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
    if (items.length >= 50) break;   // 期限切れを外したあと 40件前後になるよう少し多めに
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

  // 期限の読み取り結果を前回分から再利用（記事ページへのアクセスを減らす）
  const cacheOf = (list) => new Map((list || []).filter((it) => 'deadline' in it).map((it) => [it.url, { date: it.date, deadline: it.deadline }]));
  const cityCache = cacheOf(prev.cityNews);
  const machiiroCache = cacheOf(prev.machiiroEvents);
  const today = todayISO();
  const REPORT = /(開催|実施)(しました|されました)|行いました|終了しました|が開催されました/;

  const jobs = [
    ['cityNews', '酒田市HP 新着情報', async () => {
      const items = await getCityNews();
      await attachDeadlines(items, cityCache, { strict: true });
      // 期限（締切日・開催日）が過ぎたものは載せない
      const keep = items.filter((x) => !(x.deadline && x.deadline < today));
      items.filter((x) => !keep.includes(x)).forEach((x) => console.log(`\n  期限切れで除外: [${x.deadline}] ${x.title}`));
      return keep.slice(0, 40);
    }],
    ['machiiroEvents', 'マチイロ イベント', async () => {
      const items = await getMachiiro(1, 20);
      await attachDeadlines(items, machiiroCache);
      const keep = items.filter((x) => {
        if (REPORT.test(x.title)) return false;           // 「開催しました」等の報告 → 外す
        if (x.deadline) return x.deadline >= today;      // 開催日・締切が過ぎたもの → 外す
        return x.date >= addDaysISO(today, -60);          // 日付が読めない古い記事（60日超） → 外す
      });
      items.filter((x) => !keep.includes(x)).forEach((x) => console.log(`\n  終了済みで除外: [${x.deadline || x.date}] ${x.title}`));
      return keep;
    }],
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
