/**
 * Regenerates the sample receipt corpus (M2 plan, CP3) and the
 * browser-check files (M-I-4) under src/features/receipt/fixtures/.
 *
 * Each sample is defined once below: its printed lines, what the receipt
 * really says (`expected`, written to `.expected.json`), its fiscal QR
 * payload if it has one, and the photo effects. The script writes the SVG
 * source, renders it with `rsvg-convert`, and applies the effects with
 * `magick`. The browser-check files need `magick` and `heif-enc` (libheif,
 * with its HEVC encoder). None of these tools is a CI or project
 * dependency: the outputs are committed.
 *
 *   node scripts/make-sample-receipts.mjs [--corpus-only]
 */
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = path.join(APP, 'src/features/receipt/fixtures')
const CORPUS = path.join(FIXTURES, 'receipts')
const BROWSER = path.join(FIXTURES, 'browser')

// ---------------------------------------------------------------------------
// Helpers

/** A Portuguese NIF: 8 digits plus their mod-11 check digit. */
export function nif(first8) {
  let total = 0
  for (let i = 0; i < 8; i++) total += Number(first8[i]) * (9 - i)
  const remainder = total % 11
  return `${first8}${remainder < 2 ? 0 : 11 - remainder}`
}

const WIDTH = 40 // characters per receipt line

/** `left` and `right` on one line, `WIDTH` characters wide. */
function row(left, right = '', width = WIDTH) {
  const gap = Math.max(1, width - left.length - right.length)
  return `${left}${' '.repeat(gap)}${right}`
}

function center(text, width = WIDTH) {
  return `${' '.repeat(Math.max(0, Math.floor((width - text.length) / 2)))}${text}`
}

/** A quantity-column line: `Q Name P L`. */
function qtyRow(quantity, name, unit, total) {
  return row(`${quantity} ${name}`, `${unit.padStart(6)}  ${total.padStart(6)}`)
}

const escape = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ---------------------------------------------------------------------------
// The samples

const RESTAURANT_NIF = nif('50734218')
const RESTAURANT_QR = [
  `A:${RESTAURANT_NIF}`,
  'B:999999990',
  'C:PT',
  'D:FS',
  'E:N',
  'F:20260928',
  'G:FS A2026/318',
  'H:JFJ7K2LM-318',
  'I1:PT',
  'I5:17.70',
  'I6:2.30',
  'N:2.30',
  'O:20.00',
  'Q:k9Xa',
  'R:1234',
].join('*')

const RESTAURANT = {
  lines: [
    center('Restaurante A Tasquinha'),
    center('Rua dos Remedios 34'),
    center('1100-441 Lisboa'),
    center(`NIF: ${RESTAURANT_NIF}`),
    'Fatura Simplificada FS A2026/318',
    row('Data: 28-09-2026', 'Hora: 13:42'),
    '',
    row('Qtd Descrição', 'P.Unit   Total'),
    qtyRow(2, 'Imperial', '1,60', '3,20'),
    qtyRow(1, 'Bitoque', '9,50', '9,50'),
    qtyRow(1, 'Salada Mista', '4,20', '4,20'),
    qtyRow(2, 'Café', '0,80', '1,60'),
    qtyRow(1, 'Água das Pedras', '1,50', '1,50'),
    '',
    row('TOTAL', '20,00 €'),
    row('Multibanco', '20,00'),
    '',
    row('Taxa', 'Base     IVA'),
    row('13%', '17,70    2,30'),
    '',
    'ATCUD: JFJ7K2LM-318',
    'Processado por programa certificado',
    'n.º 1234/AT',
  ],
  qr: RESTAURANT_QR,
  footer: [center('Obrigado pela visita')],
  expected: {
    merchant: 'Restaurante A Tasquinha',
    merchantTaxId: RESTAURANT_NIF,
    date: '2026-09-28',
    currencyHint: 'EUR',
    items: [
      ['Imperial', '2', '1.60', '3.20'],
      ['Bitoque', '1', '9.50', '9.50'],
      ['Salada Mista', '1', '4.20', '4.20'],
      ['Café', '2', '0.80', '1.60'],
      ['Água das Pedras', '1', '1.50', '1.50'],
    ],
    tax: '2.30',
    total: '20.00',
  },
}

