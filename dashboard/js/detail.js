// Token Radar dashboard, part 4: one protocol's detail view.
window.TR = window.TR || {};
(function (TR) {
  'use strict';
  var el = TR.el;

  function card(title) {
    return el('section', { class: 'card' }, title ? el('h3', { text: title }) : null);
  }

  function fact(k, v, cls) {
    return el('li', null, el('span', { class: 'k', text: k }), el('span', { class: 'v ' + (cls || ''), text: v }));
  }

  function stepText(text) {
    // a farm step ends "... Cost: X. Time: Y."; split the cost/time tail so it reads at a glance
    var at = text.lastIndexOf(' Cost:');
    if (at < 0) return el('span', { text: text });
    return el('span', null,
      el('span', { text: text.slice(0, at) }),
      el('span', { class: 'muted', text: text.slice(at) }));
  }

  function scoreNote(row, data) {
    var rank = row.rank, n = data.board_size;
    return 'Conviction is where this row sits in the board\'s own implied-value range: #' + rank +
      ' of ' + n + '. The model claims value, not a launch date; a high score is a stronger claim, never a promise.';
  }

  function renderDetail(node, slug, data) {
    node.textContent = '';
    var row = data.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) {
      node.appendChild(el('div', { class: 'empty' },
        el('b', { text: 'No such protocol' }),
        el('span', { text: 'The board does not hold ' + slug + '.' })));
      return;
    }
    var wrap = el('div', { class: 'detail' });
    wrap.appendChild(el('button', { class: 'crumb', type: 'button', text: '← The board', onclick: function () { TR.go('board'); } }));

    var grid = el('div', { class: 'dgrid' });
    var left = el('div', { class: 'dcol' });
    var right = el('div', { class: 'dcol' });

    var head = card();
    var h2 = el('h2', null, document.createTextNode(row.name));
    if (row.watchlist) h2.appendChild(el('span', { class: 'badge wl', text: 'WATCHLIST' }));
    else h2.appendChild(el('span', { class: 'badge early', text: 'BELOW FLOOR · EARLY FIND' }));
    head.appendChild(el('div', { class: 'dhead' },
      h2,
      el('span', { class: 'meta', text: '#' + row.rank + ' · ' + row.slug + ' · ' + (row.category || 'Uncategorized') })));
    head.appendChild(el('div', { class: 'pillrow' }, row.chains.map(function (c) { return el('span', { class: 'pill', text: c }); })));
    var kv = el('div', { class: 'kv' });
    kv.appendChild(el('div', { class: 'stat hot' }, el('b', { text: TR.fmtUsd(row.implied_value_usd) }), el('span', { text: 'implied value' })));
    kv.appendChild(el('div', { class: 'stat' }, el('b', { text: TR.fmtUsd(row.tvl_usd) }), el('span', { text: 'TVL today' })));
    kv.appendChild(el('div', { class: 'stat' }, el('b', { class: TR.pctClass(row.change_7d), text: row.change_7d === null ? 'n/a' : TR.fmtPct(row.change_7d) }), el('span', { text: 'TVL change, 7d' })));
    kv.appendChild(el('div', { class: 'stat' }, el('b', { text: TR.fmtAge(row.age_days) }), el('span', { text: 'tracked, no token' })));
    head.appendChild(kv);
    left.appendChild(head);

    // the arithmetic, in the model's own order, from the row's unrounded factors
    var proof = card('The number, from the snapshot\'s own figures');
    var m = row.model;
    var recomputed = Math.max(1, Math.round(row.tvl_usd * m.comps_ratio * m.momentum * m.anticipation));
    proof.appendChild(el('div', { class: 'formula' },
      el('s', { text: 'implied = ' }), 'TVL ', TR.fmtUsd(row.tvl_usd),
      el('s', { text: ' × comps ' }), TR.fmtX(m.comps_ratio),
      el('s', { text: ' × momentum ' }), TR.fmtX(m.momentum),
      el('s', { text: ' × anticipation ' }), TR.fmtX(m.anticipation),
      el('s', { text: ' = ' }), TR.fmtUsd(row.implied_value_usd)));
    var ul = el('ul', { class: 'reason' });
    ul.appendChild(fact('TVL today', TR.fmtUsd(row.tvl_usd)));
    ul.appendChild(fact('Comps multiple', TR.fmtX(m.comps_ratio) + ' (' + (m.comps_source === 'category' ? m.comps_members + ' live protocols in ' + (row.category || 'Uncategorized') : 'universe median, no category peers') + ')'));
    ul.appendChild(fact('Momentum', TR.fmtX(m.momentum) + ' (' + (row.change_7d === null ? 'no 7d report, neutral' : TR.fmtPct(row.change_7d) + ' over 7d, clamped') + ')'));
    ul.appendChild(fact('Anticipation', TR.fmtX(m.anticipation) + ' (' + (row.age_days === null ? 'no listing date, assumed fresh' : TR.fmtAge(row.age_days) + ' tracked with no token') + ')'));
    var match = recomputed === row.implied_value_usd;
    var check = el('li', { class: match ? 'check' : '' },
      el('span', { class: 'k', text: match ? 'Recomputed from these factors' : 'Recomputed from these factors' }),
      el('span', { class: 'v', text: TR.fmtUsd(recomputed) + (match ? ' · matches the board' : '') }));
    ul.appendChild(check);
    proof.appendChild(ul);
    proof.appendChild(el('p', { class: 'note', text: 'Implied value is this entry\'s own claim about a token that does not exist yet. It predicts no launch and no date.' }));
    left.appendChild(proof);

    var conv = card('Conviction');
    var score = TR.scoreOf(row, data.rows);
    conv.appendChild(el('div', { class: 'kv', style: 'margin-top:0' },
      el('div', { class: 'stat' }, el('b', { text: String(score) + ' / 100' }), el('span', { text: 'implied-value rank' }))));
    conv.appendChild(el('div', { class: 'meter', style: 'width:100%;margin:8px 0' }, el('i', { style: 'width:' + score + '%' })));
    conv.appendChild(el('p', { class: 'note', text: scoreNote(row, data) }));
    left.appendChild(conv);

    var farm = card('Farm it before the launch');
    var ol = el('ol', { class: 'steps' });
    row.farm_steps.forEach(function (s) { ol.appendChild(el('li', null, stepText(s))); });
    farm.appendChild(ol);
    right.appendChild(farm);

    var nav = el('div', { class: 'pillrow' });
    data.rows.filter(function (r) { return r.rank === row.rank - 1; }).forEach(function (r) {
      nav.appendChild(el('button', { class: 'crumb', type: 'button', text: '← #' + r.rank + ' ' + r.name, onclick: function () { TR.go('detail', r.slug); } }));
    });
    data.rows.filter(function (r) { return r.rank === row.rank + 1; }).forEach(function (r) {
      nav.appendChild(el('button', { class: 'crumb', type: 'button', text: '#' + r.rank + ' ' + r.name + ' →', onclick: function () { TR.go('detail', r.slug); } }));
    });
    right.appendChild(nav);

    grid.appendChild(left);
    grid.appendChild(right);
    wrap.appendChild(grid);
    node.appendChild(wrap);
  }

  TR.renderDetail = renderDetail;
})(window.TR);
