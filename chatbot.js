/* =========================================================
   chatbot.js — Master Barber VIP
   Asistente local + reserva + atrás + español/inglés + WhatsApp
   ========================================================= */

const CHATBOT_CONFIG = {
  businessName: "Master Barber",
  whatsapp: "595992163408",
  phone: "+595 992 163 408",

  // Dejalo en false para que no dependa de Gemini.
  useAiFallback: false,

  aiEndpoint: "/api/chat",
};

const BUSINESS_DATA = typeof MB !== "undefined" ? MB : null;

if (BUSINESS_DATA?.whatsapp) CHATBOT_CONFIG.whatsapp = BUSINESS_DATA.whatsapp;
if (BUSINESS_DATA?.phone) CHATBOT_CONFIG.phone = BUSINESS_DATA.phone;
if (BUSINESS_DATA?.name) CHATBOT_CONFIG.businessName = BUSINESS_DATA.name;

let isLoading = false;
let chatLanguage = "es";
let chatSnapshots = [];

let bookingState = {
  active: false,
  step: "",
  service: "",
  day: "",
  time: "",
  placeType: "",
  cityZone: "",
  addressRef: "",
  notes: "",
};

const BOT_ICON = `
  <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <rect x="14" y="18" width="36" height="30" rx="12" fill="currentColor"/>
    <circle cx="26" cy="33" r="3.5" fill="#080808"/>
    <circle cx="38" cy="33" r="3.5" fill="#080808"/>
    <path d="M25 42c4 3 10 3 14 0" fill="none" stroke="#080808" stroke-width="3" stroke-linecap="round"/>
    <path d="M32 18V10" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <circle cx="32" cy="8" r="4" fill="currentColor"/>
    <path d="M14 34H8M56 34h-6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
  </svg>
`;

function t(es, en) {
  return chatLanguage === "en" ? en : es;
}

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatText(text = "") {
  return escapeHTML(text).replace(/\n/g, "<br>");
}

function countMatches(text, words = []) {
  const clean = normalizeText(text);

  return words.reduce((total, word) => {
    return clean.includes(normalizeText(word)) ? total + 1 : total;
  }, 0);
}