const SUPERMARKET_NIF = nif('50918273')
const SUPERMARKET_QR = [
  `A:${SUPERMARKET_NIF}`,
  'B:999999990',
  'C:PT',
  'D:FS',
  'E:N',
  'F:20260929',
  'G:FS 0042/01234',
  'H:KQ2M9V7T-1234',
  'I1:PT',
  'I3:3.18',
  'I4:0.19',
  'I5:2.65',
  'I6:0.34',
  'I7:5.80',
  'I8:1.34',
  'N:1.87',
  'O:13.50',
  'Q:Zp3c',
  'R:2468',
].join('*')

const SAMPLES = [
  {
    name: '01-pt-restaurante-qr',
    ...RESTAURANT,
    check: 'match',
  },
  {
    name: '02-pt-restaurante-qr-foto',
    ...RESTAURANT,
    source: '01-pt-restaurante-qr',
    // A phone photo: on a gray table, rotated 4°, blurred, with noise.
    // (The blur comes before the noise: after it, this HDRI ImageMagick
    // turns noise into black squares.)
    effects: [
      '-bordercolor',
      '#8a8a86',
      '-border',
      '60',
      '-background',
      '#8a8a86',
      '-rotate',
      '4',
      '-blur',
      '0x0.7',
      '-seed',
      '42',
      '-attenuate',
      '0.5',
      '+noise',
      'Gaussian',
    ],
    check: 'match',
  },
  {
    name: '03-pt-supermercado-qr',
    lines: [
      center('Supermercado Pomar'),
      center('Pomar Distribuicao Alimentar, Lda'),
      center('Av. da Republica 210'),
      center('1050-194 Lisboa'),
      center(`NIF ${SUPERMARKET_NIF}`),
      'Fatura Simplificada FS 0042/01234',
      'Data 29.09.2026 18:42',
      '',
      row('Leite Meio Gordo', '0,89 A'),
      row('Pão de Forma', '1,79 A'),
      'Bananas',
      row('0,532 kg x 1,29 €/kg', '0,69 A'),
      row('Queijo Flamengo', '3,49 B'),
      row('Desc. Cartão Pomar', '-0,50'),
      row('Detergente Loiça', '2,15 C'),
      row('Vinho Tinto Reserva', '4,99 C'),
      '',
      row('TOTAL A PAGAR', '13,50 €'),
      row('Cartão de Débito', '13,50'),
      '',
      row('Taxa', 'Base     IVA'),
      row('A  6%', '3,18    0,19'),
      row('B 13%', '2,65    0,34'),
      row('C 23%', '5,80    1,34'),
      row('Total IVA', '1,87'),
      row('Total poupança', '0,50'),
      '',
      'ATCUD: KQ2M9V7T-1234',
    ],
    qr: SUPERMARKET_QR,
    footer: [center('Obrigado e volte sempre')],
    expected: {
      merchant: 'Supermercado Pomar',
      merchantTaxId: SUPERMARKET_NIF,
      date: '2026-09-29',
      currencyHint: 'EUR',
      items: [
        ['Leite Meio Gordo', '1', '0.89', '0.89'],
        ['Pão de Forma', '1', '1.79', '1.79'],
        ['Bananas', '0.532', '1.29', '0.69'],
        ['Queijo Flamengo', '1', '2.99', '2.99'],
        ['Detergente Loiça', '1', '2.15', '2.15'],
        ['Vinho Tinto Reserva', '1', '4.99', '4.99'],
      ],
      tax: '1.87',
      total: '13.50',
    },
    check: 'match',
  },
  {
    name: '04-pt-cafe',
    lines: [
      center('Café Central'),
      center('Praça da Liberdade 7'),
      center('4000-322 Porto'),
      center(`Contribuinte: ${nif('50561234')}`),
      center('29/09/2026 09:12'),
      '',
      row('Galão', '1,40 €'),
      row('Tosta Mista', '3,20 €'),
      row('Pastel de Nata', '1,30 €'),
      row('Meia de Leite', '1,20 €'),
      '',
      row('Total a pagar', '7,10 €'),
      row('Numerário', '10,00 €'),
      row('Troco', '2,90 €'),
    ],
    expected: {
      merchant: 'Café Central',
      merchantTaxId: nif('50561234'),
      date: '2026-09-29',
      currencyHint: 'EUR',
      items: [
        ['Galão', '1', '1.40', '1.40'],
        ['Tosta Mista', '1', '3.20', '3.20'],
        ['Pastel de Nata', '1', '1.30', '1.30'],
        ['Meia de Leite', '1', '1.20', '1.20'],
      ],
      total: '7.10',
    },
    check: 'match',
  },
  {
    name: '05-pt-talao-desbotado',
    lines: [
      center('Padaria Estrela'),
      center('Rua de Santa Catarina 150'),
      center('4000-447 Porto'),
      center(`NIF: ${nif('50827364')}`),
      row('FS 2026/7781', '30-09-2026'),
      '',
      row('2 x Pão de Mistura 0,35', '0,70'),
      row('Broa de Milho', '1,85'),
      row('Bola de Berlim', '1,60'),
      row('Café', '0,75'),
      '',
      row('TOTAL', '4,90'),
      row('Numerário', '5,00'),
      row('Troco', '0,10'),
    ],
    // A faded thermal print: pale gray text on off-white paper.
    effects: [
      '+level',
      '58%,100%',
      '-fill',
      '#f3eedd',
      '-tint',
      '100',
      '-blur',
      '0x0.5',
      '-seed',
      '7',
      '-attenuate',
      '0.25',
      '+noise',
      'Gaussian',
    ],
    expected: {
      merchant: 'Padaria Estrela',
      merchantTaxId: nif('50827364'),
      date: '2026-09-30',
      items: [
        ['Pão de Mistura', '2', '0.35', '0.70'],
        ['Broa de Milho', '1', '1.85', '1.85'],
        ['Bola de Berlim', '1', '1.60', '1.60'],
        ['Café', '1', '0.75', '0.75'],
      ],
      total: '4.90',
    },
    // The plan allows this one to be flagged instead of matching.
    check: 'matchOrFlagged',
  },
  {
    name: '06-uk-pub',
    lines: [
      center('THE BLACK SWAN'),
      center('27 Market Square, York YO1 8AB'),
      center('Tel 01904 612345'),
      center('VAT No 123456789'),
      row('29/09/2026', '20:14'),
      '',
      row('2 x Pint of Bitter £4.60', '£9.20'),
      row('Steak and Ale Pie', '£15.50'),
      row('Sticky Toffee Pudding', '£6.75'),
      row('Service charge 12.5%', '£3.93'),
      '',
      row('Total', '£35.38'),
      row('VAT included', '5.90'),
      row('Card payment', '£35.38'),
    ],
    footer: [center('Thank you for visiting')],
    expected: {
      merchant: 'THE BLACK SWAN',
      date: '2026-09-29',
      currencyHint: 'GBP',
      items: [
        ['Pint of Bitter', '2', '4.60', '9.20'],
        ['Steak and Ale Pie', '1', '15.50', '15.50'],
        ['Sticky Toffee Pudding', '1', '6.75', '6.75'],
      ],
      tax: '5.90',
      tip: '3.93',
      total: '35.38',
    },
    check: 'match',
  },
  {
    name: '07-us-diner',
    lines: [
      center("Rosie's Diner"),
      center('410 Main Street'),
      center('Springfield, IL 62701'),
      row('09/29/2026', '12:31 PM'),
      '',
      row('Cheeseburger Deluxe', '12.95'),
      row('Chicken Caesar Salad', '11.50'),
      row('French Fries', '4.25'),
      row('2 x Coffee 2.50', '5.00'),
      '',
      row('Subtotal', '33.70'),
      row('Sales Tax 8.25%', '2.78'),
      row('Total', '36.48'),
      row('Tip', '6.50'),
      row('Total', '42.98'),
      '',
      'VISA XXXX4821',
    ],
    footer: [center('Thank you!')],
    expected: {
      merchant: "Rosie's Diner",
      date: '2026-09-29',
      items: [
        ['Cheeseburger Deluxe', '1', '12.95', '12.95'],
        ['Chicken Caesar Salad', '1', '11.50', '11.50'],
        ['French Fries', '1', '4.25', '4.25'],
        ['Coffee', '2', '2.50', '5.00'],
      ],
      subtotal: '33.70',
      tax: '2.78',
      tip: '6.50',
      total: '42.98',
    },
    check: 'match',
  },
  {
    name: '08-pt-linha-borrada',
    lines: [
      center('Churrasqueira do Largo'),
      center('Largo do Carmo 3'),
      center('1200-092 Lisboa'),
      center(`NIF: ${nif('50492817')}`),
      row('Data: 27-09-2026', '20:05'),
      '',
      row('Qtd Descrição', 'P.Unit   Total'),
      qtyRow(1, 'Frango no Churrasco', '8,50', '8,50'),
      qtyRow(2, 'Batata Frita', '2,00', '4,00'),
      qtyRow(1, 'Salada de Tomate', '2,50', '2,50'),
      qtyRow(2, 'Sumo Natural', '2,25', '4,50'),
      '',
      row('TOTAL', '19,50 €'),
      row('Multibanco', '19,50'),
    ],
    // A smudge over the salad line (the 10th line, index 9).
    smudgeLine: 9,
    expected: {
      merchant: 'Churrasqueira do Largo',
      merchantTaxId: nif('50492817'),
      date: '2026-09-27',
      currencyHint: 'EUR',
      items: [
        ['Frango no Churrasco', '1', '8.50', '8.50'],
        ['Batata Frita', '2', '2.00', '4.00'],
        ['Salada de Tomate', '1', '2.50', '2.50'],
        ['Sumo Natural', '2', '2.25', '4.50'],
      ],
      total: '19.50',
    },
    check: 'flagged',
  },
  {
    name: '09-pt-efatura',
    pdf: true,
    lines: [
      'Oficina Auto Ribeiro, Lda.',
      'Rua do Brasil 88, 3030-175 Coimbra',
      `NIF: ${nif('51029384')}`,
      '',
      'Fatura FT 2026/412',
      'Data de emissão: 25-09-2026',
      '',
      row('Descrição', 'Qtd  P.Unit   Total', 56),
      row('Mudança de óleo', '1   45,00   45,00', 56),
      row('Filtro de óleo', '1   12,50   12,50', 56),
      row('Pastilhas de travão', '2   24,00   48,00', 56),
      row('Mão de obra', '1   35,00   35,00', 56),
      '',
      row('Total s/ IVA', '140,50', 56),
      row('IVA 23%', '32,32', 56),
      row('Total c/ IVA', '172,82 €', 56),
      '',
      'ATCUD: PL8N2X4Q-412',
    ],
    qr: [
      `A:${nif('51029384')}`,
      'B:999999990',
      'C:PT',
      'D:FT',
      'E:N',
      'F:20260925',
      'G:FT 2026/412',
      'H:PL8N2X4Q-412',
      'I1:PT',
      'I7:140.50',
      'I8:32.32',
      'N:32.32',
      'O:172.82',
      'Q:t7Rm',
      'R:1357',
    ].join('*'),
    expected: {
      merchant: 'Oficina Auto Ribeiro, Lda.',
      merchantTaxId: nif('51029384'),
      date: '2026-09-25',
      currencyHint: 'EUR',
      items: [
        ['Mudança de óleo', '1', '45.00', '45.00'],
        ['Filtro de óleo', '1', '12.50', '12.50'],
        ['Pastilhas de travão', '2', '24.00', '48.00'],
        ['Mão de obra', '1', '35.00', '35.00'],
      ],
      subtotal: '140.50',
      tax: '32.32',
      total: '172.82',
    },
    check: 'match',
  },
  {
    name: '10-nao-e-recibo',
    lines: [
      'Era uma vez uma pequena aldeia junto',
      'ao rio, onde os pescadores saíam de',
      'madrugada e voltavam ao fim da tarde',
      'com as redes cheias. As crianças',
      'corriam pela praia a apanhar conchas',
      'enquanto as mães remendavam as velas',
      'dos barcos e cantavam modas antigas.',
      'Ninguém ali sabia ler as horas no',
      'relógio da igreja, mas todos sabiam',
      'quando a maré ia virar.',
    ],
    expected: { items: [] },
    check: 'noItems',
  },
]

