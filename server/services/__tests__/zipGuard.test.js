import { describe, it, expect } from 'vitest';
import fs from 'fs'; import os from 'os'; import path from 'path';
import * as docx from 'docx'; // docx ships ESM named exports (no default) under vitest
import { uncompressedSize, assertDocxSafe } from '../zipGuard.js';

async function makeDocx(p, text) {
  const d = new docx.Document({ sections: [{ children: [ new docx.Paragraph({ children:[ new docx.TextRun(text) ] }) ] }] });
  const buf = await docx.Packer.toBuffer(d);
  fs.writeFileSync(p, buf);
}

it('measures uncompressed size > 0 for a real docx', async () => {
  const p = path.join(os.tmpdir(), 'g1.docx'); await makeDocx(p, 'hello world');
  expect(await uncompressedSize(p)).toBeGreaterThan(0);
  fs.rmSync(p, {force:true});
});
it('assertDocxSafe throws when over cap', async () => {
  const p = path.join(os.tmpdir(), 'g2.docx'); await makeDocx(p, 'x'.repeat(2000));
  await expect(assertDocxSafe(p, 10)).rejects.toThrow('DOC_TOO_LARGE'); // cap 10 bytes
  fs.rmSync(p, {force:true});
});
it('assertDocxSafe passes under a generous cap', async () => {
  const p = path.join(os.tmpdir(), 'g3.docx'); await makeDocx(p, 'small');
  await expect(assertDocxSafe(p, 100*1024*1024)).resolves.toBeUndefined();
  fs.rmSync(p, {force:true});
});