function whatsappUrl(text) {
  return `https://wa.me/${CHATBOT_CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;
}

function getServicesText() {
  if (!BUSINESS_DATA?.services?.length) {
    return t(
      "• Corte de pelo\n• Barba\n• Pintura de pelo o barba\n• Combo corte + barba",
      "• Haircut\n• Beard trim\n• Hair or beard coloring\n• Haircut + beard combo",
    );
  }

  return BUSINESS_DATA.services
    .map((service) => {
      const price = service.price ? ` — ${service.price}` : "";
      return `• ${service.name}${price}`;
    })
    .join("\n");
}

function detectLanguageSwitch(userMessage) {
  const text = normalizeText(userMessage);

  if (
    text.includes("english") ||
    text.includes("ingles") ||
    text.includes("inglés") ||
    text.includes("speak english") ||
    text.includes("can you speak english")
  ) {
    chatLanguage = "en";

    return "Sure. I can help you in English. I can answer questions about services, prices, service area, or help you prepare a WhatsApp booking request.";
  }

  if (
    text.includes("espanol") ||
    text.includes("español") ||
    text.includes("spanish") ||
    text.includes("castellano")
  ) {
    chatLanguage = "es";

    return "Perfecto. Te puedo ayudar en español con precios, servicios, zonas de atención o armar tu reserva por WhatsApp.";
  }

  if (
    text.includes("hello") ||
    text.includes("hi ") ||
    text === "hi" ||
    text.includes("how much") ||
    text.includes("price") ||
    text.includes("book") ||
    text.includes("appointment") ||
    text.includes("haircut")
  ) {
    chatLanguage = "en";
  }

  return null;
}

function detectService(text) {
  const clean = normalizeText(text);

  if (
    clean.includes("combo") ||
    clean.includes("corte y barba") ||
    clean.includes("corte con barba") ||
    clean.includes("haircut and beard") ||
    clean.includes("haircut beard")
  ) {
    return chatLanguage === "en"
      ? "Haircut + Beard Combo"
      : "Combo Corte + Barba";
  }

  if (
    clean.includes("pintura") ||
    clean.includes("color") ||
    clean.includes("tintura") ||
    clean.includes("coloring") ||
    clean.includes("dye")
  ) {
    return chatLanguage === "en"
      ? "Hair or beard coloring"
      : "Pintura de pelo o barba";
  }

  if (clean.includes("barba") || clean.includes("beard")) {
    return chatLanguage === "en" ? "Beard trim" : "Barba";
  }

  if (
    clean.includes("corte") ||
    clean.includes("pelo") ||
    clean.includes("cabello") ||
    clean.includes("degrade") ||
    clean.includes("fade") ||
    clean.includes("haircut") ||
    clean.includes("hair cut")
  ) {
    return chatLanguage === "en" ? "Haircut" : "Corte de pelo";
  }

  return "";
}

function detectPlaceType(text) {
  const clean = normalizeText(text);

  if (
    clean.includes("casa") ||
    clean.includes("domicilio") ||
    clean.includes("home") ||
    clean.includes("house")
  ) {
    return chatLanguage === "en" ? "Home" : "Casa";
  }

  if (
    clean.includes("oficina") ||
    clean.includes("trabajo") ||
    clean.includes("office") ||
    clean.includes("work")
  ) {
    return chatLanguage === "en" ? "Office" : "Oficina";
  }

  if (clean.includes("hotel")) {
    return "Hotel";
  }

  if (
    clean.includes("departamento") ||
    clean.includes("depto") ||
    clean.includes("apartment")
  ) {
    return chatLanguage === "en" ? "Apartment" : "Departamento";
  }

  return "";
}

function isBookingIntent(text) {
  const clean = normalizeText(text);

  return (
    clean.includes("reservar") ||
    clean.includes("reserva") ||
    clean.includes("agendar") ||
    clean.includes("agenda") ||
    clean.includes("turno") ||
    clean.includes("cita") ||
    clean.includes("quiero un corte") ||
    clean.includes("quiero corte") ||
    clean.includes("quiero barba") ||
    clean.includes("necesito corte") ||
    clean.includes("book") ||
    clean.includes("booking") ||
    clean.includes("appointment") ||
    clean.includes("reserve") ||
    clean.includes("i want a haircut") ||
    clean.includes("need a haircut")
  );
}

function isCancelIntent(text) {
  const clean = normalizeText(text);

  return (
    clean.includes("cancelar") ||
    clean.includes("salir") ||
    clean.includes("reiniciar") ||
    clean.includes("empezar de nuevo") ||
    clean.includes("cancel") ||
    clean.includes("restart") ||
    clean.includes("start over")
  );
}

function isAffirmative(text) {
  const clean = normalizeText(text);

  return (
    clean === "si" ||
    clean === "sí" ||
    clean === "yes" ||
    clean.includes("confirmo") ||
    clean.includes("confirm") ||
    clean.includes("correcto") ||
    clean.includes("correct") ||
    clean.includes("dale") ||
    clean.includes("ok") ||
    clean.includes("perfecto") ||
    clean.includes("perfect")
  );
}

function isNegative(text) {
  const clean = normalizeText(text);

  return (
    clean === "no" ||
    clean.includes("cambiar") ||
    clean.includes("modificar") ||
    clean.includes("corregir") ||
    clean.includes("change") ||
    clean.includes("modify") ||
    clean.includes("wrong")
  );
}

/* ═══════════════════════════════════════════════════════════
   BASE DE CONOCIMIENTO LOCAL
   ═══════════════════════════════════════════════════════════ */

const KNOWLEDGE_BASE = [
  {
    id: "precios",
    priority: 10,
    keywords: [
      "precio",
      "precios",
      "cuanto",
      "cuánto",
      "costo",
      "vale",
      "sale",
      "tarifa",
      "cobran",
      "price",
      "prices",
      "cost",
      "how much",
      "rates",
    ],
    answer: () =>
      t(
        `Estos son los precios publicados:\n\n${getServicesText()}\n\nLos precios y la disponibilidad se confirman al reservar por WhatsApp.`,
        `These are the published prices:\n\n${getServicesText()}\n\nPrices and availability should be confirmed by WhatsApp before booking.`,
      ),
  },
  {
    id: "ninos",
    priority: 11,
    keywords: [
      "niño",
      "niños",
      "nino",
      "ninos",
      "menor",
      "menores",
      "infantil",
      "hijo",
      "chico",
      "child",
      "children",
      "kid",
      "kids",
      "boy",
      "minor",
    ],
    answer: (userMessage) => {
      const waText = t(
        `Hola ${CHATBOT_CONFIG.businessName}, quería consultar si realizan cortes para niños.`,
        `Hello ${CHATBOT_CONFIG.businessName}, I would like to ask if you offer haircuts for children.`,
      );

      return `[WHATSAPP_CONTACT|${waText}]`;
    },
  },
  {
    id: "servicios",
    priority: 8,
    keywords: [
      "servicio",
      "servicios",
      "que ofrecen",
      "que hacen",
      "barba",
      "corte",
      "pelo",
      "cabello",
      "pintura",
      "color",
      "combo",
      "degrade",
      "fade",
      "service",
      "services",
      "haircut",
      "beard",
      "coloring",
    ],
    answer: () =>
      t(
        `Master Barber ofrece barbería VIP a domicilio en Asunción:\n\n${getServicesText()}\n\nEl servicio puede ser en casa, oficina u hotel.`,
        `Master Barber offers VIP barber services at your location in Asunción:\n\n${getServicesText()}\n\nThe service can be at home, office, hotel, or apartment.`,
      ),
  },
  {
    id: "zona",
    priority: 9,
    keywords: [
      "zona",
      "zonas",
      "barrio",
      "ciudad",
      "ubicacion",
      "ubicación",
      "asuncion",
      "asunción",
      "llegan",
      "vienen",
      "domicilio",
      "casa",
      "hotel",
      "oficina",
      "area",
      "location",
      "city",
      "where",
      "home service",
      "do you come",
    ],
    answer: () =>
      t(
        "El servicio principal es barbería VIP a domicilio en Asunción. Podés pedir atención en casa, oficina u hotel. Para confirmar una zona exacta, lo ideal es enviar la ubicación por WhatsApp.",
        "The main service is VIP barber service at your location in Asunción. You can request service at home, office, hotel, or apartment. To confirm an exact area, it is best to send the location by WhatsApp.",
      ),
  },
  {
    id: "horario",
    priority: 9,
    keywords: [
      "horario",
      "hora",
      "atienden",
      "abren",
      "cerrado",
      "abierto",
      "lunes",
      "martes",
      "miercoles",
      "jueves",
      "viernes",
      "sabado",
      "domingo",
      "fin de semana",
      "hours",
      "schedule",
      "open",
      "closed",
      "monday",
      "saturday",
      "sunday",
      "weekend",
    ],
    answer: () =>
      t(
        "El horario publicado es de lunes a viernes de 09:00 a 18:00, con agenda previa. Para fines de semana u horarios especiales, conviene consultar por WhatsApp.",
        "The published schedule is Monday to Friday from 09:00 to 18:00, by appointment. For weekends or special hours, it is better to check directly by WhatsApp.",
      ),
  },
  {
    id: "ingles",
    priority: 8,
    keywords: [
      "ingles",
      "inglés",
      "english",
      "extranjero",
      "turista",
      "tourist",
      "foreigner",
    ],
    answer: () => {
      chatLanguage = "en";
      return "Yes, Master Barber can assist in Spanish and English. I can help you in English with services, prices, service area, or booking by WhatsApp.";
    },
  },
  {
    id: "pago",
    priority: 7,
    keywords: [
      "pago",
      "pagos",
      "efectivo",
      "transferencia",
      "tarjeta",
      "pos",
      "qr",
      "payment",
      "cash",
      "card",
      "transfer",
    ],
    answer: () =>
      t(
        "No tengo confirmadas las formas de pago en la información publicada. Para evitar errores, lo mejor es consultarlo por WhatsApp al momento de reservar.",
        "I do not have confirmed public information about payment methods. To avoid mistakes, it is best to ask directly by WhatsApp when booking.",
      ),
  },
  {
    id: "urgente",
    priority: 8,
    keywords: [
      "hoy",
      "ahora",
      "urgente",
      "esta tarde",
      "esta mañana",
      "esta noche",
      "today",
      "now",
      "urgent",
      "as soon as possible",
      "tonight",
    ],
    answer: () =>
      t(
        "Para disponibilidad urgente o para hoy, lo más rápido es escribir directamente por WhatsApp indicando servicio, zona y horario deseado.",
        "For urgent availability or same-day appointments, the fastest option is to message directly on WhatsApp with the service, area, and preferred time.",
      ),
  },
  {
    id: "whatsapp_directo",
    priority: 12,
    keywords: [
      "whatsapp",
      "contactar",
      "contacto",
      "hablar con alguien",
      "asesor",
      "persona",
      "consultar por whatsapp",
      "quiero consultar",
      "send whatsapp",
      "contact",
      "talk to someone",
    ],
    answer: (userMessage) => {
      const waText = t(
        `Hola ${CHATBOT_CONFIG.businessName}, tengo una consulta.`,
        `Hello ${CHATBOT_CONFIG.businessName}, I have a question.`,
      );

      return `[WHATSAPP_CONTACT|${waText}]`;
    },
  },
  {
    id: "saludo",
    priority: 3,
    keywords: [
      "hola",
      "buenas",
      "buen dia",
      "buenas tardes",
      "buenas noches",
      "hello",
      "hi",
      "good morning",
      "good afternoon",
      "good evening",
    ],
    answer: () =>
      t(
        "¡Hola! Soy el asistente de Master Barber. Puedo ayudarte con precios, servicios, zonas de atención o armar tu reserva por WhatsApp.",
        "Hello! I am the Master Barber assistant. I can help you with prices, services, service area, or prepare your WhatsApp booking request.",
      ),
  },
];

function findLocalAnswer(userMessage) {
  let best = null;
  let bestScore = 0;

  for (const item of KNOWLEDGE_BASE) {
    const matches = countMatches(userMessage, item.keywords);
    if (matches === 0) continue;

    const score = matches * 10 + (item.priority || 0);

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (!best) return null;
  return best.answer(userMessage);
}

/* ═══════════════════════════════════════════════════════════
   RESERVA
   ═══════════════════════════════════════════════════════════ */

function resetBooking() {
  bookingState = {
    active: false,
    step: "",
    service: "",
    day: "",
    time: "",
    placeType: "",
    cityZone: "",
    addressRef: "",
    notes: "",
  };
}

function startBooking(userMessage = "") {
  resetBooking();

  bookingState.active = true;

  const detectedService = detectService(userMessage);
  const detectedPlace = detectPlaceType(userMessage);

  if (detectedService) bookingState.service = detectedService;
  if (detectedPlace) bookingState.placeType = detectedPlace;

  if (!bookingState.service) {
    bookingState.step = "service";

    return t(
      "Genial, te ayudo a armar la reserva.\n\n¿Qué servicio querés reservar?\n\n• Corte de pelo\n• Barba\n• Pintura de pelo o barba\n• Combo corte + barba",
      "Great, I can help you prepare the booking.\n\nWhich service would you like to book?\n\n• Haircut\n• Beard trim\n• Hair or beard coloring\n• Haircut + beard combo",
    );
  }

  bookingState.step = "day";

  return t(
    `Perfecto, anoté: ${bookingState.service}.\n\n¿Para qué día te gustaría reservar?`,
    `Perfect, I noted: ${bookingState.service}.\n\nWhich day would you like to book?`,
  );
}

function nextBookingQuestion() {
  if (!bookingState.service) {
    bookingState.step = "service";

    return t(
      "¿Qué servicio querés reservar? Puede ser corte, barba, pintura o combo corte + barba.",
      "Which service would you like to book? It can be haircut, beard trim, coloring, or haircut + beard combo.",
    );
  }

  if (!bookingState.day) {
    bookingState.step = "day";
    return t(
      "¿Para qué día te gustaría reservar?",
      "Which day would you like to book?",
    );
  }

  if (!bookingState.time) {
    bookingState.step = "time";
    return t("¿En qué horario preferís?", "What time would you prefer?");
  }

  if (!bookingState.placeType) {
    bookingState.step = "placeType";

    return t(
      "¿El servicio sería en tu casa, oficina, hotel o departamento?",
      "Would the service be at your home, office, hotel, or apartment?",
    );
  }

  if (!bookingState.cityZone) {
    bookingState.step = "cityZone";

    return t(
      "¿En qué ciudad o zona sería el servicio? Por ejemplo: Asunción, Villa Morra, San Lorenzo, etc.",
      "In which city or area would the service be? For example: Asunción, Villa Morra, San Lorenzo, etc.",
    );
  }

  if (!bookingState.addressRef) {
    bookingState.step = "addressRef";

    return t(
      "Pasame una dirección o referencia aproximada para coordinar mejor.",
      "Please send an address or approximate reference so they can coordinate better.",
    );
  }

  if (!bookingState.notes) {
    bookingState.step = "notes";

    return t(
      "¿Querés agregar alguna observación? Por ejemplo tipo de corte, referencia, si es con barba, o escribí “no”.",
      "Would you like to add any note? For example haircut style, reference, beard included, or write “no”.",
    );
  }

  bookingState.step = "confirm";
  return buildBookingSummary();
}

function buildBookingSummary() {
  return t(
    "Perfecto, tengo estos datos para tu reserva:\n\n" +
      `• Servicio: ${bookingState.service}\n` +
      `• Día: ${bookingState.day}\n` +
      `• Horario: ${bookingState.time}\n` +
      `• Lugar: ${bookingState.placeType}\n` +
      `• Zona/Ciudad: ${bookingState.cityZone}\n` +
      `• Dirección o referencia: ${bookingState.addressRef}\n` +
      `• Observación: ${bookingState.notes}\n\n` +
      "¿Confirmamos para preparar el mensaje de WhatsApp?",

    "Perfect, I have these details for your booking:\n\n" +
      `• Service: ${bookingState.service}\n` +
      `• Day: ${bookingState.day}\n` +
      `• Time: ${bookingState.time}\n` +
      `• Place: ${bookingState.placeType}\n` +
      `• Area/City: ${bookingState.cityZone}\n` +
      `• Address or reference: ${bookingState.addressRef}\n` +
      `• Note: ${bookingState.notes}\n\n` +
      "Should I prepare the WhatsApp message?",
  );
}

function handleBookingFlow(userMessage) {
  const clean = normalizeText(userMessage);

  if (bookingState.active && isCancelIntent(userMessage)) {
    resetBooking();

    return t(
      "Listo, cancelé la reserva en curso. Podés empezar de nuevo escribiendo “quiero reservar”.",
      "Done, I cancelled the current booking. You can start again by writing “I want to book”.",
    );
  }

  if (!bookingState.active && isBookingIntent(userMessage)) {
    return startBooking(userMessage);
  }

  if (!bookingState.active) return null;

  if (bookingState.step === "service") {
    const service = detectService(userMessage);

    if (!service) {
      return t(
        "No pude identificar el servicio.\n\nPodés responder con una de estas opciones:\n• Corte de pelo\n• Barba\n• Pintura\n• Combo corte + barba",
        "I could not identify the service.\n\nYou can answer with one of these options:\n• Haircut\n• Beard trim\n• Coloring\n• Haircut + beard combo",
      );
    }

    bookingState.service = service;
    return nextBookingQuestion();
  }

  if (bookingState.step === "day") {
    bookingState.day = userMessage.trim();
    return nextBookingQuestion();
  }

  if (bookingState.step === "time") {
    bookingState.time = userMessage.trim();
    return nextBookingQuestion();
  }

  if (bookingState.step === "placeType") {
    const place = detectPlaceType(userMessage);
    bookingState.placeType = place || userMessage.trim();
    return nextBookingQuestion();
  }

  if (bookingState.step === "cityZone") {
    bookingState.cityZone = userMessage.trim();
    return nextBookingQuestion();
  }

  if (bookingState.step === "addressRef") {
    bookingState.addressRef = userMessage.trim();
    return nextBookingQuestion();
  }

  if (bookingState.step === "notes") {
    if (
      clean === "no" ||
      clean === "none" ||
      clean === "ninguna" ||
      clean === "sin observacion" ||
      clean === "sin observación"
    ) {
      bookingState.notes = t("Sin observación", "No note");
    } else {
      bookingState.notes = userMessage.trim();
    }

    return nextBookingQuestion();
  }

  if (bookingState.step === "confirm") {
    if (isAffirmative(userMessage)) {
      return `[RESERVA_LISTA|${bookingState.service}|${bookingState.day}|${bookingState.time}|${bookingState.placeType}|${bookingState.cityZone}|${bookingState.addressRef}|${bookingState.notes}]`;
    }

    if (isNegative(userMessage)) {
      resetBooking();

      bookingState.active = true;
      bookingState.step = "service";

      return t(
        "Sin problema. Empecemos de nuevo. ¿Qué servicio querés reservar?",
        "No problem. Let’s start again. Which service would you like to book?",
      );
    }

    return t(
      "Respondeme con “sí” para preparar el WhatsApp, o “cambiar” si querés corregir los datos.",
      "Reply “yes” to prepare the WhatsApp message, or “change” if you want to correct the details.",
    );
  }

  return nextBookingQuestion();
}

/* ═══════════════════════════════════════════════════════════
   IA OPCIONAL
   ═══════════════════════════════════════════════════════════ */

async function askAiFallback(userMessage) {
  if (!CHATBOT_CONFIG.useAiFallback) return null;

  try {
    const response = await fetch(CHATBOT_CONFIG.aiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: userMessage,
        language: chatLanguage,
        business: {
          name: CHATBOT_CONFIG.businessName,
          phone: CHATBOT_CONFIG.phone,
          whatsapp: CHATBOT_CONFIG.whatsapp,
          services: BUSINESS_DATA?.services || [],
          faqs: BUSINESS_DATA?.faqs || [],
          area: BUSINESS_DATA?.area || "Asunción, Paraguay",
          hours: BUSINESS_DATA?.hours || "Lunes a viernes 09:00 - 18:00",
        },
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();

    if (typeof data.reply === "string" && data.reply.trim())
      return data.reply.trim();
    if (typeof data.message === "string" && data.message.trim())
      return data.message.trim();

    return null;
  } catch (error) {
    console.warn("[Chatbot AI fallback]", error);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════
   MOTOR PRINCIPAL
   ═══════════════════════════════════════════════════════════ */

async function getBotReply(userMessage) {
  const langReply = detectLanguageSwitch(userMessage);
  if (langReply) return langReply;

  const bookingReply = handleBookingFlow(userMessage);
  if (bookingReply) return bookingReply;

  const localAnswer = findLocalAnswer(userMessage);
  if (localAnswer) return localAnswer;

  const aiAnswer = await askAiFallback(userMessage);
  if (aiAnswer) return aiAnswer;

  const waText = t(
    `Hola ${CHATBOT_CONFIG.businessName}, tengo una consulta: ${userMessage}`,
    `Hello ${CHATBOT_CONFIG.businessName}, I have a question: ${userMessage}`,
  );

  return `[WHATSAPP_CONTACT|${waText}]`;
}

/* ═══════════════════════════════════════════════════════════
   SNAPSHOTS / BOTÓN ATRÁS
   ═══════════════════════════════════════════════════════════ */

function cloneBookingState() {
  return JSON.parse(JSON.stringify(bookingState));
}

function pushSnapshot() {
  const messages = document.getElementById("chat-messages");
  if (!messages) return;

  chatSnapshots.push({
    html: messages.innerHTML,
    booking: cloneBookingState(),
    language: chatLanguage,
  });

  updateBackButton();
}

function goBackChat() {
  showMainMenu();
}

function showMainMenu() {
  const messages = document.getElementById("chat-messages");
  const input = document.getElementById("chat-input");

  if (!messages || !input) return;

  resetBooking();
  chatSnapshots = [];

  messages.innerHTML = "";

  messages.appendChild(
    createMessageEl(
      t(
        "Volvimos al menú principal 👇\n\n¿En qué te puedo ayudar?",
        "Back to the main menu 👇\n\nHow can I help you?",
      ),
      "bot",
    ),
  );

  addQuickOptions(messages, input);
  updateBackButton();
  scrollToBottom(messages);
}

function updateBackButton() {
  const back = document.getElementById("chat-back");
  if (!back) return;

  back.disabled = false;
  back.style.opacity = "1";
  back.style.pointerEvents = "auto";
}

/* ═══════════════════════════════════════════════════════════
   WHATSAPP FINAL
   ═══════════════════════════════════════════════════════════ */

function processBotReply(replyText) {
  const messages = document.getElementById("chat-messages");
  if (!messages) return;

  const bookingRegex =
    /\[RESERVA_LISTA\|([\s\S]+?)\|([\s\S]+?)\|([\s\S]+?)\|([\s\S]+?)\|([\s\S]+?)\|([\s\S]+?)\|([\s\S]+?)\]/i;
  const contactRegex = /\[WHATSAPP_CONTACT\|([\s\S]+?)\]/i;

  const bookingMatch = String(replyText).match(bookingRegex);
  const contactMatch = String(replyText).match(contactRegex);

  if (bookingMatch) {
    const [, service, day, time, placeType, cityZone, addressRef, notes] =
      bookingMatch;

    finishBooking({
      service: service.trim(),
      day: day.trim(),
      time: time.trim(),
      placeType: placeType.trim(),
      cityZone: cityZone.trim(),
      addressRef: addressRef.trim(),
      notes: notes.trim(),
    });

    resetBooking();
    return;
  }

  if (contactMatch) {
    finishContact(contactMatch[1].trim());
    return;
  }

  messages.appendChild(createMessageEl(replyText, "bot"));
}

function finishBooking(data) {
  const messages = document.getElementById("chat-messages");
  if (!messages) return;

  const waText = t(
    `Hola ${CHATBOT_CONFIG.businessName}! Quiero reservar un turno:\n` +
      `• Servicio: ${data.service}\n` +
      `• Día: ${data.day}\n` +
      `• Horario: ${data.time}\n` +
      `• Lugar: ${data.placeType}\n` +
      `• Zona/Ciudad: ${data.cityZone}\n` +
      `• Dirección o referencia: ${data.addressRef}\n` +
      `• Observación: ${data.notes}\n\n` +
      `¿Tienen disponibilidad?`,

    `Hello ${CHATBOT_CONFIG.businessName}! I would like to book an appointment:\n` +
      `• Service: ${data.service}\n` +
      `• Day: ${data.day}\n` +
      `• Time: ${data.time}\n` +
      `• Place: ${data.placeType}\n` +
      `• Area/City: ${data.cityZone}\n` +
      `• Address or reference: ${data.addressRef}\n` +
      `• Note: ${data.notes}\n\n` +
      `Do you have availability?`,
  );

  const waUrl = whatsappUrl(waText);

  const confirmEl = document.createElement("div");
  confirmEl.className = "chat-msg chat-msg--bot chat-booking-confirm";

  confirmEl.innerHTML = `
    <p style="margin:0 0 10px">
      ${escapeHTML(
        t(
          "¡Perfecto! Ya tengo los datos de tu reserva. Tocá el botón para enviar el mensaje por WhatsApp y confirmar disponibilidad:",
          "Perfect! I have your booking details. Tap the button to send the message by WhatsApp and confirm availability:",
        ),
      )}
    </p>

    <div class="chat-wa-preview">${escapeHTML(waText)}</div>

    <a href="${escapeHTML(waUrl)}" target="_blank" rel="noopener" class="chat-wa-btn">
      ${escapeHTML(t("Enviar por WhatsApp", "Send by WhatsApp"))}
    </a>
  `;

  messages.appendChild(confirmEl);
}

function finishContact(waText) {
  const messages = document.getElementById("chat-messages");
  if (!messages) return;

  const waUrl = whatsappUrl(waText);

  const card = document.createElement("div");
  card.className = "chat-msg chat-msg--bot chat-booking-confirm";

  card.innerHTML = `
    <p style="margin:0 0 10px">
      ${escapeHTML(
        t(
          "No tengo ese dato confirmado en la información publicada. Para evitar darte una respuesta incorrecta, podés enviar la consulta directa por WhatsApp:",
          "I do not have that information confirmed in the published details. To avoid giving you an incorrect answer, you can send the question directly by WhatsApp:",
        ),
      )}
    </p>

    <div class="chat-wa-preview">${escapeHTML(waText)}</div>

    <a href="${escapeHTML(waUrl)}" target="_blank" rel="noopener" class="chat-wa-btn">
      ${escapeHTML(t("Consultar por WhatsApp", "Ask by WhatsApp"))}
    </a>
  `;

  messages.appendChild(card);
}

/* ═══════════════════════════════════════════════════════════
   UI
   ═══════════════════════════════════════════════════════════ */

function createMessageEl(text, role) {
  const div = document.createElement("div");
  div.className = `chat-msg chat-msg--${role}`;
  div.innerHTML = formatText(text);
  return div;
}

function scrollToBottom(container) {
  if (!container) return;
  container.scrollTop = container.scrollHeight;
}

function setLoading(show) {
  const indicator = document.getElementById("chat-loading");
  if (indicator) indicator.style.display = show ? "flex" : "none";
}

function setSendDisabled(disabled) {
  const send = document.getElementById("chat-send");
  const input = document.getElementById("chat-input");

  if (send) send.disabled = disabled;
  if (input) input.disabled = disabled;
}

function autoResizeInput(input) {
  if (!input) return;

  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 100)}px`;
}

