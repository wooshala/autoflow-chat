import { jsonOk } from '@/lib/api/envelope';

export async function GET() {
  const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  return jsonOk({
    serverTtsAvailable: hasOpenAiKey,
    hasOpenAiKey,
    model: 'tts-1',
    locale: 'ru'
  });
}
