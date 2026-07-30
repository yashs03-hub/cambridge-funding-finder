/**
 * A thin, two-provider wrapper for structured extraction.
 *
 * Provider is chosen by model name, so switching is an environment variable
 * rather than a rewrite:
 *
 *   EXTRACT_MODEL=gemini-2.5-pro   node scripts/extract-awards.mjs
 *   EXTRACT_MODEL=gpt-5.4          node scripts/extract-awards.mjs
 *
 * Keys are read from the environment and never written, logged or persisted.
 *
 * Both providers are asked for a strict schema. That matters less than it
 * looks: schema conformance only guarantees the SHAPE of a record, never its
 * truth. The actual guarantee comes from scripts/verify-evidence.mjs, which
 * re-fetches the source page and rejects any record whose evidence_quote is
 * not genuinely on it. The model proposes; the source page decides.
 */

const TIMEOUT_MS = 180_000;

/** Gemini wants an OpenAPI-ish subset: upper-case types, no additionalProperties. */
function toGeminiSchema(node) {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (node === null || typeof node !== 'object') return node;

  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'additionalProperties') continue;
    if (k === 'type') {
      // A JSON-Schema union like ['string','null'] has no Gemini equivalent;
      // take the concrete type and mark it nullable instead.
      if (Array.isArray(v)) {
        const concrete = v.find((t) => t !== 'null') ?? 'string';
        out.type = concrete.toUpperCase();
        if (v.includes('null')) out.nullable = true;
      } else {
        out.type = String(v).toUpperCase();
      }
      continue;
    }
    if (k === 'properties') {
      out.properties = Object.fromEntries(
        Object.entries(v).map(([pk, pv]) => [pk, toGeminiSchema(pv)]),
      );
      // Gemini emits properties in whatever order it likes unless told.
      out.propertyOrdering = Object.keys(v);
      continue;
    }
    out[k] = toGeminiSchema(v);
  }
  return out;
}

async function callGemini({ model, system, user, schema }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(schema),
        },
      }),
    },
  );

  const body = await res.json();
  if (body.error) throw new Error(`gemini: ${body.error.status} ${body.error.message}`);

  const cand = body.candidates?.[0];
  if (!cand) throw new Error('gemini: no candidate returned');
  if (cand.finishReason && cand.finishReason !== 'STOP') {
    throw new Error(`gemini: finishReason ${cand.finishReason}`);
  }

  const text = (cand.content?.parts ?? []).map((p) => p.text ?? '').join('');
  return { data: JSON.parse(text), usage: body.usageMetadata ?? {} };
}

async function callOpenAI({ model, system, user, schema }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'extraction', strict: true, schema },
      },
    }),
  });

  const body = await res.json();
  if (body.error) throw new Error(`openai: ${body.error.type} ${body.error.message}`);
  return {
    data: JSON.parse(body.choices[0].message.content),
    usage: body.usage ?? {},
  };
}

export function providerFor(model) {
  return /^gemini/i.test(model) ? 'gemini' : 'openai';
}

/** Generate a schema-conforming object. Retries transient failures only. */
export async function generateJSON({ model, system, user, schema, attempts = 3 }) {
  const call = providerFor(model) === 'gemini' ? callGemini : callOpenAI;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await call({ model, system, user, schema });
    } catch (err) {
      lastErr = err;
      // A quota or auth failure will not fix itself; stop immediately rather
      // than burning three identical requests and reporting the third.
      if (/quota|auth|api key|permission|invalid/i.test(err.message)) throw err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}
