import { z } from "zod";
import { openai } from "./open-ai";

const pageStructureSchema = z.object({
  sections: z.array(
    z.object({
      title: z.string(),
      readingRelevance: z.number(),
      sentences: z.array(
        z.object({
          sentenceText: z.string(),
          continuesOnNextPage: z.boolean(),
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
  ## You are an expert PDF reader. 
  Analyze the PDF page image and extract structured information about its content and layout.
  Think of this task as a preparation for a reading assistant.

  ## Instructions
  1. Visually inspect the page to find text blocks and if applicable, a title for the given section.
  2. Do not omit short sections, like article titles, authors, table of contents, etc.
  3. Assign a reading relevance score (0-5) to every section, 0 being not relevant and 5 being very relevant. You must not omit any section in your response.
  4. If a section continues on the next page, set the continuesOnNextPage flag to true, otherwise false.
  5. If a sentence continues on the next page, set the continuesOnNextPage flag to true.

  ## Schema 
  ${pageStructureSchema.describe("JSON schema for the page structure")}
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-2024-11-20",
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
                      },
                      required: ["sentenceText", "continuesOnNextPage"],
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
