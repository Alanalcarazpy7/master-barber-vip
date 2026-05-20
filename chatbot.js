/* =========================================================
   chatbot.js — Master Barber VIP · Asistente Gemini
   La API Key se carga desde config.js (ver .env.example)
   ========================================================= */

// ─── CONFIGURACIÓN ────────────────────────────────────────
// La API Key y el System Prompt ahora viven de forma segura en el backend 
// en la ruta /api/chat.js (Vercel Serverless Functions)

// ─── ESTADO ───────────────────────────────────────────────
let chatHistory = [];
let isLoading   = false;

// ─── FLUJO DE RESERVA CONVERSACIONAL ──────────────────────
function processBotReply(replyText) {
  const messages = document.getElementById('chat-messages');

  // Verifica si el bot emitió la instrucción final de reserva
  const bookingRegex = /\[RESERVA_LISTA\|(.+?)\|(.+?)\|(.+?)\|(.+?)\]/i;
  const match = replyText.match(bookingRegex);

  if (match) {
    const [, service, day, time, location] = match;
    finishBooking(service.trim(), day.trim(), time.trim(), location.trim());
    
    // Si Gemini agregó texto además del tag, lo mostramos aparte
    const remainingText = replyText.replace(bookingRegex, '').trim();
    if (remainingText) {
      messages.appendChild(createMessageEl(remainingText, 'bot'));
    }
  } else {
    // Si no es el final de la reserva, muestra el mensaje normal
    messages.appendChild(createMessageEl(replyText, 'bot'));
  }
}

function finishBooking(service, day, time, location) {
  const messages = document.getElementById('chat-messages');
  if (!messages) return;

  const waText =
    `Hola Master Barber! Quiero reservar un turno:\n` +
    `• Servicio: ${service}\n` +
    `• Día: ${day}\n` +
    `• Horario: ${time}\n` +
    `• Ubicación: ${location}\n` +
    `¿Tienen disponibilidad?`;

  const waUrl = `https://wa.me/595992163408?text=${encodeURIComponent(waText)}`;

  const confirmEl = document.createElement('div');
  confirmEl.className = 'chat-msg chat-msg--bot chat-booking-confirm';
  confirmEl.innerHTML = `
    <p style="margin:0 0 10px">¡Perfecto! Tengo todos tus datos anotados. Tocá el botón abajo para enviar tu mensaje por WhatsApp y confirmamos la cita al instante:</p>
    <div style="background:rgba(201,162,78,.08);border:1px solid rgba(201,162,78,.25);border-radius:10px;padding:10px 12px;font-size:12px;color:#ccc;margin-bottom:12px;white-space:pre-line">${waText}</div>
    <a href="${waUrl}" target="_blank" rel="noopener" class="chat-wa-btn">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.997 0C5.373 0 0 5.373 0 11.997c0 2.117.554 4.1 1.523 5.818L0 24l6.335-1.498A11.953 11.953 0 0 0 11.997 24C18.621 24 24 18.627 24 11.997 24 5.373 18.621 0 11.997 0zm.003 21.818a9.821 9.821 0 0 1-5.002-1.368l-.359-.213-3.718.879.894-3.63-.234-.373a9.818 9.818 0 0 1-1.504-5.116c0-5.42 4.412-9.832 9.832-9.832 5.418 0 9.83 4.412 9.83 9.832 0 5.418-4.412 9.821-9.739 9.821z"/></svg>
      Enviar por WhatsApp
    </a>
  `;
  messages.appendChild(confirmEl);
}

