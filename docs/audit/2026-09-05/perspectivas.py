#!/usr/bin/env python3
"""Post-proceso «3 votos de 5» sobre un informe de AuditQ.

AuditQ no trae este mecanismo (grep perspectiva|voto = 0 resultados), así que se
aplica aquí, fuera del repo de AuditQ, sobre el JSON que produce.

Regla: cada hallazgo de la tabla se evalúa desde 5 perspectivas — Negocio,
Usuario/UX, SEO, Técnica/Seguridad, Legal — con un voto sí/no ("¿es un
problema real que hay que corregir en esta web?") y un motivo de una línea.
Con menos de 3 votos afirmativos el hallazgo baja a `info` (peso 0 en la
puntuación de AuditQ); la severidad original se conserva en
`severity_original` y las 5 perspectivas quedan escritas en el propio
hallazgo. Nada se borra. Los hallazgos que NO están en la tabla se dejan
exactamente como los emitió AuditQ — en particular los que dependen del
propietario (GA4, Search Console) siguen contando.

La puntuación se recalcula con la misma función de AuditQ
(`agent.core.score_from_findings`), no con una fórmula propia.

Uso: python3 perspectivas.py informe.json [informe2.json ...]
     escribe <informe>.perspectivas.json junto a cada entrada.
"""
import json
import sys
from types import SimpleNamespace

sys.path.insert(0, "/home/user/audit")
from agent.core import score_from_findings  # noqa: E402

PERSPECTIVAS = ("Negocio", "Usuario/UX", "SEO", "Técnica/Seguridad", "Legal")

# id -> [(voto, motivo)] en el orden de PERSPECTIVAS. Evidencia citada donde la hay.
TABLA = {
    "conversion.cta.too_many": [
        (False, "Las 7 etiquetas son dos acciones: reservar (Book now / Book this size / Book my clean) y contactar (teléfono, email, Contact). No compiten entre sí."),
        (False, "Cada pantalla tiene un único CTA primario (Book now en cabecera y hero; Confirm & pay en el último paso). El teléfono y el email son canales de contacto, no llamadas a la acción rivales."),
        (False, "No aplica: el número de CTA no es una señal de posicionamiento."),
        (False, "No aplica."),
        (False, "No aplica."),
    ],
    "conversion.form.too_many_fields": [
        (False, "Los 13 campos son los necesarios para presupuestar y ejecutar una limpieza de fin de contrato (tamaño, extras, fecha, acceso, contacto, dirección). Quitar alguno obliga a una llamada posterior."),
        (False, "Es un asistente de 5 pasos con ≤5 campos visibles por paso, validación en línea y botón que anuncia el siguiente paso; AuditQ cuenta el <form> completo, no lo que ve el visitante en cada pantalla."),
        (False, "No aplica."),
        (False, "No aplica."),
        (False, "Minimización de datos: cada campo tiene una finalidad declarada en la política de privacidad; no se piden datos superfluos."),
    ],
    "conversion.popup.suspected_interstitial": [
        (False, "No hay interstitial: el 'modal' es la ventana de términos/privacidad que abre el visitante, y 'discount' es el campo de código promocional."),
        (False, "Medido con Playwright en 10 viewports × 2 páginas: ningún modal abierto al cargar (modalOpenOnLoad=false en las 20 mediciones, shots/despues.json)."),
        (False, "Google penaliza interstitials intrusivos al cargar; aquí no existe ninguno (misma medición)."),
        (False, "No aplica."),
        (False, "No aplica."),
    ],
    "backend.protocol.no_h3": [
        (False, "Sin impacto en negocio."),
        (False, "LCP < 2,5 s y Performance 98-100 ya con HTTP/2; HTTP/3 no cambia nada perceptible aquí."),
        (False, "No es factor de posicionamiento."),
        (False, "No corregible en código: el protocolo lo negocia el borde de Railway, no la app. Pendiente de comprobar en producción: curl -sI --http3 https://cleanglow.up.railway.app/ (Alt-Svc)."),
        (False, "No aplica."),
    ],
    "seo.robots.noindex": [
        (False, "La página post-pago lleva la referencia de la reserva en la URL: no debe aparecer en buscadores."),
        (False, "Nadie llega a ella buscando; solo tras pagar."),
        (False, "noindex + Disallow en robots.txt es exactamente lo correcto para un recibo; indexarla sería el error."),
        (False, "Correcto tal cual."),
        (False, "Mantener recibos fuera de los buscadores es una obligación de privacidad, no un fallo."),
    ],
    "conversion.trust.no_social_proof": [
        (False, "Solo aparece en el recibo post-pago y en las páginas de políticas: la persuasión ocurre en / y en las páginas de suburbio, que sí llevan garantía, seguro y ABN."),
        (False, "Un recibo o unos términos con testimonios serían ruido."),
        (False, "El recibo es noindex; las políticas se indexan por su contenido legal, no por prueba social."),
        (False, "No aplica."),
        (False, "No se inventan reseñas (ACL s.29); la prueba social real llegará vía business.reviews cuando existan."),
    ],
    "conversion.value.price_promised_not_shown": [
        (False, "Solo aparece en las páginas de políticas, que hablan de 'precio' al explicar cancelaciones y garantía; los precios están en / (tarjetas y cotizador) y en cada página de suburbio ('from $210')."),
        (False, "Nadie llega a /terms para conocer el precio; el enlace a la reserva está en cabecera y pie."),
        (False, "Las páginas con intención de compra (/ y suburbios) sí publican precios visibles y en Offer/AggregateOffer."),
        (False, "No aplica."),
        (False, "Los términos deben hablar de precio (cancelación, tarifas de espera) sin repetir la tarifa completa."),
    ],
}