// ---------------------------------------------------------------------------
// Rendering

const FONT_SIZE = 22
const LINE_HEIGHT = 32
const CHAR_WIDTH = FONT_SIZE * 0.602 // DejaVu Sans Mono's advance
const MARGIN = 34
const QR_SIZE = 180

let writerReady = false
async function qrSvg(payload) {
  if (!writerReady) {
    const wasm = path.join(
      APP,
      'node_modules/zxing-wasm/dist/writer/zxing_writer.wasm',
    )
    prepareZXingModule({ overrides: { wasmBinary: await readFile(wasm) } })
    writerReady = true
  }
  const { svg, error } = await writeBarcode(payload, {
    format: 'QRCode',
    ecLevel: 'M',
    scale: 4,
  })
  if (error) throw new Error(`QR code: ${error}`)
  return svg.replace(/^[\s\S]*?(<svg)/, '$1')
}

function textLine(text, y) {
  return `<text x="${MARGIN}" y="${y}" xml:space="preserve">${escape(text)}</text>`
}

async function receiptSvg(sample) {
  const columns = Math.max(WIDTH, ...sample.lines.map((line) => line.length))
  const width = Math.round(MARGIN * 2 + columns * CHAR_WIDTH)
  const parts = []
  let y = MARGIN + FONT_SIZE
  for (const line of sample.lines) {
    parts.push(textLine(line, y))
    y += LINE_HEIGHT
  }
  if (sample.smudgeLine !== undefined) {
    const lineY = MARGIN + FONT_SIZE + sample.smudgeLine * LINE_HEIGHT - 8
    parts.push(
      `<ellipse cx="${width / 2 + 40}" cy="${lineY}" rx="${width / 2 - 20}" ry="19" fill="#262422" filter="url(#smudge)"/>`,
    )
  }
  if (sample.qr) {
    y += 8
    const qr = await qrSvg(sample.qr)
    parts.push(
      qr.replace(
        /<svg width="(\d+)" height="(\d+)"/,
        (_, w, h) =>
          `<svg x="${(width - QR_SIZE) / 2}" y="${y}" width="${QR_SIZE}" height="${QR_SIZE}" viewBox="0 0 ${w} ${h}"`,
      ),
    )
    y += QR_SIZE + 16 + FONT_SIZE
  }
  for (const line of sample.footer ?? []) {
    parts.push(textLine(line, y))
    y += LINE_HEIGHT
  }
  const height = y - LINE_HEIGHT + MARGIN + 12
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="DejaVu Sans Mono" font-size="${FONT_SIZE}" fill="#111">
<defs><filter id="smudge"><feGaussianBlur stdDeviation="3"/></filter></defs>
<rect width="100%" height="100%" fill="#ffffff"/>
${parts.join('\n')}
</svg>
`
}

function expectedJson(sample) {
  const { items, ...rest } = sample.expected
  const expected = {
    ...rest,
    items: items.map(([name, quantity, unitPrice, lineTotal]) => ({
      name,
      quantity,
      unitPrice,
      lineTotal,
      needsCheck: false,
    })),
    warnings: [],
  }
  if (sample.qr) expected.qr = sample.qr
  expected.check = sample.check
  return `${JSON.stringify(expected, null, 2)}\n`
}

// A fixed date for the PDFs' metadata, so a rerun gives the same files.
const SOURCE_DATE_EPOCH = String(Date.UTC(2026, 8, 29) / 1000)

function run(tool, args) {
  try {
    execFileSync(tool, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, SOURCE_DATE_EPOCH },
    })
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`${tool} isn't installed (see this script's header)`, {
        cause: error,
      })
    }
    throw new Error(`${tool} failed: ${error.stderr?.toString() ?? error}`, {
      cause: error,
    })
  }
}

async function makeCorpus() {
  await mkdir(CORPUS, { recursive: true })
  for (const sample of SAMPLES) {
    const base = path.join(CORPUS, sample.name)
    await writeFile(`${base}.expected.json`, expectedJson(sample))
    if (sample.source !== undefined) {
      // Same receipt, photographed: effects on the source's rendering.
      run('magick', [
        path.join(CORPUS, `${sample.source}.png`),
        ...sample.effects,
        '-strip',
        `${base}.png`,
      ])
      continue
    }
    await writeFile(`${base}.svg`, await receiptSvg(sample))
    if (sample.pdf) {
      // A text-layer PDF (D6): cairo keeps the text as text.
      run('rsvg-convert', ['-f', 'pdf', `${base}.svg`, '-o', `${base}.pdf`])
      continue
    }
    run('rsvg-convert', [`${base}.svg`, '-o', `${base}.png`])
    if (sample.effects !== undefined) {
      run('magick', [`${base}.png`, ...sample.effects, '-strip', `${base}.png`])
    } else {
      run('magick', [`${base}.png`, '-strip', `${base}.png`])
    }
  }
}

async function makeBrowserFiles() {
  await rm(BROWSER, { recursive: true, force: true })
  await mkdir(BROWSER, { recursive: true })
  const corpus = (name) => path.join(CORPUS, name)
  const browser = (name) => path.join(BROWSER, name)
  const withExpected = async (file, sample) => {
    await copyFile(
      corpus(`${sample}.expected.json`),
      browser(file.replace(/\.[a-z]+$/, '.expected.json')),
    )
  }

  run('magick', [
    corpus('01-pt-restaurante-qr.png'),
    '-quality',
    '90',
    browser('sample-1.jpg'),
  ])
  await withExpected('sample-1.jpg', '01-pt-restaurante-qr')

  // An 8-bit colour HEIC, as a phone writes it (major brand `heic`): from
  // an RGB copy, since a grayscale PNG would give a monochrome `heix` file.
  const rgb = path.join(BROWSER, 'sample-3.rgb.png')
  run('magick', [
    corpus('03-pt-supermercado-qr.png'),
    '-type',
    'TrueColor',
    `PNG24:${rgb}`,
  ])
  run('heif-enc', ['--quality', '90', rgb, '-o', browser('sample-3.heic')])
  await rm(rgb)
  await withExpected('sample-3.heic', '03-pt-supermercado-qr')

  // An image-only PDF, with no text layer: read by OCR.
  run('magick', [
    corpus('06-uk-pub.png'),
    '-density',
    '150',
    '-units',
    'PixelsPerInch',
    '-define',
    `pdf:create-epoch=${SOURCE_DATE_EPOCH}`,
    '-define',
    `pdf:modify-epoch=${SOURCE_DATE_EPOCH}`,
    browser('sample-6-scanned.pdf'),
  ])
  await withExpected('sample-6-scanned.pdf', '06-uk-pub')

  await copyFile(corpus('09-pt-efatura.pdf'), browser('sample-9.pdf'))
  await withExpected('sample-9.pdf', '09-pt-efatura')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await makeCorpus()
  if (!process.argv.includes('--corpus-only')) {
    await makeBrowserFiles()
  }
  console.log('Sample receipts written to', path.relative(APP, FIXTURES))
}
