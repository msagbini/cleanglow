# Firma de QA · LGS Labs

Una empresa de testeo hecha de agentes. Ningún humano tiene que meterle mano al código para encontrar lo que está mal:
la firma lo encuentra, lo demuestra, lo prioriza y le pasa a Durazno (el que construye) un caso que se puede
reproducir y una regla para que no vuelva a pasar.

**Dos lados, un ciclo:**

```
   Durazno (construye)                         LGS Labs (audita)
   criterios ANTES de escribir  ──────────▶   la firma ataca lo construido
   docs/qa/reglas-aprendidas.md (y los criterios de Durazno en msagbini/agency docs/criterios-previos-lgs.md)   .claude/org/firma/roles.md
            ▲                                            │
            │   regla nueva + test que la vigila         │ hallazgo confirmado (TP)
            └──────── docs/qa/reglas-aprendidas.md ◀─────┘
                       docs/qa/AAAA-MM-DD-*.md
```

Cada hallazgo confirmado termina en tres lugares: un **test** que lo vigila, una **regla** en
`docs/qa/reglas-aprendidas.md` (para LGS) y, si se pudo prevenir al construir, un **criterio** en
`docs/qa/reglas-aprendidas.md (y los criterios de Durazno en msagbini/agency docs/criterios-previos-lgs.md)` (para Durazno). Así el mismo error no paga dos veces.

## Archivos
| Archivo | Para qué |
|---|---|
| `roles.md` | Quién es quién: especialidad, qué ataca, cómo mide, con quién habla |
| `protocolo.md` | Cómo trabaja la firma: ronda, comunicación entre roles, jueces, desempates |
| `recompensas.md` | Tabla de puntos del cazador y del resto: lo que vale cada hallazgo y lo que resta |
| `marcador.md` | Puntos acumulados por rol y por ronda (lo actualiza la Directora al cerrar) |
| `../reglas-aprendidas.md` | Registro de reglas (id, cómo detectar, cómo medir, origen, historial TP/FP) |
| `../../durazno/criterios-de-construccion.md` | Lo que Durazno cumple ANTES de que LGS mire |
| `.claude/agents/*.md` | Los roles como subagentes de Claude Code (se llaman por nombre) |

## Cómo se usa (en cualquier proyecto)
1. Unirse a la organización: ver `org/README.md` en msagbini/skills (un `.claude/org.json` y `node .claude/org/sync.mjs`).
2. Pedir: «corré una ronda de la firma sobre <área o todo>» → la Directora arma el plan con `protocolo.md`.
3. Al cerrar: hallazgos confirmados → arreglos con test en rojo→verde → reglas y criterios nuevos → marcador.
