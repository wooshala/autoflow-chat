import type { MainCategory, ClassificationFlags } from '@/lib/chat/classifyMessageCategory';

export type QueuePriority = 1 | 2 | 3 | 4;

export function getQueuePriority(params: {
  mainCategory: MainCategory;
  flags: ClassificationFlags;
}): QueuePriority {
  const { mainCategory, flags } = params;
  if (flags.urgent) return 1;
  if (mainCategory === 'repair' || mainCategory === 'environment') return 2;
  if (mainCategory === 'cleaning' || mainCategory === 'turnover') return 3;
  return 4;
}

