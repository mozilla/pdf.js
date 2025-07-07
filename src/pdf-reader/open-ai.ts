import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: "<your-api-key>",
  dangerouslyAllowBrowser: true,
});
