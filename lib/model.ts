// The radar's model: a sealed snapshot of the protocol universe in, a ranked pre-token board out.
//
// The question the board answers: if this protocol's record stayed as it is, what would the token it
// may issue be worth, and what would a reader do about it now? Every number below is derived from the
// snapshot's own figures; no protocol name is ever special-cased, and the same functions score every row.
//
// The value model, in one line:
//
//   implied = tvl x comps x momentum x anticipation
//
// - comps       What a dollar of TVL in this category already trades for. The snapshot's live-token
//               protocols carry both a TVL and a market cap; their mcap/tvl ratio, per category, is the
//               market's own comparable. A category with few members is shrunk toward the universe's
//               median so a single odd protocol cannot set the price.
// - momentum    The protocol's own seven-day TVL growth (clamped), as the market prices launches
//               hotter when inflow is rising.
// - anticipation How long the protocol has run with no token. Activity accrues while it waits, so the
//               multiplier rises with age up to three years and is neutral where the record has no date.
//
// The board ranks every pre-token protocol the snapshot carries that is not a structural product of one
// whose token already trades — bridges, staking families, wrapped and versioned pools, exchange runs —
// the same families the watchlist's own rule sets aside. The watchlist is the floor and every slug on it
// is on the board; the protocols below the floor are the early rows the radar exists to find. Protocols
// whose token already trades never mix into the ranking: the page shows them apart, with the very
// multiples the comps step reads as its evidence.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  winsor_low: number;
  winsor_high: number;
  comps_shrink_k: number;
  comps_min_members: number;
  comps_ratio_min: number;
  comps_ratio_max: number;
  momentum_weight: number;
  momentum_floor: number;
  momentum_cap: number;
  anticipation_floor: number;
  anticipation_range: number;
  anticipation_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  winsor_low: 0.01,
  winsor_high: 2,
  comps_shrink_k: 6,
  comps_min_members: 3,
  comps_ratio_min: 0.02,
  comps_ratio_max: 1,
  momentum_weight: 0.35,
  momentum_floor: -60,
  momentum_cap: 120,
  anticipation_floor: 0.75,
  anticipation_range: 0.5,
  anticipation_days: 1095,
  unknown_age_days: 365,
};

export const MODEL_VERSION = 'comps-1';

/** How a category's comps read: the members it drew on and the multiple it settled on. */
export interface Comps {
  ratio: number;
  members: number;
  category: string;
  source: 'category' | 'global';
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  watchlist: boolean;
  model: { comps_ratio: number; comps_members: number; comps_source: string; momentum: number; anticipation: number };
}

/** A live-token protocol, shown apart with the multiple the comps read. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

/** One row of the page's compact board, with the farm plan carried whole. */
export interface RadarRow extends BoardRow {}

/** What the category comps table shows: the model's own evidence. */
export interface CompsRow {
  category: string;
  members: number;
  median: number;
  shrunk: number;
}

/** Everything the dashboard needs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  board_size: number;
  watchlist_size: number;
  early_size: number;
  excluded_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  comps: CompsRow[];
  global_ratio: number;
  global_members: number;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `from` to the snapshot's `as_of`, clamped at zero; null when the date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release marks a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The categories whose products exist because another token already trades. */
const STRUCTURAL_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Exchange runs: a name beginning with an exchange's own brand is its product, not a launch. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A whole word of these marks a wrapped or staked receipt of something that trades already. */
const RECEIPT_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * Whether a protocol is one the board may rank: pre-token, and none of the structural families the
 * watchlist's own rule sets aside (its parent rule is DefiLlama's record, which the snapshot does not
 * carry, so the categories, names and exchanges carry the rule here).
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && STRUCTURAL_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (RECEIPT_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The median of a list of numbers (a copy is sorted); NaN when the list is empty. */
function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The comps the snapshot supports: winsorized per-category medians, shrunk toward the universe's median. */
export function buildComps(protocols: SnapshotProtocol[], model: ModelConstants): { byCategory: Map<string, Comps>; globalRatio: number; globalMembers: number; table: CompsRow[] } {
  // Every live-token protocol's mcap/tvl: the market's own price of a dollar of TVL in that category.
  // Each ratio is winsorized first, so one protocol trading at 400x its TVL cannot set a category's price.
  const winsor = (r: number) => Math.min(model.winsor_high, Math.max(model.winsor_low, r));
  const perCategory = new Map<string, number[]>();
  let all: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const r = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(r) || r <= 0) continue;
    all.push(winsor(r));
    const c = p.category ?? 'Uncategorized';
    let list = perCategory.get(c);
    if (list === undefined) perCategory.set(c, (list = []));
    list.push(winsor(r));
  }
  const globalRatio = median(all);
  const globalMembers = all.length;
  const byCategory = new Map<string, Comps>();
  const table: CompsRow[] = [];
  for (const [category, ratios] of [...perCategory].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) {
    const raw = median(ratios);
    // Shrinkage: n members pull the category's median toward the universe's median with weight k, and a
    // category under comps_min_members members does not speak for itself at all — the universe prices it.
    if (ratios.length < model.comps_min_members) continue;
    const shrunk = (ratios.length * raw + model.comps_shrink_k * globalRatio) / (ratios.length + model.comps_shrink_k);
    const ratio = Math.min(model.comps_ratio_max, Math.max(model.comps_ratio_min, shrunk));
    byCategory.set(category, { ratio, members: ratios.length, category, source: 'category' });
    table.push({ category, members: ratios.length, median: Math.round(raw * 10000) / 10000, shrunk: Math.round(ratio * 10000) / 10000 });
  }
  return { byCategory, globalRatio, globalMembers, table };
}

