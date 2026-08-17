export function toSqlDateTime(value) {
  const stringValue = String(value || '').trim().replace('T', ' ');
  if (!stringValue) return '';
  return stringValue.length === 16 ? `${stringValue}:00` : stringValue;
}

export function localNextPath(value, fallback = '/admin') {
  const next = String(value || '');
  return next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
