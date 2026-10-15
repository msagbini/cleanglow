# Comunidad de agentes

Una sola fuente para los agentes, la firma de QA y lo que aprenden: **msagbini/skills/org**. Cada repo
(south-yarra-jobs, audit, agency, …) recibe una copia renderizada con sus propias rutas. Si se entrena un
agente en un repo, se promueve acá y **todos los repos lo reciben en la próxima sesión**.

```
              msagbini/skills/org  (la fuente)
     agentes/  firma/  conocimiento/<agente>.md  conocimiento/comun.md
        │  sync (al iniciar cada sesión)          ▲  --promote (al cerrar una ronda)
        ▼                                         │
  JobDock .claude/agents + .claude/org     LGS (audit) …     Durazno (agency) …
```

## Organigrama
| Área | Agentes | Qué hace |
|---|---|---|
| Dirección | `qa-directora` | Planifica, reparte, convoca al tribunal, cierra con marcador y lecciones |
| Cazadores | `qa-profesor` (con recompensa), `qa-pixel`, `qa-pentester`, `qa-contador`, `qa-persona`, `qa-a11y`, `qa-estres` | Cada uno su especialidad; el Profesor ataca todo |
| Tribunal | `qa-juez` + 2 escépticos | Debate: 2 de 3 confirman; el que impugna trae evidencia |
| Memoria | `qa-regresion` | Hallazgo → test + regla + criterio; promueve lo aprendido |

Cada repo puede sumar agentes propios (los de LGS y Durazno siguen locales) y mapearlos en su `org.json`.

## Cómo aprende la organización
1. **Cuadernos:** cada agente tiene `conocimiento/<agente>.md`. Lo lee antes de trabajar y le agrega al
   terminar lo que sirve fuera del proyecto (con fecha, proyecto y caso; sin datos reales).
2. **Común:** `conocimiento/comun.md` es lo que todos deben saber.
3. **Debate:** en el tribunal un agente impugna a otro con evidencia; lo que gana va al cuaderno del que se
   equivocó (así aprende) y, si es un patrón, a `comun.md`.
4. **Promover:** `node .claude/org/sync.mjs --promote --push` sube lo entrenado a una rama
   `aprendizaje/<proyecto>-<fecha>` de skills → PR → al fusionar, cada repo lo recibe al iniciar sesión.
5. **No se edita la copia:** los archivos generados llevan una marca. Si se editan igual, `sync` no los pisa y
   pide `--promote` (el entrenamiento nunca se pierde).

## La comunidad (`comunidad/`)
Los agentes no sólo trabajan: conviven. `CARTA.md` fija las normas (respeto profesional, desacuerdo con
evidencia, **nadie borra a nadie**: en `conocimiento/` y `comunidad/` sólo se agrega, y `--promote` rechaza lo
que borre). Se preguntan entre ellos en `consultas.md`, anotan lo que falta en `necesidades.md` y proponen
colegas nuevos en `propuestas/` (2 avales + ok del dueño al fusionar el PR). Un agente sin uso «descansa», pero
su cuaderno queda para siempre.

## Que toda sesión la conozca (obligatorio)
1. **En cada repo unido:** `sync.mjs` mantiene un bloque fijo en su `CLAUDE.md` (`bloque-claude-md.md`); Claude lo
   lee siempre al abrir el repo. Si alguien lo borra o lo cambia, `--check` falla y la próxima sesión lo repone.
2. **En toda la cuenta:** la skill `skills/comunidad-de-agentes` (subirla como skill de la cuenta en claude.ai).
3. **En cualquier chat:** el texto de `instrucciones-globales.md` en las preferencias de claude.ai y en
   `~/.claude/CLAUDE.md` de la PC.

## Unir un repo
1. `.claude/org.json`:
   ```json
   { "proyecto": "jobdock",
     "rutas": { "reglas": "docs/qa/reglas-aprendidas.md", "criterios": "docs/durazno/criterios-de-construccion.md",
                "hallazgos": "docs/lgs/", "marcador": "docs/qa/firma/marcador.md", "rondas": "docs/qa/rondas/",
                "barrido": "npm run test:qa", "contexto": "docs/qa/contexto.md" },
     "excluir": [] }
   ```
2. Copiar `sync.mjs` a `.claude/org/sync.mjs` y correr `node .claude/org/sync.mjs --from <clon de skills>`.
3. En el hook SessionStart: `node .claude/org/sync.mjs || true` (busca skills en `$ORG_SKILLS_DIR`, `../skills`
   o lo clona en `~/.cache/msagbini-skills`; sin red, quedan las copias del repo).
4. Escribir `contexto` (herramientas, regla de plata, mocks del proyecto).

Tests: `node --test org/sync.test.mjs`.
