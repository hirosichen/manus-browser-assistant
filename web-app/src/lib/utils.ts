import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function truncateUrl(url: string, maxLength: number = 50): string {
  if (url.length <= maxLength) return url;

  try {
    const urlObj = new URL(url);
    const shortened = urlObj.hostname + urlObj.pathname;
    if (shortened.length <= maxLength) return shortened;
    return shortened.slice(0, maxLength - 3) + '...';
  } catch {
    return url.slice(0, maxLength - 3) + '...';
  }
}