// ─── API CALL ─────────────────────────────────────────────
async function sendToGemini(userMessage) {
  chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatHistory })
  });

  if (!response.ok) {
    const err     = await response.json().catch(() => ({}));
    const status  = response.status;
    const message = err?.error?.message || err?.error || `Error ${status}`;
    if (status === 429) {
      const retryMatch = message.match(/(\d+)\s*s/);
      const seconds    = retryMatch ? retryMatch[1] : '30';
      throw Object.assign(new Error(message), { isRateLimit: true, retrySeconds: seconds });
    }
    throw new Error(message);
  }

  const data  = await response.json();
  const reply = data.reply || '';
  chatHistory.push({ role: 'model', parts: [{ text: reply }] });
  return reply;
}

// ─── UI HELPERS ───────────────────────────────────────────
function createMessageEl(text, role) {
  const div = document.createElement('div');
  div.className = `chat-msg chat-msg--${role}`;
  div.innerHTML = text.replace(/\n/g, '<br>');
  return div;
}

function scrollToBottom(container) {
  container.scrollTop = container.scrollHeight;
}

function setLoading(show) {
  const indicator = document.getElementById('chat-loading');
  if (indicator) indicator.style.display = show ? 'flex' : 'none';
}

// ─── ENVÍO DEL MENSAJE ────────────────────────────────────
async function handleSend() {
  if (isLoading) return;

  const input    = document.getElementById('chat-input');
  const messages = document.getElementById('chat-messages');
  const userText = input.value.trim();
  if (!userText) return;

  messages.appendChild(createMessageEl(userText, 'user'));
  input.value = '';
  scrollToBottom(messages);

  isLoading = true;
  setLoading(true);

  try {
    const reply = await sendToGemini(userText);
    processBotReply(reply);
  } catch (err) {
    console.error('[Chatbot]', err);
    const errorText = err.isRateLimit
      ? `⏳ Demasiadas consultas seguidas. Esperá unos ${err.retrySeconds || 30} segundos e intentá de nuevo.`
      : 'Hubo un error al conectar con el asistente. Podés reservar directamente por WhatsApp: +595 992 163 408.';
    messages.appendChild(createMessageEl(errorText, 'bot error'));
  } finally {
    isLoading = false;
    setLoading(false);
    scrollToBottom(messages);
  }
}

// ─── INICIALIZACIÓN DEL WIDGET ────────────────────────────
function initChatbot() {
  const toggle   = document.getElementById('chat-toggle');
  const panel    = document.getElementById('chat-panel');
  const close    = document.getElementById('chat-close');
  const input    = document.getElementById('chat-input');
  const send     = document.getElementById('chat-send');
  const messages = document.getElementById('chat-messages');

  if (!toggle || !panel) return;

  // Abrir / cerrar el panel
  toggle.addEventListener('click', () => {
    const isOpen = panel.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen);
    if (isOpen && messages && messages.children.length === 0) {
      messages.appendChild(createMessageEl(
        'Hola 👋 Soy el asistente de Master Barber. ¿En qué te puedo ayudar o qué servicio te gustaría reservar?',
        'bot'
      ));

      // 3 chips para que el usuario empiece rápido a chatear
      const quickEl = document.createElement('div');
      quickEl.className = 'chat-quick-options';
      
      const btn1 = document.createElement('button');
      btn1.className = 'chat-quick-btn chat-quick-btn--primary';
      btn1.textContent = 'Quiero reservar un corte';
      btn1.addEventListener('click', () => { quickEl.remove(); input.value = btn1.textContent; handleSend(); });
      
      const btn2 = document.createElement('button');
      btn2.className = 'chat-quick-btn';
      btn2.textContent = 'Quiero hacer una consulta';
      btn2.addEventListener('click', () => { quickEl.remove(); input.value = btn2.textContent; handleSend(); });

      quickEl.appendChild(btn1);
      quickEl.appendChild(btn2);
      messages.appendChild(quickEl);
    }
    if (isOpen) setTimeout(() => input?.focus(), 300);
  });

  if (close) close.addEventListener('click', () => {
    panel.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  });

  if (send) send.addEventListener('click', handleSend);
  if (input) input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
}

document.addEventListener('DOMContentLoaded', initChatbot);