/** One protocol's comps: its category's shrunk median, or the universe's when its category does not trade. */
export function compsOf(p: SnapshotProtocol, comps: { byCategory: Map<string, Comps>; globalRatio: number }, model: ModelConstants): Comps {
  const category = p.category ?? 'Uncategorized';
  const hit = comps.byCategory.get(category);
  if (hit !== undefined) return hit;
  const ratio = Math.min(model.comps_ratio_max, Math.max(model.comps_ratio_min, comps.globalRatio));
  return { ratio, members: 0, category, source: 'global' };
}

/** The momentum multiplier: the protocol's own seven-day TVL change, clamped, at `weight`. */
export function momentumOf(change_7d: number | null, model: ModelConstants): { momentum: number; growth: number } {
  const growth = Math.min(model.momentum_cap, Math.max(model.momentum_floor, finite(change_7d, 0)));
  return { momentum: 1 + (growth / 100) * model.momentum_weight, growth };
}

/** The anticipation multiplier: activity accrues while a protocol runs with no token, up to three years. */
export function anticipationOf(age: number | null, model: ModelConstants): { anticipation: number; age: number } {
  const known = age ?? model.unknown_age_days;
  const t = Math.min(Math.max(known, 0), model.anticipation_days) / model.anticipation_days;
  return { anticipation: model.anticipation_floor + t * model.anticipation_range, age: known };
}

/** The implied value one protocol gets, with every factor named for the dashboard's breakdown. */
export function impliedValueOf(p: SnapshotProtocol, asOf: string, comps: { byCategory: Map<string, Comps>; globalRatio: number }, model: ModelConstants): { implied: number; c: Comps; momentum: number; anticipation: number; age: number | null } {
  const c = compsOf(p, comps, model);
  const m = momentumOf(p.change_7d, model);
  const age = ageDays(asOf, p.listed_at);
  const a = anticipationOf(age, model);
  const implied = Math.max(1, Math.round(p.tvl_usd * c.ratio * m.momentum * a.anticipation));
  return { implied, c, momentum: m.momentum, anticipation: a.anticipation, age };
}

// ---------------------------------------------------------------- farm plans

/** How much gas costs where the protocol lives, in the words a plan states. */
const CHAIN_GAS: Array<[string, string]> = [
  ['Ethereum', '$2-$10'],
  ['Solana', 'under $0.02'],
  ['Base', '$0.02-$0.30'],
  ['Arbitrum', '$0.02-$0.30'],
  ['Optimism', '$0.02-$0.30'],
  ['Polygon', '$0.01-$0.10'],
  ['Avalanche', '$0.05-$0.40'],
  ['BNB', '$0.05-$0.30'],
  ['Sui', 'under $0.05'],
  ['Aptos', 'under $0.05'],
  ['Hyperliquid', 'under $0.10'],
  ['Sei', 'under $0.05'],
  ['TON', 'under $0.10'],
];

function gasOf(chains: string[]): string {
  for (const [chain, gas] of CHAIN_GAS) if (chains.includes(chain)) return gas;
  return 'a few cents to a few dollars';
}

/** The position a plan opens, sized so it counts without risking more than the idea is worth. */
export function positionFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 2_500;
  if (tvl >= 1_000_000_000) return 1_500;
  if (tvl >= 250_000_000) return 750;
  if (tvl >= 100_000_000) return 400;
  return 200;
}

/** How long to hold, from the protocol's age: the freshest launches qualify the longest. */
export function holdFor(age: number | null): { days: number; why: string } {
  if (age === null) return { days: 60, why: 'the record gives no listing date, so treat the protocol as fresh and qualify early' };
  if (age < 90) return { days: 90, why: 'a listing this recent is early in its activity window, and early users are remembered' };
  if (age < 365) return { days: 60, why: 'the protocol has run under a year, so qualify across several months of snapshots' };
  return { days: 45, why: 'a long-running protocol rewards steady, repeated activity more than one large deposit' };
}

