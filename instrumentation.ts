/** Next.js server startup — env diagnostics (no secret values). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log({
      hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY?.trim())
    });
  }
}
