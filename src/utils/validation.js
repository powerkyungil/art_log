export function required(value) {
  return String(value ?? '').trim();
}

export function isValidUrl(value) {
  try {
    const url = new URL(String(value).trim());
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

export function isValidDateTime(value) {
  return /^\d{4}-\d{2}-\d{2}T?\d{2}:\d{2}(:\d{2})?$/.test(String(value || ''));
}

export function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseErrors(errors) {
  return errors.filter(Boolean);
}
