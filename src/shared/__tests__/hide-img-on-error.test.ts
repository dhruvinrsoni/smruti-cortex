import { describe, it, expect } from 'vitest';
import { wireHideImgOnError } from '../hide-img-on-error';

describe('wireHideImgOnError', () => {
  it('hides the img when an error event fires', () => {
    const img = document.createElement('img');
    img.style.display = '';
    wireHideImgOnError(img);
    img.dispatchEvent(new Event('error'));
    expect(img.style.display).toBe('none');
  });

  it('no-ops for null', () => {
    expect(() => wireHideImgOnError(null)).not.toThrow();
  });
});
