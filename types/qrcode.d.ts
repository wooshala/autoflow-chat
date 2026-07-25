/** Ambient types for `qrcode` (no @types package — keep deps minimal). */
declare module 'qrcode' {
  export type QRCodeErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H' | number;

  export interface QRCodeToDataURLOptions {
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
    type?: 'image/png' | 'image/jpeg' | 'image/webp';
    quality?: number;
    margin?: number;
    width?: number;
    color?: { dark?: string; light?: string };
    rendererOpts?: { quality?: number };
  }

  export interface QRCodeToBufferOptions extends QRCodeToDataURLOptions {
    type?: 'png' | 'jpeg';
  }

  const QRCode: {
    toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
    toBuffer(text: string, options?: QRCodeToBufferOptions): Promise<Buffer>;
    toString(text: string, options?: Record<string, unknown>): Promise<string>;
  };

  export default QRCode;
}