async function handleSend() {
  if (isLoading) return;

  const input = document.getElementById("chat-input");
  const messages = document.getElementById("chat-messages");

  if (!input || !messages) return;

  const userText = input.value.trim();
  if (!userText) return;

  pushSnapshot();

  messages.appendChild(createMessageEl(userText, "user"));

  input.value = "";
  autoResizeInput(input);
  scrollToBottom(messages);

  isLoading = true;
  setLoading(true);
  setSendDisabled(true);

  try {
    const reply = await getBotReply(userText);
    processBotReply(reply);
  } catch (err) {
    console.error("[Chatbot]", err);

    finishContact(
      t(
        `Hola ${CHATBOT_CONFIG.businessName}, tengo una consulta.`,
        `Hello ${CHATBOT_CONFIG.businessName}, I have a question.`,
      ),
    );
  } finally {
    isLoading = false;
    setLoading(false);
    setSendDisabled(false);
    scrollToBottom(messages);
    input.focus();
  }
}

function addQuickOptions(messages, input) {
  const quickEl = document.createElement("div");
  quickEl.className = "chat-quick-options";

  const options =
    chatLanguage === "en"
      ? [
          { label: "Book an appointment", primary: true },
          { label: "See prices", primary: false },
          { label: "Services", primary: false },
          { label: "Service area", primary: false },
          { label: "Business hours", primary: false },
          { label: "Ask by WhatsApp", primary: false },
          { label: "Español", primary: false },
        ]
      : [
          { label: "Reservar turno", primary: true },
          { label: "Ver precios", primary: false },
          { label: "Servicios", primary: false },
          { label: "Zonas de atención", primary: false },
          { label: "Horarios", primary: false },
          { label: "Consultar por WhatsApp", primary: false },
          { label: "English", primary: false },
        ];

  options.forEach((option) => {
    const btn = document.createElement("button");

    btn.className = option.primary
      ? "chat-quick-btn chat-quick-btn--primary"
      : "chat-quick-btn";

    btn.type = "button";
    btn.textContent = option.label;
    btn.dataset.text = option.label;

    quickEl.appendChild(btn);
  });

  messages.appendChild(quickEl);
  bindQuickButtons();
}

