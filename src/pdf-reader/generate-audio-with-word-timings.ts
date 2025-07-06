import { openai } from "./open-ai";

export async function generateAudioWithWordTimings(input: string) {
  const speechResponse = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    input,
    voice: "alloy",
    speed: 0.9,
    response_format: "wav",
  });

  const audioBuf = await speechResponse.arrayBuffer();

  const file = new File([audioBuf], "speech.wav", { type: "audio/wav" });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  });

  return {
    audioBuffer: audioBuf,
    transcription,
  };
}