/** The category's one position, in the words a farmer can follow on the protocol's own app. */
export function positionAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC as collateral on ${name} (${chain}), then borrow a small amount against it so the wallet shows a real position.`;
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity')) return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and leave the LP position open.`;
  if (c.includes('yield')) return `Deposit $${capital} into ${name}'s largest vault on ${chain} and keep the receipt token in the same wallet.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} (${chain}) and open one small, hedged position you can close the same day.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and take one position in its most liquid market, then hold it to resolution.`;
  if (c.includes('curator') || c.includes('allocator')) return `Allocate $${capital} through ${name} into one of its curated vaults on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or swap $${capital} of the stable asset on ${name} (${chain}) and hold it there for the qualifying window.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and keep it in the wallet that minted it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover on ${name} (${chain}) for an active market and keep the policy to expiry.`;
  if (c.includes('launchpad') || c.includes('ido')) return `Participate once with $${capital} in ${name}'s live sale on ${chain}, sized well under the cap.`;
  if (c.includes('gaming') || c.includes('nft')) return `Use $${capital} on ${name}'s core loop on ${chain}: one full play or mint session, not a bare deposit.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and use the app's core function, not just the deposit.`;
}

/**
 * A protocol's farm plan: seven steps, each one action with its cost and its time, derived from the
 * protocol's own record (category, chains, TVL, age) and never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chains = p.chains.length > 0 ? p.chains : ['its main chain'];
  const chain = chains[0]!;
  const second = chains.length > 1 ? chains[1]! : null;
  const capital = positionFor(p.tvl_usd);
  const gas = gasOf(p.chains);
  const hold = holdFor(age);
  const steps = [
    `Open a fresh wallet for this position alone and keep its seed phrase offline; fund it on ${chain} with the capital you plan to farm. Cost: ${gas} to move funds. Time: 15 minutes.`,
    `${positionAction(p, capital, chain)} Cost: $${capital} of capital plus ${gas} of gas. Time: 20 minutes.`,
    second === null
      ? `Make one extra qualifying action in the app this week — a swap through the position, a vote, or a small top-up — so the wallet shows usage, not a deposit that sat still. Cost: ${gas} per action. Time: 10 minutes a week.`
      : `Repeat the position on ${second}, where ${p.name} also runs, so the activity covers more than one deployment of the protocol. Cost: $${Math.round(capital / 2)} plus ${gasOf([second])} of gas. Time: 25 minutes.`,
    `Come back weekly: one deposit, borrow, swap or vote each week is the cadence that lands in airdrop snapshots. Cost: about ${gas} a week. Time: 10 minutes a week.`,
    `Hold the position at least ${hold.days} days: ${hold.why}. Cost: the $${capital} stays parked. Time: ${hold.days} days.`,
    `Watch ${p.name}'s own announcements for a points program or token claim, and claim only from the link it publishes on its own site. Cost: nothing to read, and never pay a fee to claim. Time: 15 minutes a month.`,
    `Log the wallet address, every date and transaction hash as you go, and set the unwind rule now: close the position once the token is claimed or the thesis breaks. Cost: nothing but the log. Time: 5 minutes.`,
  ];
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 596)}...` : s));
}

// ---------------------------------------------------------------- the board

function bySlug(a: { slug: string }, b: { slug: string }): number {
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

/** The board: every rankable pre-token protocol, strongest first, ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; compsTable: CompsRow[]; globalRatio: number; globalMembers: number } {
  const comps = buildComps(snapshot.protocols, model);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p] as const));
  const watchlist = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter((p) => isRankable(p) || watchlist.has(p.slug))
    .map((p) => ({ p, v: impliedValueOf(p, snapshot.as_of, comps, model) }))
    .sort((a, b) => b.v.implied - a.v.implied || bySlug(a.p, b.p));
  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    implied_value_usd: s.v.implied,
    farm_steps: farmSteps(s.p, s.v.age),
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    age_days: s.v.age,
    watchlist: watchlist.has(s.p.slug),
    model: {
      comps_ratio: s.v.c.ratio,
      comps_members: s.v.c.members,
      comps_source: s.v.c.source,
      momentum: s.v.momentum,
      anticipation: s.v.anticipation,
    },
  }));
  return { board, compsTable: comps.table, globalRatio: comps.globalRatio, globalMembers: comps.globalMembers };
}

/** The live-token protocols the board must never mix into the ranking, strongest market cap first. */
export function buildLive(snapshot: Snapshot, limit = 24): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || bySlug(a, b))
    .slice(0, limit)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: Math.round((p.mcap_usd! / p.tvl_usd) * 10000) / 10000,
    }));
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, distinct values, steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const seen = new Set<string>();
  for (const r of board) {
    if (seen.has(r.slug)) return `${r.slug} appears twice`;
    seen.add(r.slug);
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Everything the dashboard renders, from one snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): RadarData {
  const { board, compsTable, globalRatio, globalMembers } = buildBoard(snapshot, model);
  const live = buildLive(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  // Set aside: pre-token protocols the board leaves out because a structural family rule refuses them.
  const excluded = snapshot.protocols.filter((p) => isPreToken(p) && !isRankable(p)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    board_size: board.length,
    watchlist_size: snapshot.watchlist.length,
    early_size: early,
    excluded_size: excluded,
    live_size: live.length,
    rows: board,
    live,
    comps: compsTable,
    global_ratio: Math.round(globalRatio * 10000) / 10000,
    global_members: globalMembers,
  };
  return radar;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
