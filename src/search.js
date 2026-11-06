// Search: the Search button, the / key or Ctrl+K opens a dialog that finds words in every chapter
// (its title, kicker and lead, its sections, paragraphs, lists and tables, and the headings of its
// calculator) and in the normal values. A result opens its chapter at the passage, or the normal
// values at the row, and marks it. The index builds from the page itself at the first search, so
// it holds the text that the page shows, with the citation numbers left out.
import { CHAPTERS, numOf } from './chapters.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Text for matching: no accents or primes, ² as 2, lower case, single spaces. */
const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ′″’'`]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** What a kind of passage adds to a result's rank. */
const WEIGHT = { title: 60, head: 40, calc: 34, kicker: 30, key: 26, dek: 20, norm: 16, text: 10 };
const PER_CHAPTER = 5, MAX = 60;

/** An element's text without its citation numbers, buttons and links to other chapters' calculations. */
function textOf(el) {
  let s = '';
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) s += c.data;
      else if (c.nodeType === 1 && !c.classList.contains('cite') && !c.classList.contains('asx-go') && c.tagName !== 'SUP' && c.tagName !== 'BUTTON') {
        walk(c);
        if (/^(TD|TH|BR|LI|P|DIV|DT|DD)$/.test(c.tagName)) s += ' ';
      }
    }
  };
  walk(el);
  return s.replace(/\s+/g, ' ').trim();
}

/** The passages of the page: { i (chapter index, or -1 for the normal values), el, sec, kind, text, f }. */
function build() {
  const items = [];
  const add = (i, el, sec, kind, text) => { if (text) items.push({ i, el, sec, kind, text, f: fold(text) }); };
  CHAPTERS.forEach((c, i) => {
    const art = document.getElementById(`ch-${c.key}`);
    if (!art) return;
    add(i, art, '', 'title', textOf($('.ch-title', art) || art));
    const kick = $('.ch-kicker', art), dek = $('.dek', art);
    if (kick) add(i, art, '', 'kicker', textOf(kick));
    if (dek) add(i, dek, '', 'dek', textOf(dek));
    let sec = '';
    for (const el of art.querySelectorAll('h3, h4, p, li, tr, .ase-sh')) {
      // the live sentence, the readouts and the quiz change with the page; a list item or a row
      // with paragraphs inside is read by its paragraphs
      if (el.closest('.live, .readouts, .quiz') || el === dek || el.closest('.ch-head')) continue;
      if (el.closest('.ase') && !el.matches('.ase-title, .ase-sh, .ase-lede')) continue;
      if (el.matches('li, tr') && el.querySelector('p, li, tr')) continue;
      const text = textOf(el);
      if (el.matches('h3, h4')) {
        if (el.matches('.ase-title')) { add(i, el, text, 'calc', text); continue; }
        sec = text;
        add(i, el, sec, 'head', text);
      } else if (el.matches('.ase-sh, .ase-lede')) add(i, el, $('.ase-title', el.closest('.ase'))?.textContent || sec, 'calc', text);
      else add(i, el, sec, /^key points$/i.test(sec) ? 'key' : 'text', text);
    }
  });
  // the normal values: each row, under its table's caption
  for (const t of document.querySelectorAll('#norms-body table')) {
    const cap = textOf($('caption', t) || t);
    for (const tr of t.querySelectorAll('tbody tr')) add(-1, tr, cap, 'norm', [...tr.cells].map((td) => textOf(td)).join(' · '));
  }
  return items;
}

/** The terms of a query: words, each to be found; a word of one letter only at the start of a word. */
function termsOf(q) {
  return fold(q).split(' ').filter(Boolean).map((t) => (t.length > 1 ? { t } : { t, re: new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }));
}
const has = (f, T) => (T.re ? T.re.test(f) : f.includes(T.t));

