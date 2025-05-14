// --- SECCIÓN 1: IMPORTS Y CONFIGURACIÓN BÁSICA DEL SERVIDOR ---

// Carga las variables de entorno del archivo .env al inicio
require('dotenv').config();

// Importa los módulos necesarios
const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios'); // Necesitaremos axios para enviar mensajes de vuelta a WhatsApp

// Inicializa la aplicación Express
const app = express();
const port = process.env.PORT || 3000; // Usa el puerto 3000 o el definido en variables de entorno

// Configura middleware para parsear el cuerpo de las solicitudes POST
app.use(bodyParser.json()); // Para solicitudes con cuerpo tipo JSON
app.use(bodyParser.urlencoded({ extended: true })); // Para solicitudes con cuerpo tipo URL-encoded

// --- SECCIÓN 2: CONFIGURACIÓN DE GEMINI ---

// Accede a tu clave API de Gemini de forma segura desde las variables de entorno
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY no está configurada en el archivo .env");
    process.exit(1); // Sale de la aplicación si la clave no está configurada
}

// Inicializa el cliente de la API de Google Generative AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Elige el modelo que quieres usar (ej. gemini-1.5-flash-latest o gemini-1.0-pro)
// gemini-1.5-flash-latest suele ser más rápido y económico.
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

// --- SECCIÓN 3: FUNCIÓN PARA INTERACTUAR CON GEMINI ---

/**
 * Envía el texto del usuario a Gemini para generar una respuesta de ventas.
 * @param {string} textoUsuario - El mensaje de texto recibido del usuario.
 * @returns {Promise<string>} - La respuesta generada por Gemini.
 */
async function generarRespuestaGemini(textoUsuario) {
    try {
        // Define las instrucciones del sistema para guiar a Gemini sobre su rol
        // *** PERSONALIZA ESTO CON LA INFORMACIÓN DETALLADA DE TUS SERVICIOS ***
        const systemInstructions = `Eres un agente de ventas amable, servicial y experto en servicios digitales para [JYJ Soluciones Digitales].
Tu objetivo principal es entender la problemática digital que el cliente describe y proponer los servicios específicos de [JYJ Soluciones Digitales] que pueden resolverla, explicando el beneficio para el cliente.

INFORMACIÓN SOBRE NUESTROS SERVICIOS:
- Servicio 1: [Nombre del Servicio 1]. Resuelve el problema de [Menciona el problema específico que resuelve]. Incluye [Características clave]. El beneficio para el cliente es [Describe el resultado positivo].
- Servicio 2: [Nombre del Servicio 2]. Ideal para [Tipo de cliente o situación]. Resuelve el problema de [Menciona el problema específico]. Incluye [Características clave]. El beneficio para el cliente es [Describe el resultado positivo].
- Servicio 3: [Nombre del Servicio 3]. Enfocado en [Aspecto específico]. Resuelve el problema de [Menciona el problema específico]. Incluye [Características clave]. El beneficio para el cliente es [Describe el resultado positivo].
- ... (Soluciones para tu empresa, transformación digital, marketing digital, etc.)

Instrucciones Adicionales:
- Mantén las respuestas concisas y directas al punto.
- Usa un tono profesional pero accesible.
- Siempre conecta la solución propuesta directamente con UNO O VARIOS de los servicios que ofreces.
- Si la problemática descrita es muy general o no encaja claramente con un servicio, haz una pregunta de clarificación amable para entender mejor su necesidad.
- Si el cliente pide hablar con un humano, usar palabras como "agente", "persona", "llamar", o hace una pregunta que no puedes responder con la información de tus servicios, indícale amablemente que derivarás su consulta a un especialista humano y que pronto se pondrán en contacto. NO inventes información sobre servicios que no tienes.
- Evita respuestas genéricas; intenta hacer referencia a la problemática específica que el usuario mencionó.
`;

        // Envía la solicitud a Gemini. Aquí usamos generateContent simple.
        // Para conversaciones más largas manteniendo contexto, se recomienda usar model.startChat().
        const result = await model.generateContent([
            { text: systemInstructions }, // Las instrucciones del sistema
            { text: textoUsuario } // El mensaje actual del usuario
        ]);

        // Extrae el texto de la respuesta. Maneja posibles errores o respuestas vacías.
        const response = result.response;
        const textoRespuesta = response.text();

        if (!textoRespuesta) {
             console.warn('Gemini no generó texto de respuesta.');
             return "Lo siento, no pude generar una respuesta en este momento.";
        }

        return textoRespuesta;

    } catch (error) {
        console.error('Error al llamar a la API de Gemini:', error);
        // Devuelve un mensaje de error amigable al usuario
        return "Lo siento, tengo dificultades técnicas para procesar tu solicitud en este momento. Por favor, inténtalo de nuevo más tarde.";
    }
}


