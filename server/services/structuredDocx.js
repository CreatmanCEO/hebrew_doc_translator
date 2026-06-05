const docx = require('docx');

/**
 * Render a StructuredDoc (schemaVersion 2) into a clean, editable .docx Buffer.
 *
 * Maps ordered StructuredDoc elements to native docx primitives, rendering the
 * translated `target` text of each element:
 *   - heading   -> Paragraph with HeadingLevel (clamped to H1..H3)
 *   - paragraph -> Paragraph with a single TextRun
 *   - list      -> one Paragraph per item, numbering/bullet prefixed into text
 *   - table     -> native docx.Table with one cell per column
 * Unknown element types are skipped.
 *
 * @param {{elements?: Array<object>}} structuredDoc
 * @returns {Promise<Buffer>} the packed .docx file contents
 */
async function renderStructuredDocx(structuredDoc) {
  const elements = (structuredDoc && structuredDoc.elements) || [];
  const headingLevels = [
    docx.HeadingLevel.HEADING_1,
    docx.HeadingLevel.HEADING_2,
    docx.HeadingLevel.HEADING_3,
  ];

  const children = [];

  for (const el of elements) {
    if (!el || !el.type) continue;

    switch (el.type) {
      case 'heading': {
        const idx = Math.min(Math.max((el.level || 1) - 1, 0), 2);
        children.push(
          new docx.Paragraph({
            text: el.target || '',
            heading: headingLevels[idx],
          })
        );
        break;
      }

      case 'paragraph': {
        children.push(
          new docx.Paragraph({
            children: [new docx.TextRun(el.target || '')],
          })
        );
        break;
      }

      case 'list': {
        const items = el.items || [];
        items.forEach((it, i) => {
          const prefix = el.ordered ? `${i + 1}. ` : '• ';
          children.push(
            new docx.Paragraph({
              children: [new docx.TextRun(prefix + ((it && it.target) || ''))],
            })
          );
        });
        break;
      }

      case 'table': {
        const rows = el.rows || [];
        children.push(
          new docx.Table({
            rows: rows.map(
              (r) =>
                new docx.TableRow({
                  children: (r || []).map(
                    (c) =>
                      new docx.TableCell({
                        children: [
                          new docx.Paragraph({
                            children: [new docx.TextRun((c && c.target) || '')],
                          }),
                        ],
                      })
                  ),
                })
            ),
          })
        );
        break;
      }

      default:
        // Unknown element type -> skip.
        break;
    }
  }

  const doc = new docx.Document({
    sections: [{ properties: {}, children }],
  });

  return await docx.Packer.toBuffer(doc);
}

module.exports = { renderStructuredDocx };
