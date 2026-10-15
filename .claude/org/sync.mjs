#!/usr/bin/env node
// La organización compartida: agentes, firma de QA y conocimiento viven en msagbini/skills/org
// y se copian a cada repo. Lo que se entrena en un repo se "promueve" a la fuente y llega a todos.
//
//   node .claude/org/sync.mjs            trae la última versión y la escribe en este repo
//   node .claude/org/sync.mjs --check    sale con 1 si lo del repo no coincide con la fuente
//   node .claude/org/sync.mjs --promote  sube a la fuente lo aprendido/editado acá (cuadernos y agentes)
//   opciones: --from <dir de skills>  --repo <dir del proyecto>  --push (con --promote: rama + push)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REMOTE = 'https://github.com/msagbini/skills';
const MARK = '<!-- org: GENERADO desde msagbini/skills/org. No se edita acá: se entrena (ver .claude/org/README.md) -->';
const FOOT_START = '<!-- org:aprendizaje -->';

export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

export function aprendizaje(name) {
  return `${FOOT_START}
## Cómo aprendés (sos parte de una organización)
- Antes de empezar leé tu cuaderno \`.claude/org/conocimiento/${name}.md\` (lo que aprendiste en TODOS los proyectos) y \`.claude/org/conocimiento/comun.md\`.
- Si un colega (otro agente) te impugna con evidencia, respondé con evidencia; el desacuerdo se resuelve midiendo, no insistiendo.
- Al terminar, si aprendiste algo que sirve fuera de este proyecto (una trampa, una forma de medir, un falso positivo), agregalo al final de tu cuaderno con fecha, proyecto y el caso que lo motivó. Sin datos reales.
- Lo específico de este proyecto va a {{reglas}}; lo general, a tu cuaderno. Luego: \`node .claude/org/sync.mjs --promote\` para que lo aprendan los demás repos.
- Sos parte de una comunidad (\`.claude/org/comunidad/CARTA.md\`): respeto profesional, desacuerdo con evidencia, nadie borra a nadie (sólo se agrega).
- ¿Te falta saber algo? Preguntá en \`.claude/org/comunidad/consultas.md\`; si sabés la respuesta a una consulta abierta, contestala. ¿Falta un colega con otra especialidad? Anotalo en \`necesidades.md\` y, si se repite, proponelo en \`propuestas/\`.
`;
}

export function render(text, rutas) {
  return text.replace(/\{\{([a-z.]+)\}\}/g, (m, k) => (k in rutas ? rutas[k] : m));
}

// Inversa de render para --promote: valores conocidos → placeholders (los más largos primero).
export function unrender(text, rutas) {
  const pairs = Object.entries(rutas).filter(([, v]) => v && v.length > 3).sort((a, b) => b[1].length - a[1].length);
  for (const [k, v] of pairs) text = text.split(v).join(`{{${k}}}`);
  return text;
}

// Convivencia: en conocimiento/ y comunidad/ sólo se agrega; nadie borra lo que escribió otro.
export const APPEND_ONLY = /^(conocimiento|comunidad)\//;
export function soloAgrega(antes, despues) {
  return despues.replace(/\s+$/, '').startsWith(antes.replace(/\s+$/, ''));
}

// Bloque obligatorio en el CLAUDE.md del repo (lo lee toda sesión). Se mantiene entre marcas; lo demás no se toca.
export const B_INI = '<!-- comunidad-de-agentes:inicio (generado por .claude/org/sync.mjs; no editar) -->';
export const B_FIN = '<!-- comunidad-de-agentes:fin -->';
export function upsertBlock(md, bloque) {
  const nuevo = `${B_INI}\n${bloque.replace(/\s+$/, '')}\n${B_FIN}`;
  const i = md.indexOf(B_INI), j = md.indexOf(B_FIN);
  if (i >= 0 && j > i) return md.slice(0, i) + nuevo + md.slice(j + B_FIN.length);
  return md.replace(/\s*$/, '') + '\n\n' + nuevo + '\n';
}

