/* =============================================================
   松本くにひろ 公式ページ  動作プログラム
   ============================================================= */
(() => {
  'use strict';
  const C = window.SITE_CONFIG || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  // ---------- 日付（日本時間） ----------
  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  function jstToday() {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return p; // "2026-11-17"
  }
  const TODAY = jstToday();
  const parseYMD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const addDays = (s, n) => { const d = parseYMD(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const diffDays = (a, b) => Math.round((parseYMD(a) - parseYMD(b)) / 86400000);
  const wd = (s) => parseYMD(s).getUTCDay();
  const md = (s) => { const d = parseYMD(s); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
  const mdw = (s) => `${md(s)}(${WEEK[wd(s)]})`;

  // =============================================================
  //  基本情報（名前・写真・プロフィール）
  // =============================================================
  function applyConfig() {
    if (C.name) { $('#siteName').textContent = C.name; $('#aboutName').textContent = C.name; $('#copyName').textContent = C.name; }
    if (C.title) { $('#siteTitle').textContent = C.title; $('#aboutTitle').textContent = C.title; }
    $('#siteCatch').textContent = C.catchphrase || '';
    $('#siteTags').textContent = (C.keywords || []).length ? `「${C.keywords.join('　')}」\nをPRしていきます！` : '';
    $('#aboutKana').textContent = C.nameKana || '';
    $('#aboutText').textContent = C.profileText || '';
    const img = $('#heroImg');
    img.style.backgroundImage = `url("${C.heroImage || 'images/hero.svg'}")`;
    if (C.heroPosition) img.style.backgroundPosition = C.heroPosition;
    // スマホで文字を置く左側の背景色（写真の背景に合わせる）
    if (C.heroBackground) $('.hero').style.setProperty('--hero-bg', C.heroBackground);

    $('#aboutDl').innerHTML = (C.profile || []).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');

    // 略歴・現在・座右の銘
    const line = (l) => Array.isArray(l)
      ? `<li><span>${esc(l[0])}</span><em>${esc(l[1])}</em></li>`
      : `<li><span>${esc(l)}</span></li>`;
    const more = [];
    if ((C.career || []).length) {
      more.push(`<section class="pf"><h3 class="pf__h">略歴</h3>${C.career.map((g) =>
        `<div class="pf__group"><p class="pf__head">${esc(g.head)}</p>${(g.lines || []).length ? `<ul class="pf__list">${g.lines.map(line).join('')}</ul>` : ''}</div>`).join('')}</section>`);
    }
    if ((C.current || []).length) {
      more.push(`<section class="pf pf--now"><h3 class="pf__h">現在</h3><ul class="pf__list">${C.current.map(line).join('')}</ul></section>`);
    }
    if (C.motto && C.motto.text) {
      more.push(`<section class="pf motto"><h3 class="motto__h">座右の銘</h3><p class="motto__text">「${esc(C.motto.text)}」</p>${C.motto.sub ? `<p class="motto__sub">${esc(C.motto.sub)}</p>` : ''}</section>`);
    }
    $('#aboutMore').innerHTML = more.join('');

    const ct = C.contact || {};
    const rows = [];
    if (C.facebookPageUrl) rows.push(`<a href="${esc(C.facebookPageUrl)}" target="_blank" rel="noopener"><span>Facebook</span>活動報告を見る</a>`);
    if (ct.instagram) rows.push(`<a href="${esc(ct.instagram)}" target="_blank" rel="noopener"><span>Instagram</span>写真で見る活動</a>`);
    if (ct.tel) rows.push(`<a href="tel:${esc(ct.tel.replace(/[^\d+]/g, ''))}"><span>電話</span>${esc(ct.tel)}</a>`);
    if (ct.email) rows.push(`<a href="mailto:${esc(ct.email)}"><span>メール</span>${esc(ct.email)}</a>`);
    if (ct.office) rows.push(`<p><span>事務所</span>${esc(ct.office)}</p>`);
    $('#contactBox').innerHTML = rows.length ? `<div class="contact">${rows.join('')}</div>` : '';
  }

  // =============================================================
  //  タブ ＆ 左右スワイプ
  // =============================================================
  const panels = $('#panels');
  const tabs = $$('.tab');
  let current = -1;

  function setActive(i, { scroll = true, smooth = true } = {}) {
    i = Math.max(0, Math.min(tabs.length - 1, i));
    if (scroll) panels.scrollTo({ left: i * panels.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    if (i === current) return;
    current = i;
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
    const bar = $('#tabBar');
    if (!smooth) { bar.style.transition = 'none'; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = ''; })); }
    bar.style.transform = `translateX(${i * 100}%)`;
    store.set('tab', String(i));
    if (i === 0) ensureFacebook();
  }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => setActive(i));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        setActive(n); tabs[n].focus();
      }
    });
  });

  let scrollTimer;
  panels.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const i = Math.round(panels.scrollLeft / panels.clientWidth);
      setActive(i, { scroll: false });
    }, 60);
  }, { passive: true });

  window.addEventListener('resize', () => {
    panels.scrollTo({ left: current * panels.clientWidth, behavior: 'auto' });
  });

  // =============================================================
  //  ① 活動報告：Facebookページの埋め込み
  // =============================================================
  const FB_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21z"/></svg>';
  let fbWidth = 0;

  function ensureFacebook(force = false) {
    const box = $('#fbBox');
    const url = (C.facebookPageUrl || '').trim();
    if (!url) {
      if (box.dataset.state === 'setup') return;
      box.dataset.state = 'setup';
      box.innerHTML = `
        <div class="fb__setup">
          <h3>Facebookの活動報告がここに表示されます</h3>
          <p>設定ファイル <code>config.js</code> の <code>facebookPageUrl</code> に、議員用Facebookページの URL を入れてください。</p>
          <p>投稿すると、このページにも自動で最新の投稿が表示されます。</p>
        </div>`;
      return;
    }
    const frameBox = $('.fb__frame', box);
    const w = Math.max(180, Math.min(500, Math.floor(box.clientWidth)));
    if (!force && frameBox && Math.abs(w - fbWidth) < 20) return;
    if (!box.clientWidth) return; // 非表示中は後で
    fbWidth = w;
    if (!frameBox) {
      box.innerHTML = `
        <div class="fb__bar">
          <span>最新の活動をFacebookから<br><small>表示されない時はボタンからどうぞ</small></span>
          <a class="fb__btn" href="${esc(url)}" target="_blank" rel="noopener">${FB_ICON}Facebookで見る</a>
        </div>
        <div class="fb__frame"></div>`;
    }
    const fr = $('.fb__frame', box);
    const h = Math.max(300, Math.floor(fr.clientHeight || box.clientHeight - 50));
    const src = 'https://www.facebook.com/plugins/page.php?' + new URLSearchParams({
      href: url, tabs: 'timeline', width: String(w), height: String(h),
      small_header: 'true', adapt_container_width: 'true', hide_cover: 'true',
      show_facepile: 'false', locale: 'ja_JP',
    });
    fr.innerHTML = `<iframe title="Facebookの投稿" src="${esc(src)}" width="${w}" height="${h}" scrolling="no" allowfullscreen loading="lazy"
      allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>`;
  }
  let fbResize;
  window.addEventListener('resize', () => { clearTimeout(fbResize); fbResize = setTimeout(() => current === 0 && ensureFacebook(), 400); });

  // =============================================================
  //  データ読み込み（自動取り込み結果 data/data.json）
  // =============================================================
  let DATA = null;
  async function loadData() {
    try {
      const res = await fetch('data/data.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      DATA = await res.json();
    } catch (e) {
      console.error(e);
      DATA = { cityNews: [], machiiroEvents: [], myplEvents: [], sources: {}, failed: true };
    }
    renderNews();
    renderEvents();
    if (DATA.updatedAt) {
      const d = new Date(DATA.updatedAt);
      const f = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
      $('#updated').textContent = `情報の最終更新：${f}`;
    }
  }
  const staleNote = (key) => {
    const s = DATA.sources?.[key];
    if (DATA.failed) return '<p class="warn">情報を読み込めませんでした。時間をおいて再度お試しください。</p>';
    if (s && !s.ok) return '<p class="warn">最新情報の取り込みに失敗したため、前回取得した内容を表示しています。</p>';
    return '';
  };

  // =============================================================
  //  ② 酒田市のお知らせ
  // =============================================================
  let newsFilter = 'すべて';
  function renderNews() {
    // 期限（締切日・開催日）が過ぎたものは表示しない（取り込み後に日付が変わった場合のため）
    const items = (DATA.cityNews || []).filter((x) => !(x.deadline && x.deadline < TODAY));
    const cats = ['すべて', ...new Set(items.map((x) => x.category))];
    if (!cats.includes(newsFilter)) newsFilter = 'すべて';
    $('#newsChips').innerHTML = items.length > 0 ? cats.map((c) =>
      `<button class="chip${c === newsFilter ? ' is-on' : ''}" data-c="${esc(c)}" aria-pressed="${c === newsFilter}">${esc(c)}</button>`).join('') : '';
    const list = items.filter((x) => newsFilter === 'すべて' || x.category === newsFilter);
    $('#newsList').innerHTML = staleNote('cityNews') + (list.length ? list.map((x) => {
      const isNew = diffDays(TODAY, x.date) <= 2;
      return `<li><a class="item" href="${esc(x.url)}" target="_blank" rel="noopener">
        <span class="item__meta">${isNew ? '<span class="tag tag--new">NEW</span>' : ''}<time datetime="${x.date}">${mdw(x.date)}</time><span class="tag">${esc(x.category)}</span></span>
        <span class="item__title">${esc(x.title)}</span></a></li>`;
    }).join('') : '<li class="empty">お知らせはありません</li>');
  }
  $('#newsChips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    newsFilter = b.dataset.c; renderNews();
    $('#panel-news').scrollTo({ top: 0, behavior: 'smooth' });
  });

  // =============================================================
  //  ③ 酒田のイベント
  // =============================================================
  let evSrc = store.get('evSrc') === 'machiiro' ? 'machiiro' : 'mypl';

  function dateBadge(ev) {
    const start = ev.periodStart && ev.periodStart < ev.start ? ev.periodStart : ev.start;
    const end = ev.periodEnd || ev.end;
    if (start < TODAY || (start === TODAY && end > TODAY && start !== end)) {
      return `<span class="ev__date is-now"><span class="m">開催中</span><span class="d">〜${md(end)}</span></span>`;
    }
    const w = wd(ev.start);
    const cls = w === 6 ? ' is-sat' : w === 0 ? ' is-sun' : '';
    const d = parseYMD(ev.start);
    return `<span class="ev__date${cls}"><span class="m">${d.getUTCMonth() + 1}月</span><span class="d">${d.getUTCDate()}</span><span class="w">${WEEK[w]}</span></span>`;
  }

  function renderEvents() {
    $$('.seg__btn').forEach((b) => b.classList.toggle('is-on', b.dataset.src === evSrc));
    const box = $('#eventList');
    if (evSrc === 'machiiro') {
      const items = (DATA.machiiroEvents || []).filter((x) => !(x.deadline && x.deadline < TODAY));
      box.innerHTML = staleNote('machiiroEvents') + (items.length ? `<ul class="list">${items.map((x) => {
        const isNew = diffDays(TODAY, x.date) <= 3;
        return `<li><a class="item" href="${esc(x.url)}" target="_blank" rel="noopener">
          <span class="item__meta">${isNew ? '<span class="tag tag--new">NEW</span>' : ''}<time datetime="${x.date}">${mdw(x.date)} 掲載</time></span>
          <span class="item__title">${esc(x.title)}</span></a></li>`;
      }).join('')}</ul>` : '<p class="empty">情報はありません</p>') +
        '<p class="src">出典：<a href="https://machiiro.town/lp/yamagata_sakata" target="_blank" rel="noopener">マチイロ「私の街さかた」</a>（酒田市の発信情報）</p>';
      return;
    }

    // まいぷれ：今日・開催中／今週末／これから にまとめる
    const items = (DATA.myplEvents || []).filter((x) => (x.periodEnd || x.end) >= TODAY);
    const dow = wd(TODAY);
    const sat = addDays(TODAY, (6 - dow + 7) % 7);
    const sun = dow === 0 ? TODAY : addDays(sat, 1);
    const groups = [['今日・開催中', []], ['今週末', []], ['これから', []]];
    for (const ev of items) {
      if (ev.start <= TODAY) groups[0][1].push(ev);
      else if (ev.start >= sat && ev.start <= sun) groups[1][1].push(ev);
      else groups[2][1].push(ev);
    }
    const card = (ev) => {
      const sub = [ev.place && `📍${ev.place}`, ev.shop && !ev.place && `🏪${ev.shop}`, ev.price && `💴${ev.price}`].filter(Boolean).join('　');
      return `<li><a class="item ev" href="${esc(ev.url)}" target="_blank" rel="noopener">
        ${dateBadge(ev)}
        <span class="ev__body">
          <span class="item__meta"><span class="tag${ev.shop ? ' tag--shop' : ''}">${esc(ev.category || 'イベント')}</span></span>
          <span class="item__title">${esc(ev.title)}</span>
          ${sub ? `<span class="ev__sub">${esc(sub)}</span>` : ''}
        </span></a></li>`;
    };
    box.innerHTML = staleNote('myplEvents') + (items.length ? groups.filter(([, l]) => l.length).map(([h, l]) =>
      `<h3 class="ev-group">${h}${h === '今週末' ? `<small>${mdw(sat)}〜${mdw(sun)}</small>` : ''}</h3><ul class="list">${l.map(card).join('')}</ul>`).join('')
      : '<p class="empty">予定されているイベントはありません</p>') +
      '<p class="src">出典：<a href="https://sakata.mypl.net/event/" target="_blank" rel="noopener">まいぷれ［酒田］イベントカレンダー</a></p>';
  }
  $('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('.seg__btn'); if (!b) return;
    evSrc = b.dataset.src; store.set('evSrc', evSrc); renderEvents();
    $('#panel-event').scrollTo({ top: 0 });
  });

  // =============================================================
  //  ④ 酒田の天気（気象庁 ＋ Open-Meteo をその場で取得）
  // =============================================================
  const SAKATA = { lat: 38.9144, lon: 139.8365 };
  const JMA_URL = 'https://www.jma.go.jp/bosai/forecast/data/forecast/060000.json';
  const SHONAI = '060030';  // 庄内地方
  const SAKATA_AMEDAS = '35052'; // 酒田（気温・アメダス）
  const AMEDAS_BASE = 'https://www.jma.go.jp/bosai/amedas/data/';

  // 気象庁の天気文 → 絵文字
  function telopEmoji(t = '') {
    const words = [['雷', '⚡'], ['雪', '⛄'], ['雨', '☔'], ['くもり', '☁️'], ['曇', '☁️'], ['晴', '☀️']];
    const s = t.replace(/\s|　/g, '');
    const find = (str) => {
      let best = null;
      for (const [w, e] of words) { const i = str.indexOf(w); if (i >= 0 && (!best || i < best.i)) best = { i, e, w }; }
      return best;
    };
    const first = find(s);
    if (!first) return '🌤️';
    // 2つ目の天気（「晴れ 後 くもり」「くもり 朝晩 雨」など）
    let restStr = s.slice(first.i + first.w.length);
    let rest = find(restStr);
    while (rest && rest.e === first.e) { restStr = restStr.slice(rest.i + rest.w.length); rest = find(restStr); }
    if (!rest) return first.e;
    const conn = /^[^晴曇雨雪雷]*後/.test(s.slice(first.i + first.w.length)) ? '→' : '|';
    return `${first.e}<small>${conn}</small>${rest.e}`;
  }
  // 気象庁の天気コード（週間予報） → 絵文字
  function jmaCodeEmoji(code) {
    const s = String(code); const a = s[0]; const n = Number(s.slice(1));
    const MAIN = { 1: '☀️', 2: '☁️', 3: '☔', 4: '⛄' }[a] || '🌤️';
    let sec = '';
    if (a === '1' || a === '2') {
      const SNOW = [4, 5, 15, 16, 17, 24, 29, 30, 31, 50, 60, 70, 81];
      const MIX = [6, 7, 8, 18, 19];
      if (n === 0) sec = '';
      else if ([1, 10, 11].includes(n)) sec = a === '1' ? '☁️' : '☀️';
      else if (n === 9) sec = '🌫️';
      else if (SNOW.includes(n)) sec = '⛄';
      else if (MIX.includes(n)) sec = '🌨️';
      else sec = '☔';
    } else if (a === '3' || a === '4') {
      if ([1, 11].includes(n)) sec = '☀️';
      else if ([2, 13].includes(n)) sec = '☁️';
      else if (n && ![5, 6, 7, 8].includes(n)) sec = a === '3' ? '⛄' : '☔';
    }
    return sec ? `${MAIN}<small>|</small>${sec}` : MAIN;
  }
  // WMO 天気コード → 絵文字・言葉
  function wmo(code) {
    if (code === 0) return ['☀️', '晴れ'];
    if (code <= 2) return ['🌤️', '晴れ時々くもり'];
    if (code === 3) return ['☁️', 'くもり'];
    if (code <= 48) return ['🌫️', '霧'];
    if (code <= 57) return ['🌦️', '霧雨'];
    if (code <= 67) return ['☔', '雨'];
    if (code <= 77) return ['⛄', '雪'];
    if (code <= 82) return ['🌧️', 'にわか雨'];
    if (code <= 86) return ['🌨️', 'にわか雪'];
    return ['⛈️', '雷雨'];
  }

  async function loadWeather() {
    const box = $('#weatherBox');
    const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${SAKATA.lat}&longitude=${SAKATA.lon}` +
      '&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,wind_direction_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&timezone=Asia%2FTokyo&forecast_days=7&wind_speed_unit=ms';
    const getJSON = (u, ms = 8000) => fetch(u, { signal: AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status));
    const amedas = (async () => {
      const t = (await fetch(AMEDAS_BASE + 'latest_time.txt').then((r) => r.ok ? r.text() : Promise.reject(r.status))).trim();
      const d = new Date(t);
      const key = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        .format(d).replace(/\D/g, '') + '00';
      const map = await getJSON(`${AMEDAS_BASE}map/${key}.json`);
      return { time: d, obs: map[SAKATA_AMEDAS] };
    })();
    const [jma, om, am] = await Promise.allSettled([getJSON(JMA_URL), getJSON(omUrl, 6000), amedas]);
    let html = '';

    // --- いまの天気（気象庁アメダス酒田の観測値。使えない時は Open-Meteo） ---
    const DIR16 = ['静穏', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西', '北'];
    let todayTelop = '';
    try { todayTelop = jma.value[0].timeSeries[0].areas.find((a) => a.area.code === SHONAI).weathers[0]; } catch {}
    const v = (x) => (Array.isArray(x) && x[1] === 0 ? x[0] : null); // 品質フラグ0のみ採用
    if (am.status === 'fulfilled' && am.value.obs && v(am.value.obs.temp) !== null) {
      const o = am.value.obs;
      const temp = v(o.temp); const hum = v(o.humidity); const wind = v(o.wind); const dir = v(o.windDirection); const rain = v(o.precipitation1h);
      const hm = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: 'numeric', minute: '2-digit' }).format(am.value.time);
      const ic = rain > 0 ? (temp <= 1 ? '⛄' : '☔') : (todayTelop ? telopEmoji(todayTelop.split(/後|時々|一時/)[0]) : '🌡️');
      $('#tabTemp').textContent = `${Math.round(temp)}°`;
      const parts = [hum !== null && `湿度${hum}%`, wind !== null && `${dir ? DIR16[dir] + 'の風 ' : ''}${wind.toFixed(1)}m/s`, rain > 0 && `1時間雨量 ${rain}mm`].filter(Boolean);
      html += `<div class="wx-now">
        <div class="wx-now__icon" aria-hidden="true">${ic}</div>
        <div><div class="wx-now__t">${temp.toFixed(1)}<small>℃</small></div>
        <div class="wx-now__d">${parts.join('・')}</div></div>
        <div class="wx-now__place">酒田<br>${hm} 観測</div>
      </div>`;
    } else if (om.status === 'fulfilled' && om.value.current) {
      const c = om.value.current;
      const [ic, label] = wmo(c.weather_code);
      const dirs = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
      const dir = dirs[Math.round(c.wind_direction_10m / 45) % 8];
      $('#tabTemp').textContent = `${Math.round(c.temperature_2m)}°`;
      html += `<div class="wx-now">
        <div class="wx-now__icon" aria-hidden="true">${ic}</div>
        <div><div class="wx-now__t">${c.temperature_2m.toFixed(1)}<small>℃</small></div>
        <div class="wx-now__d">${label}・湿度${c.relative_humidity_2m}%・${dir}の風 ${c.wind_speed_10m.toFixed(1)}m/s</div></div>
        <div class="wx-now__place">酒田市<br>いまの天気</div>
      </div>`;
    }

    // --- 今日・明日（気象庁） ---
    if (jma.status === 'fulfilled') {
      try {
        const ts = jma.value[0].timeSeries;
        const wArea = ts[0].areas.find((a) => a.area.code === SHONAI);
        const pArea = ts[1].areas.find((a) => a.area.code === SHONAI);
        const tArea = ts[2].areas.find((a) => a.area.code === SAKATA_AMEDAS);
        const dayKey = (s) => s.slice(0, 10);
        const temps = {};
        ts[2].timeDefines.forEach((t, i) => {
          const d = dayKey(t); const h = t.slice(11, 13);
          temps[d] = temps[d] || {};
          if (h === '00') temps[d].min = tArea.temps[i]; else temps[d].max = tArea.temps[i];
        });
        const nowH = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
        const days = ts[0].timeDefines.slice(0, 2).map((t, i) => {
          const d = dayKey(t);
          const tp = temps[d] || {};
          // 当日分の「最低気温」は朝の発表後は意味がないので表示しない
          const showMin = tp.min !== undefined && !(d === TODAY && tp.min === tp.max);
          const pops = ts[1].timeDefines.map((pt, k) => ({ d: dayKey(pt), h: Number(pt.slice(11, 13)), v: pArea.pops[k] })).filter((p) => p.d === d);
          const popHtml = [0, 6, 12, 18].map((h) => {
            const p = pops.find((x) => x.h === h);
            const past = d === TODAY && h + 6 <= nowH;
            return `<span class="${past || !p ? 'is-past' : ''}">${h}時〜<b>${p ? p.v + '%' : '－'}</b></span>`;
          }).join('');
          const label = d === TODAY ? '今日' : i === 1 || d === addDays(TODAY, 1) ? '明日' : '';
          return `<div class="wx-day">
            <div class="wx-day__h">${label} ${mdw(d)}</div>
            <div class="wx-day__icon" aria-hidden="true">${telopEmoji(wArea.weathers[i])}</div>
            <div class="wx-day__txt">${esc(wArea.weathers[i].replace(/　/g, ' '))}</div>
            <div class="wx-day__temp">${tp.max !== undefined && tp.max !== '' ? `<span class="hi">${tp.max}℃</span>` : ''}${showMin ? `<span class="lo">${tp.min}℃</span>` : ''}</div>
            <div class="wx-pops" aria-label="降水確率">${popHtml}</div>
          </div>`;
        });
        html += `<p class="wx-h">庄内地方の予報（気象庁 ${new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: 'numeric', minute: '2-digit' }).format(new Date(jma.value[0].reportDatetime))} 発表）</p>
          <div class="wx-days">${days.join('')}</div>`;
      } catch (e) { console.error(e); }
    }

    // --- 週間予報（天気・降水確率＝気象庁。気温は酒田の予測値が取れればそれを使う） ---
    let weekNote = '';
    try {
      const wk = jma.value[1].timeSeries;
      const area = wk[0].areas[0];
      const tArea = wk[1].areas[0];
      const omDaily = om.status === 'fulfilled' && om.value.daily ? om.value.daily : null;
      const cols = wk[0].timeDefines.map((t, i) => {
        const day = t.slice(0, 10);
        let hi = tArea.tempsMax[i]; let lo = tArea.tempsMin[i];
        const k = omDaily ? omDaily.time.indexOf(day) : -1;
        if (k >= 0) { hi = Math.round(omDaily.temperature_2m_max[k]); lo = Math.round(omDaily.temperature_2m_min[k]); }
        const w = wd(day);
        const cls = w === 6 ? 'sat' : w === 0 ? 'sun' : '';
        return `<div><span class="${cls}">${md(day)}<br>(${WEEK[w]})</span>
          <div class="ic" aria-hidden="true">${jmaCodeEmoji(area.weatherCodes[i])}</div>
          <span class="hi">${hi !== '' && hi != null ? hi + '°' : '－'}</span><br>
          <span class="lo">${lo !== '' && lo != null ? lo + '°' : '－'}</span><br>
          <span class="p">${area.pops[i] ? area.pops[i] + '%' : '－'}</span></div>`;
      });
      weekNote = omDaily ? '気温は酒田市の予測値（Open-Meteo）' : `気温は${esc(tArea.area.name)}の予想`;
      html += `<p class="wx-h">週間予報（山形県）</p><div class="wx-week">${cols.join('')}</div>
        <p class="src" style="margin-top:6px">${weekNote}・下段は降水確率</p>`;
    } catch (e) { console.error(e); }

    if (!html) html = '<p class="warn">天気情報を読み込めませんでした。下のリンクからご確認ください。</p>';
    html += `<div class="wx-links">
      <a href="https://www.jma.go.jp/bosai/warning/#area_type=class20s&area_code=0620400" target="_blank" rel="noopener">⚠️ 警報・注意報</a>
      <a href="https://www.jma.go.jp/bosai/nowc/#zoom:11/lat:38.914/lon:139.836/colordepth:normal/elements:hrpns" target="_blank" rel="noopener">☔ 雨雲レーダー</a>
    </div>
    <p class="src">出典：気象庁（予報・アメダス）${om.status === 'fulfilled' ? '、Open-Meteo' : ''}</p>`;
    box.innerHTML = html;
  }

  // =============================================================
  //  起動
  // =============================================================
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  applyConfig();
  const saved = Number(store.get('tab'));
  const first = Number.isInteger(saved) && saved >= 0 && saved < 4 ? saved : 0;
  requestAnimationFrame(() => setActive(first, { smooth: false }));
  loadData();
  loadWeather();
  // 開きっぱなしでも30分ごとに天気を更新
  setInterval(loadWeather, 30 * 60 * 1000);
})();