function bindQuickButtons() {
  const input = document.getElementById("chat-input");

  document.querySelectorAll(".chat-quick-btn").forEach((btn) => {
    if (btn.dataset.bound === "true") return;

    btn.dataset.bound = "true";

    btn.addEventListener("click", () => {
      const text = btn.dataset.text || btn.textContent.trim();

      const quickContainer = btn.closest(".chat-quick-options");
      if (quickContainer) quickContainer.remove();

      input.value = text;
      handleSend();
    });
  });
}

function setupBotIcon() {
  const avatar = document.querySelector(".chat-avatar");
  const openIcon = document.querySelector(".chat-icon-open");

  if (avatar) avatar.innerHTML = BOT_ICON;
  if (openIcon) openIcon.innerHTML = BOT_ICON;
}

function setupBackButton() {
  const header = document.querySelector(".chat-header");
  const close = document.getElementById("chat-close");

  if (!header || !close || document.getElementById("chat-back")) return;

  const back = document.createElement("button");
  back.type = "button";
  back.id = "chat-back";
  back.className = "chat-back-btn";
  back.setAttribute("aria-label", "Volver atrás");
  back.innerHTML = "☰";
  back.title = "Volver al menú";

  back.addEventListener("click", goBackChat);

  close.parentNode.insertBefore(back, close);
  updateBackButton();
}

