/**
 * Helper function to parse query string (e.g. ?param1=value&parm2=...).
 */
export default function parseQueryString(query) {
  let parts = query.split('&');
  let params = Object.create(null);
  for (let i = 0, ii = parts.length; i < ii; ++i) {
    let param = parts[i].split('=');
    let key = param[0].toLowerCase();
    let value = param.length > 1 ? param[1] : null;
    params[decodeURIComponent(key)] = decodeURIComponent(value);
  }
  return params;
}
