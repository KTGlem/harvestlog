// --------------------
// CONFIGURATION
// --------------------
const SHEET_DATA_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWgAxkAYCsHizO9zPI9j0QSfS7YEzak0PutaN1xBBGidYQJ108Ua2s_rqFfw8Jm_AbnUPGVcPoAhSy/pub?gid=0&single=true&output=csv';
const SHEETBEST_CONNECTION_URL = 'https://api.sheetbest.com/sheets/9243a254-59b8-4906-addf-e097a076a76a';

let currentRow = null;
let allTasks = [];
let taskMap = {};

// --------------------
// UTILITY FUNCTION
// Normalize inconsistent date formats to YYYY-MM-DD
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
    return '';
  }
}

// --------------------
// RENDER SUMMARY LIST OF TASKS
// --------------------
function renderTasks(tasksToRender) {
  const container = document.getElementById('task-list');
  container.innerHTML = '';

  if (!tasksToRender.length) {
    container.innerHTML = '<p>No tasks to display for this date. / No hay tareas para esta fecha.</p>';
    return;
  }

  tasksToRender.forEach(task => {
    const div = document.createElement('div');
    div.className = 'task-card';
    div.innerHTML = `
      <strong>${task['Crop'] || 'N/A'}</strong><br>
      <strong>Location / Ubicación:</strong> ${task['Location'] || '-'}<br>
      <strong>Quantity / Cantidad:</strong> ${task['Units to Harvest'] || 'N/A'} ${task['Harvest Units'] || ''}<br>
      <strong>Assigned To / Asignado a:</strong> ${task['Assignee(s)'] || 'Unassigned / Sin asignar'}<br>
      <button onclick="openForm(${task._row || 0})">Open / Abrir</button>
    `;
    container.appendChild(div);
  });
}

// --------------------
// DETAIL FORM VIEW
// --------------------
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

  document.getElementById('sales-breakdown').innerHTML = `
    <strong>Sales Breakdown / Desglose de Ventas:</strong>
    <span>CSA: ${task['CSA'] || 0}</span>
    <span>Parkdale Bins: ${task['Parkdale Bins'] || 0}</span>
    <span>Cobourg Market: ${task['Cobourg Farmers Market'] || 0}</span>
    <span>Kitchen: ${task['Kitchen'] || 0}</span>
    <span>Online: ${task['Online'] || 0}</span>
  `;

  // Reset form inputs
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
// BUILD PAYLOAD FOR PATCH
// - requireAllFields = true → used for final "Mark Completed"
// --------------------
function buildPayload(requireAllFields = false) {
  const assignee = document.getElementById('assignee').value.trim();
  const harvestTime = document.getElementById('harvestTime').value.trim();
  const weight = document.getElementById('weight').value.trim();
  const washPackTime = document.getElementById('washPackTime').value.trim();
  const notes = document.getElementById('notes').value.trim();

  if (requireAllFields && (!assignee || !harvestTime || !weight || !washPackTime)) {
    alert("Please complete all required fields before marking as completed.");
    return null;
  }

  const payload = {};
  if (assignee) payload['Assignee(s)'] = assignee;
  if (harvestTime) payload['Time to Harvest (min)'] = harvestTime;
  if (weight) payload['Harvest Weight (kg)'] = weight;
  if (washPackTime) payload['Time to Wash & Pack (mins)'] = washPackTime;
  if (notes) payload['Field Crew Notes'] = notes;

  if (requireAllFields) {
    payload['Status'] = 'Completed';
    payload['Harvest Date'] = new Date().toISOString().split('T')[0]; // today
  } else if (assignee) {
    payload['Status'] = 'Assigned';
  }

  return payload;
}

// --------------------
// SEND PATCH TO SHEETBEST
// --------------------
function sendUpdate(payload) {
  if (!currentRow || typeof currentRow._row === 'undefined') {
    alert("Task data is incomplete.");
    return;
  }

  const rowIndex = currentRow._row - 2;
  const url = `${SHEETBEST_CONNECTION_URL}/${rowIndex}`;

  fetch(url, {
    method: 'PATCH',
    mode: 'cors', // ✅ Required for browser-based SheetBest access
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(() => {
      alert('Update successful!');
      location.reload(); // Refresh to re-render summary list
    })
    .catch(error => {
      console.error('Failed to update task:', error);
      alert('Error updating task. Check console for details.');
    });
}

// --------------------
// PAGE LOAD & BUTTON EVENTS
// --------------------
document.addEventListener('DOMContentLoaded', () => {
  const dateInput = document.getElementById('date-selector');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;

    document.addEventListener('tasksLoaded', () => {
      const filtered = allTasks.filter(row => normalizeDate(row['Harvest Date']) === dateInput.value);
      renderTasks(filtered);
    });

    dateInput.addEventListener('change', () => {
      const selected = dateInput.value;
      const filtered = allTasks.filter(row => normalizeDate(row['Harvest Date']) === selected);
      renderTasks(filtered);
    });
  }

  document.getElementById('update-btn')?.addEventListener('click', () => {
    const payload = buildPayload(false);
    if (payload) sendUpdate(payload);
  });

  document.getElementById('complete-btn')?.addEventListener('click', () => {
    const payload = buildPayload(true);
    if (payload) sendUpdate(payload);
  });
});
