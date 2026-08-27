import {
  GeminiAnalysisProvider
} from "../src/modules/analysis/gemini.provider.js";

const provider = new GeminiAnalysisProvider();

const result = await provider.analyze({
  analysisDate: new Date().toISOString().slice(0, 10),
  companyPrompt:
    "We are a web-development agency. Never promise prices or delivery dates.",
  inquiry: {
    name: "Demo Customer",
    email: "demo@example.com",
    phone: null,
    service: "Website development",
    message:
      "We need a new company website by the end of next month. Our budget is around 5000 EUR."
  }
});

console.dir(result, { depth: null });