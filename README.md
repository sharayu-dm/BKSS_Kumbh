# Kumbh – MCQ Question Paper

A Node.js (Express) website with three selectable MCQ tests. Each student enters their name and roll number, answers the selected test and submits. The result is saved to an Excel marksheet.

## Folder structure

```
Kumbh/
├── package.json        # project info and dependencies
├── server.js           # Express server: serves the paper, grades it, writes Excel
├── questions.js        # Test 1 questions
├── questions1.js       # Test 2 questions
├── questions2.js       # Test 3 questions
├── public/
│   ├── index.html      # question paper page
│   ├── style.css       # styling
│   └── app.js          # loads questions, validates and submits answers
└── data/
    └── marksheet.xlsx  # created automatically on the first submission
```

## Run it

```
cd D:\Kumbh
npm install
npm start
```

Open http://localhost:3000 in a browser.

## Marksheet

- Each submission adds one row to `data/marksheet.xlsx`: Roll No, Name, Test Number, selected options, Score, Percentage and submission time.
- Download it from http://localhost:3000/marksheet, or open the file directly.
- Existing rows are preserved and labeled as Test 1 when the Test Number column is added.
- Close the file in Excel before students submit. Windows locks open files, so saving fails while it's open.

## Changing the questions

Edit `questions.js` for Test 1, `questions1.js` for Test 2, or `questions2.js` for Test 3. Each file exports an array of question objects with four options. `answer` is the index of the correct option: 0 = A, 1 = B, 2 = C, 3 = D. Restart the server after editing a question file manually. Excel uploads take effect immediately without a restart.

## Uploading questions from Excel

On the home page, download the template for the test you want to update, fill it in, and use that test's upload button. The worksheet must include these columns: `Q No`, `Question Description`, `Option A`, `Option B`, `Option C`, `Option D`, and `Correct Choice`. Number questions consecutively from 1, provide all four options, and enter `A`, `B`, `C`, or `D` as the correct choice. Uploads accept `.xlsx` files with 1–200 questions and replace only the selected test's questions.

The selected question file (`questions.js`, `questions1.js`, or `questions2.js`) is updated on the server. Keep the uploaded workbook if you need the original Excel version; the server stores the questions as JSON-formatted JavaScript.

## Use from other computers on the same network

Run `ipconfig` to find this PC's IPv4 address, then students open `http://<that-address>:3000`. You may need to allow Node.js through Windows Firewall.