// --- SECCIÓN 4: ENDPOINT WEBHOOK PARA RECIBIR MENSAJES DE WHATSAPP (POST) ---

// Endpoint que WhatsApp llamará cuando reciba un mensaje entrante
app.post('/whatsapp', async (req, res) => {
    console.log('Webhook recibido de WhatsApp:', JSON.stringify(req.body, null, 2)); // Log completo del cuerpo recibido

    // **IMPORTANTE:**
    // Esta es la parte CRÍTICA que DEBES adaptar. La estructura del 'req.body'
    // varía dependiendo de si usas la API directa de Meta o un BSP.
    // Consulta la documentación exacta que te proporcionó Meta o tu BSP.
    // El siguiente código es un EJEMPLO común basado en la estructura de Meta Cloud API, pero DEBE SER VERIFICADO y ADAPTADO.

    let textoUsuario = '';
    let numeroRemitente = '';
    let messageId = ''; // Puede ser útil para rastrear o evitar duplicados

    try {
        const changes = req.body.entry?.[0]?.changes?.[0];

        if (changes && changes.field === 'messages' && changes.value && changes.value.messages) {
             const message = changes.value.messages[0];
             numeroRemitente = message.from; // Número de teléfono del remitente
             messageId = message.id;

             if (message.type === 'text') {
                 textoUsuario = message.text.body; // El texto del mensaje
             } else {
                 // Manejar otros tipos de mensajes si es necesario (imágenes, audio, etc.)
                 // Por ahora, respondemos que solo procesamos texto
                 textoUsuario = `El usuario envió un mensaje de tipo: ${message.type}.`
                 console.log(`Mensaje de tipo ${message.type} recibido de ${numeroRemitente}.`);
                 // Podrías enviar un mensaje automático de vuelta aquí si quieres
                 // await enviarMensajeWhatsApp(numeroRemitente, "Actualmente solo puedo procesar mensajes de texto. ¿Podrías describir tu problema digital escribiendo?");
                 // Y no llamar a Gemini para este tipo de mensaje
                 // return res.sendStatus(200); // Acusa recibo y termina
             }

             // Opcional: Puedes marcar el mensaje como leído en WhatsApp
             // await marcarComoLeido(numeroRemitente, messageId);


        } else {
            // Podría ser una notificación de estado, cambio en metadata, etc.
            // No es un mensaje de usuario que necesite respuesta de Gemini.
            console.log('Evento de WhatsApp recibido que no es un mensaje de texto entrante relevante.');
            // Es crucial responder 200 OK a WhatsApp para cualquier webhook que recibas para acusar recibo.
            return res.sendStatus(200);
        }

    } catch (error) {
        console.error('Error al procesar el webhook de WhatsApp:', error);
         // Aunque haya error al procesar, responde 200 OK a WhatsApp para evitar reintentos infinitos
        return res.sendStatus(200); // O res.status(500).send('Error interno'); si quieres indicar problema a WhatsApp
    }


    console.log(`Mensaje entrante de ${numeroRemitente}: "${textoUsuario}"`);

    // Si logramos extraer texto del usuario, procesa con Gemini
    if (textoUsuario) {
        const respuestaGemini = await generarRespuestaGemini(textoUsuario);
        console.log('Respuesta generada por Gemini:', respuestaGemini);

        // *** TAREA PENDIENTE PARA EL SIGUIENTE PASO (Paso 4) ***
        // Aquí es donde, en el Paso 4, llamarás a la función para enviar
        // `respuestaGemini` de vuelta al `numeroRemitente` usando la API de WhatsApp.
        // await enviarMensajeWhatsApp(numeroRemitente, respuestaGemini);

        // Responde 200 OK a WhatsApp lo antes posible. Es vital hacerlo rápidamente.
        res.sendStatus(200);

    } else {
         // Si no hubo texto que procesar (ej. era un mensaje de tipo no soportado)
         res.sendStatus(200); // Responde 200 OK de todas formas
    }
});


