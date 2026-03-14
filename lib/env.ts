export const APP_MODE = process.env.NEXT_PUBLIC_APP_MODE === 'production' ? 'production' : 'mock';
export const IS_MOCK = APP_MODE === 'mock';
