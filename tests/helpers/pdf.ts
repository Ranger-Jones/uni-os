/** Builds a minimal valid one-page PDF showing `text` (Helvetica). */
export function makePdf(text: string): Uint8Array {
  const stream = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, (c) => '\\' + c)}) Tj ET`
  return pdfFromObjects([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ])
}

/**
 * A 600×400 pt "slide" with a title and a red 2×2 px picture drawn at x 300–500, y 100–300 (PDF coordinates,
 * origin bottom-left) — i.e. left 0.5, right 0.833, top 0.25, bottom 0.75 as displayed.
 */
export function makeSlidePdf(title: string): Uint8Array {
  const stream = `BT /F1 24 Tf 40 350 Td (${title}) Tj ET q 200 0 0 200 300 100 cm /Im1 Do Q`
  const pixels = 'FF0000'.repeat(4) + '>'
  return pdfFromObjects([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${pixels.length} >>\nstream\n${pixels}\nendstream`
  ])
}

function pdfFromObjects(objs: string[]): Uint8Array {
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}
