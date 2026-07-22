export type NotifySynthProfile =
  | 'soft-chime'
  | 'ding'
  | 'pop'
  | 'glass'
  | 'water-drop'
  | 'office-soft'
  | 'digital-soft'
  | 'knock';

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// DIAGNOSTIC (log-only) — stable per-object id so Staff vs Guest logs reveal whether they share the
// SAME AudioContext instance. Same object → same id; a new context → a new id. No behavior change.
let synthCtxSeq = 0;
const synthCtxIds = new WeakMap<AudioContext, number>();
function synthCtxId(ctx: AudioContext): number {
  let id = synthCtxIds.get(ctx);
  if (id == null) {
    id = (synthCtxSeq += 1);
    synthCtxIds.set(ctx, id);
  }
  return id;
}

function tone(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  durationSec: number,
  volume: number,
  type: OscillatorType = 'sine'
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationSec + 0.02);
}

export async function playNotifySynthProfile(
  ctx: AudioContext,
  profile: NotifySynthProfile,
  volume: number
): Promise<void> {
  // DIAGNOSTIC — localize why a logged synth tone produces no audible output. AudioContext
  // playback fails SILENTLY when the context is suspended (osc.start(t0) with a frozen currentTime),
  // and the caller's catch swallows the reason. These logs record state / resume / start / errors.
  const ctxId = synthCtxId(ctx);
  const stateBeforePlay = ctx.state;
  console.log('[NOTIFY_SYNTH_STATE]', {
    phase: 'before_play',
    ctxId,
    profile,
    state: stateBeforePlay,
    currentTime: ctx.currentTime,
    sampleRate: ctx.sampleRate,
    destinationChannels: ctx.destination.maxChannelCount,
  });
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
      console.log('[NOTIFY_SYNTH_RESUME]', { ctxId, stateBefore: stateBeforePlay, stateAfter: ctx.state });
    } catch (err: unknown) {
      const e = err instanceof Error ? { name: err.name, message: err.message } : { name: 'unknown', message: String(err) };
      console.log('[NOTIFY_SYNTH_RESUME_FAILED]', { ctxId, stateBefore: stateBeforePlay, stateAfter: ctx.state, ...e });
      throw err; // preserve original behavior: a resume() rejection propagated out (→ caller ok=false)
    }
  }
  const t0 = ctx.currentTime;
  const v = Math.min(0.5, Math.max(0.2, volume));

  try {
    switch (profile) {
    case 'soft-chime':
      tone(ctx, 523.25, t0, 0.22, v * 0.9);
      tone(ctx, 659.25, t0 + 0.14, 0.28, v * 0.75);
      await sleep(420);
      break;
    case 'ding':
      tone(ctx, 880, t0, 0.18, v * 0.85);
      await sleep(220);
      break;
    case 'pop':
      tone(ctx, 420, t0, 0.08, v * 0.7, 'triangle');
      tone(ctx, 260, t0 + 0.05, 0.1, v * 0.5, 'triangle');
      await sleep(180);
      break;
    case 'glass':
      tone(ctx, 1200, t0, 0.12, v * 0.55);
      tone(ctx, 1800, t0 + 0.04, 0.16, v * 0.35);
      tone(ctx, 2400, t0 + 0.08, 0.2, v * 0.25);
      await sleep(320);
      break;
    case 'water-drop':
      tone(ctx, 640, t0, 0.1, v * 0.65);
      tone(ctx, 480, t0 + 0.08, 0.14, v * 0.5);
      tone(ctx, 360, t0 + 0.16, 0.18, v * 0.35);
      await sleep(380);
      break;
    case 'office-soft':
      tone(ctx, 600, t0, 0.1, v * 0.55);
      tone(ctx, 600, t0 + 0.16, 0.1, v * 0.45);
      await sleep(300);
      break;
    case 'digital-soft':
      tone(ctx, 740, t0, 0.06, v * 0.5, 'square');
      tone(ctx, 980, t0 + 0.09, 0.07, v * 0.4, 'square');
      await sleep(200);
      break;
    case 'knock':
      tone(ctx, 180, t0, 0.09, v * 0.7, 'triangle');
      tone(ctx, 140, t0 + 0.1, 0.11, v * 0.55, 'triangle');
      await sleep(240);
      break;
    default:
      await sleep(0);
    }
    // Oscillators are scheduled at t0 = ctx.currentTime; audible ONLY if the context is 'running'.
    console.log('[NOTIFY_SYNTH_STARTED]', { ctxId, profile, state: ctx.state, t0, v });
  } catch (err: unknown) {
    const e = err instanceof Error ? { name: err.name, message: err.message } : { name: 'unknown', message: String(err) };
    console.log('[NOTIFY_SYNTH_PLAY_FAILED]', { ctxId, profile, state: ctx.state, ...e });
    throw err; // preserve existing behavior: the caller's catch maps this to ok=false
  }
}
