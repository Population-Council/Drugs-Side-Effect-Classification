// --------------------------------------------------------------------------------------------------------//
// Primary color constants for the theme
export const PRIMARY_MAIN = "#444E56"; // The main primary color used for buttons, highlights, etc.
export const primary_50 = "#E7B00C"; // The 50 variant of the primary color

// Background color constants
export const SECONDARY_MAIN = "#D3D3D3"; // The main secondary color used for less prominent elements

// Chat component background colors
export const CHAT_BODY_BACKGROUND = "#FFFFFF"; // Background color for the chat body area
export const CHAT_LEFT_PANEL_BACKGROUND = "#444E56"; // Background color for the left panel in the chat
export const ABOUT_US_HEADER_BACKGROUND = "#FFFFFF"; // Background color for the About Us section in the left panel
export const FAQ_HEADER_BACKGROUND = "#FFFFFF"; // Background color for the FAQ section in the left panel
export const ABOUT_US_TEXT = "#FFFFFF"; // Text color for the About Us section in the left panel
export const FAQ_TEXT = "#FFFFFF"; // Text color for the FAQ section in the left panel
export const HEADER_BACKGROUND = "#FFFFFF"; // Background color for the header
export const HEADER_TEXT_GRADIENT = "#444E56"; // Text gradient color for the header

// Message background colors
export const BOTMESSAGE_BACKGROUND = "#F5F5F5"; // Background color for messages sent by the bot
export const USERMESSAGE_BACKGROUND = "#FFEFCA"; // Background color for messages sent by the user

// --------------------------------------------------------------------------------------------------------//
// --------------------------------------------------------------------------------------------------------//

// Text Constants
export const TEXT = {
  EN: {
    APP_NAME: "Chatbot Template App",
    APP_ASSISTANT_NAME: "GenAI Bot",
    ABOUT_US_TITLE: "About Us",
    ABOUT_US: "Welcome to the GenAI chat bot! We're here to assist to quickly access relevant information.",
    FILE_PREVIEW:"Uploaded File",
    FAQ_TITLE: "Frequently Asked Questions",
    FAQS: [
      "What is React JS? and How do I get started?",
      "What is a Chatbot and how does it work?",
      "Write me a essay on the history of the internet.",
      "What is the capital of France and its population?",
      "What is the weather like in New York?"
    ],
    CHAT_HEADER_TITLE: "Sample AI Chat Assistant",
    CHAT_INPUT_PLACEHOLDER: "Type a Query...",
    HELPER_TEXT: "Cannot send empty message",
    SPEECH_RECOGNITION_START: "Start Listening",
    SPEECH_RECOGNITION_STOP: "Stop Listening",
    SPEECH_RECOGNITION_HELPER_TEXT: "Stop speaking to send the message" // New helper text
  },
  ES: {
    APP_NAME: "Aplicación de Plantilla de Chatbot",
    APP_ASSISTANT_NAME: "Bot GenAI",
    ABOUT_US_TITLE: "Acerca de nosotros",
    ABOUT_US: "¡Bienvenido al chatbot GenAI! Estamos aquí para ayudarte a acceder rápidamente a la información relevante.",
    FILE_PREVIEW:"Vista previa del documento",
    FAQ_TITLE: "Preguntas frecuentes",
    FAQS: [
      "¿Qué es React JS? y ¿Cómo puedo empezar?",
      "¿Qué es un Chatbot y cómo funciona?",
      "Escríbeme un ensayo sobre la historia de Internet.",
      "¿Cuál es la capital de Francia y su población?",
      "¿Cómo está el clima en Nueva York?"
    ],
    CHAT_HEADER_TITLE: "Asistente de Chat AI de Ejemplo",
    CHAT_INPUT_PLACEHOLDER: "Escribe una Consulta...",
    HELPER_TEXT: "No se puede enviar un mensaje vacío",
    SPEECH_RECOGNITION_START: "Comenzar a Escuchar",
    SPEECH_RECOGNITION_STOP: "Dejar de Escuchar",
    SPEECH_RECOGNITION_HELPER_TEXT: "Deja de hablar para enviar el mensaje" // New helper text
  }
};

export const SWITCH_TEXT = {
  SWITCH_LANGUAGE_ENGLISH: "English",
  SWITCH_TOOLTIP_ENGLISH: "Language",
  SWITCH_LANGUAGE_SPANISH: "Español",
  SWITCH_TOOLTIP_SPANISH: "Idioma"
};

export const LANDING_PAGE_TEXT = {
  EN: {
    CHOOSE_LANGUAGE: "Choose language:",
    ENGLISH: "English",
    SPANISH: "Español",
    SAVE_CONTINUE: "Save and Continue",
    APP_ASSISTANT_NAME: "Sample GenAI Bot Landing Page",
    WELCOME_MESSAGE : "This chat is designed to help you access information about XYZ. You can ask questions about some FAQ and more!",
  },
  ES: {
    CHOOSE_LANGUAGE: "Elige el idioma:",
    ENGLISH: "English",
    SPANISH: "Español",
    SAVE_CONTINUE: "Guardar y continuar",
    APP_ASSISTANT_NAME: "Bot GenAI de Ejemplo Página de Inicio",
    WELCOME_MESSAGE : "Este chat está diseñado para ayudarte a acceder a información sobre XYZ. ¡Puedes hacer preguntas sobre algunas FAQ y más!",
  }
};


// --------------------------------------------------------------------------------------------------------//
// --------------------------------------------------------------------------------------------------------//

// API endpoints

export const CHAT_API = process.env.REACT_APP_CHAT_API; // URL for the chat API endpoint
export const WEBSOCKET_API = process.env.REACT_APP_WEBSOCKET_API; // URL for the WebSocket API endpoint
export const AVATAR_BOT_WEBSITE_LINK = process.env.REACT_APP_AVATAR_BOT_WEBSITE_LINK; // URL for the avatar bot
// --------------------------------------------------------------------------------------------------------//
// --------------------------------------------------------------------------------------------------------//
export const MAX_TEXT_LENGTH_PDF = 5000; // Number of words to check for PDF size (150000 - 200000 is good enough for 200k token limit of claude)

// Features
export const ALLOW_FILE_UPLOAD = true; // Set to true to enable file upload feature
export const ALLOW_VOICE_RECOGNITION = false; // Set to true to enable voice recognition feature
export const ALLOW_MULTLINGUAL_TOGGLE = false; // Set to true to enable multilingual support

export const ALLOW_MARKDOWN_BOT = false; // Set to true to enable markdown support for bot messages

export const ALLOW_LANDING_PAGE = false; // Set to true to enable the landing page
export const ALLOW_AVATAR_BOT = false; // Set to true to enable the avatar for the bot
export const ALLOW_PDF_PREVIEW = true; // Set to true to enable PDF preview
export const ALLOW_VIDEO_PREVIEW = true; // Set to true to enable video preview
export const ALLOW_CHAT_HISTORY = true; // Set to true to enable chat history
// --------------------------------------------------------------------------------------------------------//
// Styling under work, would reccomend keeping it false for now
export const ALLOW_FAQ = true; // Set to true to enable the FAQs to be visible in Chat body 

// VERY IMPORTANT
// (If there is any)REMOVE THE POST PROCESSING IN SPEECH RECOGNITION TO DETECT CALVIN AS KELYVIN IN SPEECH RECOGNITION COMPONENT
// ALSO update the title in the index.html file in the public folder
// Change the public favicon.ico to the new favicon.ico that you would like to use