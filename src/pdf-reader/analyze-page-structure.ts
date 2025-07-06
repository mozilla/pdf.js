import { OpenAIChatApi } from "llm-api";
import { completion } from "zod-gpt";
import { z } from "zod";

const OPENAI_API_KEY =
  "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";

const openai = new OpenAIChatApi(
  { apiKey: OPENAI_API_KEY, dangerouslyAllowBrowser: true },
  { model: "gpt-4o-mini", temperature: 0 }
);

export async function analyzePageStructure() {
  const structureSchema = z.object({
    sections: z.array(
      z.object({
        sentences: z.array(
          z.object({
            sentenceText: z.string(),
            pageStart: z.number(),
            pageEnd: z.number(),
            words: z.array(
              z.object({
                word: z.string(),
                indexInSentence: z.number(),
                page: z.number(),
              })
            ),
          })
        ),
      })
    ),
  });

  const systemPrompt = `
  You are an expert in PDF structure analysis.
  Analyze PDF page content and return structured data about sentences and words.
  `;

  const result = await completion(openai, systemPrompt, {
    autoSlice: true,
    schema: structureSchema,
  });

  return result?.data;
}
