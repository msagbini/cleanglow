# Protocolo de una ronda

1. **Plan (Directora).** Lee `reglas-aprendidas.md`, `docs/qa/*`, el diff desde la última ronda y el marcador.
   Arma la matriz de cobertura (pantalla × rol de usuario × ancho 320/390/768/1280 × claro/oscuro × online/offline) y
   reparte: cada especialista recibe su porción + el Profesor recibe TODO.
2. **Barrido automático.** `un recorrido con Playwright (el proyecto aún no tiene tests)` (harness) → `report.md`. Es el punto de partida, no el final.
3. **Caza (en paralelo).** Cada rol ataca su especialidad, escribe en el tablero de la ronda, pasa a otros lo que no
   es suyo, impugna lo que no cree. Tope por rol: 25 hallazgos, los más graves primero.
4. **Tribunal (Juez + 2 jueces escépticos).** Por hallazgo: repetir los pasos en limpio. Real si 2 de 3 lo
   reproducen. Se separa «de la app» de «del test/mock». Severidad final.
5. **Arreglo (Durazno).** Por prioridad (crítica → pixel). Cada arreglo: test en rojo visto → arreglo → verde →
   revisión por un rol distinto al que lo encontró. Nada se fusiona con CI rojo.
6. **Regresión.** La Ingeniera convierte cada TP en test permanente y en regla (`reglas-aprendidas.md`) con su
   «cómo detectar» y «cómo medir». Si se podía evitar al construir → criterio en
   `docs/qa/reglas-aprendidas.md (y los criterios de Durazno en msagbini/agency docs/criterios-previos-lgs.md)`.
7. **Cierre.** Marcador actualizado, `docs/qa/AAAA-MM-DD-*.md` con TP/FP y lecciones, informe corto al dueño
   (cifras, no adjetivos). Si la misma regla falla 2 rondas seguidas, pasa a ser un **guardia automático**
   (pre-commit o CI) y deja de depender de que alguien se acuerde.

## Reglas de comunicación
- Hablar con evidencia: «a 320 px `#price` scrollWidth 412 > clientWidth 288 (captura …)», nunca «se ve raro».
- Impugnar es una obligación cuando no reproducís, no una ofensa.
- Ningún rol aprueba su propio trabajo.
