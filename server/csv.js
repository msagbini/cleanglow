// Minimal, dependency-free CSV writer — hand-rolled because the escaping
// rules are simple and well-defined (RFC 4180): quote a field if it contains
// a comma, quote, or newline, and double up any quotes inside it.
function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows, columns) {
  const header = columns.map(c => csvEscape(c.label)).join(',');
  const lines = rows.map(row => columns.map(c => csvEscape(c.value(row))).join(','));
  return [header, ...lines].join('\r\n');
}
