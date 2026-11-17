// Token Radar dashboard, part 3: snapshot stats, filter controls and the ranked board table.
window.TR = window.TR || {};
(function (TR) {
  'use strict';
  var el = TR.el;

  function categories(rows) {
    var seen = {};
    rows.forEach(function (r) { seen[r.category || 'Uncategorized'] = 1; });
    return Object.keys(seen).sort(function (a, b) { return a < b ? -1 : 1; });
  }

  function chains(rows) {
    var count = {};
    rows.forEach(function (r) { r.chains.forEach(function (c) { count[c] = (count[c] || 0) + 1; }); });
    return Object.keys(count).sort(function (a, b) { return count[b] - count[a] || (a < b ? -1 : 1); });
  }

  function stat(value, label, cls) {
    return el('div', { class: 'stat' + (cls ? ' ' + cls : '') }, el('b', { text: value }), el('span', { text: label }));
  }

  function renderStats(node, data) {
    node.textContent = '';
    node.appendChild(stat(String(data.board_size), 'ranked pre-token', 'hot'));
    node.appendChild(stat(String(data.watchlist_size), 'on the watchlist', 'cool'));
    node.appendChild(stat(String(data.early_size), 'found below the floor'));
    node.appendChild(stat(String(data.live_size), 'live comparables'));
    node.appendChild(stat(data.as_of, 'snapshot date'));
    node.appendChild(stat(data.model_version, 'model version'));
  }

  function control(label, node) {
    return el('span', { class: 'ctl-group' }, el('label', { text: label }), node);
  }

  function renderControls(node, data, f, onChange) {
    node.textContent = '';
    var q = el('input', {
      class: 'ctl search', type: 'search', placeholder: 'Search protocol or slug…',
      value: f.q, 'aria-label': 'Search protocols', id: 'filter-q',
      oninput: function (e) { onChange({ q: e.target.value }); }
    });
    var cat = el('select', { class: 'ctl', 'aria-label': 'Category', id: 'filter-cat', onchange: function (e) { onChange({ cat: e.target.value }); } });
    cat.appendChild(el('option', { value: 'all', text: 'All categories' }));
    categories(data.rows).forEach(function (c) {
      cat.appendChild(el('option', { value: c, text: c, selected: f.cat === c ? 'selected' : null }));
    });
    cat.value = f.cat;
    var chain = el('select', { class: 'ctl', 'aria-label': 'Chain', id: 'filter-chain', onchange: function (e) { onChange({ chain: e.target.value }); } });
    chain.appendChild(el('option', { value: 'all', text: 'All chains' }));
    chains(data.rows).forEach(function (c) {
      chain.appendChild(el('option', { value: c, text: c, selected: f.chain === c ? 'selected' : null }));
    });
    chain.value = f.chain;
    var watch = el('button', {
      class: 'ctl' + (f.watch ? ' is-on' : ''), type: 'button', id: 'filter-watch',
      'aria-pressed': f.watch ? 'true' : 'false', text: f.watch ? '★ Watchlist only' : '☆ Watchlist only',
      onclick: function () { onChange({ watch: !f.watch }); }
    });
    var reset = el('button', {
      class: 'ctl', type: 'button', text: 'Reset', title: 'Clear every filter',
      onclick: function () { onChange({ q: '', cat: 'all', chain: 'all', watch: false }); }
    });
    node.appendChild(control('Search', q));
    node.appendChild(control('Category', cat));
    node.appendChild(control('Chain', chain));
    node.appendChild(watch);
    node.appendChild(reset);
    node.appendChild(el('span', { class: 'result-count', id: 'result-count' }));
  }

  function filtered(rows, f) {
    var q = f.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (f.cat !== 'all' && (r.category || 'Uncategorized') !== f.cat) return false;
      if (f.chain !== 'all' && r.chains.indexOf(f.chain) < 0) return false;
      if (f.watch && !r.watchlist) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
  }

  function sortRows(rows, f) {
    var key = f.sort, dir = f.dir === 'asc' ? 1 : -1;
    var pick = {
      rank: function (r) { return r.rank; },
      name: function (r) { return r.name.toLowerCase(); },
      cat: function (r) { return (r.category || 'Uncategorized').toLowerCase(); },
      tvl: function (r) { return r.tvl_usd; },
      change: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
      implied: function (r) { return r.implied_value_usd; }
    }[key] || function (r) { return r.implied_value_usd; };
    return rows.slice().sort(function (a, b) {
      var x = pick(a), y = pick(b);
      if (x === y) return a.rank - b.rank;
      return (x < y ? -1 : 1) * dir;
    });
  }

  function head(cells, f, onSort) {
    var tr = el('tr');
    cells.forEach(function (c) {
      var th = el('th', {
        class: (c.num ? 'num' : '') + (c.key ? '' : ' no-sort'),
        scope: 'col', text: c.label,
        onclick: c.key ? function () { onSort(c.key); } : null
      });
      if (c.key && f.sort === c.key) th.appendChild(el('span', { class: 'arrow', text: f.dir === 'asc' ? '▲' : '▼' }));
      tr.appendChild(th);
    });
    return el('thead', null, tr);
  }

  function row(r, rows) {
    var score = TR.scoreOf(r, rows);
    var leader = rows.reduce(function (m, x) { return Math.max(m, x.implied_value_usd); }, 1);
    var chg = r.change_7d === null ? 'n/a' : TR.fmtPct(r.change_7d);
    var tr = el('tr', {
      class: r.watchlist ? 'is-watching' : '', tabindex: '0', role: 'link',
      title: 'Open ' + r.name, 'data-slug': r.slug,
      onclick: function () { TR.go('detail', r.slug); },
      onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); TR.go('detail', r.slug); } }
    });
    var name = el('td', null,
      el('span', { class: 'pname', text: r.name },
        r.watchlist ? el('span', { class: 'badge wl', text: 'WATCHLIST' }) : el('span', { class: 'badge early', text: 'EARLY' })),
      el('span', { class: 'pslug', text: r.slug }));
    tr.appendChild(el('td', { class: 'rank', text: '#' + r.rank }));
    tr.appendChild(name);
    tr.appendChild(el('td', { class: 'cat', text: r.category || 'Uncategorized', title: r.category || 'Uncategorized' }));
    tr.appendChild(el('td', { class: 'chains', text: r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : ''), title: r.chains.join(', ') }));
    tr.appendChild(el('td', { class: 'num', text: TR.fmtUsd(r.tvl_usd) }));
    tr.appendChild(el('td', { class: 'num ' + TR.pctClass(r.change_7d), text: chg }));
    tr.appendChild(el('td', { class: 'num val' },
      el('span', { text: TR.fmtUsd(r.implied_value_usd) }),
      el('span', { class: 'vbar' }, el('i', { style: 'width:' + Math.max(1, Math.round(100 * r.implied_value_usd / leader)) + '%' }))));
    tr.appendChild(el('td', { class: 'num' }, el('span', { class: 'score', text: String(score) })));
    return tr;
  }

  TR.renderStats = renderStats;
  TR.renderControls = renderControls;
  TR.filtered = filtered;
  TR.sortRows = sortRows;
  TR.head = head;
  TR.row = row;
})(window.TR);
