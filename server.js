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
const maxQuestions = Math.max(...questionSets.map((questions) => questions.length));

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const MARKSHEET = path.join(DATA_DIR, 'marksheet.xlsx');
const LETTERS = ['A', 'B', 'C', 'D'];

fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
      ...Array.from({ length: maxQuestions }, (_, i) => ({ header: `Q${i + 1}`, width: 6 })),
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

  for (let questionNumber = 1; questionNumber <= maxQuestions; questionNumber += 1) {
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
