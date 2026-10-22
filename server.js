const path = require('path');
const fs = require('fs');
const express = require('express');
const ExcelJS = require('exceljs');
const questionSets = [
  require('./questions'),
  require('./questions1'),
  require('./questions2'),
];
const tests = new Map(questionSets.map((questions, index) => [index + 1, questions]));
const questionFiles = new Map([
  [1, path.join(__dirname, 'questions.js')],
  [2, path.join(__dirname, 'questions1.js')],
  [3, path.join(__dirname, 'questions2.js')],
]);

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const MARKSHEET = path.join(DATA_DIR, 'marksheet.xlsx');
const LETTERS = ['A', 'B', 'C', 'D'];
const QUESTION_HEADERS = [
  'Q No',
  'Question Description',
  'Option A',
  'Option B',
  'Option C',
  'Option D',
  'Correct Choice',
];
const MAX_QUESTIONS = 200;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/tests', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tests.html'));
});

function currentMaxQuestions() {
  return Math.max(...Array.from(tests.values(), (questions) => questions.length));
}

function uploadError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function cellText(row, columnNumber, fieldName, rowNumber) {
  const value = row.getCell(columnNumber).value;
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw uploadError(`Row ${rowNumber}: ${fieldName} must be plain text or a number, not a formula.`);
  }
  return String(value).trim();
}

function parseQuestionWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();

  return workbook.xlsx.load(buffer).then(() => {
    const sheet = workbook.worksheets[0];
    if (!sheet) throw uploadError('The Excel file does not contain a worksheet.');

    const headerColumns = new Map();
    sheet.getRow(1).eachCell((cell, columnNumber) => {
      const header = String(cell.value || '').trim().replace(/\s+/g, ' ').toLowerCase();
      if (!header) return;
      if (headerColumns.has(header)) {
        throw uploadError(`The template contains a duplicate column: ${cell.value}.`);
      }
      headerColumns.set(header, columnNumber);
    });

    const missingHeaders = QUESTION_HEADERS.filter(
      (header) => !headerColumns.has(header.toLowerCase()),
    );
    if (missingHeaders.length) {
      throw uploadError(`This file does not match the template. Missing columns: ${missingHeaders.join(', ')}.`);
    }

    const columns = QUESTION_HEADERS.map((header) => headerColumns.get(header.toLowerCase()));
    const questions = [];

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const values = columns.map((columnNumber, index) => (
        cellText(row, columnNumber, QUESTION_HEADERS[index], rowNumber)
      ));
      if (values.every((value) => !value)) continue;

      const [questionNumber, question, ...rest] = values;
      const [optionA, optionB, optionC, optionD, correctChoice] = rest;
      const parsedQuestionNumber = Number(questionNumber);
      if (!Number.isInteger(parsedQuestionNumber) || parsedQuestionNumber !== questions.length + 1) {
        throw uploadError(`Row ${rowNumber}: Q No must be ${questions.length + 1}.`);
      }
      if (!question) throw uploadError(`Row ${rowNumber}: Question Description is required.`);
      if ([optionA, optionB, optionC, optionD].some((option) => !option)) {
        throw uploadError(`Row ${rowNumber}: all four answer options are required.`);
      }
      if (!/^[A-D]$/i.test(correctChoice)) {
        throw uploadError(`Row ${rowNumber}: Correct Choice must be A, B, C, or D.`);
      }
      if (questions.length >= MAX_QUESTIONS) {
        throw uploadError(`A test cannot contain more than ${MAX_QUESTIONS} questions.`);
      }

      questions.push({
        question,
        options: [optionA, optionB, optionC, optionD],
        answer: correctChoice.toUpperCase().charCodeAt(0) - 65,
      });
    }

    if (!questions.length) throw uploadError('The template has no questions. Add at least one question and try again.');
    return questions;
  }).catch((error) => {
    if (error.status) throw error;
    throw uploadError('Could not read this Excel file. Upload a valid .xlsx workbook using the template.');
  });
}

// Questions without the answers, for the browser.
app.get('/api/tests', (req, res) => {
  res.json(questionSets.map((questions, index) => ({
    number: index + 1,
    questionCount: questions.length,
  })));
});

app.get('/api/tests/:testNumber/questions', (req, res) => {
  const questions = tests.get(Number(req.params.testNumber));
  if (!questions) return res.status(404).json({ error: 'Test not found.' });
  res.json(questions.map(({ question, options }) => ({ question, options })));
});

app.get('/api/tests/:testNumber/template', async (req, res) => {
  const testNumber = Number(req.params.testNumber);
  if (!questionFiles.has(testNumber)) return res.status(404).json({ error: 'Test not found.' });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.columns = [
    { header: QUESTION_HEADERS[0], key: 'questionNumber', width: 10 },
    { header: QUESTION_HEADERS[1], key: 'question', width: 52 },
    { header: QUESTION_HEADERS[2], key: 'optionA', width: 30 },
    { header: QUESTION_HEADERS[3], key: 'optionB', width: 30 },
    { header: QUESTION_HEADERS[4], key: 'optionC', width: 30 },
    { header: QUESTION_HEADERS[5], key: 'optionD', width: 30 },
    { header: QUESTION_HEADERS[6], key: 'correctChoice', width: 18 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D3C78' },
  };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'G1' };
  sheet.dataValidations.add(`G2:G${MAX_QUESTIONS + 1}`, {
    type: 'list',
    allowBlank: true,
    formulae: ['"A,B,C,D"'],
    showErrorMessage: true,
    errorTitle: 'Invalid correct choice',
    error: 'Choose A, B, C, or D.',
  });

  try {
    const buffer = await workbook.xlsx.writeBuffer();
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment(`test-${testNumber}-questions-template.xlsx`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not create the Excel template.' });
  }
});

app.post(
  '/api/tests/:testNumber/upload',
  express.raw({ type: 'application/octet-stream', limit: MAX_UPLOAD_BYTES }),
  (error, req, res, next) => {
    if (!error) return next();
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Excel files must be 5 MB or smaller.' });
    }
    return res.status(400).json({ error: 'Could not read the uploaded Excel file.' });
  },
  async (req, res) => {
    const testNumber = Number(req.params.testNumber);
    const targetPath = questionFiles.get(testNumber);
    if (!targetPath) return res.status(404).json({ error: 'Test not found.' });
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ error: 'Choose an Excel template containing questions to upload.' });
    }

    try {
      const questions = await parseQuestionWorkbook(req.body);
      await queueWrite(async () => {
        const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
        await fs.promises.writeFile(
          temporaryPath,
          `// Generated from the Test ${testNumber} Excel upload.\nmodule.exports = ${JSON.stringify(questions, null, 2)};\n`,
          'utf8',
        );
        await fs.promises.rename(temporaryPath, targetPath);
        tests.set(testNumber, questions);
        questionSets[testNumber - 1] = questions;
      });
      res.json({ success: true, testNumber, questionCount: questions.length });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      console.error(error);
      res.status(500).json({ error: 'Could not save the uploaded questions.' });
    }
  },
);

