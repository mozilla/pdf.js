# A fork of PDF.js

The changes to the original repo:

- added gulp task to bundle TS modules and transpile TS
- minimal UI to the `web/viewer.hmtl`
- `/src/pdf-reader` folder where the TS modules are placed

## New Features

### Reader

Click "Read" button and listen to the pdf being read outloud.

1. LLM-based visual analysis
   - examines syntactical structure: what are the sections, titles, and sentences?
   - assigns semantical relevance: how relevant is a given section to a reader?
  
2. WordMap: relates the structure to the position of its elements on the rendered document
   - allows for location of each structural element on the rendered document
  
3. Create audio file with temporal references 
    - combines OpenAI's `speech` API with `transcription` API that returns audio with timestamps for each word

4. Play audio file
   - synchronized with Highlighter thanks to transcription timestamps and WordMap traverse API
  
### Highlighter

Walk through the pdf and highlight sentences and words one by one.

1. Leverages the pdf.js' internal event-based "search" functionality
2. Highlights the played word by comparing timestamps with Timer's state  
3. Simultaneously highlights the current sentence and word - TODO

    - the challenge lies in that the internal search is not able to find more than one thing at the same time
    - potential solution: double the code that searches and emit a different events fow words and sentences

## Run locally

1. clone repo
2. run `npm install` (Node v22)
3. add your OpenAI API Key in `src/pdf-reader/open-ai.ts`
4. run `npx gulp server`
5. Open `http://localhost:8888/web/viewer.html`
