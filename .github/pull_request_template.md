Probar lo que es un Pull-Request
## Resumen
Describe en 2–3 líneas el objetivo de este PR.

## Cambios principales
- [ ] Estructura base (HTML / CSS modular / JS)
- [ ] Integración LM Studio local (OpenAI-compatible)
- [ ] Heurística de extensión del relato (auto)
- [ ] Detección de idioma del navegador (BCP-47)
- [ ] Salvaguardas anti-jerga (sin mencionar el juego)
- [ ] Cierre garantizado de escena (si quedó corto)

## Cómo probar
1. Abrí index.html en el navegador.
2. Tené LM Studio corriendo en http://127.0.0.1:1234/v1 con CORS ON.
3. Pegá un PGN corto (p. ej. 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7# 1-0).
4. Tocá **Generar relato** y verificá que:
   - el texto respete el estilo elegido,
   - no mencione jerga del juego,
   - cierre la escena en 1–2 frases potentes.

## Checklist
- [ ] Texto sin meta-explicaciones ni bloques de código.
- [ ] No se nombran “ajedrez”, “tablero”, “piezas”, colores literales, etc.
- [ ] Longitud acorde a la complejidad del registro.
- [ ] Funciona con /chat/completions y fallback /completions.

## Notas
- Se mantiene MODELO por defecto: meta-llama-3.1-8b-instruct.
- Para producción se podrá conmutar a API de GPT con mínimo cambio.
