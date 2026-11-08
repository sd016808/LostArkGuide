// Minimal implementation of devalue's stringify / unflatten
// (https://github.com/Rich-Harris/devalue) — the wire format used by
// SvelteKit remote functions on lostark.bible.
(function (global) {
  const UNDEFINED = -1, HOLE = -2, NAN = -3, POS_INF = -4, NEG_INF = -5, NEG_ZERO = -6;

  function unflatten(parsed) {
    if (typeof parsed === 'number') return hydrate(parsed, true);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Invalid devalue input');
    const values = parsed;
    const hydrated = Array(values.length);

    function hydrate(index, standalone) {
      if (index === UNDEFINED) return undefined;
      if (index === NAN) return NaN;
      if (index === POS_INF) return Infinity;
      if (index === NEG_INF) return -Infinity;
      if (index === NEG_ZERO) return -0;
      if (standalone) throw new Error('Invalid input');
      if (index in hydrated) return hydrated[index];
      const value = values[index];
      if (!value || typeof value !== 'object') {
        hydrated[index] = value;
      } else if (Array.isArray(value)) {
        if (typeof value[0] === 'string') {
          const type = value[0];
          switch (type) {
            case 'Date': hydrated[index] = new Date(value[1]); break;
            case 'Set': { const s = new Set(); hydrated[index] = s; for (let i = 1; i < value.length; i++) s.add(hydrate(value[i])); break; }
            case 'Map': { const m = new Map(); hydrated[index] = m; for (let i = 1; i < value.length; i += 2) m.set(hydrate(value[i]), hydrate(value[i + 1])); break; }
            case 'RegExp': hydrated[index] = new RegExp(value[1], value[2]); break;
            case 'Object': hydrated[index] = Object(value[1]); break;
            case 'BigInt': hydrated[index] = BigInt(value[1]); break;
            case 'null': { const o = Object.create(null); hydrated[index] = o; for (let i = 1; i < value.length; i += 2) o[value[i]] = hydrate(value[i + 1]); break; }
            default: throw new Error('Unknown devalue type ' + type);
          }
        } else {
          const arr = new Array(value.length);
          hydrated[index] = arr;
          for (let i = 0; i < value.length; i++) {
            if (value[i] === HOLE) continue;
            arr[i] = hydrate(value[i]);
          }
        }
      } else {
        const obj = {};
        hydrated[index] = obj;
        for (const key in value) obj[key] = hydrate(value[key]);
      }
      return hydrated[index];
    }
    return hydrate(0);
  }

  function stringify(value) {
    const stringified = [];
    const indexes = new Map();
    function flatten(thing) {
      if (typeof thing === 'function') throw new Error('Cannot stringify a function');
      if (indexes.has(thing)) return indexes.get(thing);
      if (thing === undefined) return UNDEFINED;
      if (Number.isNaN(thing)) return NAN;
      if (thing === Infinity) return POS_INF;
      if (thing === -Infinity) return NEG_INF;
      if (thing === 0 && 1 / thing < 0) return NEG_ZERO;
      const index = stringified.length;
      indexes.set(thing, index);
      stringified.push('');
      let str;
      if (thing === null || typeof thing !== 'object') {
        str = JSON.stringify(thing);
      } else if (Array.isArray(thing)) {
        str = '[' + thing.map((v, i) => (i in thing ? flatten(v) : HOLE)).join(',') + ']';
      } else if (thing instanceof Date) {
        str = '["Date","' + thing.toISOString() + '"]';
      } else {
        str = '{' + Object.keys(thing).map((k) => JSON.stringify(k) + ':' + flatten(thing[k])).join(',') + '}';
      }
      stringified[index] = str;
      return index;
    }
    const idx = flatten(value);
    if (idx < 0) return String(idx);
    return '[' + stringified.join(',') + ']';
  }

  const api = { unflatten, stringify, parse: (s) => unflatten(JSON.parse(s)) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.devalue = api;
})(typeof window !== 'undefined' ? window : globalThis);