export function renderAgent(src, name, rutas) {
  const m = src.match(/^---\n[\s\S]*?\n---\n/);
  const front = m ? m[0] : '';
  const body = src.slice(front.length).replace(/\s+$/, '');
  return render(`${front}${MARK}\n${body}\n\n${aprendizaje(name)}`, rutas);
}

export function stripAgent(local, rutas) {
  let t = local.replace(MARK + '\n', '');
  const i = t.indexOf(FOOT_START);
  if (i >= 0) t = t.slice(0, i).replace(/\s+$/, '') + '\n';
  return unrender(t, rutas);
}

const DEFAULT_RUTAS = {
  reglas: 'docs/qa/reglas-aprendidas.md', criterios: 'docs/durazno/criterios-de-construccion.md',
  hallazgos: 'docs/lgs/', marcador: 'docs/qa/marcador.md', rondas: 'docs/qa/rondas/',
  barrido: 'el barrido automático del proyecto, si existe', contexto: 'docs/qa/contexto.md',
};

// Plan: { destino relativo al repo → contenido } a partir de la fuente.
export function plan(srcOrg, cfg) {
  const rutas = { ...DEFAULT_RUTAS, ...(cfg.rutas || {}) };
  const excluir = new Set(cfg.excluir || []);
  const out = {};
  for (const f of fs.readdirSync(path.join(srcOrg, 'agentes')).filter((f) => f.endsWith('.md')).sort()) {
    const name = f.replace(/\.md$/, '');
    if (excluir.has(name)) continue;
    out[`.claude/agents/${f}`] = renderAgent(fs.readFileSync(path.join(srcOrg, 'agentes', f), 'utf8'), name, rutas);
  }
  for (const dir of ['firma', 'conocimiento', 'comunidad']) {
    if (!fs.existsSync(path.join(srcOrg, dir))) continue;
    for (const f of fs.readdirSync(path.join(srcOrg, dir), { recursive: true }).map(String).sort()) {
      if (fs.statSync(path.join(srcOrg, dir, f)).isDirectory()) continue;
      out[`.claude/org/${dir}/${f}`.split(path.sep).join('/')] = render(fs.readFileSync(path.join(srcOrg, dir, f), 'utf8'), rutas);
    }
  }
  out['.claude/org/README.md'] = fs.readFileSync(path.join(srcOrg, 'README.md'), 'utf8');
  out['.claude/org/sync.mjs'] = fs.readFileSync(path.join(srcOrg, 'sync.mjs'), 'utf8');
  return { out, rutas };
}

function git(args, cwd) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }

function findSource(repo, from) {
  const cands = [from, process.env.ORG_SKILLS_DIR, path.resolve(repo, '..', 'skills'), path.join(os.homedir(), '.cache', 'msagbini-skills')].filter(Boolean);
  for (const c of cands) if (fs.existsSync(path.join(c, 'org', 'agentes'))) return c;
  const cache = path.join(os.homedir(), '.cache', 'msagbini-skills');
  git(['clone', '--depth', '1', REMOTE, cache]);
  return cache;
}

function refresh(src) {
  try { if (!git(['status', '--porcelain'], src)) git(['pull', '--ff-only', '-q'], src); } catch { /* sin red: se usa lo que hay */ }
}