// Serialize writes so two submissions at once can't overwrite each other.
let writeQueue = Promise.resolve();
function queueWrite(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => {});
  return run;
}

async function loadWorkbook() {
  const workbook = new ExcelJS.Workbook();
  let sheet;
  if (fs.existsSync(MARKSHEET)) {
    await workbook.xlsx.readFile(MARKSHEET);
    sheet = workbook.getWorksheet('Marksheet');
    if (!sheet) sheet = workbook.addWorksheet('Marksheet');
  } else {
    sheet = workbook.addWorksheet('Marksheet');
    sheet.columns = [
      { header: 'Roll No', width: 12 },
      { header: 'Student Name', width: 28 },
      { header: 'Test Number', width: 12 },
      ...Array.from({ length: currentMaxQuestions() }, (_, i) => ({ header: `Q${i + 1}`, width: 6 })),
      { header: 'Score', width: 10 },
      { header: 'Percentage', width: 12 },
      { header: 'Submitted At', width: 22 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  let testColumn = 0;
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    if (String(cell.value).trim().toLowerCase() === 'test number') testColumn = columnNumber;
  });
  if (!testColumn) {
    sheet.spliceColumns(3, 0, []);
    testColumn = 3;
    const header = sheet.getRow(1).getCell(testColumn);
    header.value = 'Test Number';
    header.font = { bold: true };
    sheet.getColumn(testColumn).width = 12;
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      if (row.hasValues) row.getCell(testColumn).value = 1;
    }
  }

  for (let questionNumber = 1; questionNumber <= currentMaxQuestions(); questionNumber += 1) {
    let hasQuestionColumn = false;
    sheet.getRow(1).eachCell((cell) => {
      if (String(cell.value).trim().toLowerCase() === `q${questionNumber}`.toLowerCase()) hasQuestionColumn = true;
    });
    if (!hasQuestionColumn) {
      let scoreColumn = 0;
      sheet.getRow(1).eachCell((cell, columnNumber) => {
        if (String(cell.value).trim().toLowerCase() === 'score') scoreColumn = columnNumber;
      });
      const columnNumber = scoreColumn || sheet.columnCount + 1;
      sheet.spliceColumns(columnNumber, 0, []);
      const header = sheet.getRow(1).getCell(columnNumber);
      header.value = `Q${questionNumber}`;
      header.font = { bold: true };
      sheet.getColumn(columnNumber).width = 6;
    }
  }

  return workbook;
}

app.post('/api/submit', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const roll = String(req.body.roll || '').trim();
  const testNumber = Number(req.body.testNumber);
  const questions = tests.get(testNumber);
  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];

  if (!name || !roll) {
    return res.status(400).json({ error: 'Name and roll number are required.' });
  }
  if (!Number.isInteger(testNumber) || !questions) {
    return res.status(400).json({ error: 'Please select a valid test.' });
  }
  if (answers.length !== questions.length || answers.some((answer, index) => (
    !Number.isInteger(answer) || answer < 0 || answer >= questions[index].options.length
  ))) {
    return res.status(400).json({ error: 'Please answer all questions.' });
  }

  const results = questions.map((q, i) => answers[i] === q.answer);
  const score = results.filter(Boolean).length;

  try {
    await queueWrite(async () => {
      const workbook = await loadWorkbook();
      const sheet = workbook.getWorksheet('Marksheet');
      const maxQuestions = currentMaxQuestions();

      const row = [
        roll,
        name,
        testNumber,
        ...answers.map((answer, i) => `${LETTERS[answer]} ${results[i] ? '✔' : '✘'}`),
        ...Array(maxQuestions - answers.length).fill(''),
        `${score}/${questions.length}`,
        `${Math.round((score / questions.length) * 100)}%`,
        new Date().toLocaleString('en-IN'),
      ];
      sheet.addRow(row);

      await workbook.xlsx.writeFile(MARKSHEET);
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      return res.status(503).json({ error: 'The marksheet is open in Excel. Close it and submit again.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Could not save the result.' });
  }

  res.json({ success: true });
});

// Download the marksheet.
app.get('/marksheet', (req, res) => {
  if (!fs.existsSync(MARKSHEET)) return res.status(404).send('No submissions yet.');
  res.download(MARKSHEET, 'marksheet.xlsx');
});

app.listen(PORT, () => {
  console.log(`Kumbh MCQ test running at http://localhost:${PORT}`);
  console.log(`Marksheet: ${MARKSHEET}`);
});
