const batchSelection = document.getElementById('batch-selection');
const batchOptions = document.getElementById('batch-options');
const selectionError = document.getElementById('selection-error');
const selectedTestType = document.getElementById('selected-test-type');
const testTypeButtons = document.querySelectorAll('[data-test-type]');

let batches = [];
let activeTestType = null;

function renderBatches() {
  batchOptions.innerHTML = batches.map(({ batchNumber }) => `
    <button type="button" class="batch-option" data-batch-number="${batchNumber}">
      Batch ${batchNumber}
    </button>`).join('');
}

async function loadBatches() {
  const res = await fetch('/api/batches');
  if (!res.ok) throw new Error('Could not load the batch list. Is the server running?');
  batches = await res.json();
  renderBatches();
}

function chooseTestType(testType) {
  activeTestType = testType;
  testTypeButtons.forEach((button) => {
    const selected = button.dataset.testType === testType;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  selectedTestType.textContent = `${testType === 'pre' ? 'Pre-test' : 'Post-test'} selected`;
  batchSelection.hidden = false;
  selectionError.hidden = true;
}

testTypeButtons.forEach((button) => {
  button.addEventListener('click', () => chooseTestType(button.dataset.testType));
});

batchOptions.addEventListener('click', (event) => {
  const button = event.target.closest('[data-batch-number]');
  if (!button || !activeTestType) return;
  const batchNumber = Number(button.dataset.batchNumber);
  window.location.assign(`/tests?type=${activeTestType}&batch=${batchNumber}`);
});

const initialTestType = new URLSearchParams(window.location.search).get('type');
if (initialTestType === 'pre' || initialTestType === 'post') chooseTestType(initialTestType);

loadBatches().catch((error) => {
  selectionError.textContent = error.message;
  selectionError.hidden = false;
  batchSelection.hidden = false;
});