function initChatbot() {
  const toggle = document.getElementById("chat-toggle");
  const panel = document.getElementById("chat-panel");
  const close = document.getElementById("chat-close");
  const input = document.getElementById("chat-input");
  const send = document.getElementById("chat-send");
  const messages = document.getElementById("chat-messages");

  if (!toggle || !panel || !input || !messages) return;

  setupBotIcon();
  setupBackButton();

  toggle.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("open");

    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");

    if (isOpen && messages.children.length === 0) {
      messages.appendChild(
        createMessageEl(
          t(
            "Hola 👋 Soy el asistente de Master Barber. Puedo ayudarte con precios, servicios, zonas de atención o armar tu reserva por WhatsApp.",
            "Hello 👋 I am the Master Barber assistant. I can help you with prices, services, service area, or prepare your WhatsApp booking request.",
          ),
          "bot",
        ),
      );

      addQuickOptions(messages, input);
      scrollToBottom(messages);
    }

    if (isOpen) {
      setTimeout(() => input.focus(), 250);
    }
  });

  if (close) {
    close.addEventListener("click", () => {
      panel.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
  }

  if (send) {
    send.addEventListener("click", handleSend);
  }

  input.addEventListener("input", () => {
    autoResizeInput(input);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
}

document.addEventListener("DOMContentLoaded", initChatbot);
