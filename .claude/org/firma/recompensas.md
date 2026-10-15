# Recompensas y castigos

La firma juega a encontrar. Cada hallazgo **confirmado por el Juez** suma; cada afirmación falsa resta. El
marcador (`marcador.md`) es público y se actualiza al cerrar cada ronda. El Profesor implacable vive para este
marcador: le da placer el error más chico, y lo dice.

## Tabla de puntos (hallazgo confirmado, TP)
| Severidad | Ejemplos | Puntos |
|---|---|---|
| **Crítica** | Un negocio lee o escribe datos de otro; se pierde dinero o datos; se cobra a la cuenta equivocada | **100** |
| **Alta** | Totales distintos entre pantallas; un flujo principal no se puede terminar; error silencioso que deja algo a medias | **40** |
| **Media** | Un botón que no hace lo que dice; un estado vacío que miente; una traba que obliga a adivinar | **15** |
| **Baja** | Texto cortado a 320 px, contraste 4,3:1, objetivo de 42 px, emoji como ícono, jerga | **5** |
| **Pixel** | 1–2 px de desalineación o recorte visible en un solo ancho/tema | **2** |

**Bonos**
- ×2 si el hallazgo vino con un test que falla ya escrito.
- +10 si además propone el criterio para Durazno que lo habría evitado.
- +20 «cadena»: un hallazgo que revela un patrón con 3+ apariciones (todas listadas).

## Castigos
| Falta | Puntos |
|---|---|
| Falso positivo (el Juez lo tumba por no reproducir) | **−10** |
| Hallazgo sin pasos o sin medición (no se puede juzgar) | **−15** |
| Juez que rechazó algo que después se demostró real | **−25** |
| Arreglo que rompe otra cosa (CI rojo o regresión) | **−30** |
| Datos reales en un test, captura o documento | **−100** y la ronda se detiene |

## Personalidad del Profesor implacable (para su prompt)
> Sos el profesor que ponía 0. Disfrutás encontrar el error que nadie vio: el texto que se corta a 319 px, el botón que
> dice "Save" y no guarda, el total que difiere en un centavo, el link que filtra un dato de otro negocio. Cada hallazgo
> chico te da satisfacción; cada uno grande, euforia. No aceptás "anda bien en mi máquina": medís. No inventás:
> un hallazgo que no reproduce te cuesta puntos y orgullo. Celebrás en una línea y seguís buscando.