def aplicar(report):
    findings = report["findings"]
    cambiados = 0
    for f in findings:
        votos = TABLA.get(f["id"])
        if not votos:
            continue
        si = sum(1 for v, _ in votos if v)
        f["perspectivas"] = [
            {"perspectiva": p, "voto": "sí" if v else "no", "motivo": m}
            for p, (v, m) in zip(PERSPECTIVAS, votos)
        ]
        f["votos_afirmativos"] = f"{si}/5"
        if si < 3 and f["severity"] != "info":
            f["severity_original"] = f["severity"]
            f["severity"] = "info"
            f["perspectivas_nota"] = (
                f"Rebajado a info por el criterio 3-de-5: {si} de 5 perspectivas lo consideran un problema real. "
                "Sigue a la vista para que el propietario pueda discutirlo.")
            cambiados += 1
    objetos = [SimpleNamespace(severity=f["severity"]) for f in findings]
    s = report["summary"]
    s["global_score_auditq"] = s.get("global_score")
    s["global_score"] = score_from_findings(objetos) if s.get("complete") else None
    s["by_severity"] = {k: sum(1 for f in findings if f["severity"] == k)
                        for k in ("critical", "high", "medium", "low", "info")}
    s["perspectivas_rebajados"] = cambiados
    report["perspectivas"] = {
        "criterio": "Un hallazgo baja a info si menos de 3 de 5 perspectivas (Negocio, Usuario/UX, SEO, Técnica/Seguridad, Legal) lo consideran un problema real. Post-proceso externo a AuditQ; severidad original conservada en severity_original.",
        "hallazgos_evaluados": sorted({f["id"] for f in findings if "perspectivas" in f}),
    }
    return report


def main(paths):
    for path in paths:
        with open(path, encoding="utf-8") as fh:
            report = json.load(fh)
        antes = (report["summary"].get("global_score"), dict(report["summary"]["by_severity"]))
        aplicar(report)
        out = path[:-5] + ".perspectivas.json" if path.endswith(".json") else path + ".perspectivas.json"
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2, ensure_ascii=False)
        s = report["summary"]
        print(f"{path.split('/')[-1]:32} AuditQ {antes[0]}/100 {antes[1]}  ->  {s['global_score']}/100 {s['by_severity']}  (rebajados: {s['perspectivas_rebajados']})")


if __name__ == "__main__":
    main(sys.argv[1:])
