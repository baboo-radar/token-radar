// Token Radar dashboard, part 2: hash routing and filter state.
// Routes: #/ (board), #/?q=..&cat=..&chain=..&watch=1&sort=..&dir=.. , #/p/<slug>, #/model
window.TR = window.TR || {};
(function (TR) {
  'use strict';

  var DEFAULTS = { q: '', cat: 'all', chain: 'all', watch: false, sort: 'implied', dir: 'desc' };
  var state = { view: 'board', slug: null, filters: copy(DEFAULTS) };

  function copy(o) {
    var out = {};
    Object.keys(o).forEach(function (k) { out[k] = o[k]; });
    return out;
  }

  function parseQuery(qs) {
    var out = {};
    qs.split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      var k = i < 0 ? pair : pair.slice(0, i);
      var v = i < 0 ? '' : pair.slice(i + 1);
      try { out[decodeURIComponent(k)] = decodeURIComponent(v); } catch (e) { /* skip bad pair */ }
    });
    return out;
  }

  function bool(v) { return v === '1' || v === 'true' || v === 'on'; }

  function readHash() {
    var raw = (location.hash || '').replace(/^#\/?/, '');
    var view = 'board';
    var slug = null;
    var params = {};
    if (raw === 'model') {
      view = 'model';
    } else if (raw.slice(0, 2) === 'p/') {
      view = 'detail';
      var rest = raw.slice(2);
      var cut = rest.indexOf('?');
      if (cut >= 0) rest = rest.slice(0, cut);
      try { slug = decodeURIComponent(rest); } catch (e) { slug = rest; }
    } else {
      var qi = raw.indexOf('?');
      if (qi >= 0) params = parseQuery(raw.slice(qi + 1));
    }
    var f = copy(DEFAULTS);
    if (params.q) f.q = params.q;
    if (params.cat) f.cat = params.cat;
    if (params.chain) f.chain = params.chain;
    if (params.watch !== undefined) f.watch = bool(params.watch);
    if (params.sort) f.sort = params.sort;
    if (params.dir === 'asc' || params.dir === 'desc') f.dir = params.dir;
    return { view: view, slug: slug, filters: f };
  }

  function hashFor(view, slug, f) {
    if (view === 'detail') return '#/p/' + encodeURIComponent(slug || '');
    if (view === 'model') return '#/model';
    var parts = [];
    if (f.q) parts.push('q=' + encodeURIComponent(f.q));
    if (f.cat && f.cat !== 'all') parts.push('cat=' + encodeURIComponent(f.cat));
    if (f.chain && f.chain !== 'all') parts.push('chain=' + encodeURIComponent(f.chain));
    if (f.watch) parts.push('watch=1');
    if (f.sort !== DEFAULTS.sort || f.dir !== DEFAULTS.dir) parts.push('sort=' + f.sort + '&dir=' + f.dir);
    return '#/' + (parts.length ? '?' + parts.join('&') : '');
  }

  function sync() {
    var h = readHash();
    state.view = h.view;
    state.slug = h.slug;
    state.filters = h.filters;
    return state;
  }

  function go(view, slug, patch) {
    var f = copy(state.filters);
    if (patch) Object.keys(patch).forEach(function (k) { f[k] = patch[k]; });
    var next = hashFor(view, slug, f);
    if (next === (location.hash || '')) {
      TR.render();
    } else {
      location.hash = next;
    }
  }

  TR.DEFAULTS = DEFAULTS;
  TR.state = state;
  TR.syncState = sync;
  TR.go = go;
  TR.hashFor = hashFor;
})(window.TR);
