const form = document.getElementById('paper');
const container = document.getElementById('questions');
const errorBox = document.getElementById('error');
const selectionError = document.getElementById('selection-error');
const submitBtn = document.getElementById('submit');
const resultBox = document.getElementById('result');
const quiz = document.getElementById('quiz');
const pageTitle = document.getElementById('page-title');
const pageDescription = document.getElementById('page-description');
const batchLink = document.getElementById('batch-link');
const LETTERS = ['A', 'B', 'C', 'D'];

let questions = [];
let activeTestNumber = null;
let activeTestType = null;
let activeBatchNumber = null;

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

async function loadAssignedTest() {
  const params = new URLSearchParams(window.location.search);
  const testType = params.get('type');
  const batchNumber = Number(params.get('batch'));
  if (!['pre', 'post'].includes(testType)
    || !Number.isInteger(batchNumber)
    || batchNumber < 1
    || batchNumber > 70) {
    throw new Error('Choose a pre-test or post-test and a batch from the home page.');
  }

  const assignmentsResponse = await fetch('/api/batches');
  if (!assignmentsResponse.ok) throw new Error('Could not load the batch assignments.');
  const assignments = await assignmentsResponse.json();
  const assignment = assignments.find((batch) => batch.batchNumber === batchNumber);
  if (!assignment) throw new Error('The selected batch does not have an assigned test.');

  const res = await fetch(`/api/tests/${assignment.testNumber}/questions`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not load this test.');

  activeTestType = testType;
  activeBatchNumber = batchNumber;
  activeTestNumber = assignment.testNumber;
  questions = data;
  renderQuestions();
  pageTitle.textContent = `${testType === 'pre' ? 'Pre-test' : 'Post-test'} · Batch ${batchNumber} · Test ${activeTestNumber}`;
  pageDescription.textContent = `Answer all ${questions.length} questions. Each question carries 1 mark.`;
  batchLink.href = `/?type=${testType}`;
  resultBox.hidden = true;
  quiz.hidden = false;
  form.hidden = false;
  form.reset();
  submitBtn.disabled = false;
  errorBox.hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

document.getElementById('another-test').addEventListener('click', () => {
  window.location.assign(`/?type=${activeTestType}`);
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
      body: JSON.stringify({
        name,
        roll,
        testType: activeTestType,
        batchNumber: activeBatchNumber,
        testNumber: activeTestNumber,
        answers,
      }),
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

loadAssignedTest().catch((err) => {
  selectionError.textContent = err.message;
  selectionError.hidden = false;
});
