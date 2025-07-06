export interface PageStructure {
  pageNumber: number;
  elements: string[];
  wordCount: number;
}

export function analyzePageStructure(pageNumber: number): PageStructure {
  return {
    pageNumber,
    elements: ["text", "images", "links"],
    wordCount: Math.floor(Math.random() * 1000) + 100,
  };
}
