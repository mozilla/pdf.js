import OpenAI from "openai";
import { z } from "zod";

const openai = new OpenAI({
  apiKey:
    "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",
  dangerouslyAllowBrowser: true,
});

const pageStructureSchema = z.object({
  sections: z.array(
    z.object({
      title: z.string(),
      readingRelevance: z.number(),
      sentences: z.array(
        z.object({
          sentenceText: z.string(),
          continuesOnNextPage: z.boolean(),
          words: z.array(
            z.object({
              word: z.string(),
              indexInSentence: z.number(),
              continuesOnNextPage: z.boolean(),
            })
          ),
        })
      ),
    })
  ),
});

export type PageStructureSchema = z.infer<typeof pageStructureSchema>;

export async function analyzePageStructure(
  pageFile: File
): Promise<PageStructureSchema> {
  const base64Data = await fileToBase64(pageFile);

  const systemPrompt = `
  You are an expert PDF reader. Analyze the PDF page image and extract structured information about its content and layout.
  You need to first visually inspect the page to find text blocks and if applicable, a title for the given section.
  Then, you need to determine the reading relevance of the section (0-5), 0 being not relevant and 5 being very relevant.
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze this PDF page screenshot and extract the structure information according to the schema.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Data}`,
            },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "page_structure_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                  },
                  readingRelevance: {
                    type: "number",
                  },
                  sentences: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        sentenceText: {
                          type: "string",
                        },
                        continuesOnNextPage: {
                          type: "boolean",
                        },
                        words: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              word: {
                                type: "string",
                              },
                              indexInSentence: {
                                type: "number",
                              },
                              continuesOnNextPage: {
                                type: "boolean",
                              },
                            },
                            required: [
                              "word",
                              "indexInSentence",
                              "continuesOnNextPage",
                            ],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: [
                        "sentenceText",
                        "continuesOnNextPage",
                        "words",
                      ],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["title", "readingRelevance", "sentences"],
                additionalProperties: false,
              },
            },
          },
          required: ["sections"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error("No content in LLM response");
  }

  const rawData = JSON.parse(content);
  return pageStructureSchema.parse(rawData);
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(",")[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
