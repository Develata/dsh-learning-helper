/** Original minimal PDF test material; fixture construction only, never the product parser. */
export function makePdf(pages: { text?: string; image?: boolean }[]): Buffer {
  const objects: Buffer[] = [];
  const object = (value: string | Buffer) => { objects.push(Buffer.from(value)); return objects.length; };
  object('<< /Type /Catalog /Pages 2 0 R >>'); object('');
  object('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const image = object(Buffer.concat([Buffer.from('<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 12 >>\nstream\n'),
    Buffer.from([0, 0, 0, 255, 255, 255, 128, 128, 128, 0, 0, 0]), Buffer.from('\nendstream')]));
  const ids: number[] = [];
  for (const page of pages) {
    const lines = (page.text ?? '').split('\n').flatMap(line => line.match(/.{1,70}(?:\s|$)|.{1,70}/g) ?? ['']);
    const text = lines.map(line => `(${line.trim().replace(/[\\()]/g, '\\$&')}) Tj 0 -16 Td`).join('\n');
    const stream = `${page.image ? 'q 200 0 0 200 50 500 cm /Im1 Do Q\n' : ''}${page.text ? `BT /F1 12 Tf 50 720 Td ${text} ET\n` : ''}`;
    const content = object(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`);
    ids.push(object(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 ${image} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[1] = Buffer.from(`<< /Type /Pages /Kids [${ids.map(id => `${id} 0 R`).join(' ')}] /Count ${ids.length} >>`);
  const parts = [Buffer.from('%PDF-1.4\n')]; const offsets = [0]; let position = parts[0]!.length;
  for (const [i, value] of objects.entries()) {
    offsets.push(position); const part = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), value, Buffer.from('\nendobj\n')]); parts.push(part); position += part.length;
  }
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`));
  return Buffer.concat(parts);
}
