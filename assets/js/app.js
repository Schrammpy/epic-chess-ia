/* ===========================================================
   Narrador Épico — app.js
   Lógica de generación (LM Studio), heurísticas y UI helpers
   =========================================================== */

(() => {
  "use strict";

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const $pgn = $("pgn");
  const $style = $("style");
  const $words = $("words");

  // Los siguientes pueden NO existir si ocultaste “Configuración avanzada”
  const $base = $("baseUrl");
  const $model = $("model");
  const $temp = $("temp");
  const $topP = $("topP");
  const $maxTok = $("maxTok");

  const $btnGo = $("btnGo");
  const $btnCopy = $("btnCopy");
  const $btnSave = $("btnSave");
  const $status = $("status");
  const $out = $("out");
  const $langBadge = $("langBadge");

  // ---------- Config por defecto (se usan si no hay campos avanzados) ----------
  const DEFAULTS = {
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "meta-llama-3.1-8b-instruct",
    temperature: 0.8,
    top_p: 0.9,
    max_tokens_cap: 1100,
  };
  const ENDPOINTS = { chat: "/chat/completions", text: "/completions" };
  const AUTH = "Bearer lm-studio";

  // ---------- Idioma UI ----------
  function detectUILang() {
    let l =
      (navigator.languages && navigator.languages[0]) ||
      navigator.language ||
      "en";
    l = (l || "en").toLowerCase();
    const map = {
      "es-ar": "español rioplatense",
      "es-uy": "español rioplatense",
      "es-es": "español (España)",
      "es-mx": "español (México)",
      es: "español",
      "en-us": "inglés (EE. UU.)",
      "en-gb": "inglés (Reino Unido)",
      en: "inglés",
      "pt-br": "portugués (Brasil)",
      "pt-pt": "portugués (Portugal)",
      pt: "portugués",
      fr: "francés",
      it: "italiano",
      de: "alemán",
      pl: "polaco",
      cs: "checo",
      sk: "eslovaco",
      ru: "ruso",
      uk: "ucraniano",
      tr: "turco",
      nl: "neerlandés",
      sv: "sueco",
      no: "noruego",
      da: "danés",
      fi: "finés",
      el: "griego",
      hu: "húngaro",
      ro: "rumano",
      bg: "búlgaro",
      "zh-cn": "chino simplificado",
      "zh-tw": "chino tradicional",
      ja: "japonés",
      ko: "coreano",
      ar: "árabe",
      he: "hebreo",
      hi: "hindi",
      id: "indonesio",
      vi: "vietnamita",
      th: "tailandés",
    };
    const name = map[l] || map[l.split("-")[0]] || "inglés";
    return { langCode: l, langName: name };
  }
  const DETECT = detectUILang();
  if ($langBadge) {
    $langBadge.textContent = `Idioma detectado: ${DETECT.langName} (${DETECT.langCode})`;
  }

  // ---------- Utils ----------
  const join = (u, p) => u.replace(/\/$/, "") + (p ? (p[0] === "/" ? "" : "/") + p : "");
  const toast = (msg) => ($status ? ($status.textContent = msg) : void 0);
  const lockUI = (bool) => {
    if ($btnGo) $btnGo.disabled = bool;
  };
  const normalize = (raw) =>
    (raw || "").replace(/[\t ]+/g, " ").replace(/\s*\n+\s*/g, "\n").trim();
  const stripHeaders = (s) =>
    s.split("\n").filter((line) => !line.trim().startsWith("[")).join("\n");
  const countWords = (t) => (t.trim().match(/\S+/g) || []).length;

  // ---------- Heurística suave (sin cortes duros) ----------
  function estimateFromRecord(src) {
    const s = stripHeaders(src);
    const tokens = s.replace(/\{[^}]*\}/g, "");
    const parts = tokens.split(/\s+/).filter(Boolean);

    let maxMove = 0;
    for (const t of parts) {
      if (/\d+\./.test(t)) {
        const n = parseInt(t, 10);
        if (!isNaN(n) && n > maxMove) maxMove = n;
      }
    }
    const captures = (tokens.match(/x/g) || []).length;
    const checks = (tokens.match(/\+/g) || []).length;
    const mates = (tokens.match(/#/g) || []).length;
    const castles3 = (tokens.match(/O-O-O/g) || []).length;
    const castles2 = (tokens.match(/O-O/g) || []).length;
    const castles = castles3 + Math.max(0, castles2 - castles3 * 2);
    const promos = (tokens.match(/=/g) || []).length;
    const isDraw = /1\/2-1\/2|½-½/.test(tokens);

    let base =
      110 +
      22 * maxMove +
      10 * checks +
      6 * Math.min(12, captures) +
      20 * mates +
      8 * castles +
      10 * promos;
    if (isDraw) base *= 0.9;

    const words = Math.round(Math.max(140, Math.min(900, base)));
    return { maxMove, captures, checks, mates, castles, promos, isDraw, words };
  }
  function pickWords(userVal, stats) {
    const v = (userVal ?? "").toString().trim().toLowerCase();
    if (!v || v === "auto") return stats.words;
    const n = parseInt(v, 10);
    return isNaN(n) || n < 80 ? stats.words : n;
  }

  // ---------- Prompts ----------
  function buildSystemPrompt(langName, bcp47) {
    return [
      "Sos un cronista que ESTUVO en el campo de batalla y narra en primera persona.",
      `Escribí SIEMPRE en ${langName} (BCP-47: ${bcp47}).`,
      "Devolvés ÚNICAMENTE la narración en prosa: sin títulos, listas, notas, código ni explicaciones.",
      "PROHIBIDO nombrar o insinuar el juego de mesa o su jerga (ajedrez, tablero, pieza, jugada, notación, coordenadas, rey/reina/dama/peón/alfil/torre/caballo, blancas/negras).",
      "Si se escapa un término vetado, reescribí ESA oración usando metáforas (soberano, alta señora, capitanes, caballeros, murallas, torres de piedra, lanceros, estandartes del alba o de la sombra).",
      "Ritmo sugerido: apertura tensa → escaramuzas y avances → sacrificios/engaños → asalto final y caída del soberano (o tregua).",
      "Mostrá, no expliques: sonidos (cascos, acero), olores (cuero, polvo, humo), tacto (sudor, vibración del suelo), miradas y dudas. Breves apartes de testimonio (“juro que…”).",
      "Ajustá la extensión al registro y CERRÁ SIEMPRE la escena con 1–2 frases redondas.",
      "Prohibido: “debemos”, “necesitamos”, “voy a”, “esta tarea”, “según el PGN”. Si empezás a explicar la consigna, frená y seguí narrando como testigo.",
    ].join(" ");
  }
  const FEWSHOT_USER =
    "Lista breve de movimientos: 1. e4 e5 2. Nf3 Nc6\n\nEscribí un micro-párrafo (3–4 frases) en el estilo indicado: solo prosa épica medieval, sin títulos ni notas.";
  const FEWSHOT_ASSISTANT =
    "Al alba juro que el suelo vibró bajo los cascos. Un joven caballero cruzó la linde con la lanza baja y el aire se llenó de polvo y metal. Del otro lado, una guardia plantó el escudo y respondió con igual temple, clavando la bota en la tierra. En ese suspiro de acero entendimos que la calma había terminado.";

  // Paradas: evitar meta y bloques de código (no bloquear palabras narrativas)
  const STOP = ["```", "We need", "Your task", "In this task", "Debemos", "Necesitamos"];

  function purify(t) {
    let x = t || "";
    while (x.includes("```")) {
      const a = x.indexOf("```");
      const b = x.indexOf("```", a + 3);
      if (b < 0) break;
      x = x.slice(0, a) + x.slice(b + 3);
    }
    const starters = ["We need", "We must", "Your task", "In this task", "Debemos", "Necesitamos", "Movimientos", "PGN", "FEN"];
    for (const s of starters) {
      if (x.trim().startsWith(s)) {
        x = x.trim().slice(s.length);
        break;
      }
    }
    return x.trim();
  }
  // Saneador de jerga por si se filtra
  function enforceStyle(text) {
    const map = [
      [/\bajedrez\b|\btablero\b|\bpieza(s)?\b/gi, ""],
      [/\bjugada(s)?\b|\bnotación\b|\bcoordenadas\b/gi, ""],
      [/\bjaque( mate)?\b|\benroque\b/gi, ""],
      [/\brey(es)?\b/gi, "soberano"],
      [/\breina(s)?\b|\bdama(s)?\b/gi, "alta señora"],
      [/\bpeón(es)?\b/gi, "soldado raso"],
      [/\btorre(s)?\b/gi, "torres de piedra"],
      [/\balfil(es)?\b/gi, "guardia consagrada"],
      [/\bcaballo(s)?\b|\bjinete(s)?\b/gi, "caballeros"],
      [/\bblancas?\b|\bnegras?\b/gi, "estandartes"],
    ];
    let out = text || "";
    for (const [re, rep] of map) out = out.replace(re, rep);
    return out.trim();
  }

  // Mensajería → prompt plano para /completions
  function renderPrompt(msgs) {
    let out = "";
    for (const m of msgs) {
      if (!m || !m.content) continue;
      const hdr = m.role === "system" ? "[SYSTEM]" : m.role === "assistant" ? "[ASSISTANT]" : "[USER]";
      out += hdr + "\n" + m.content + "\n\n";
    }
    return out + "[ASSISTANT]\n";
  }

  // ---------- Cliente LM Studio ----------
  async function callChat(base, model, messages, temperature, top_p, max_tokens) {
    const body = { model, messages, temperature, top_p, max_tokens, stop: STOP };
    const res = await fetch(join(base, ENDPOINTS.chat), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: AUTH },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    return { ok: res.ok, status: res.status, txt };
  }
  async function callCompletions(base, model, messages, temperature, top_p, max_tokens) {
    const body = { model, prompt: renderPrompt(messages), temperature, top_p, max_tokens, stop: STOP };
    const res = await fetch(join(base, ENDPOINTS.text), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: AUTH },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    return { ok: res.ok, status: res.status, txt };
  }

  // Asegurar cierre si quedó corto o sin punto final
  async function ensureClosing(base, model, text, temperature, top_p) {
    const closed = /[.!?…]\s*$/.test(text);
    if (closed && countWords(text) > 90) return text;

    const ask =
      "Escribí 1 o 2 ORACIONES finales que rematen y cierren la escena, manteniendo la primera persona y el tono épico medieval, sin mencionar juegos de mesa ni su jerga.";
    let r = await callChat(
      base,
      model,
      [
        { role: "system", content: "Devolvés SOLO las oraciones finales, sin prólogo ni lista." },
        { role: "user", content: ask + "\n\nTexto previo:\n" + text },
      ],
      temperature,
      top_p,
      180
    );
    if (!r.ok && (r.status === 404 || r.status === 405)) {
      r = await callCompletions(
        base,
        model,
        [
          { role: "system", content: "Devolvés SOLO las oraciones finales, sin prólogo ni lista." },
          { role: "user", content: ask + "\n\nTexto previo:\n" + text },
        ],
        temperature,
        top_p,
        180
      );
    }
    let extra = r.txt;
    try {
      const d = JSON.parse(r.txt);
      extra = (d.choices?.[0]?.message?.content || d.choices?.[0]?.text || "").trim();
    } catch {}
    extra = enforceStyle(purify(extra || ""));
    if (!extra) return text;
    return (text.trim() + (text.trim().endsWith(".") ? " " : " ") + extra).trim();
  }

  // ---------- Generate ----------
  async function generate() {
    const raw = normalize($pgn?.value);
    if (!raw) {
      toast("Pegá una lista corta, PGN o FEN.");
      return;
    }

    const base = ($base?.value || DEFAULTS.baseUrl).replace(/\/$/, "");
    const model = ($model?.value || DEFAULTS.model).trim();
    const temperature = parseFloat($temp?.value || DEFAULTS.temperature);
    const top_p = parseFloat($topP?.value || DEFAULTS.top_p);
    const userMax = parseInt($maxTok?.value || DEFAULTS.max_tokens_cap, 10);

    const stats = estimateFromRecord(raw);
    const wordsAuto = pickWords($words?.value, stats);
    // tokens más generosos para evitar cortes prematuros
    const maxTokTarget = Math.max(360, Math.min(userMax, Math.round(wordsAuto * 2.4) + 140));

    const kind =
      raw.includes("/") && raw.split("/").length === 8
        ? "fen"
        : raw.includes("[Event")
        ? "pgnFull"
        : "movesOnly";
    const style = ($style?.value && $style.value.trim()) || "testigo presencial (recomendado)";
    const intro =
      kind === "fen"
        ? "Datos: posición inicial provista como FEN."
        : kind === "pgnFull"
        ? "Datos: registro completo con cabeceras y lista de movimientos."
        : "Datos: lista breve de movimientos (formato corto).";

    toast(
      `Analizado: ~${stats.maxMove} jugadas, x=${stats.captures}, +=${stats.checks}, #=${stats.mates}, O-O=${stats.castles}, promo=${stats.promos}. Objetivo ≈ ${wordsAuto} palabras.`
    );

    const sceneHint =
      stats.maxMove <= 6
        ? "Una sola escena cerrada, sin prólogo ni epílogo. Si te acercás al límite, comprimí y cerrá en 1–2 frases."
        : "Podés desplegar 1–2 giros, pero cerrá con decisión.";

    const userMsg =
      intro +
      "\n\nContenido:\n" +
      raw +
      "\n\n" +
      "Estilo: " +
      style +
      ". Extensión objetivo: " +
      wordsAuto +
      " palabras aprox. " +
      "No superes " +
      wordsAuto +
      " palabras; si te acercás al límite, cerrá con una imagen final. " +
      sceneHint +
      " Entregá únicamente la crónica (prosa continua, sin explicaciones).";

    const messages = (function () {
      const arr = [{ role: "system", content: buildSystemPrompt(DETECT.langName, DETECT.langCode) }];
      if (DETECT.langCode.startsWith("es")) {
        arr.push({ role: "user", content: FEWSHOT_USER }, { role: "assistant", content: FEWSHOT_ASSISTANT });
      }
      arr.push({ role: "user", content: userMsg });
      return arr;
    })();

    lockUI(true);
    if ($out) $out.textContent = "";

    try {
      // intento 1: chat
      let r = await callChat(base, model, messages, temperature, top_p, maxTokTarget);
      // fallback: /completions
      if (!r.ok && (r.status === 404 || r.status === 405)) {
        toast("Servidor sin /chat/completions. Probando /completions…");
        r = await callCompletions(base, model, messages, temperature, top_p, maxTokTarget);
      }
      if (!r.ok) {
        throw new Error("HTTP " + r.status + " — " + r.txt.slice(0, 160));
      }

      // parse
      let data;
      try {
        data = JSON.parse(r.txt);
      } catch {
        data = { choices: [{ message: { content: r.txt } }] };
      }
      let text =
        (data.choices &&
          data.choices[0] &&
          (data.choices[0].message?.content || data.choices[0].text)) ||
        "";
      text = enforceStyle(purify((text || "").trim()));

      // compresión si excede ~20%
      let wc = countWords(text);
      if (wc > Math.round(wordsAuto * 1.2)) {
        const cap = wordsAuto;
        const lower = Math.max(120, Math.round(wordsAuto * 0.85));
        const rewrite =
          "Reducí y reescribí, manteniendo primera persona y tono épico medieval, a no más de " +
          cap +
          " palabras (ideal: " +
          lower +
          "–" +
          cap +
          "). Sin prólogo ni epílogo. Texto:\n\n" +
          text;

        let r2 = await callChat(
          base,
          model,
          [
            { role: "system", content: "Sos un editor que devuelve SOLO prosa en el mismo idioma." },
            { role: "user", content: rewrite },
          ],
          temperature,
          top_p,
          Math.max(240, Math.min(700, Math.round(cap * 1.4)))
        );
        if (!r2.ok && (r2.status === 404 || r2.status === 405)) {
          r2 = await callCompletions(
            base,
            model,
            [
              { role: "system", content: "Sos un editor que devuelve SOLO prosa en el mismo idioma." },
              { role: "user", content: rewrite },
            ],
            temperature,
            top_p,
            Math.max(240, Math.min(700, Math.round(cap * 1.4)))
          );
        }
        try {
          const d2 = JSON.parse(r2.txt);
          text = enforceStyle(
            purify((d2.choices?.[0]?.message?.content || d2.choices?.[0]?.text || "").trim())
          );
        } catch {
          text = enforceStyle(purify(r2.txt.trim()));
        }
      }

      // asegurar cierre si vino corto/abierto
      text = await ensureClosing(base, model, text, temperature, top_p);

      if ($out) $out.textContent = text || "(sin contenido)";
      const ok = !!text;
      if ($btnCopy) $btnCopy.disabled = !ok;
      if ($btnSave) $btnSave.disabled = !ok;
      toast(ok ? "Listo ✅" : "Listo (sin contenido útil)");
      if ($out) $out.dataset.raw = $out.textContent || "";
    } catch (e) {
      console.error(e);
      toast("Error: " + (e.message || e.toString()) + ". Verificá que LM Studio esté RUNNING y CORS ON.");
    } finally {
      lockUI(false);
    }
  }

  async function copyOut() {
    const t = ($out?.textContent || "").trim();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      toast("Copiado al portapapeles 📋");
    } catch (e) {
      toast("No pude copiar (permisos del navegador).");
    }
  }

  function saveOut() {
    const t = ($out?.textContent || "").trim();
    if (!t) return;
    const blob = new Blob([t], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "relato-epico.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---------- Eventos ----------
  if ($btnGo) $btnGo.addEventListener("click", generate);
  if ($btnCopy) $btnCopy.addEventListener("click", copyOut);
  if ($btnSave) $btnSave.addEventListener("click", saveOut);

  // Enter rápido si el foco está en el textarea
  if ($pgn) {
    $pgn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        generate();
      }
    });
  }
})();
