// Token Radar dashboard, part 1: shared helpers (no imports; each file adds to window.TR).
window.TR = window.TR || {};
(function (TR) {
  'use strict';

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }

  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }

  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.round(days) + 'd';
  }

  function fmtX(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }

  // conviction: how far the row sits above the board's median implied value, 0-100
  function scoreOf(row, rows) {
    if (!rows.length) return 0;
    var sorted = rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
    var lo = sorted[0], hi = sorted[sorted.length - 1];
    if (hi <= lo) return 50;
    return Math.round(100 * (row.implied_value_usd - lo) / (hi - lo));
  }

  function pctClass(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'flat';
    return n > 0.05 ? 'up' : n < -0.05 ? 'down' : 'flat';
  }

  TR.el = el;
  TR.fmtUsd = fmtUsd;
  TR.fmtPct = fmtPct;
  TR.fmtAge = fmtAge;
  TR.fmtX = fmtX;
  TR.scoreOf = scoreOf;
  TR.pctClass = pctClass;
})(window.TR);
