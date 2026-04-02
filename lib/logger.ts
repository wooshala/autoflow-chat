const isDev = process.env.NODE_ENV !== 'production';

export const log = {
  debug: (...args: any[]) => {
    if (isDev) console.log('[DEBUG]', ...args);
  },
  info: (...args: any[]) => {
    console.log('[INFO]', ...args);
  },
  warn: (...args: any[]) => {
    console.warn('[WARN]', ...args);
  },
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args);
  }
};

/** 태그를 첫 인자로 고정해 console 치환 시 패턴 유지 */
export function createTaggedLogger(tag: string) {
  return {
    debug: (...args: any[]) => log.debug(tag, ...args),
    info: (...args: any[]) => log.info(tag, ...args),
    warn: (...args: any[]) => log.warn(tag, ...args),
    error: (...args: any[]) => log.error(tag, ...args)
  };
}

