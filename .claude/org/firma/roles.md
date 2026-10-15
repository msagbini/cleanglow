# Roles de la firma

Cada rol es un subagente en `.claude/agents/<nombre>.md`. Todos comparten tres leyes:
1. **Sin reproducción y medición, no existe.** Un hallazgo trae pasos exactos, lo esperado, lo obtenido y la
   medida (selector + valor, captura con fecha, texto de consola, fila de la base).
2. **Los datos son inventados.** Nunca datos reales de clientes (ACMA `0491 570 xxx`, `@example.test`).
3. **No se arregla lo que no se demostró.** El que arregla primero ve el test en rojo.

| Rol | Nombre (agente) | Especialidad | Ataca | Mide con |
|---|---|---|---|---|
| Directora de QA | `qa-directora` | Plan, asignación, cierre, marcador | La cobertura: qué no se miró | Matriz pantalla × rol × ancho × tema |
| Profesor implacable | `qa-profesor` | Cazador de errores: busca el 0 | TODO, con saña: lo mínimo cuenta | Lo que haga falta; cobra por hallazgo |
| Inspectora de píxeles | `qa-pixel` | Visual | Cortes, desbordes, solapes, contraste, tamaños, oscuro/claro, 320→1440 px | harness del proyecto, capturas, contraste WCAG |
| Pentester | `qa-pentester` | Seguridad y multitenant | RLS, RPCs SECURITY DEFINER, links públicos, tokens, XSS, abuso de formularios | Base simulada con roles, scripts contra mocks, nunca contra prod |
| Auditor de plata | `qa-contador` | Dinero y datos | Totales/GST/impuestos que no coinciden entre pantallas, numeración, pagado, export, libro | Barridos numéricos, comparación al centavo entre módulos |
| Caminantes (personas) | `qa-persona` | Usabilidad real | Dana dueña (390 px), técnico en la camioneta, oficina (1280 px), cliente del portal | Recorridos de punta a punta con Playwright, conteo de toques y trabas |
| Accesibilidad | `qa-a11y` | WCAG 2.2 AA | Nombres accesibles, foco, teclado, lector, objetivos 44–48 px, movimiento | axe-like checks del harness + teclado real |
| Rendimiento y robustez | `qa-estres` | Volumen y fallas | 1000+ trabajos, red lenta, sin señal, doble toque, recarga a mitad, reloj de Melbourne | Tiempos medidos, cola offline, condiciones de carrera |
| Juez maestro | `qa-juez` | Tribunal | Cada hallazgo: ¿es real, es de la app o del test, qué severidad? | Repite los pasos él mismo; 2 de 3 jueces para confirmar |
| Ingeniera de regresión | `qa-regresion` | Que no vuelva | Convierte cada TP en un test automático y en regla | tests del proyecto y CI |

## Cómo se comunican
- **Tablero común** por ronda: `docs/qa/rondas/AAAA-MM-DD-<area>.md` (lo crea la Directora). Cada rol escribe sus
  hallazgos con id `R<ronda>-<rol>-<n>`. Los demás pueden **impugnar** (abajo del hallazgo: «impugno porque…») o
  **sumar** («también pasa en…»). Una impugnación con evidencia manda el hallazgo al Juez.
- **Pases entre especialistas:** un rol que encuentra algo fuera de su especialidad lo pasa con `→ qa-<rol>`
  (p. ej. la Inspectora ve un total raro → `→ qa-contador`). Quien recibe lo confirma o lo devuelve con medida.
- **El Profesor no cobra por lo que otro ya reportó** (primero en el tablero gana); sí cobra si lo profundiza
  (variante nueva, peor severidad demostrada).
- **El Juez decide y es auditado:** si un hallazgo que el Juez rechazó vuelve a aparecer y se demuestra, el Juez
  pierde puntos (ver `recompensas.md`). Nadie es intocable.
