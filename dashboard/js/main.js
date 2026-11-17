// Token Radar dashboard, part 5: wiring. Reads window.RADAR, renders on load and on hashchange.
window.TR = window.TR || {};
(function (TR) {
  'use strict';
  var el = TR.el;
  var DATA = window.RADAR;

  function renderBoardView(node, f) {
    TR.renderStats(document.getElementById('stats'), DATA);
    TR.renderControls(document.getElementById('controls'), DATA, f, function (patch) {
      var clean = {};
      Object.keys(patch).forEach(function (k) { clean[k] = patch[k]; });
      TR.go('board', null, clean);
    });
    var shown = TR.sortRows(TR.filtered(DATA.rows, f), f);
    var count = document.getElementById('result-count');
    if (count) count.textContent = shown.length + ' of ' + DATA.rows.length + ' protocols';

    var wrap = el('div', { class: 'board-wrap' });
    if (!shown.length) {
      wrap.appendChild(el('div', { class: 'empty' },
        el('b', { text: 'Nothing on the scope' }),
        el('span', { text: 'No protocol matches these filters. Reset them or widen the search.' })));
    } else {
      var cells = [
        { label: 'Rank', key: 'rank', num: true },
        { label: 'Protocol', key: 'name' },
        { label: 'Category', key: 'cat' },
        { label: 'Chains', key: null },
        { label: 'TVL', key: 'tvl', num: true },
        { label: '7d change', key: 'change', num: true },
        { label: 'Implied value', key: 'implied', num: true },
        { label: 'Conviction', key: null, num: true }
      ];
      var onSort = function (key) {
        var dir = f.sort === key && f.dir === 'desc' ? 'asc' : 'desc';
        TR.go('board', null, { sort: key, dir: dir });
      };
      var table = el('table', { class: 'board' }, TR.head(cells, f, onSort));
      var tbody = el('tbody');
      shown.forEach(function (r) { tbody.appendChild(TR.row(r, DATA.rows)); });
      table.appendChild(tbody);
      wrap.appendChild(table);
    }
    node.appendChild(wrap);
    node.appendChild(evidence());
  }

  function evidence() {
    var box = el('div', { class: 'mgrid', style: 'margin-top:12px' });
    var live = el('section', { class: 'mcard' }, el('h3', { text: 'Already trading · the comparables behind the multiples' }));
    live.appendChild(el('p', { text: 'These protocols record a token, so they never mix into the ranking. Their market cap over TVL is what the model reads as a category\'s price.' }));
    var lt = el('table', { class: 'plain' }, el('thead', null, el('tr', null,
      el('th', { text: 'Protocol' }), el('th', { class: 'num', text: 'TVL' }),
      el('th', { class: 'num', text: 'Mcap' }), el('th', { class: 'num', text: 'Mcap/TVL' }))));
    var lb = el('tbody');
    DATA.live.slice(0, 8).forEach(function (r) {
      lb.appendChild(el('tr', null, el('td', { text: r.name }), el('td', { class: 'num', text: TR.fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: TR.fmtUsd(r.mcap_usd) }), el('td', { class: 'num', text: TR.fmtX(r.multiple) })));
    });
    lt.appendChild(lb);
    live.appendChild(lt);
    box.appendChild(live);

    var comps = el('section', { class: 'mcard' }, el('h3', { text: 'Category comps · the evidence table' }));
    comps.appendChild(el('p', { text: 'Universe median mcap/TVL is ' + TR.fmtX(DATA.global_ratio) + ' from ' + DATA.global_members + ' live protocols. A category with its own peers shrinks toward it; fewer than ' + DATA.model.comps_min_members + ' peers prices at the universe median.' }));
    var ct = el('table', { class: 'plain' }, el('thead', null, el('tr', null,
      el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Peers' }),
      el('th', { class: 'num', text: 'Median' }), el('th', { class: 'num', text: 'Used' }))));
    var cb = el('tbody');
    DATA.comps.slice().sort(function (a, b) { return b.members - a.members; }).slice(0, 8).forEach(function (c) {
      cb.appendChild(el('tr', null, el('td', { text: c.category }), el('td', { class: 'num', text: String(c.members) }),
        el('td', { class: 'num', text: TR.fmtX(c.median) }), el('td', { class: 'num', text: TR.fmtX(c.shrunk) })));
    });
    ct.appendChild(cb);
    comps.appendChild(ct);
    box.appendChild(comps);
    return box;
  }

  function renderModelView(node) {
    document.getElementById('stats').textContent = '';
    document.getElementById('controls').textContent = '';
    var wrap = el('div', { class: 'mgrid' });
    var m = DATA.model;
    var intro = el('section', { class: 'mcard pagemodel' });
    intro.appendChild(el('h3', { text: 'How the board values a token that does not exist yet' }));
    intro.appendChild(el('div', { class: 'formula', text: 'implied = TVL × comps × momentum × anticipation' }));
    intro.appendChild(el('p', { text: 'comps: the category\'s winsorized median market-cap/TVL among live protocols (' + m.winsor_low + 'x to ' + m.winsor_high + 'x), shrunk toward the universe median with weight ' + m.comps_shrink_k + ', then held within ' + m.comps_ratio_min + 'x and ' + m.comps_ratio_max + 'x.' }));
    intro.appendChild(el('p', { text: 'momentum: the protocol\'s own 7-day TVL change, clamped to ' + m.momentum_floor + '% .. ' + m.momentum_cap + '% and weighted ' + m.momentum_weight + '.' }));
    intro.appendChild(el('p', { text: 'anticipation: time run with no token, from ' + m.anticipation_floor + 'x at listing to ' + (m.anticipation_floor + m.anticipation_range) + 'x at ' + m.anticipation_days + ' days (' + (m.unknown_age_days / 365).toFixed(0) + 'y assumed when the record has no date).' }));
    wrap.appendChild(intro);
    node.appendChild(wrap);
  }

  function render() {
    var node = document.getElementById('view');
    if (!DATA) {
      node.textContent = 'data.js did not load: run main.ts and open the dashboard from its output.';
      return;
    }
    var s = TR.syncState();
    document.getElementById('nav-board').classList.toggle('is-active', s.view !== 'model');
    document.getElementById('nav-model').classList.toggle('is-active', s.view === 'model');
    node.textContent = '';
    if (s.view === 'detail') {
      TR.renderStats(document.getElementById('stats'), DATA);
      TR.renderControls(document.getElementById('controls'), DATA, s.filters, function (patch) { TR.go('board', null, patch); });
      TR.renderDetail(node, s.slug, DATA);
    } else if (s.view === 'model') {
      renderModelView(node);
    } else {
      renderBoardView(node, s.filters);
    }
    var f = document.getElementById('foot-line');
    if (f) f.textContent = 'Token Radar · ' + DATA.board_size + ' pre-token protocols ranked by implied value · snapshot ' + DATA.as_of +
      ' · ' + DATA.source + ' · every figure is baked into data.js; the page makes no network request.';
    node.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  TR.render = render;
  document.getElementById('nav-board').addEventListener('click', function () { TR.go('board'); });
  document.getElementById('nav-model').addEventListener('click', function () { TR.go('model'); });
  window.addEventListener('hashchange', render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})(window.TR);
