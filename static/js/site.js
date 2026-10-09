'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const mobile = () => matchMedia('(max-width:767px)').matches;
  const remember = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
  const recall = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const dark = () => root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme:dark)').matches);
  const themeLabel = () => $('theme-toggle').setAttribute('aria-label', dark() ? '라이트 모드로 전환' : '다크 모드로 전환');
  themeLabel();
  $('theme-toggle').onclick = () => {
    root.dataset.theme = dark() ? 'light' : 'dark';
    remember('kernel-theme', root.dataset.theme);
    themeLabel();
  };
  matchMedia('(prefers-color-scheme:dark)').addEventListener('change', themeLabel);
  function menu(open) {
    open = open && mobile();
    $('left-nav').classList.toggle('is-open', open);
    $('drawer-backdrop').hidden = !open;
    $('menu-toggle').setAttribute('aria-expanded', String(open));
    if (open) $('drawer-close').focus();
  }
  $('menu-toggle').onclick = () => menu(!$('left-nav').classList.contains('is-open'));
  $('drawer-close').onclick = () => { menu(false); $('menu-toggle').focus(); };
  $('drawer-backdrop').onclick = () => menu(false);
  matchMedia('(max-width:767px)').addEventListener('change', () => menu(false));

  const cards = [...document.querySelectorAll('.feed-card')];
  const chips = [...document.querySelectorAll('[data-depth]')];
  const selects = [...document.querySelectorAll('[data-filter]')];
  const filters = {depth:'all', field:'all', series:'all', sort:'latest'};
  function filterFeed(writeURL = true) {
    if (!$('feed-count')) return;
    let count = 0;
    const list = document.querySelector('.feed-list');
    for (const card of [...cards].sort((a, b) => b.dataset[filters.sort === 'updated' ? 'updated' : 'date'].localeCompare(a.dataset[filters.sort === 'updated' ? 'updated' : 'date']))) {
      card.hidden = !(filters.depth === 'all' || card.dataset.depths.split(',').includes(filters.depth)) ||
        !(filters.field === 'all' || card.dataset.field === filters.field) ||
        !(filters.series === 'all' || card.dataset.series === filters.series);
      if (!card.hidden) count++;
      list.append(card);
    }
    for (const chip of chips) chip.setAttribute('aria-pressed', String(chip.dataset.depth === filters.depth));
    for (const select of selects) select.value = filters[select.dataset.filter];
    $('feed-count').textContent = `글 ${count}편`;
    const empty = document.querySelector('.feed-empty');
    empty.hidden = count > 0;
    empty.textContent = cards.length ? '아직 이 조건의 글이 없습니다.' : '아직 글이 없습니다. 첫 글을 준비하고 있습니다.';
    $('filter-reset').hidden = Object.entries(filters).every(([key, value]) => value === (key === 'sort' ? 'latest' : 'all'));
    if (writeURL) {
      const url = new URL(location.href);
      for (const [key, value] of Object.entries(filters)) {
        if (value === (key === 'sort' ? 'latest' : 'all')) url.searchParams.delete(key);
        else url.searchParams.set(key, value);
      }
      history.replaceState(history.state, '', url);
      remember('kernel-reading-level', filters.depth);
    }
  }
  if (chips.length) {
    const params = new URLSearchParams(location.search);
    const depth = params.get('depth') || recall('kernel-reading-level');
    if (chips.some(chip => chip.dataset.depth === depth)) filters.depth = depth;
    for (const select of selects) {
      const value = params.get(select.dataset.filter);
      if ([...select.options].some(option => option.value === value)) filters[select.dataset.filter] = value;
      select.onchange = () => { filters[select.dataset.filter] = select.value; filterFeed(); };
    }
    for (const chip of chips) chip.onclick = () => { filters.depth = chip.dataset.depth; filterFeed(); };
    $('filter-reset').onclick = event => {
      event.preventDefault();
      Object.assign(filters, {depth:'all', field:'all', series:'all', sort:'latest'});
      filterFeed();
    };
    filterFeed(false);
  }
  if ($('search-input')) $('search-input').oninput = event => {
    const term = event.target.value.trim().toLocaleLowerCase();
    const links = [...$('section-tree').querySelectorAll('.concept')];
    let count = 0;
    for (const link of links) {
      const found = link.textContent.toLocaleLowerCase().includes(term);
      (link.closest('details')?.parentElement || link.closest('li')).hidden = !found;
      if (found) { count++; if (term && link.closest('details')) link.closest('details').open = true; }
    }
    $('search-results').textContent = term ? `글 ${count}편` : '';
  };

  let popup = null;
  let articleController = null;
  function initArticle(area) {
    const pages = [...area.querySelectorAll('.reading-page')];
    const tabs = [...area.querySelectorAll('[role="tab"]')];
    if (typeof renderMathInElement === 'function') renderMathInElement(area, {
      delimiters: [{left:'$$',right:'$$',display:true}, {left:'$',right:'$',display:false}],
      throwOnError:false
    });
    if (!pages.length) return null;
    let index = 0;
    let observer = null;
    function show(next, move = false, writeHash = true) {
      index = Math.max(0, Math.min(pages.length - 1, next));
      pages.forEach((page, i) => { page.hidden = i !== index; });
      tabs.forEach((tab, i) => {
        tab.setAttribute('aria-selected', String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
        tab.classList.toggle('done', i < index);
      });
      const toc = area.querySelector('[data-toc]');
      toc.replaceChildren();
      const headings = [...pages[index].querySelectorAll('h2,h3')];
      for (const [i, heading] of headings.entries()) {
        heading.id = `reading-${index}-${i}`;
        const a = document.createElement('a');
        a.href = `#${heading.id}`;
        a.textContent = heading.textContent;
        a.onclick = event => { event.preventDefault(); heading.scrollIntoView({block:'start'}); };
        toc.append(a);
      }
      observer?.disconnect();
      const scrollRoot = popup ? $('popup-scroll') : null;
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          for (const a of toc.querySelectorAll('a')) {
            if (a.hash === `#${entry.target.id}`) a.setAttribute('aria-current', 'location');
            else a.removeAttribute('aria-current');
          }
        }
      }, {root:scrollRoot, rootMargin:'-96px 0px -60% 0px'});
      headings.forEach(heading => observer.observe(heading));
      remember('kernel-reading-level', pages[index].dataset.pageName);
      if (writeHash) {
        const url = new URL(location.href);
        url.hash = pages[index].dataset.pageName;
        history.replaceState(history.state, '', url);
        if (popup) $('popup-fullscreen').href = url.href;
      }
      if (move) {
        if (popup) $('popup-scroll').scrollTo({top:0}); else window.scrollTo({top:0});
        tabs[index].focus({preventScroll:true});
      }
    }
    tabs.forEach((tab, i) => {
      tab.onclick = () => show(i);
      tab.onkeydown = event => {
        const next = {ArrowRight:(i+1)%tabs.length, ArrowLeft:(i+tabs.length-1)%tabs.length, Home:0, End:tabs.length-1}[event.key];
        if (next !== undefined) { event.preventDefault(); show(next); tabs[next].focus(); }
      };
    });
    area.querySelectorAll('[data-go]').forEach(button => { button.onclick = () => show(Number(button.dataset.go), true); });
    function fromHash() {
      let name = '';
      try { name = decodeURIComponent(location.hash.slice(1)); } catch {}
      const found = pages.findIndex(page => page.dataset.pageName === name);
      const saved = pages.findIndex(page => page.dataset.pageName === recall('kernel-reading-level'));
      show(found >= 0 ? found : saved >= 0 ? saved : 0);
    }
    fromHash();
    return {fromHash, dispose:() => observer?.disconnect()};
  }
  articleController = initArticle($('main'));
  window.addEventListener('hashchange', () => articleController?.fromHash());

  async function fetchPage(href) {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) throw new Error('Different origin');
    const response = await fetch(url.href);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return new DOMParser().parseFromString(await response.text(), 'text/html');
  }
  function dismissPopup() {
    if (!popup) return;
    articleController?.dispose();
    const saved = popup;
    popup = null;
    $('post-popup').hidden = true;
    $('post-popup').classList.remove('is-open');
    $('popup-content').replaceChildren();
    root.classList.remove('popup-open');
    saved.background.forEach(([node, inert]) => { node.inert = inert; });
    document.title = saved.title;
    window.scrollTo(0, saved.scroll);
    saved.focus?.focus({preventScroll:true});
    articleController = initArticle($('main'));
  }
  function closePopup() {
    if (!popup || popup.closing) return;
    popup.closing = true;
    if (history.state?.kernelPopup) history.back();
    else { history.replaceState(null, '', popup.url); dismissPopup(); }
  }
  async function openPopup(link) {
    const saved = {
      url:location.href, title:document.title, focus:link, scroll:window.scrollY,
      background:[...document.querySelectorAll('.site-layout,.masthead,.skip')].map(node => [node,node.inert])
    };
    // Fetch before hiding the page: a failed request still has a usable full-page link.
    const doc = await fetchPage(link.href);
    const content = doc.querySelector('[data-article]');
    if (!content) throw new Error('Missing article');
    if (popup) return;
    popup = saved;
    history.pushState({kernelPopup:true}, '', link.href);
    saved.background.forEach(([node]) => { node.inert = true; });
    root.classList.add('popup-open');
    $('popup-content').replaceChildren(document.importNode(content, true));
    const title = $('popup-content').querySelector('h1');
    title.id = 'popup-title';
    $('popup-path').textContent = `글 목록 › ${content.dataset.title}`;
    $('popup-fullscreen').href = link.href;
    document.title = doc.title;
    $('popup-scroll').scrollTop = 0;
    $('post-popup').hidden = false;
    requestAnimationFrame(() => { if (popup) $('post-popup').classList.add('is-open'); });
    articleController?.dispose();
    articleController = initArticle($('popup-content'));
    title.focus({preventScroll:true});
  }
  $('popup-close').onclick = closePopup;
  $('post-popup').onclick = event => { if (event.target === $('post-popup')) closePopup(); };
  $('popup-fullscreen').onclick = event => {
    if (popup) { event.preventDefault(); location.replace($('popup-fullscreen').href); }
  };
  window.addEventListener('popstate', () => {
    if (popup && !history.state?.kernelPopup) dismissPopup();
    filterFeed(false);
  });

  let howtoFocus = null;
  document.addEventListener('click', async event => {
    const link = event.target.closest('a[data-post],a[data-howto]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (link.hasAttribute('data-post') && mobile()) return;
    event.preventDefault();
    try {
      if (link.hasAttribute('data-howto')) {
        const doc = await fetchPage(link.href);
        const content = doc.querySelector('.plain-page');
        if (!content) throw new Error('Missing reading guide');
        howtoFocus = link;
        $('howto-content').replaceChildren(document.importNode(content, true));
        $('howto-dialog').showModal();
        $('howto-close').focus();
      } else await openPopup(link);
    } catch { location.assign(link.href); }
  });
  $('howto-close').onclick = () => $('howto-dialog').close();
  $('howto-dialog').addEventListener('close', () => howtoFocus?.focus({preventScroll:true}));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (popup) { event.preventDefault(); closePopup(); }
      else if ($('left-nav').classList.contains('is-open')) { menu(false); $('menu-toggle').focus(); }
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && $('search-input') && !popup && !$('howto-dialog').open) {
      event.preventDefault(); menu(mobile()); $('search-input').focus();
    }
    if (event.key !== 'Tab' || !popup) return;
    const focusable = [...$('post-popup').querySelectorAll('a[href],button,[tabindex="0"]')].filter(node => !node.closest('[hidden]'));
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('popup-title'))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
})();

// 복사하면 출처를 붙인다 (10-09 L0). 코드 블록과 짧은 선택은 그대로 둔다.
document.addEventListener('copy',e=>{const sel=getSelection();const text=sel?sel.toString():'';if(!text||text.trim().length<40)return;const n=sel.anchorNode;const el=n&&(n.nodeType===1?n:n.parentElement);if(el&&el.closest('pre,code,input,textarea'))return;e.clipboardData.setData('text/plain',text+'\n\n출처: KERNEL, '+location.href.split('#')[0]);e.preventDefault();});
