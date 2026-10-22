const uploadOptions = document.getElementById('upload-options');
const uploadStatus = document.getElementById('upload-status');

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

    uploadStatus.textContent = `Test ${testNumber} updated with ${data.questionCount} questions. Opening the test page...`;
    window.setTimeout(() => window.location.assign('/tests'), 500);
  } catch (err) {
    uploadStatus.textContent = err.message;
    uploadStatus.className = 'upload-status error';
    uploadStatus.hidden = false;
    uploadButton.disabled = false;
  }
});