/** The passages that hold every term, by rank: the kind, the whole query as one phrase, shortness. */
function find(items, q) {
  const T = termsOf(q);
  if (!T.length) return [];
  const phrase = fold(q);
  const hits = [];
  for (const it of items) {
    if (!T.every((x) => has(it.f, x))) continue;
    const at = it.f.indexOf(T[0].t);
    hits.push({ it, score: WEIGHT[it.kind] + (it.f.includes(phrase) ? 20 : 0) + (at >= 0 && at < 60 ? 6 : 0) + Math.max(0, 200 - it.f.length) / 40 });
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** About 160 characters of text around the first term, with every term marked. */
function snippet(text, q) {
  const words = q.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[′″’'`]/g, ''));
  const low = text.toLowerCase();
  const at = Math.max(0, low.indexOf(words[0]?.toLowerCase() ?? ''));
  let a = Math.max(0, at - 50), b = Math.min(text.length, a + 160);
  if (a > 0) a = text.indexOf(' ', a) + 1 || a;
  if (b < text.length) b = text.lastIndexOf(' ', b) > a ? text.lastIndexOf(' ', b) : b;
  const part = `${a > 0 ? '… ' : ''}${text.slice(a, b)}${b < text.length ? ' …' : ''}`;
  const re = words.length ? new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi') : null;
  return re ? esc(part).replace(re, '<mark>$1</mark>') : esc(part);
}

/**
 * Bind the search: open(id) opens a dialog of the page (main.js openDialog); go(i) opens chapter
 * i; still() stops the chapter's own sequence, so that the text above a passage keeps its height.
 * Returns the function that opens the search.
 */
export function initSearch({ open, go, still }) {
  const dlg = document.getElementById('dlg-search'), input = $('#search-q'), list = $('#search-res'), count = $('#search-n');
  let items = null, shown = [], timer = 0;
  const run = () => {
    const q = input.value.trim();
    if (q.length < 2) { list.innerHTML = ''; count.textContent = q ? 'Type two letters or more.' : ''; shown = []; return; }
    items ??= build();
    const hits = find(items, q);
    // by chapter, the chapters in the order of their best passage, at most five passages each
    const groups = new Map();
    for (const h of hits) {
      const g = groups.get(h.it.i) ?? groups.set(h.it.i, []).get(h.it.i);
      if (g.length < PER_CHAPTER) g.push(h.it);
    }
    shown = [];
    let html = '';
    for (const [i, its] of groups) {
      if (shown.length >= MAX) break;
      const name = i < 0 ? 'Normal values' : CHAPTERS[i].title, n = i < 0 ? '' : numOf(CHAPTERS[i].key);
      html += `<li class="srch-ch"><span class="n">${esc(n)}</span>${esc(name)}</li>`;
      for (const it of its) {
        const where = it.kind === 'title' || it.kind === 'kicker' || it.kind === 'dek' ? 'Chapter' : it.sec;
        html += `<li><button type="button" class="srch-hit" data-r="${shown.length}"><span class="srch-sec">${esc(where || 'Text')}</span><span class="srch-snip">${snippet(it.text, q)}</span></button></li>`;
        shown.push(it);
      }
    }
    list.innerHTML = html;
    const nch = [...groups.keys()].filter((i) => i >= 0).length;
    const where = [nch ? `${nch} ${nch === 1 ? 'chapter' : 'chapters'}` : '', groups.has(-1) ? 'the normal values' : ''].filter(Boolean).join(' and ');
    count.textContent = hits.length
      ? `${hits.length} ${hits.length === 1 ? 'passage' : 'passages'} in ${where}${hits.length > shown.length ? `. The best ${shown.length} show` : ''}.`
      : `No passage holds “${q}”.`;
  };
  /** Open a result: its chapter at the passage, or the normal values at the row; the passage is marked. */
  const reveal = (it) => {
    dlg.close();
    if (it.i < 0) open('dlg-norms');
    else { go(it.i); still(); }
    // the chapter shows, its text renders, then the passage scrolls into view
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = it.el, stage = document.getElementById('stage');
      // a phone: the figure stays at the top of the screen, so the passage goes below it
      const sticky = it.i >= 0 && stage && getComputedStyle(stage).position === 'sticky';
      if (sticky) el.style.scrollMarginTop = `${(parseFloat(getComputedStyle(stage).top) || 0) + stage.offsetHeight + 16}px`;
      el.scrollIntoView({ block: sticky || el.matches('article') ? 'start' : 'center' });
      if (sticky) setTimeout(() => { el.style.scrollMarginTop = ''; }, 100);
      if (el.matches('article')) return;   // the chapter's title: no mark on the whole chapter
      el.classList.remove('srch-mark');
      void el.offsetWidth;   // restart the mark
      el.classList.add('srch-mark');
      setTimeout(() => el.classList.remove('srch-mark'), 2600);
    }));
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 70); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); $('.srch-hit', list)?.focus(); }
    else if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); run(); if (shown[0]) reveal(shown[0]); }
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.srch-hit');
    if (b) reveal(shown[Number(b.dataset.r)]);
  });
  list.addEventListener('keydown', (e) => {
    const b = e.target.closest('.srch-hit');
    if (!b || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    const all = [...list.querySelectorAll('.srch-hit')], k = all.indexOf(b) + (e.key === 'ArrowDown' ? 1 : -1);
    (k < 0 ? input : all[Math.min(k, all.length - 1)]).focus();
  });
  const show = () => {
    open('dlg-search');
    input.focus();
    input.select();
  };
  document.getElementById('btn-search')?.addEventListener('click', show);
  return show;
}
