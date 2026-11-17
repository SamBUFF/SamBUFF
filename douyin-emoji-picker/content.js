/**
 * 抖音表情包下载器 - 内容脚本
 *
 * 关键点：抖音表情图的地址带 x-signature 会话签名，脱离页面直接请求会 403。
 * 所以这里一律用「页面内 fetch → 本地打包 → 触发保存」，
 * 只有在整批都失败时才回退到 background 的浏览器下载。
 */
(() => {
  'use strict';
  if (window.__dyEmojiPicker) return;
  window.__dyEmojiPicker = true;

  const IS_TOP = window.top === window;
  const HINT = /emoticon|emotion|sticker|emoji|expression/i;
  const SKIP = /avatar|user_?avatar|profile|cover/i;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------- 工具

  function isEmojiUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (!/^https?:\/\//i.test(url)) return false;
    if (SKIP.test(url)) return false;
    return HINT.test(url);
  }

  function pickName(img) {
    let raw = img.alt || img.title || '';
    if (!raw) {
      const box = img.closest('[title]');
      if (box) raw = box.getAttribute('title') || '';
    }
    return String(raw)
      .replace(/^\[|\]$/g, '')
      .replace(/[\\/:*?"<>|\s]/g, '')
      .slice(0, 12);
  }

  function scanInto(map) {
    let added = 0;
    document.querySelectorAll('img').forEach((img) => {
      const url = img.currentSrc || img.src;
      if (!isEmojiUrl(url)) return;
      const key = url.split('?')[0];
      if (map.has(key)) return;
      map.set(key, { key, url, name: pickName(img) });
      added++;
    });
    // 少数面板用 CSS 背景图渲染表情
    document.querySelectorAll('[style*="background-image"]').forEach((el) => {
      const m = /url\(["']?(https?:[^"')]+)/.exec(el.style.backgroundImage || '');
      if (!m) return;
      const url = m[1];
      if (!isEmojiUrl(url)) return;
      const key = url.split('?')[0];
      if (map.has(key)) return;
      map.set(key, { key, url, name: pickName(el) });
      added++;
    });
    return added;
  }

  const MIME_EXT = {
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/avif': 'avif',
  };

  function extOf(type, url) {
    if (MIME_EXT[type]) return MIME_EXT[type];
    const m = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(url || '');
    return m ? m[1].toLowerCase() : 'webp';
  }

  function fileName(index, name, ext) {
    return `${String(index).padStart(3, '0')}${name ? '_' + name : ''}.${ext}`;
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function pool(list, limit, fn) {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (cursor < list.length) {
        const i = cursor++;
        await fn(list[i], i);
      }
    });
    await Promise.all(workers);
  }

  // ------------------------------------------------- 子框架：只回报，不渲染

  if (!IS_TOP) {
    window.addEventListener('message', (e) => {
      const data = e.data;
      if (!data || data.__dyEmoji !== 'collect') return;
      const map = new Map();
      scanInto(map);
      e.source.postMessage(
        {
          __dyEmoji: 'collected',
          id: data.id,
          items: [...map.values()].map(({ key, url, name }) => ({ key, url, name })),
        },
        '*'
      );
    });
    return;
  }

  function collectFrames() {
    const frames = [...document.querySelectorAll('iframe')];
    if (!frames.length) return Promise.resolve([]);
    return Promise.all(
      frames.map(
        (f) =>
          new Promise((resolve) => {
            const id = Math.random().toString(36).slice(2);
            const onMsg = (e) => {
              const d = e.data;
              if (!d || d.__dyEmoji !== 'collected' || d.id !== id) return;
              window.removeEventListener('message', onMsg);
              resolve(d.items || []);
            };
            window.addEventListener('message', onMsg);
            try {
              f.contentWindow.postMessage({ __dyEmoji: 'collect', id }, '*');
            } catch (err) {
              /* 跨域框架直接忽略 */
            }
            setTimeout(() => {
              window.removeEventListener('message', onMsg);
              resolve([]);
            }, 400);
          })
      )
    ).then((all) => all.flat());
  }

  // ---------------------------------------------------------------- 状态

  const state = {
    items: new Map(),
    selected: new Set(),
    busy: false,
    autoing: false,
  };

  // ---------------------------------------------------------------- 样式

  const CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.wrap {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
  display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  color: #1b1d21; text-align: left; pointer-events: none;
}
.wrap > * { pointer-events: auto; }
button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; }

.fab {
  width: 46px; height: 46px; border-radius: 15px; background: #fff;
  border: 1px solid rgba(0,0,0,.09); box-shadow: 0 6px 22px rgba(0,0,0,.13);
  display: grid; place-items: center; touch-action: none;
  transition: transform .16s ease, box-shadow .16s ease, background .16s ease;
}
.fab:hover { transform: translateY(-1px); box-shadow: 0 9px 26px rgba(0,0,0,.17); }
.fab.on { box-shadow: 0 0 0 1.5px #16181c, 0 9px 26px rgba(0,0,0,.22); }
.fab svg { width: 24px; height: 24px; stroke: #16181c; fill: none; stroke-width: 1.7; }

.panel {
  width: 392px; max-width: calc(100vw - 32px); background: #fff;
  border: 1px solid rgba(0,0,0,.09); border-radius: 16px;
  box-shadow: 0 20px 54px rgba(0,0,0,.19); overflow: hidden;
  display: flex; flex-direction: column; max-height: min(74vh, 640px);
  position: relative;
}
.panel[hidden] { display: none; }

.hd { display: flex; align-items: center; gap: 8px; padding: 13px 14px 11px; }
.logo { width: 18px; height: 18px; stroke: #16181c; fill: none; stroke-width: 1.6; flex: none; }
.ttl { font-size: 13.5px; font-weight: 600; letter-spacing: .01em; }
.pill {
  font-size: 11.5px; color: #6b6f76; background: #f2f3f5; border-radius: 999px;
  padding: 1px 8px; margin-left: 2px;
}
.pill b { color: #16181c; font-weight: 600; }
.x { margin-left: auto; width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; }
.x:hover { background: #f2f3f5; }
.x svg { width: 14px; height: 14px; stroke: #6b6f76; stroke-width: 1.8; fill: none; }

.bar { display: flex; align-items: center; gap: 6px; padding: 0 14px 11px; }
.btn {
  height: 28px; padding: 0 11px; border-radius: 8px; background: #f4f5f7;
  border: 1px solid transparent; font-size: 12px; color: #2b2f36;
  transition: background .14s ease, border-color .14s ease;
}
.btn:hover { background: #ebedf0; }
.btn:disabled { opacity: .45; cursor: default; }
.btn.busy { background: #16181c; color: #fff; }

.switch { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 12px; color: #4a4f57; cursor: pointer; user-select: none; }
.switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.switch i {
  width: 28px; height: 16px; border-radius: 999px; background: #d8dbe0;
  position: relative; transition: background .16s ease;
}
.switch i::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px;
  border-radius: 50%; background: #fff; transition: transform .16s ease;
  box-shadow: 0 1px 2px rgba(0,0,0,.2);
}
.switch input:checked + i { background: #16181c; }
.switch input:checked + i::after { transform: translateX(12px); }

.grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; align-items: start;
  padding: 2px 14px 14px; overflow-y: auto; overscroll-behavior: contain;
}
.grid::-webkit-scrollbar { width: 8px; }
.grid::-webkit-scrollbar-thumb { background: #dcdfe4; border-radius: 8px; }

.tile {
  position: relative; border-radius: 10px; padding-top: 100%;
  border: 1px solid #e8eaee; background: #fafbfc;
  cursor: pointer; overflow: hidden;
  transition: border-color .13s ease, background .13s ease, transform .13s ease;
}
.tile:hover { transform: translateY(-1px); border-color: #cfd3d9; }
.tile img {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: contain; padding: 7px;
}
.tile.err::before {
  content: "无法预览"; position: absolute; left: 0; right: 0; top: 50%;
  transform: translateY(-50%); text-align: center; font-size: 10px; color: #a3a8b0;
}
.tile.sel { border-color: #16181c; background: #f1f2f4; box-shadow: inset 0 0 0 1px #16181c; }
.cb {
  position: absolute; left: 5px; top: 5px; width: 17px; height: 17px;
  border-radius: 50%; background: #fff; border: 1.5px solid #c6cad1;
  display: grid; place-items: center; transition: background .13s ease, border-color .13s ease;
}
.cb svg { width: 10px; height: 10px; fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; opacity: 0; }
.tile.sel .cb { background: #16181c; border-color: #16181c; }
.tile.sel .cb svg { opacity: 1; }

.empty { padding: 26px 30px 34px; text-align: center; color: #8b9098; font-size: 12.5px; }
.empty[hidden] { display: none; }
.empty b { color: #3c4148; font-weight: 600; }
.empty p { margin: 0; }

.ft { display: flex; align-items: center; gap: 4px; padding: 10px 14px 12px; border-top: 1px solid #f0f1f3; }
.lnk { font-size: 12px; color: #5a6069; padding: 4px 6px; border-radius: 6px; }
.lnk:hover { background: #f2f3f5; color: #16181c; }
.ft .sp { flex: 1; }
.cta {
  height: 32px; padding: 0 15px; border-radius: 9px; background: #16181c; color: #fff;
  font-size: 12.5px; font-weight: 500; transition: opacity .14s ease, transform .14s ease;
}
.cta:hover:not(:disabled) { transform: translateY(-1px); }
.cta:disabled { background: #e4e6ea; color: #9aa0a8; cursor: default; }

.bar-progress { height: 2px; background: transparent; }
.bar-progress i { display: block; height: 100%; width: 0; background: #16181c; transition: width .2s ease; }

.toast {
  position: absolute; left: 50%; bottom: 58px; transform: translate(-50%, 8px);
  background: rgba(22,24,28,.94); color: #fff; font-size: 12px;
  padding: 7px 13px; border-radius: 9px; opacity: 0; pointer-events: none;
  transition: opacity .18s ease, transform .18s ease; max-width: 86%;
  text-align: center; line-height: 1.45; box-shadow: 0 8px 22px rgba(0,0,0,.24);
}
.toast.on { opacity: 1; transform: translate(-50%, 0); }
`;

  // ---------------------------------------------------------------- UI

  const host = document.createElement('div');
  host.id = 'dy-emoji-picker';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
<style>${CSS}</style>
<div class="wrap">
  <section class="panel" hidden>
    <header class="hd">
      <svg class="logo" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.2V5.5Z"/>
        <path d="M9 10.2h.01M15 10.2h.01" stroke-linecap="round"/>
        <path d="M9.4 13.2c.7.8 1.6 1.2 2.6 1.2s1.9-.4 2.6-1.2" stroke-linecap="round"/>
      </svg>
      <div class="ttl">抖音表情包</div>
      <div class="pill"><b id="cnt">0</b> 张</div>
      <button class="x" data-act="close" title="关闭">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>
      </button>
    </header>
    <div class="bar">
      <button class="btn" data-act="scan">扫描</button>
      <button class="btn" data-act="auto">自动翻页</button>
      <button class="btn" data-act="clear">清空</button>
      <label class="switch"><input type="checkbox" id="zip" checked><i></i>打包 ZIP</label>
    </div>
    <div class="grid" id="grid" hidden></div>
    <div class="empty" id="empty">
      <p>先点开抖音的 <b>表情面板</b> 或 <b>收藏表情</b>，<br>再点「自动翻页」把列表滚到底</p>
    </div>
    <footer class="ft">
      <button class="lnk" data-act="all">全选</button>
      <button class="lnk" data-act="inv">反选</button>
      <div class="sp"></div>
      <button class="cta" data-act="dl" disabled>下载 0 张</button>
    </footer>
    <div class="bar-progress"><i id="prog"></i></div>
    <div class="toast" id="toast"></div>
  </section>
  <button class="fab" id="fab" title="抖音表情包下载器">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.2V5.5Z"/>
      <path d="M9 10.2h.01M15 10.2h.01" stroke-linecap="round"/>
      <path d="M9.4 13.2c.7.8 1.6 1.2 2.6 1.2s1.9-.4 2.6-1.2" stroke-linecap="round"/>
    </svg>
  </button>
</div>`;

  const $ = (sel) => root.querySelector(sel);
  const wrap = $('.wrap');
  const fab = $('#fab');
  const panel = $('.panel');
  const grid = $('#grid');
  const empty = $('#empty');
  const cnt = $('#cnt');
  const prog = $('#prog');
  const toastEl = $('#toast');
  const zipInput = $('#zip');
  const dlBtn = $('[data-act="dl"]');

  let toastTimer = 0;
  function toast(msg, ms = 2200) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms);
  }

  function setProgress(pct) {
    prog.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  function updateFooter() {
    const n = state.selected.size;
    dlBtn.textContent = state.busy ? '下载中…' : `下载 ${n} 张`;
    dlBtn.disabled = state.busy || n === 0;
    cnt.textContent = state.items.size;
  }

  function makeTile(item) {
    const el = document.createElement('div');
    el.className = 'tile' + (state.selected.has(item.key) ? ' sel' : '');
    el.dataset.key = item.key;
    el.title = item.name || '表情';

    const img = document.createElement('img');
    img.src = item.url;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => el.classList.add('err'));

    const cb = document.createElement('span');
    cb.className = 'cb';
    cb.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

    el.append(img, cb);
    el.addEventListener('click', () => {
      if (state.selected.has(item.key)) state.selected.delete(item.key);
      else state.selected.add(item.key);
      el.classList.toggle('sel');
      updateFooter();
    });
    return el;
  }

  function render() {
    const items = [...state.items.values()];
    const keep = grid.scrollTop;
    grid.textContent = '';
    const frag = document.createDocumentFragment();
    items.forEach((it) => frag.appendChild(makeTile(it)));
    grid.appendChild(frag);
    grid.scrollTop = keep;
    grid.hidden = items.length === 0;
    empty.hidden = items.length > 0;
    updateFooter();
  }

  function openPanel(open) {
    panel.hidden = !open;
    fab.classList.toggle('on', open);
  }

  // ---------------------------------------------------------------- 扫描

  function scanLocal() {
    return scanInto(state.items);
  }

  async function scanAll() {
    const added = scanLocal();
    const remote = await collectFrames();
    let extra = 0;
    remote.forEach((it) => {
      if (state.items.has(it.key)) return;
      state.items.set(it.key, it);
      extra++;
    });
    if (added + extra) render();
    updateFooter();
    return added + extra;
  }

  function findScroller() {
    const imgs = [...document.querySelectorAll('img')].filter((i) => isEmojiUrl(i.currentSrc || i.src));
    for (const img of imgs) {
      let el = img.parentElement;
      let depth = 0;
      while (el && depth++ < 14) {
        const oy = getComputedStyle(el).overflowY;
        if (/(auto|scroll)/.test(oy) && el.scrollHeight > el.clientHeight + 24) return el;
        el = el.parentElement;
      }
    }
    return null;
  }

  async function autoScroll() {
    if (state.autoing) return;
    state.autoing = true;
    const btn = $('[data-act="auto"]');
    btn.classList.add('busy');
    btn.textContent = '翻页中';

    await scanAll();
    const sc = findScroller();
    if (!sc) {
      toast('没找到可滚动的表情面板，先手动点开表情列表再试');
      resetAuto();
      return;
    }

    sc.scrollTop = 0;
    await sleep(220);
    await scanAll();

    const step = Math.max(160, Math.round(sc.clientHeight * 0.78));
    let guard = 0;
    while (guard++ < 400) {
      const prev = sc.scrollTop;
      sc.scrollTop = prev + step;
      await sleep(170);
      const added = await scanAll();
      if (!added && Math.abs(sc.scrollTop - prev) < 2) break;
    }

    sc.scrollTop = 0;
    toast(`扫描完成，共 ${state.items.size} 张`);
    resetAuto();

    function resetAuto() {
      state.autoing = false;
      btn.classList.remove('busy');
      btn.textContent = '自动翻页';
    }
  }

  // ---------------------------------------------------------------- 下载

  async function startDownload() {
    const picked = [...state.selected].map((k) => state.items.get(k)).filter(Boolean);
    if (!picked.length || state.busy) return;

    state.busy = true;
    setProgress(0);
    updateFooter();

    const zipMode = zipInput.checked && typeof JSZip !== 'undefined';
    const d = new Date();
    const tag = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

    const results = [];
    const failed = [];
    let done = 0;

    try {
      await pool(picked, 4, async (item, i) => {
        try {
          const res = await fetch(item.url, { credentials: 'include' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const blob = await res.blob();
          results.push({ i, name: fileName(i + 1, item.name, extOf(blob.type, item.url)), blob });
        } catch (err) {
          failed.push({ i, item });
        }
        done++;
        setProgress((done / picked.length) * 92);
      });

      // 整批都失败 → 说明页面内请求被拦截，交给浏览器下载器再试一次
      if (!results.length && failed.length) {
        toast('页面内请求被拦截，改用浏览器直接下载…', 3200);
        for (const { i, item } of failed) {
          chrome.runtime.sendMessage({
            type: 'dy-emoji-download',
            url: item.url,
            filename: `抖音表情包/${fileName(i + 1, item.name, extOf('', item.url))}`,
          });
          await sleep(140);
        }
        return;
      }

      results.sort((a, b) => a.i - b.i);

      if (zipMode) {
        const zip = new JSZip();
        results.forEach((r) => zip.file(r.name, r.blob));
        const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, (m) =>
          setProgress(92 + m.percent * 0.07)
        );
        saveBlob(out, `抖音表情包_${tag}.zip`);
      } else {
        for (const r of results) {
          saveBlob(r.blob, r.name);
          await sleep(160);
        }
      }

      setProgress(100);
      toast(`完成：${results.length} 张${failed.length ? `，失败 ${failed.length} 张` : ''}`, 3000);
      setTimeout(() => setProgress(0), 1400);
    } catch (err) {
      toast('下载出错：' + ((err && err.message) || err), 3200);
      setProgress(0);
    } finally {
      state.busy = false;
      updateFooter();
    }
  }

  // ---------------------------------------------------------------- 交互

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'close') openPanel(false);
    else if (act === 'scan') {
      openPanel(true);
      scanAll().then((n) => toast(n ? `新发现 ${n} 张` : '没有新的表情'));
    } else if (act === 'auto') {
      openPanel(true);
      autoScroll();
    } else if (act === 'clear') {
      state.items.clear();
      state.selected.clear();
      render();
      toast('已清空');
    } else if (act === 'all') {
      [...state.items.keys()].forEach((k) => state.selected.add(k));
      render();
    } else if (act === 'inv') {
      const next = new Set();
      [...state.items.keys()].forEach((k) => {
        if (!state.selected.has(k)) next.add(k);
      });
      state.selected = next;
      render();
    } else if (act === 'dl') {
      startDownload();
    }
  });

  zipInput.addEventListener('change', () => {
    chrome.storage?.local.set({ dyEmojiZip: zipInput.checked });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') openPanel(false);
  });

  // 浮动按钮：拖动定位，轻点展开
  let pos = { right: 20, bottom: 20 };
  function applyPos() {
    wrap.style.right = pos.right + 'px';
    wrap.style.bottom = pos.bottom + 'px';
  }
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  fab.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom };
    let moved = false;
    fab.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) > 4) moved = true;
      if (!moved) return;
      pos.right = clamp(start.right - dx, 6, window.innerWidth - 60);
      pos.bottom = clamp(start.bottom - dy, 6, window.innerHeight - 60);
      applyPos();
    };
    const onUp = () => {
      fab.removeEventListener('pointermove', onMove);
      fab.removeEventListener('pointerup', onUp);
      fab.removeEventListener('pointercancel', onUp);
      if (!moved) openPanel(panel.hidden);
      chrome.storage?.local.set({ dyEmojiPos: pos });
    };
    fab.addEventListener('pointermove', onMove);
    fab.addEventListener('pointerup', onUp);
    fab.addEventListener('pointercancel', onUp);
  });

  // ---------------------------------------------------------------- 启动

  document.documentElement.appendChild(host);
  applyPos();

  chrome.storage?.local.get(['dyEmojiPos', 'dyEmojiZip'], (v) => {
    if (v && v.dyEmojiPos) {
      pos = {
        right: clamp(Number(v.dyEmojiPos.right) || 20, 6, window.innerWidth - 60),
        bottom: clamp(Number(v.dyEmojiPos.bottom) || 20, 6, window.innerHeight - 60),
      };
      applyPos();
    }
    if (v && typeof v.dyEmojiZip === 'boolean') zipInput.checked = v.dyEmojiZip;
  });
})();
