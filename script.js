const SHEET_DATA_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3QUa3Kjzoj1gDbv8kfbhAf8JSQzuzNe5JgozY8Rk0VfF12zrwkhAo25-4mtgy2B0uM6Rfgctu-VLo/pub?gid=0&single=true&output=csv';
const FORM_POST_URL = 'https://script.google.com/macros/s/AKfycbzG5INeK0qXakzJcTcygtJilOPpQU5RNSzBYYxhx-Iuhy6ibELqqJ-r1UEX-bREzQRP/exec';

let currentRow = null;
let allTasks = [];

function normalizeDate(d) {
  if (!d) return '';
  return d.trim()
          .replace(/["']/g, '')
          .replace(/\r/g, '') // Strip carriage return
          .replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (_, m, d, y) =>
            `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          );
}

function formatDateInput(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

document.getElementById('date-selector').addEventListener('change', (e) => {
  const selected = e.target.value;
  renderTasks(allTasks.filter(row => row['Harvest Date'] === selected));
});

fetch(SHEET_DATA_URL)
  .then(res => res.text())
  .then(csv => {
    const rows = csv.split('\n').map(row => row.split(','));
    const headers = rows.shift();
    allTasks = rows
      .map((row, i) => {
        const data = {};
        headers.forEach((h, j) => data[h.trim()] = row[j] ? row[j].trim() : '');
        data._row = i + 2;
        return data;
      })
      .filter(row => row['Units to Harvest']);

    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('date-selector').value = todayStr;
    renderTasks(allTasks.filter(row => row['Harvest Date'] === todayStr));
  });

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
      <button onclick='openForm(${JSON.stringify(task)})'>Open</button>
    `;
    container.appendChild(div);
  });
}

function openForm(task) {
  currentRow = task;
  document.getElementById('detail-title').innerText = task['Crop'];
  document.getElementById('detail-location').innerText = task['Location'];
  document.getElementById('detail-channel').innerText = task['Harvest Date'];
  document.getElementById('detail-quantity').innerText = task['Units to Harvest'] + ' ' + task['Harvest Units'];

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

document.getElementById('submit-btn').onclick = () => {
  const body = {
    id: currentRow._row,
    assignee: document.getElementById('assignee').value,
    harvestTime: document.getElementById('harvestTime').value,
    weight: document.getElementById('weight').value,
    washPackTime: document.getElementById('washPackTime').value,
    notes: document.getElementById('notes').value,
  };

  fetch(FORM_POST_URL, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  }).then(() => location.reload());
};
