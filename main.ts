// Token Radar's entrypoint for token-radar-01 (Node 22, standard library only).
//
// It reads the sealed snapshot (mounted at /input in the grader's container, or --input <file|dir>
// anywhere else), scores the pre-token universe with the comps model in lib/model.ts, and writes to
// /output (MAKEFUN_OUTPUT_DIR stands in for it outside the grader):
//
//   board.json     every rankable pre-token protocol, ranked by implied value, with farm steps
//   data.js        the same board plus the live-token evidence, as one script the page reads
//   dashboard/     this repository's page, copied whole
//   screenshots/   the three images the judge reads, copied whole
//   dossier.json   what the vendored make.fun library writes from all of the above
//
// The run is deterministic: the snapshot's as_of dates every row, no clock, no randomness, no network.
// The grader runs it twice and both runs must write the same bytes.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the dossier's bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', process.env.MAKEFUN_INPUT_DIR ?? '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|dir> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const radar = buildRadar(snapshot);
const issue = boardIssue(radar.rows, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: radar.rows })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, recursively, skipping names that start with a dot. */
function copyFiles(from: string, to: string, prefix = ''): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    const rel = prefix === '' ? name : `${prefix}/${name}`;
    if (statSync(path).isDirectory()) {
      copied.push(...copyFiles(path, join(to, name), rel));
    } else if (statSync(path).isFile()) {
      copyFileSync(path, join(to, name));
      copied.push(rel);
    }
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }));

const dashboardFiles = readdirSync(join(out, 'dashboard'), { recursive: true }).map(String).filter((f) => statSync(join(out, 'dashboard', f)).isFile());
const dashboardBytes = dashboardFiles.reduce((n, f) => n + statSync(join(out, 'dashboard', f)).size, 0);
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${radar.board_size} ranked ` +
    `(${radar.early_size} below the floor, ${radar.excluded_size} set aside as structural products, ${radar.live_size} live shown apart)\n` +
  `token radar: comps from ${radar.global_members} live-token protocols, universe median mcap/tvl ${radar.global_ratio}, ${radar.comps.length} categories with their own\n` +
  `token radar: wrote board.json, data.js, dashboard/ (${dashboardFiles.length} files, ${dashboardBytes} bytes), screenshots/ (${shots.length} images), dossier.json to ${out}\n`,
);
