import OpenAI from 'openai';
import { TranslatedText } from '@/lib/types';

const MODEL = 'gpt-4o-mini';
const LANGS = ['ko', 'vi', 'ru', 'en'] as const;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function guessLanguage(text: string): string {
  if (/[\u0400-\u04FF]/.test(text)) return 'ru';
  if (/[가-힣]/.test(text)) return 'ko';
  if (/[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụýỳỷỹỵ]/i.test(text)) return 'vi';
  return 'en';
}

export async function detectAndTranslate(text: string): Promise<{ detected_lang: string; translations: TranslatedText }> {
  const fallbackLang = guessLanguage(text);
  const fallback: TranslatedText = { ko: text, vi: text, ru: text, en: text };
  if (!openai) return { detected_lang: fallbackLang, translations: fallback };

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Detect the language and translate the user text into ko, vi, ru, en. Return JSON with keys detected_lang and translations where translations is an object with keys ko, vi, ru, en.'
        },
        { role: 'user', content: text }
      ]
    });
    const raw = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw) as { detected_lang?: string; translations?: TranslatedText };
    return {
      detected_lang: parsed.detected_lang || fallbackLang,
      translations: { ...fallback, ...(parsed.translations || {}) }
    };
  } catch {
    return { detected_lang: fallbackLang, translations: fallback };
  }
}
