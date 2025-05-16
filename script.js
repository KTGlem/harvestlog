// Replace with your published Google Sheet endpoint or Apps Script endpoint for task data
const SHEET_DATA_URL = "YOUR_SHEET_JSON_OR_CSV_ENDPOINT";
const SHEET_WEB_APP_URL = "YOUR_APPS_SCRIPT_WEBHOOK_URL";


async function loadTasks() {
  const res = await fetch(SHEET_DATA_URL);
  const raw = await res.text();
  const rows = raw.split("\n").slice(1).filter(r => r.trim() !== "").map(r => r.split(","));


  const tasks = rows.map(row => ({
    crop: row[0],
    location: row[1],
    units: row[2],
    quantity: row[3],
    salesChannel: row[4],
    clearBed: row[5] === 'Y',
    assignees: row[6],
    done: row[7] === 'Yes',
    id: row[8] || `${row[0]}_${row[1]}` // fallback ID
  })).sort((a, b) => a.crop.localeCompare(b.crop));


  renderTaskList(tasks);
}


function renderTaskList(tasks) {
  const container = document.getElementById("task-list");
  container.innerHTML = "";
  tasks.forEach(task => {
    const div = document.createElement("div");
    div.className = `task-card ${task.done ? 'done' : ''}`;
    div.innerHTML = `
      <h3>${task.crop}</h3>
      <p><strong>Location:</strong> ${task.location}</p>
      <p><strong>${task.clearBed ? 'Clear Bed' : 'Quantity'}:</strong> ${task.clearBed ? '' : task.quantity} ${task.units}</p>
      <p><strong>Assigned To:</strong> ${task.assignees || 'Unassigned'}</p>
      <button onclick='openForm(${JSON.stringify(task)})'>Open</button>
    `;
    container.appendChild(div);
  });
}


function openForm(task) {
  const form = document.createElement("div");
  form.className = "detail-form";
  form.innerHTML = `
    <h2>${task.crop}</h2>
    <p><strong>Location:</strong> ${task.location}</p>
    <p><strong>Sales Channel:</strong> ${task.salesChannel}</p>
    <p><strong>${task.clearBed ? 'Clear Bed' : 'Quantity'}:</strong> ${task.clearBed ? 'YES — harvest all' : task.quantity + ' ' + task.units}</p>
    <form onsubmit="submitForm(event, '${task.id}')">
      <label>Assignee(s)</label>
      <input name="assignee" required placeholder="e.g., Glen, Erika" />
      <label>Time to Harvest (mins)</label>
      <input name="harvestTime" type="number" required />
      <label>Total Harvest Weight (kg)</label>
      <input name="weight" type="number" step="0.1" required />
      <label>Time to Wash & Pack (mins)</label>
      <input name="washTime" type="number" required />
      <label>Field Crew Notes</label>
      <textarea name="notes" placeholder="Optional observations..."></textarea>
      <button type="submit">Submit</button>
      <button type="button" onclick="this.parentNode.parentNode.remove()">Cancel</button>
    </form>
  `;
  document.body.appendChild(form);
}


function submitForm(e, id) {
  e.preventDefault();
  const form = e.target;
  const data = {
    id,
    assignee: form.assignee.value,
    harvestTime: form.harvestTime.value,
    weight: form.weight.value,
    washPackTime: form.washTime.value,
    notes: form.notes.value
  };


  fetch(SHEET_WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  })
    .then(res => res.text())
    .then(() => {
      alert("Submitted!");
      form.parentNode.remove();
      loadTasks();
    })
    .catch(err => alert("Error submitting: " + err));
}


loadTasks();