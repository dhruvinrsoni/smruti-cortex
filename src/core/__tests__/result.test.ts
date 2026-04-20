import { describe, it, expect } from 'vitest';
import {
  ok, err, map, mapErr, andThen,
  unwrapOr, unwrapOrElse, match,
  tryCatch, tryCatchAsync, collectResults,
  type Result,
} from '../result';

describe('Result type', () => {
  describe('ok / err constructors', () => {
    it('ok creates Ok variant with value', () => {
      const r = ok(42);
      expect(r.ok).toBe(true);
      expect(r.isOk).toBe(true);
      expect(r.isErr).toBe(false);
      expect(r.value).toBe(42);
    });

    it('err creates Err variant with error', () => {
      const r = err('not found');
      expect(r.ok).toBe(false);
      expect(r.isOk).toBe(false);
      expect(r.isErr).toBe(true);
      expect(r.error).toBe('not found');
    });

    it('ok with complex value', () => {
      const data = { items: [1, 2, 3], total: 3 };
      const r = ok(data);
      expect(r.value).toEqual(data);
    });

    it('err with Error object', () => {
      const e = new Error('fail');
      const r = err(e);
      expect(r.error).toBe(e);
      expect(r.error.message).toBe('fail');
    });
  });

  describe('map', () => {
    it('transforms Ok value', () => {
      const r = map(ok(10), x => x * 2);
      expect(r.ok).toBe(true);
      if (r.ok) {expect(r.value).toBe(20);}
    });

    it('passes Err through unchanged', () => {
      const r = map(err('bad') as Result<number, string>, x => x * 2);
      expect(r.ok).toBe(false);
      if (!r.ok) {expect(r.error).toBe('bad');}
    });
  });

  describe('mapErr', () => {
    it('transforms Err error', () => {
      const r = mapErr(err('not found'), e => `Error: ${e}`);
      expect(r.ok).toBe(false);
      if (!r.ok) {expect(r.error).toBe('Error: not found');}
    });

    it('passes Ok through unchanged', () => {
      const r = mapErr(ok(42) as Result<number, string>, e => `Error: ${e}`);
      expect(r.ok).toBe(true);
      if (r.ok) {expect(r.value).toBe(42);}
    });
  });

  describe('andThen', () => {
    const parseInt = (s: string): Result<number, string> => {
      const n = Number(s);
      return isNaN(n) ? err('NaN') : ok(n);
    };

    it('chains successful operations', () => {
      const r = andThen(ok('42'), parseInt);
      expect(r.ok).toBe(true);
      if (r.ok) {expect(r.value).toBe(42);}
    });

    it('short-circuits on Err input', () => {
      const r = andThen(err('initial') as Result<string, string>, parseInt);
      expect(r.ok).toBe(false);
      if (!r.ok) {expect(r.error).toBe('initial');}
    });

    it('propagates Err from chained function', () => {
      const r = andThen(ok('abc'), parseInt);
      expect(r.ok).toBe(false);
      if (!r.ok) {expect(r.error).toBe('NaN');}
    });
  });

  describe('unwrapOr', () => {
    it('returns value for Ok', () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it('returns fallback for Err', () => {
      expect(unwrapOr(err('bad') as Result<number, string>, 0)).toBe(0);
    });
  });

  describe('unwrapOrElse', () => {
    it('returns value for Ok', () => {
      expect(unwrapOrElse(ok(42), () => 0)).toBe(42);
    });

    it('computes fallback from error for Err', () => {
      const r: Result<number, string> = err('length:5');
      expect(unwrapOrElse(r, e => Number(e.split(':')[1]))).toBe(5);
    });
  });

  describe('match', () => {
    it('calls ok handler for Ok', () => {
      const result = match(ok(10), {
        ok: v => `value=${v}`,
        err: e => `error=${e}`,
      });
      expect(result).toBe('value=10');
    });

    it('calls err handler for Err', () => {
      const result = match(err('fail') as Result<number, string>, {
        ok: v => `value=${v}`,
        err: e => `error=${e}`,
      });
      expect(result).toBe('error=fail');
    });
  });

  describe('tryCatch', () => {
    it('wraps successful function in Ok', () => {
      const r = tryCatch(() => JSON.parse('{"a":1}'));
      expect(r.ok).toBe(true);
      if (r.ok) {expect(r.value).toEqual({ a: 1 });}
    });

    it('wraps thrown Error in Err', () => {
      const r = tryCatch(() => JSON.parse('{invalid'));
      expect(r.ok).toBe(false);
      if (!r.ok) {expect(r.error).toBeInstanceOf(Error);}
    });

    it('wraps non-Error throw in Err with stringified message', () => {
      const r = tryCatch(() => { throw 'string error'; });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBeInstanceOf(Error);
        expect(r.error.message).toBe('string error');
      }
    });
  });

  describe('tryCatchAsync', () => {
    it('wraps successful async function in Ok', async () => {
      const r = await tryCatchAsync(async () => 42);
      expect(r.ok).toBe(true);
      if (r.ok) {expect(r.value).toBe(42);}
    });

    it('wraps rejected promise in Err', async () => {
      const r = await tryCatchAsync(async () => { throw new Error('async fail'); });
      expect(r.ok).toBe(false);
      if (!r.ok) {expect(r.error.message).toBe('async fail');}
    });

    it('wraps non-Error async throw', async () => {
      const r = await tryCatchAsync(async () => { throw 404; });
      expect(r.ok).toBe(false);
      if (!r.ok) {expect(r.error.message).toBe('404');}
    });
  });

  describe('collectResults', () => {
    it('collects all Ok values into single Ok array', () => {
      const results = [ok(1), ok(2), ok(3)];
      const r = collectResults(results);
      expect(r.ok).toBe(true);
      if (r.ok) {expect(r.value).toEqual([1, 2, 3]);}
    });

    it('returns first Err encountered', () => {
      const results: Result<number, string>[] = [ok(1), err('fail'), ok(3)];
      const r = collectResults(results);
      expect(r.ok).toBe(false);
      if (!r.ok) {expect(r.error).toBe('fail');}
    });

    it('returns Ok with empty array for empty input', () => {
      const r = collectResults([]);
      expect(r.ok).toBe(true);
      if (r.ok) {expect(r.value).toEqual([]);}
    });
  });

  describe('type narrowing', () => {
    it('narrows Ok via .ok property', () => {
      const r: Result<number, string> = ok(42);
      if (r.ok) {
        const _v: number = r.value;
        expect(_v).toBe(42);
      }
    });

    it('narrows Err via .ok property', () => {
      const r: Result<number, string> = err('fail');
      if (!r.ok) {
        const _e: string = r.error;
        expect(_e).toBe('fail');
      }
    });

    it('narrows via isOk/isErr', () => {
      const r: Result<number, string> = ok(7);
      if (r.isOk) {
        expect(r.value).toBe(7);
      }
      const e: Result<number, string> = err('x');
      if (e.isErr) {
        expect(e.error).toBe('x');
      }
    });
  });
});
