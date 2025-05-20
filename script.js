// --------------------
// CONFIGURATION
// --------------------
const SHEET_DATA_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTilt71smVx4Rd1AV9CL0izzeOCB3Vd6jpMyaLKm2mBACfngJQwgQKcUEgyBhEsU20y95GareQUEYov/pub?gid=0&single=true&output=csv';
const FORM_POST_URL = 'https://hooks.zapier.com/hooks/catch/18062960/27c20wc/';

let currentRow = null;
let allTasks = [];
let taskMap = {};

// --------------------
// UTILITY FUNCTIONS
// --------------------
function normalizeDate(d) {
  if (!d) return '';
  return d.trim()
    .replace(/["']/g, '')
    .replace(/\r/g, '')
    .replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (_, m, d, y) =>
      `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    );
}

// --------------------
// RENDER: SUMMARY VIEW
// --------------------
function renderTasks(tasks) {
  const container = document.getElementById('task-list');
  container.innerHTML = '';

  tasks.forEach(task => {
    const div = document.createElement('div');
    div.className = 'task-card';
    div.innerHTML = `
      <strong>${task['Crop']}</strong><br>
      <strong>Location:</strong> ${task['Location'] || '-'}<br>
      <strong>Quantity:</strong> ${task['Units to Harvest']} ${task['Harvest Units']}<br>
      <strong>Assigned To:</strong> ${task['Assignee(s)'] || 'Unassigned'}<br>
      <button onclick="openForm(${task._row || 0})">Open</button>
    `;
    container.appendChild(div);
  });
}

// --------------------
// RENDER: DETAIL VIEW
// --------------------
function openForm(rowId) {
  const task = taskMap[rowId];
  if (!task) return;

  currentRow = task;
  document.getElementById('detail-title').innerText = task['Crop'];
  document.getElementById('detail-location').innerText = task['Location'] || '-';
  document.getElementById('detail-quantity').innerText = `${task['Units to Harvest']} ${task['Harvest Units']}`;

  const breakdown = document.getElementById('sales-breakdown');
  breakdown.innerHTML = `
    <strong>Sales Breakdown:</strong>
    <span>CSA: ${task['CSA'] || 0}</span>
    <span>Parkdale Bins: ${task['Parkdale Bins'] || 0}</span>
    <span>Cobourg Farmers Market: ${task['Cobourg Farmers Market'] || 0}</span>
    <span>Kitchen: ${task['Kitchen'] || 0}</span>
    <span>Online: ${task['Online'] || 0}</span>
  `;

  document.getElementById('assignee').value = task['Assignee(s)'] || '';
  document.getElementById('harvestTime').value = '';
  document.getElementById('weight').value = '';
  document.getElementById('washPackTime').value = '';
  document.getElementById('notes').value = '';

  document.getElementById('detail-form').style.display = 'block';
}

function closeForm() {
  document.getElementById('detail-form').style.display = 'none';
}

// --------------------
// DATA FETCH & PARSE
// --------------------
fetch(SHEET_DATA_URL)
  .then(res => res.text())
  .then(csv => {
    const rows = csv.trim().split('\n').map(row => {
      const cells = [];
      let inQuotes = false, value = '';

      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        const nextChar = row[i + 1];

        if (char === '"' && inQuotes && nextChar === '"') {
          value += '"'; i++;
        } else if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cells.push(value);
          value = '';
        } else {
          value += char;
        }
      }
      cells.push(value);
      return cells.map(c => c.trim());
    });

    const headers = rows.shift();

    allTasks = rows.map((row, i) => {
      const obj = {};

      headers.forEach((h, j) => {
        const key = h.trim();
        let value = row[j] ? row[j].trim().replace(/^"|"$/g, '') : '';
        if (key === 'Harvest Date') value = normalizeDate(value);

        if (key === 'Location') {
          obj[key] = value;
          const matches = [...value.matchAll(/(\d+)(?:\s*\(([^)]+)\))?/g)];
          obj['_parsedLocations'] = matches.flatMap(m => {
            const primary = m[1];
            const extras = m[2]?.split(',').map(x => x.trim()) || [];
            return [primary, ...extras];
          });
        } else {
          obj[key] = value;
        }
      });

      obj._row = i + 2;
      return obj;
    })
    .filter(row =>
      row['Crop'] &&
      row['Harvest Date'] &&
      !isNaN(parseFloat(row['Units to Harvest'])) &&
      parseFloat(row['Units to Harvest']) > 0
    );

    taskMap = {};
    allTasks.forEach(t => {
      taskMap[t._row] = t;
    });
  });

// --------------------
// DOM READY BINDINGS
// --------------------
document.addEventListener('DOMContentLoaded', () => {
  // Bind date selector
  const dateInput = document.getElementById('date-selector');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;

    const filtered = () => allTasks.filter(row => normalizeDate(row['Harvest Date']) === dateInput.value);
    renderTasks(filtered());

    dateInput.addEventListener('change', () => {
      renderTasks(filtered());
    });
  }

  // Bind Completed button
  const submit = document.getElementById('submit-btn');
  if (submit) {
    submit.addEventListener('click', () => {
      if (!currentRow) return;
      const body = {
        id: currentRow._row,
        assignee: document.getElementById('assignee').value,
        harvestTime: document.getElementById('harvestTime').value,
        weight: document.getElementById('weight').value,
        washPackTime: document.getElementById('washPackTime').value,
        notes: document.getElementById('notes').value,
      };

      console.log('Body being sent to Zapier:', JSON.stringify(body)); // Verify payload before sending

      fetch(FORM_POST_URL, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
      })
      .then(response => {
        // Always try to clone the response if you might need to read it more than once
        // (though not strictly necessary with this refined pattern)
        // const clonedResponse = response.clone(); // If you ever needed to debug with multiple reads

        // First, check if the HTTP response itself was successful (e.g., 200 OK)
        if (!response.ok) {
          // If not OK, read the response as text (for error messages) and throw an error.
          return response.text().then(text => {
            throw new Error(`HTTP error! Status: ${response.status} - Response: ${text}`);
          });
        }
        // If response is OK, try to parse it as JSON.
        // This is the ONLY place response.json() should be called on the original response object.
        return response.json();
      })
      .then(data => {
        // This code runs if the fetch request was successful and response was valid JSON
        console.log('Successfully sent data to Zapier:', data); // Log Zapier's response
        // Zapier's success response will typically be like { "status": "success", "attempt": "..." }
        if (data && data.status === 'success') {
          alert('Data sent to Zapier successfully!');
        } else if (data) {
          alert('Data sent to Zapier, but Zapier indicated an issue: ' + JSON.stringify(data));
        } else {
          alert('Data sent to Zapier, but no clear success response.');
        }

        location.reload(); // Reload the page after confirmed success
      })
      .catch(error => {
        // This code runs if there was any network error or if any 'throw new Error' occurred.
        console.error('Error sending data to Zapier:', error); // Log the error to console
        alert('Failed to send data to Zapier: ' + error.message + '\nCheck console for details.');
      });
  }

  // Bind Cancel button
  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeForm);
  }
});
