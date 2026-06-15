// frontend/pdf-config.js
import * as pdfjsLib from '/src/lib/pdfjs/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/src/lib/pdfjs/build/pdf.worker.mjs';

export { pdfjsLib };