// --- SECCIÓN 5: ENDPOINT DE VERIFICACIÓN PARA WHATSAPP (GET) ---

// Este endpoint es usado por WhatsApp solo una vez durante la configuración inicial del webhook
app.get('/whatsapp', (req, res) => {
    const verify_token = process.env.WHATSAPP_VERIFY_TOKEN; // El token que definiste en .env

    // Lee los parámetros de la solicitud de verificación
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log("Solicitud de verificación de Webhook recibida. Mode:", mode, "Token:", token, "Challenge:", challenge);

    // Verifica que el token y el modo sean correctos
    if (mode === 'subscribe' && token === verify_token) {
        // Responde con 200 OK y el valor del 'challenge'
        console.log('Webhook verificado exitosamente!');
        res.status(200).send(challenge);
    } else {
        // Si los tokens no coinciden o el modo es incorrecto
        console.error('Fallo la verificación del Webhook. Tokens no coinciden.');
        res.sendStatus(403); // Forbidden
    }
});


// --- SECCIÓN 6: INICIAR EL SERVIDOR ---

// Haz que la aplicación Express escuche en el puerto definido
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
  console.log(`Webhook de WhatsApp configurado en /whatsapp`);
  console.log(`Asegúrate de exponer este endpoint públicamente (ej. con ngrok) para que WhatsApp pueda contactarlo.`);
});


// --- SECCIÓN OPCIONAL/FUTURA: FUNCIÓN PARA ENVIAR MENSAJES DE VUELTA A WHATSAPP ---
// (Implementación real en Paso 4)

/*
async function enviarMensajeWhatsApp(numeroDestino, textoMensaje) {
    // *** ESTA FUNCIÓN SE COMPLETARÁ EN EL PASO 4 ***
    // Aquí usarías la API de WhatsApp Business Cloud (o la API de tu BSP)
    // para enviar el textoMensaje al numeroDestino.
    console.log(`--- Placeholder: Intentando enviar mensaje a ${numeroDestino}: "${textoMensaje}" ---`);
    // Ejemplo básico (NECESITA ADAPTACIÓN CON TU API DE WHATSAPP):
    // const whatsappApiUrl = 'URL_DE_LA_API_DE_WHATSAPP_O_BSP/messages';
    // const whatsappAccessToken = 'TU_ACCESS_TOKEN_DE_WHATSAPP'; // Desde tu configuración de la API/BSP

    // try {
    //     const response = await axios.post(whatsappApiUrl, {
    //         messaging_product: "whatsapp",
    //         to: numeroDestino,
    //         type: "text",
    //         text: { body: textoMensaje }
    //     }, {
    //         headers: {
    //             'Authorization': `Bearer ${whatsappAccessToken}`,
    //             'Content-Type': 'application/json'
    //         }
    //     });
    //     console.log('Mensaje enviado a WhatsApp:', response.data);
    // } catch (error) {
    //     console.error('Error al enviar mensaje a WhatsApp:', error.response?.data || error.message);
    // }
}

// Opcional: Función para marcar mensajes como leídos (requiere llamar a la API de WhatsApp)
// async function marcarComoLeido(numeroDestino, messageId) {
//     // Implementación para llamar a la API de WhatsApp y marcar el mensaje como leído
// }
*/