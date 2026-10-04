# Third-party notices

Settle reads receipts in your browser with the open-source packages below.
Their runtime files are served from Settle's own site, under `/vendor/`,
never from another server. Each licence text is in `/vendor/licenses/`.

| Package                                                  | Version                   | Licence    | Source                                                                                                |
| -------------------------------------------------------- | ------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| ppu-paddle-ocr                                           | 6.6.0                     | MIT        | https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr                                              |
| ppu-ocv                                                  | 4.0.0                     | MIT        | https://github.com/PT-Perkasa-Pilar-Utama/ppu-ocv                                                     |
| onnxruntime-web                                          | 1.30.0                    | MIT        | https://github.com/microsoft/onnxruntime                                                              |
| PaddleOCR models (PP-OCRv5 detection, Latin recognition) | mirror revision `bf1d5ed` | Apache-2.0 | https://github.com/PaddlePaddle/PaddleOCR, via https://huggingface.co/snowfluke/ppu-paddle-ocr-models |
| zxing-wasm                                               | 3.1.4                     | MIT        | https://github.com/Sec-ant/zxing-wasm                                                                 |
| pdfjs-dist                                               | 6.3.289                   | Apache-2.0 | https://github.com/mozilla/pdf.js                                                                     |
| heic-to                                                  | 1.5.2                     | LGPL-3.0   | https://github.com/hoppergee/heic-to                                                                  |

## Licence files

- ppu-paddle-ocr: `/vendor/licenses/ppu-paddle-ocr-LICENSE.txt`
- ppu-ocv: `/vendor/licenses/ppu-ocv-LICENSE.txt`
- onnxruntime-web: the package declares the MIT licence and ships no
  licence file; see `/vendor/licenses/onnxruntime-web-NOTICE.txt`.
- The PaddleOCR models: `/vendor/licenses/paddleocr-models-NOTICE.txt`
  and the mirror's licence, `/vendor/licenses/ppu-paddle-ocr-models-LICENSE.txt`.
- zxing-wasm: `/vendor/licenses/zxing-wasm-LICENSE.txt`
- pdfjs-dist: `/vendor/licenses/pdfjs-dist-LICENSE.txt`, and the licences
  of its standard fonts (Foxit, Liberation) and wasm decoders (JBIG2,
  OpenJPEG, QCMS), each as `/vendor/licenses/pdfjs-dist-*.txt`.
- heic-to: `/vendor/licenses/heic-to-LICENSE.txt`.

## heic-to (LGPL-3.0)

heic-to reads HEIC photos in browsers that can't decode them natively. It
is loaded only for such a photo. It bundles libheif
(https://github.com/strukturag/libheif) and libde265
(https://github.com/strukturag/libde265), both also under the LGPL-3.0;
see `/vendor/licenses/heic-to-bundled-libraries-NOTICE.txt`.

Settle uses heic-to's CSP build unmodified: `/vendor/heic-to/heic-to.js` is
the package's `dist/csp/heic-to.js`, byte for byte. It is kept as its own
file, not bundled into Settle's code, and loaded through a dynamic
`import()` of that URL, so you can replace it with your own build of the
same interface. Its source is at https://github.com/hoppergee/heic-to.

This library is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public
License for more details.