function main() {
  const a = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const repo = path.resolve(opt('--repo') || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const cfgPath = path.join(repo, '.claude', 'org.json');
  if (!fs.existsSync(cfgPath)) { console.error('org: falta .claude/org.json en', repo); process.exit(2); }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  let src;
  try { src = findSource(repo, opt('--from')); } catch (e) { console.error('org: no llego a msagbini/skills (sin red?). Quedan las copias del repo.'); process.exit(a.includes('--check') ? 1 : 0); }
  if (!opt('--from') && !a.includes('--promote')) refresh(src);
  const srcOrg = path.join(src, 'org');
  const { out, rutas } = plan(srcOrg, cfg);
  const lockPath = path.join(repo, '.claude', 'org', 'lock.json');
  const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) : { files: {} };
  const read = (rel) => { const p = path.join(repo, rel); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };
  // Editado acá desde la última sincronización = entrenamiento local sin promover.
  const trained = Object.keys(lock.files).filter((rel) => { const t = read(rel); return t != null && sha(t) !== lock.files[rel]; });

  if (a.includes('--promote')) {
    // Archivos nuevos (una propuesta, un cuaderno) también se promueven.
    for (const dir of ['conocimiento', 'comunidad']) {
      const base = path.join(repo, '.claude', 'org', dir);
      if (!fs.existsSync(base)) continue;
      for (const f of fs.readdirSync(base, { recursive: true }).map(String)) {
        const rel = `.claude/org/${dir}/${f}`.split(path.sep).join('/');
        if (!fs.statSync(path.join(base, f)).isDirectory() && !(rel in lock.files) && !trained.includes(rel)) trained.push(rel);
      }
    }
    const done = [];
    const rechazados = [];
    for (const rel of trained) {
      if (rel.startsWith('.claude/org/')) {
        const sub = rel.slice('.claude/org/'.length);
        const dest = path.join(srcOrg, sub);
        if (APPEND_ONLY.test(sub) && fs.existsSync(dest) && !soloAgrega(fs.readFileSync(dest, 'utf8'), unrender(read(rel), rutas))) {
          rechazados.push(rel); continue;
        }
      }
      const local = read(rel);
      let dest;
      if (rel.startsWith('.claude/agents/')) { dest = path.join(srcOrg, 'agentes', path.basename(rel)); fs.writeFileSync(dest, stripAgent(local, rutas)); }
      else if (/^\.claude\/org\/(conocimiento|firma|comunidad)\//.test(rel)) { dest = path.join(srcOrg, rel.slice('.claude/org/'.length)); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, unrender(local, rutas)); }
      else continue;
      done.push(path.relative(src, dest));
    }
    if (rechazados.length) { console.error('org: rechazado (borra o reescribe lo de otro; la carta pide agregar al final con una nota):\n  ' + rechazados.join('\n  ')); process.exitCode = 1; }
    if (!done.length) { console.log('org: nada que promover.'); return; }
    console.log('org: promovido a la fuente:\n  ' + done.join('\n  '));
    if (a.includes('--push')) {
      const branch = `aprendizaje/${cfg.proyecto || path.basename(repo)}-${new Date().toISOString().slice(0, 10)}`;
      git(['checkout', '-B', branch], src); git(['add', 'org'], src);
      git(['commit', '-qm', `org: aprendizaje desde ${cfg.proyecto || path.basename(repo)}`], src);
      git(['push', '-u', 'origin', branch], src);
      console.log(`org: rama ${branch} subida; abrir PR en msagbini/skills.`);
    }
    return;
  }

  const bloquePath = path.join(srcOrg, 'bloque-claude-md.md');
  if (fs.existsSync(bloquePath)) out['CLAUDE.md'] = upsertBlock(read('CLAUDE.md') || '', fs.readFileSync(bloquePath, 'utf8'));
  const drift = Object.keys(out).filter((rel) => read(rel) !== out[rel]);
  if (a.includes('--check')) {
    if (drift.length) { console.error('org: desactualizado o entrenado sin promover:\n  ' + drift.join('\n  ')); process.exit(1); }
    console.log('org: al día'); return;
  }
  let rev = '?'; try { rev = git(['rev-parse', '--short', 'HEAD'], src); } catch {}
  const newLock = { fuente: `msagbini/skills@${rev}`, files: {} };
  for (const [rel, text] of Object.entries(out)) {
    if (rel === 'CLAUDE.md') { if (read(rel) !== text) fs.writeFileSync(path.join(repo, rel), text); continue; }
    if (trained.includes(rel)) { console.warn(`org: ${rel} tiene entrenamiento local sin promover; no lo piso (corré --promote).`); newLock.files[rel] = lock.files[rel]; continue; }
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    if (read(rel) !== text) fs.writeFileSync(path.join(repo, rel), text);
    newLock.files[rel] = sha(text);
  }
  fs.writeFileSync(lockPath, JSON.stringify(newLock, null, 2) + '\n');
  console.log(`org: ${drift.length} archivo(s) actualizados desde ${newLock.fuente}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
