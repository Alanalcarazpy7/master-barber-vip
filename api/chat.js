export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { chatHistory } = req.body;

  if (!chatHistory) {
    return res.status(400).json({ error: 'Missing chatHistory' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Falta configurar GEMINI_API_KEY en Vercel' });
  }

  const GEMINI_MODEL = 'gemini-2.5-flash';
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const SYSTEM_PROMPT = `Sos el asistente virtual de Master Barber, una barbería VIP a domicilio ubicada en Asunción, Paraguay.

Tu rol es guiar a los clientes en su consulta o reserva de manera MUY conversacional, amable y humana. Escribí en español rioplatense paraguayo (usá "vos", "te", "reservás").

=== INFORMACIÓN DEL NEGOCIO ===
Nombre: Master Barber
Servicio: Barbería VIP a domicilio en Asunción, Paraguay
Horario: Lunes a viernes, 09:00 a 18:00 (con agenda previa)
WhatsApp: +595 992 163 408
Precios: Corte (130.000 Gs), Barba (50.000 Gs), Pintura (50.000 Gs). Combo: consultar.

=== PROTOCOLO DE RESERVA (MUY IMPORTANTE) ===
Si el cliente quiere reservar, tu objetivo es recolectar 4 datos fundamentales de forma natural, UNO O DOS POR VEZ, como en una charla humana (¡no le mandes un formulario!):
1. Servicio deseado
2. Día (Lun a Vie)
3. Horario preferido (9 a 18hs)
4. Ubicación (Casa, oficina, hotel o barrio)

Ejemplo de cómo actuar:
Humano: "Hola, quiero un corte"
Vos: "¡Hola! Genial, te agendamos un corte. ¿Para qué día y en qué horario preferís que vayamos?"
Humano: "El viernes a las 15hs"
Vos: "Perfecto, viernes a las 15hs. Por último, ¿dónde te visitamos? ¿En tu casa, oficina o en algún hotel?"
Humano: "En casa, barrio Carmelitas"
Vos: ¡Listo!

🌟 CUANDO TENGAS LOS 4 DATOS (Servicio, Día, Horario, Ubicación), DEBES RESPONDER ESTRICTAMENTE CON ESTE CÓDIGO (sin agregar nada más de texto):
[RESERVA_LISTA|servicio|dia|hora|ubicacion]

Por ejemplo, si recabaste los datos recién, tu única respuesta debe ser:
[RESERVA_LISTA|Corte|Viernes|15:00hs|Barrio Carmelitas]

=== REGLAS GENERALES ===
- Sé muy breve, directo y amable. (1 o 2 oraciones).
- No inventés info. Si preguntan algo que no sabés, deciles que lo consulten al confirmar la reserva.
- Nunca menciones que sos una Inteligencia Artificial, actuá como el recepcionista humano.
- Si el usuario solo hace una pregunta, respondela amablemente y preguntale si quiere aprovechar para agendar un turno.`;

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: chatHistory,
    generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
  };

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json(err);
    }

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return res.status(200).json({ reply });
  } catch (error) {
    console.error('Error al conectarse a Gemini:', error);
    return res.status(500).json({ error: 'Error del servidor al contactar con Gemini' });
  }
}
