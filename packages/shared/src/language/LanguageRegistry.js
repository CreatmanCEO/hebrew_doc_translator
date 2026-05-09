// @hdt/shared/language/LanguageRegistry — реестр LanguageModule.
// См. ARCHITECTURE.md §4. Намеренно language-agnostic: добавление нового
// языка = новый файл-модуль + register() в bootstrap; правок в ядре не требуется.

/**
 * @typedef {import('./LanguageModule').LanguageModule} LanguageModule
 * @typedef {{ code: string, confidence: number }} DetectionResult
 */

class LanguageRegistry {
  constructor() {
    /** @type {Map<string, LanguageModule>} */
    this.modules = new Map();
  }

  /**
   * @param {LanguageModule} mod
   */
  register(mod) {
    if (!mod || typeof mod !== 'object' || typeof mod.code !== 'string') {
      throw new TypeError('LanguageRegistry.register: module.code (string) is required');
    }
    if (typeof mod.detector !== 'function') {
      throw new TypeError(`LanguageRegistry.register: module "${mod.code}" must expose detector()`);
    }
    this.modules.set(mod.code, mod);
  }

  /**
   * @param {string} code
   * @returns {LanguageModule | undefined}
   */
  get(code) {
    return this.modules.get(code);
  }

  /**
   * Прогоняет text через detector каждого зарегистрированного модуля
   * и возвращает результат с наибольшим confidence. Если ни один модуль
   * не дал > 0 — возвращает { code: 'unknown', confidence: 0 }.
   *
   * @param {string} text
   * @returns {DetectionResult}
   */
  detect(text) {
    let best = { code: 'unknown', confidence: 0 };
    for (const mod of this.modules.values()) {
      const raw = mod.detector(text);
      // detector контракт допускает boolean (для совместимости с описанием в ARCHITECTURE),
      // но MVP-реализации возвращают number ∈ [0, 1]. Нормализуем.
      const confidence = typeof raw === 'boolean' ? (raw ? 1 : 0) : Number(raw) || 0;
      if (confidence > best.confidence) {
        best = { code: mod.code, confidence };
      }
    }
    return best;
  }

  /** @returns {string[]} */
  codes() {
    return Array.from(this.modules.keys());
  }
}

module.exports = { LanguageRegistry };
