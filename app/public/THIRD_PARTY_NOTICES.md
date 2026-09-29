# Third-party notices

Settle reads receipts in your browser with the open-source packages below.
Their runtime files are served from Settle's own site, under `/vendor/`,
never from another server. Each licence text is in `/vendor/licenses/`.

| Package                | Version | Licence    | Source                                      |
| ---------------------- | ------- | ---------- | ------------------------------------------- |
| tesseract.js           | 7.0.0   | Apache-2.0 | https://github.com/naptha/tesseract.js      |
| tesseract.js-core      | 7.0.0   | Apache-2.0 | https://github.com/naptha/tesseract.js-core |
| @tesseract.js-data/por | 1.0.0   | MIT        | https://github.com/naptha/tessdata          |
| @tesseract.js-data/eng | 1.0.0   | MIT        | https://github.com/naptha/tessdata          |
| zxing-wasm             | 3.1.4   | MIT        | https://github.com/Sec-ant/zxing-wasm       |
| pdfjs-dist             | 6.3.289 | Apache-2.0 | https://github.com/mozilla/pdf.js           |
| heic-to                | 1.5.2   | LGPL-3.0   | https://github.com/hoppergee/heic-to        |

## Licence files

- tesseract.js: `/vendor/licenses/tesseract.js-LICENSE.md`
- tesseract.js-core: `/vendor/licenses/tesseract.js-core-LICENSE.txt`
- @tesseract.js-data/por and @tesseract.js-data/eng: the packages declare
  the MIT licence and ship no licence file; see
  `/vendor/licenses/tesseract.js-data-NOTICE.txt`.
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
