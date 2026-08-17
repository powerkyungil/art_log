const KOREAN_DATE = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const KOREAN_DATE_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const normalized = String(value).replace(' ', 'T');
  return new Date(normalized.includes('Z') ? normalized : `${normalized}+09:00`);
}

export function formatDate(value) {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return KOREAN_DATE.format(date).replaceAll('. ', '.').replace(/\.$/, '');
}

export function formatDateTime(value) {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return KOREAN_DATE_TIME.format(date).replaceAll('. ', '.').replace(',', ' ');
}

export function toDateTimeLocal(value) {
  if (!value) return '';
  const stringValue = String(value).replace(' ', 'T');
  return stringValue.slice(0, 16);
}

export function nowSql() {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export function displayName(name) {
  return `${name} 작가`;
}

export function statusLabel(status) {
  return {
    ACTIVE: '활동중',
    INACTIVE: '비활성',
    COMPLETED: '종료',
    SUBMITTED: '제출',
    CONFIRMED: '확인완료',
    NOT_SUBMITTED: '미제출',
    NOT_APPLICABLE: '해당없음'
  }[status] || status || '-';
}

export function statusClass(status) {
  return {
    ACTIVE: 'success',
    INACTIVE: 'muted',
    COMPLETED: 'info',
    SUBMITTED: 'warning',
    CONFIRMED: 'success',
    NOT_SUBMITTED: 'danger',
    NOT_APPLICABLE: 'muted'
  }[status] || 'muted';
}
