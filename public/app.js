const form = document.getElementById('paper');
const container = document.getElementById('questions');
const errorBox = document.getElementById('error');
const selectionError = document.getElementById('selection-error');
const submitBtn = document.getElementById('submit');
const resultBox = document.getElementById('result');
const selection = document.getElementById('test-selection');
const testOptions = document.getElementById('test-options');
const uploadOptions = document.getElementById('upload-options');
const uploadStatus = document.getElementById('upload-status');
const quiz = document.getElementById('quiz');
const pageTitle = document.getElementById('page-title');
const pageDescription = document.getElementById('page-description');
const LETTERS = ['A', 'B', 'C', 'D'];

let questions = [];
let activeTestNumber = null;

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderQuestions() {
  container.innerHTML = questions.map((q, i) => `
    <section class="card question" id="q${i}">
      <h3>${i + 1}. ${escapeHtml(q.question)}</h3>
      ${q.options.map((opt, j) => `
        <label class="option">
          <input type="radio" name="q${i}" value="${j}">
          <span>${LETTERS[j]}. ${escapeHtml(opt)}</span>
        </label>`).join('')}
    </section>`).join('');
}

async function loadTests() {
  const res = await fetch('/api/tests');
  if (!res.ok) throw new Error('Could not load tests. Is the server running?');
  const tests = await res.json();
  testOptions.innerHTML = tests.map((test) => `
    <button type="button" class="test-option" data-test-number="${test.number}">
      <span class="test-number">${String(test.number).padStart(2, '0')}</span>
      <span class="test-details">
        <strong>Test ${test.number}</strong>
        <small>${test.questionCount} questions</small>
      </span>
      <span class="test-arrow" aria-hidden="true">&#8594;</span>
    </button>`).join('');
}

testOptions.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-test-number]');
  if (!button) return;

  selectionError.hidden = true;
  button.disabled = true;
  const testNumber = Number(button.dataset.testNumber);
  try {
    const res = await fetch(`/api/tests/${testNumber}/questions`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load this test.');

    activeTestNumber = testNumber;
    questions = data;
    renderQuestions();
    pageTitle.textContent = `Test ${testNumber}`;
    pageDescription.textContent = `Answer all ${questions.length} questions. Each question carries 1 mark.`;
    selection.hidden = true;
    resultBox.hidden = true;
    quiz.hidden = false;
    form.hidden = false;
    form.reset();
    submitBtn.disabled = false;
    errorBox.hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    selectionError.textContent = err.message;
    selectionError.hidden = false;
  } finally {
    button.disabled = false;
  }
});

uploadOptions.addEventListener('click', (event) => {
  const button = event.target.closest('[data-upload-test]');
  if (!button) return;
  uploadOptions.querySelector(`[data-file-test="${button.dataset.uploadTest}"]`).click();
});

uploadOptions.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-file-test]');
  if (!input || !input.files.length) return;

  const testNumber = Number(input.dataset.fileTest);
  const file = input.files[0];
  input.value = '';
  uploadStatus.hidden = true;
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    uploadStatus.textContent = 'Please choose an .xlsx Excel file.';
    uploadStatus.className = 'upload-status error';
    uploadStatus.hidden = false;
    return;
  }

  const uploadButton = uploadOptions.querySelector(`[data-upload-test="${testNumber}"]`);
  uploadButton.disabled = true;
  uploadStatus.textContent = `Uploading Test ${testNumber} questions...`;
  uploadStatus.className = 'upload-status';
  uploadStatus.hidden = false;

  try {
    const res = await fetch(`/api/tests/${testNumber}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not upload the questions.');

    uploadStatus.textContent = `Test ${testNumber} updated with ${data.questionCount} questions.`;
    await loadTests();
  } catch (err) {
    uploadStatus.textContent = err.message;
    uploadStatus.className = 'upload-status error';
  } finally {
    uploadStatus.hidden = false;
    uploadButton.disabled = false;
  }
});

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

document.getElementById('back-to-tests').addEventListener('click', () => {
  quiz.hidden = true;
  selection.hidden = false;
  form.reset();
  errorBox.hidden = true;
  activeTestNumber = null;
  pageTitle.textContent = 'MCQ Question Paper';
  pageDescription.textContent = 'Select a test to begin.';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('another-test').addEventListener('click', () => {
  resultBox.hidden = true;
  selection.hidden = false;
  pageTitle.textContent = 'MCQ Question Paper';
  pageDescription.textContent = 'Select a test to begin.';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  document.querySelectorAll('.missing').forEach((el) => el.classList.remove('missing'));

  const name = document.getElementById('name').value.trim();
  const roll = document.getElementById('roll').value.trim();
  if (!name || !roll) {
    return showError('Please enter your name and roll number.');
  }

  const answers = questions.map((_, i) => {
    const checked = form.querySelector(`input[name="q${i}"]:checked`);
    return checked ? Number(checked.value) : null;
  });
  const unanswered = answers.map((a, i) => (a === null ? i : -1)).filter((i) => i >= 0);
  if (unanswered.length) {
    unanswered.forEach((i) => document.getElementById(`q${i}`).classList.add('missing'));
    document.getElementById(`q${unanswered[0]}`).scrollIntoView({ behavior: 'smooth', block: 'center' });
    return showError(`Please answer question(s): ${unanswered.map((i) => i + 1).join(', ')}`);
  }

  submitBtn.disabled = true;
  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, roll, testNumber: activeTestNumber, answers }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Submission failed.');

    quiz.hidden = true;
    resultBox.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    showError(err.message);
    submitBtn.disabled = false;
  }
});

loadTests().catch((err) => {
  selectionError.textContent = err.message;
  selectionError.hidden = false;
});
