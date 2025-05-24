// --------------------
// CONFIGURATION
// --------------------
const SHEET_DATA_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWgAxkAYCsHizO9zPI9j0QSfS7YEzak0PutaN1xBBGidYQJ108Ua2s_rqFfw8Jm_AbnUPGVcPoAhSy/pub?gid=0&single=true&output=csv';
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
  .then(res => {
    if (!res.ok) { // Check if the fetch itself was successful
      throw new Error(`HTTP error! status: ${res.status} while fetching SHEET_DATA_URL`);
    }
    return res.text();
  })
  .then(csv => {
    console.log("CSV data fetched successfully."); // For debugging
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
    if (!headers || headers.length === 0) {
      throw new Error("CSV headers are missing or empty.");
    }
    console.log("CSV Headers:", headers); // For debugging

    allTasks = rows.map((row, i) => {
      const obj = {};
      headers.forEach((h, j) => {
        const key = h.trim();
        let value = row[j] ? row[j].trim().replace(/^"|"$/g, '') : '';
        if (key === 'Harvest Date') { // Ensure this header name matches your CSV EXACTLY
            value = normalizeDate(value);
        }
        // Keep your existing location parsing logic if needed
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
      obj._row = i + 2; // Original row number in the sheet (headers + 0-indexed to 1-indexed)
      return obj;
    })
    .filter(row =>
      row['Crop'] &&
      row['Harvest Date'] && // This needs to be the normalized YYYY-MM-DD format for the filter to work
      !isNaN(parseFloat(row['Units to Harvest'])) &&
      parseFloat(row['Units to Harvest']) > 0
    );

    console.log('Parsed allTasks:', allTasks); // For debugging

    taskMap = {};
    allTasks.forEach(t => {
      taskMap[t._row] = t;
    });

    // --- Trigger initial rendering AFTER data is loaded and parsed ---
    const event = new Event('tasksLoaded');
    document.dispatchEvent(event);
    // --- End trigger ---

  })
  .catch(error => {
    console.error('Error fetching or parsing initial sheet data:', error);
    alert('Could not load harvest tasks. Please check the data source and your internet connection. Error: ' + error.message);
    const container = document.getElementById('task-list');
    if (container) {
        container.innerHTML = '<p style="color: red;">Error loading tasks: ' + error.message + '. Please try again later.</p>';
    }
  });


// --------------------
// DOM READY BINDINGS
// --------------------
document.addEventListener('DOMContentLoaded', () => {
  // Bind date selector
  const dateInput = document.getElementById('date-selector');
  if (dateInput) {
    // Set today's date initially
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;

    // Listen for the custom event that indicates tasks are loaded
    document.addEventListener('tasksLoaded', () => {
      console.log("Tasks loaded event received, attempting initial render."); // For debugging
      const filtered = () => allTasks.filter(row => {
          // Add a log here to see what normalizeDate(row['Harvest Date']) and dateInput.value are
          // console.log(`Filtering: Row Date: ${normalizeDate(row['Harvest Date'])}, Input Date: ${dateInput.value}`);
          return normalizeDate(row['Harvest Date']) === dateInput.value;
      });
      renderTasks(filtered());
    });

    dateInput.addEventListener('change', () => {
      console.log("Date changed, attempting to re-render."); // For debugging
      if (allTasks && allTasks.length > 0) { // Ensure allTasks is defined and populated
          const filtered = () => allTasks.filter(row => normalizeDate(row['Harvest Date']) === dateInput.value);
          renderTasks(filtered());
      } else {
          console.warn('allTasks is not populated or empty when trying to render on date change.');
          // Optionally clear the list or show a "No data" message if allTasks is empty
          const container = document.getElementById('task-list');
          if (container) {
            container.innerHTML = '<p>No tasks to display for this date (data might still be loading or filtering issue).</p>';
          }
      }
    });
  }

  // --- Your existing Zapier submission logic can remain here ---
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

      console.log('Body being sent to Zapier:', JSON.stringify(body));

      fetch(FORM_POST_URL, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
      })
      .then(response => {
        if (!response.ok) {
          return response.text().then(text => {
            throw new Error(`HTTP error! Status: ${response.status} - Response: ${text}`);
          });
        }
        return response.json();
      })
      .then(data => {
        console.log('Successfully sent data to Zapier:', data);
        if (data && data.status === 'success') {
          alert('Data sent to Zapier successfully!');
        } else if (data) {
          alert('Data sent to Zapier, but Zapier indicated an issue: ' + JSON.stringify(data));
        } else {
          alert('Data sent to Zapier, but no clear success response.');
        }
        location.reload();
      })
      .catch(error => {
        console.error('Error sending data to Zapier:', error);
        alert('Failed to send data to Zapier: ' + error.message + '\nCheck console for details.');
      });
    });
  }

  // Bind Cancel button
  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeForm);
  }
  // --- End Zapier submission logic ---
});


