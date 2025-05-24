// --------------------
// CONFIGURATION
// --------------------
const SHEET_DATA_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWgAxkAYCsHizO9zPI9j0QSfS7YEzak0PutaN1xBBGidYQJ108Ua2s_rqFfw8Jm_AbnUPGVcPoAhSy/pub?gid=0&single=true&output=csv';
const FORM_POST_URL = 'https://script.google.com/macros/s/AKfycbyYY6E0PZM2rpjys5PRkqxsbDeBw9wfW9jxzyQO96Tvo92O7tY3tCPcKx7WzgP7pDZD/exec';

let currentRow = null;
let allTasks = []; // Correctly initialized
let taskMap = {};

// --------------------
// UTILITY FUNCTIONS
// --------------------
function normalizeDate(d) {
  if (!d) return '';
  try {
    return d.trim()
      .replace(/["']/g, '')
      .replace(/\r/g, '')
      .replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (_, m, d, y) =>
        `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      );
  } catch (error) {
    console.error("Error normalizing date:", d, error);
    return ''; // Return an empty string or a specific error indicator
  }
}

// --------------------
// RENDER: SUMMARY VIEW
// --------------------
function renderTasks(tasksToRender) { // Changed parameter name for clarity
  const container = document.getElementById('task-list');
  container.innerHTML = ''; // Clear previous tasks

  if (!tasksToRender || tasksToRender.length === 0) {
    container.innerHTML = '<p>No tasks to display for this date.</p>';
    return;
  }

  tasksToRender.forEach(task => {
    const div = document.createElement('div');
    div.className = 'task-card';
    div.innerHTML = `
      <strong>${task['Crop'] || 'N/A'}</strong><br>
      <strong>Location:</strong> ${task['Location'] || '-'}<br>
      <strong>Quantity:</strong> ${task['Units to Harvest'] || 'N/A'} ${task['Harvest Units'] || ''}<br>
      <strong>Assigned To:</strong> ${task['Assignee(s)'] || 'Unassigned'}<br>
      <button onclick="openForm(${task._row || 0})">Open</button>
    `;
    container.appendChild(div);
  });
}

// ... (openForm and closeForm remain the same) ...
function openForm(rowId) {
  const task = taskMap[rowId];
  if (!task) {
      console.error("Task not found for rowId:", rowId);
      return;
  }

  currentRow = task;
  document.getElementById('detail-title').innerText = task['Crop'] || 'N/A';
  document.getElementById('detail-location').innerText = task['Location'] || '-';
  document.getElementById('detail-quantity').innerText = `${task['Units to Harvest'] || 'N/A'} ${task['Harvest Units'] || ''}`;

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
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status} while fetching SHEET_DATA_URL`);
    }
    return res.text();
  })
  .then(csv => {
    console.log("CSV data fetched successfully.");
    if (!csv || csv.trim() === "") {
        throw new Error("Fetched CSV data is empty.");
    }
    const rows = csv.trim().split('\n').map(row => {
      // ... (your existing robust CSV row parsing logic) ...
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
    console.log("CSV Headers:", headers);

    // Temporarily disable the .filter in allTasks mapping to see all parsed data
    const parsedTasks = rows.map((row, i) => {
      const obj = {};
      headers.forEach((h, j) => {
        const key = h.trim();
        let value = row[j] ? row[j].trim().replace(/^"|"$/g, '') : '';
        if (key === 'Harvest Date') {
            value = normalizeDate(value); // Ensure this is working
            // console.log(`Original Date: ${row[j]}, Normalized: ${value}`); // For date debugging
        }
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
    });

    console.log('All Parsed Tasks (before filter):', JSON.parse(JSON.stringify(parsedTasks))); // Deep copy for logging

    allTasks = parsedTasks.filter(row =>
      row['Crop'] &&
      row['Harvest Date'] && // This needs to be the normalized YYYY-MM-DD format
      row['Harvest Date'] !== '' && // Ensure normalizeDate didn't return empty
      !isNaN(parseFloat(row['Units to Harvest'])) &&
      parseFloat(row['Units to Harvest']) > 0
    );

    console.log('Filtered allTasks:', JSON.parse(JSON.stringify(allTasks))); // Deep copy for logging

    taskMap = {};
    allTasks.forEach(t => {
      taskMap[t._row] = t;
    });

    const event = new Event('tasksLoaded');
    document.dispatchEvent(event);
  })
  .catch(error => {
    console.error('Error fetching or parsing initial sheet data:', error);
    alert('Could not load harvest tasks. Error: ' + error.message);
    const container = document.getElementById('task-list');
    if (container) {
        container.innerHTML = `<p style="color: red;">Error loading tasks: ${error.message}. Please try again later.</p>`;
    }
    // Dispatch tasksLoaded event even on error, so UI can react if needed,
    // or ensure allTasks is definitely an empty array
    allTasks = []; // Ensure allTasks is an empty array on error
    taskMap = {};
    const event = new Event('tasksLoaded'); // Still dispatch so listener doesn't hang indefinitely
    document.dispatchEvent(event);
  });

// --------------------
// DOM READY BINDINGS
// --------------------
document.addEventListener('DOMContentLoaded', () => {
  const dateInput = document.getElementById('date-selector');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;

    document.addEventListener('tasksLoaded', () => {
      console.log("Tasks loaded event received, attempting initial render for date:", dateInput.value);
      // Ensure allTasks is an array before filtering
      const tasksToFilter = Array.isArray(allTasks) ? allTasks : [];
      const filteredTasks = tasksToFilter.filter(row => {
          const normalizedRowDate = normalizeDate(row['Harvest Date']);
          // console.log(`Initial Render Filtering: RowDate='${normalizedRowDate}', InputDate='${dateInput.value}'`);
          return normalizedRowDate === dateInput.value;
      });
      renderTasks(filteredTasks);
    });

    dateInput.addEventListener('change', () => {
      const selectedDate = dateInput.value;
      console.log("Date changed to:", selectedDate, "attempting to re-render.");
      // Ensure allTasks is an array before filtering
      const tasksToFilter = Array.isArray(allTasks) ? allTasks : [];
      const filteredTasks = tasksToFilter.filter(row => {
          const normalizedRowDate = normalizeDate(row['Harvest Date']);
          // console.log(`Date Change Filtering: RowDate='${normalizedRowDate}', InputDate='${selectedDate}'`);
          return normalizedRowDate === selectedDate;
      });
      renderTasks(filteredTasks);
    });
  }

  // ... (Your Zapier submission logic) ...
  const submit = document.getElementById('submit-btn');
  if (submit) {
    submit.addEventListener('click', () => {
      if (!currentRow) return;
      const body = {
        targetRow: currentRow._row, // Original row number from the sheet
        assignee: document.getElementById('assignee').value,
        harvestTime: document.getElementById('harvestTime').value,
        weight: document.getElementById('weight').value,
        washPackTime: document.getElementById('washPackTime').value,
        notes: document.getElementById('notes').value,
      };

       console.log('Body being sent to Apps Script for update:', JSON.stringify(body));
      
      fetch(FORM_POST_URL, {
        method: 'POST',
        body: JSON.stringify(body)
        
      })
       .then(response => {
        if (!response.ok) {
          return response.text().then(text => {
            throw new Error(`HTTP error! Status: ${response.status} - Response: ${text}`);
          });
        }
        return response.text(); // Apps Script doPost with ContentService returns text
      })
      .then(data => {
        console.log('Response from Apps Script:', data);
        if (data && data.toLowerCase().includes("success")) {
          alert('Task updated in Google Sheet successfully!'); // More specific message
        } else {
          alert('Task update sent, but Apps Script reported an issue or unexpected response: ' + data);
        }
        location.reload(); // Reload to refresh the task list
      })
      .catch(error => {
        console.error('Error sending update to Apps Script:', error);
        alert('Failed to update task in Google Sheet: ' + error.message + '\nCheck console for details.');
      });
    });
  }

  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeForm);
  }
});
