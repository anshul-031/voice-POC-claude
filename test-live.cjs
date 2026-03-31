const { GoogleGenAI, Modality } = require('@google/genai');
const dotenv = require('dotenv');
dotenv.config();

const ai = new GoogleGenAI(); // uses process.env.GEMINI_API_KEY
async function main() {
  const session = await ai.live.connect({
    model: 'gemini-2.0-flash-exp',
    config: { responseModalities: [Modality.AUDIO] },
    callbacks: {
      onmessage: msg => {
        console.log("FROM SERVER:", Object.keys(msg));
        if (msg.serverContent) console.log("SERVER CONTENT:", JSON.stringify(msg.serverContent).substring(0, 100));
        process.exit(0);
      },
      onerror: err => console.log("ERROR", err)
    }
  });

  console.log("Connected");
  session.sendClientContent({ turns: "Hello!" });
}
main().catch(console.error);
