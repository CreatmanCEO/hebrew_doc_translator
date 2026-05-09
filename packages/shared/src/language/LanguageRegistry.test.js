// Unit-тесты LanguageRegistry + HebrewModule (P0-T07).
// Globals enabled через vitest config (vitest.config.js → test.globals: true).

const { LanguageRegistry } = require('./LanguageRegistry');
const { HebrewModule, detector } = require('./HebrewModule');

describe('HebrewModule.detector', () => {
  it('возвращает confidence > 0.9 на чистом иврите', () => {
    expect(detector('שלום עולם')).toBeGreaterThan(0.9);
  });

  it('возвращает 0 на чистом английском', () => {
    expect(detector('hello world')).toBe(0);
  });

  it('возвращает 0 на пустой/whitespace-only строке', () => {
    expect(detector('')).toBe(0);
    expect(detector('   \n\t')).toBe(0);
  });

  it('даёт промежуточный confidence на смешанном тексте', () => {
    // 4 ивр. + 5 лат. = 4/9 ≈ 0.44
    const conf = detector('שלום hello');
    expect(conf).toBeGreaterThan(0);
    expect(conf).toBeLessThan(1);
  });

  it('игнорирует не-string ввод (защита от undefined из pipeline)', () => {
    expect(detector(undefined)).toBe(0);
    expect(detector(null)).toBe(0);
    expect(detector(123)).toBe(0);
  });
});

describe('LanguageRegistry', () => {
  /** @type {LanguageRegistry} */
  let registry;

  beforeEach(() => {
    registry = new LanguageRegistry();
    registry.register(HebrewModule);
  });

  it('detect("שלום עולם") → { code: "he", confidence > 0.9 }', () => {
    const res = registry.detect('שלום עולם');
    expect(res.code).toBe('he');
    expect(res.confidence).toBeGreaterThan(0.9);
  });

  it('detect("hello world") → не "he"', () => {
    const res = registry.detect('hello world');
    expect(res.code).not.toBe('he');
    // С единственным зарегистрированным модулем fallback — 'unknown'.
    expect(res.code).toBe('unknown');
    expect(res.confidence).toBe(0);
  });

  it('get("he").direction === "rtl"', () => {
    expect(registry.get('he').direction).toBe('rtl');
  });

  it('get для незарегистрированного кода возвращает undefined', () => {
    expect(registry.get('ar')).toBeUndefined();
  });

  it('codes() возвращает зарегистрированные коды', () => {
    expect(registry.codes()).toEqual(['he']);
  });

  it('register() отвергает модуль без code/detector', () => {
    expect(() => registry.register({})).toThrow();
    expect(() => registry.register({ code: 'xx' })).toThrow();
    expect(() => registry.register({ code: 'xx', detector: 'not-a-fn' })).toThrow();
  });

  it('detect выбирает модуль с максимальным confidence', () => {
    // Фиктивный модуль "always 0.5" — должен проигрывать ивриту на ивритском
    // и выигрывать на нелатинской/неивритской строке.
    const dummyModule = {
      code: 'xx',
      direction: 'ltr',
      shapingRequired: false,
      detector: () => 0.5,
    };
    registry.register(dummyModule);

    expect(registry.detect('שלום שלום שלום').code).toBe('he');
    expect(registry.detect('hello').code).toBe('xx');
  });
});
