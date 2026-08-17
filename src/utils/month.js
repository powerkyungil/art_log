const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentMonth() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

export function normalizeMonth(value) {
  const month = String(value || '');
  return MONTH_PATTERN.test(month) ? month : currentMonth();
}
