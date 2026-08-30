// IMAGE-CHAT-01A — map Postgres RPC exceptions to API error codes.

export type GuestAttachmentRpcError =
  | 'INVALID_TOKEN'
  | 'ALREADY_USED'
  | 'EXPIRED'
  | 'CROSS_SESSION'
  | 'INVALID_SENDER';

export function parseGuestAttachmentRpcError(error: { message?: string } | null): GuestAttachmentRpcError | null {
  const msg = String(error?.message ?? '');
  if (msg.includes('ALREADY_USED')) return 'ALREADY_USED';
  if (msg.includes('EXPIRED')) return 'EXPIRED';
  if (msg.includes('CROSS_SESSION')) return 'CROSS_SESSION';
  if (msg.includes('INVALID_SENDER')) return 'INVALID_SENDER';
  if (msg.includes('INVALID_TOKEN')) return 'INVALID_TOKEN';
  return null;
}
