export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const {
      message,
      language = "es",
      business = {},

      // compatibilidad con tu versión anterior, por si algo viejo sigue mandando chatHistory
      chatHistory,
    } = req.body || {};

    const userMessage =
      typeof message === "string" && message.trim()
        ? message.trim()
        : extractLastUserMessage(chatHistory);

    if (!userMessage) {
      return res.status(400).json({
        error: "Missing message",
      });
    }

    const provider = process.env.AI_PROVIDER || "gemini";

    if (provider === "openai") {
      const reply = await askOpenAI({
        message: userMessage,
        language,
        business,
      });

      return res.status(200).json({ reply });
    }

    const reply = await askGemini({
      message: userMessage,
      language,
      business,
    });

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("[api/chat]", error);

    return res.status(500).json({
      error: "AI request failed",
    });
  }
}

/* ═══════════════════════════════════════════════════════════
   GEMINI
   Usa GEMINI_API_KEY desde .env.local o Vercel Environment Variables
   ═══════════════════════════════════════════════════════════ */

async function askGemini({ message, language, business }) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const systemPrompt = buildSystemPrompt({ language, business });

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: message }],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 250,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("[Gemini error]", data);
    throw new Error(data?.error?.message || "Gemini request failed");
  }

  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  return cleanAiReply(reply, language);
}

/* ═══════════════════════════════════════════════════════════
   OPENAI OPCIONAL
   Solo se usa si en .env ponés:
   AI_PROVIDER=openai
   OPENAI_API_KEY=tu_api_key
   OPENAI_MODEL=gpt-4.1-mini
   ═══════════════════════════════════════════════════════════ */

async function askOpenAI({ message, language, business }) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const systemPrompt = buildSystemPrompt({ language, business });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: systemPrompt,
      input: message,
      max_output_tokens: 250,
      temperature: 0.4,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("[OpenAI error]", data);
    throw new Error(data?.error?.message || "OpenAI request failed");
  }

  const reply =
    data?.output_text || data?.output?.[0]?.content?.[0]?.text || "";

  return cleanAiReply(reply, language);
}

/* ═══════════════════════════════════════════════════════════
   PROMPT GENERAL DEL NEGOCIO
   ═══════════════════════════════════════════════════════════ */

function buildSystemPrompt({ language, business }) {
  const isEnglish = language === "en";

  const name = business?.name || "Master Barber";
  const phone = business?.phone || "+595 992 163 408";
  const whatsapp = business?.whatsapp || "595992163408";
  const area = business?.area || "Asunción, Paraguay";
  const hours = business?.hours || "Lunes a viernes 09:00 - 18:00";
  const services = Array.isArray(business?.services) ? business.services : [];
  const faqs = Array.isArray(business?.faqs) ? business.faqs : [];

  return `
Sos el asistente virtual de ${name}, una barbería VIP a domicilio.

Idioma de respuesta:
${isEnglish ? "English" : "Español paraguayo/rioplatense, usando vos cuando corresponda."}

Información del negocio:
- Nombre: ${name}
- Teléfono: ${phone}
- WhatsApp: ${whatsapp}
- Zona: ${area}
- Horario: ${hours}

Servicios disponibles:
${services.length ? JSON.stringify(services, null, 2) : "Corte de pelo, barba, pintura de pelo o barba, combo corte + barba."}

Preguntas frecuentes:
${faqs.length ? JSON.stringify(faqs, null, 2) : "No hay FAQs adicionales cargadas."}

Reglas importantes:
- Respondé breve, claro y humano.
- No inventes información.
- Si algo no está confirmado, decí que no está confirmado.
- Si no estás seguro, recomendá consultar por WhatsApp.
- No digas que sos una inteligencia artificial.
- Tu objetivo es ayudar y llevar la consulta o reserva a WhatsApp.
- No prometas disponibilidad real; siempre debe confirmarse por WhatsApp.
- No uses markdown complejo.
- Máximo 2 oraciones, salvo que pidan precios o lista de servicios.
`;
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function cleanAiReply(reply, language = "es") {
  const text = String(reply || "").trim();

  if (text) return text;

  return language === "en"
    ? "I do not have that confirmed. You can ask directly by WhatsApp."
    : "No tengo ese dato confirmado. Podés consultar directamente por WhatsApp.";
}

function extractLastUserMessage(chatHistory) {
  if (!Array.isArray(chatHistory)) return "";

  for (let i = chatHistory.length - 1; i >= 0; i--) {
    const item = chatHistory[i];

    const text = item?.parts?.[0]?.text || item?.content || item?.message || "";

    if (typeof text === "string" && text.trim()) {
      return text.trim();
    }
  }

  return "";
}
