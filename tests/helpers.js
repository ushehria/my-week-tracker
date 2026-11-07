export function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    dump() {
      return { ...data };
    },
  };
}

export function readOnlyLegacyStorage(initial, legacyKey) {
  const storage = memoryStorage(initial);
  const raw = storage.getItem(legacyKey);
  return {
    getItem: (key) => storage.getItem(key),
    setItem(key, value) {
      if (key === legacyKey) {
        throw new Error(`Refusing to write legacy key ${legacyKey}`);
      }
      storage.setItem(key, value);
    },
    dump: () => storage.dump(),
    legacyRaw: raw,
  };
}
