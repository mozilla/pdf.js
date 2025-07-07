import { z } from "zod";
import { openai } from "./open-ai";
import { loadCompletionFixtures, saveCompletionFixtures } from "./fixtures";
import { IS_DEV, CAPTURE_FIXTURES } from "./config";

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
export type Sentence =
  PageStructureSchema["sections"][number]["sentences"][number];

export async function analyzePageStructure(
  pageFile: File
): Promise<PageStructureSchema> {
  // In development mode, try to load fixtures first
  if (IS_DEV) {
    try {
      const fixtures = await loadCompletionFixtures(
        "analyzePageStructureFixture"
      );
      if (fixtures) {
        return fixtures;
      }
    } catch (error) {
      console.warn(
        "Failed to load completion fixtures, falling back to OpenAI:",
        error
      );
    }
  }

  // Generate completion using OpenAI API
  const base64Data = await fileToBase64(pageFile);

  const systemPrompt = `
  ## You are an expert PDF reader. 
  Analyze the PDF page image and extract structured information about its content and layout - as described in the schema.
  Think of this task as a preparation for a reading assistant.

  ## Schema 
  ${pageStructureSchema.describe("JSON schema for the page structure")}

  ## Instructions

  ### Sections
  1. Visually inspect the page to find text blocks and a title for the given section.
    - title should be always in a separate section.
    - if group of text is in a similar font, put it in a single section, otherwise create a new section for each group.
    - if a wider-than-average (line height) white space is between two blocks of text, treat it as a delimiter between two separate sections.
  2. Do not omit short sections, like article titles, authors, table of contents, etc.
  3. If a section continues on the next page, set the continuesOnNextPage flag to true, otherwise false.

  ### Reading Relevance
  1. Assign a reading relevance score (0-5) to every section, 0 being not relevant and 5 being very relevant. You must not omit any section in your response.
  2. Title should have a reading relevance score of 5.
  3. Examine fonts: 
  - sections with fonts with bold text should have a higher reading relevance score.
  - sections with small or light fonts should have a lower reading relevance score.
  - regular fonts should be have a reading relevance score of 5.

  ### Sentences
  1. Don't omit ANY sentence from a given section. You must include all sentences!
  2. If a sentence is broken into multiple lines, PRESERVE the exact characters of the sentence.
  - Example: "The quick brown ele - phant jumps over the lazy dog" should be preserved as is, with hyphen and spaces.
  3. If a sentence continues on the next page, set the continuesOnNextPage flag to true.
  
  ---
  Here is the PDF page image:
  `;

  try {
    const completion = await openai.chat.completions.create({
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

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error("No content in LLM response");
    }

    const rawData = JSON.parse(content);
    const parsedData = pageStructureSchema.parse(rawData);
    const filteredPageStructure = applyRelevanceFilter(parsedData);

    // Optionally save the generated completion as fixtures
    if (IS_DEV && CAPTURE_FIXTURES) {
      await saveCompletionFixtures(
        filteredPageStructure,
        "analyzePageStructureFixture"
      );
    }

    return filteredPageStructure;
  } catch (error) {
    console.error("Error analyzing page structure:", error);
    throw error;
  }
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

function applyRelevanceFilter(
  pageStructure: PageStructureSchema
): PageStructureSchema {
  return {
    sections: pageStructure.sections.filter(
      section => section.readingRelevance === 5
    ),
  };
}
