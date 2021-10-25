import * as pdfjsLib from 'pdfjs-dist';
const pdfjsWorker = require('pdfjs-dist/build/pdf.worker.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([pdfjsWorker], { type: 'text/javascript' }));