import { describe, expect, it } from 'vitest';

import AppleIcon from './apple-icon';
import Icon from './icon';
import OgImage from './opengraph-image';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/**
 * Satori (behind `next/og`) throws at render time for unsupported markup — e.g. a `<br />`
 * or any multi-child element without an explicit `display`. On Vercel that surfaces as a
 * 200 response with an empty body, so crawlers show a blank card instead of failing loudly.
 */
describe.each([
  ['opengraph-image', OgImage],
  ['icon', Icon],
  ['apple-icon', AppleIcon],
])('%s', (_name, render) => {
  it('renders a non-empty PNG', async () => {
    const bytes = Buffer.from(await render().arrayBuffer());

    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 4)).toEqual(PNG_MAGIC);
  });
});
