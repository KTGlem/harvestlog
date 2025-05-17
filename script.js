const SHEET_DATA_URL = "https://docs.google.com/spreadsheets/d/1YcqSW7jhwbVh4NSUMaYWsx5Y4Rto4vxMfxSDP54HK_g/gviz/tq?tqx=out:csv";
const SHEET_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyzC1h8Yk2fRo0_G19CW83r3IB-HjA8oHSOOV3PhllS_7CfdaKbgtaamOidFwEfDDkX/exec";

async function loadTasks() {
  const res = await fetch(SHEET_DATA_URL);
  const raw = await res.text();
  const rows = raw.split("\n").slice(1).filter(r => r.trim() !== "").map(r => r.split(","));

  const tasks = rows
    .map(row => ({
      crop: row[0].replace(/"/g, ''),
      location: row[13].replace(/"/g, ''),
      quantity: row[17].replace(/"/g, ''),
      units: row[18].replace(/"/g, ''),
      clearBed: row[19].replace(/"/g, '') === 'Y',
      assignees: row[20].replace(/"/g, ''),
      salesChannel: row[15].replace(/"/g, ''),
      id: `${row[0]}_${row[13]}`
    }))
    .filter(task => task.quantity)  // only show tasks with units to harvest
    .sort((a, b) => a.crop.localeCompare(b.crop));

  renderTaskList(tasks);
}

function renderTaskList(tasks) {
  const container = document.getElementById("task-list");
  container.innerHTML = "";
  tasks.forEach(task => {
    const div = document.createElement("div");
    div.className = `task-card`;
    div.innerHTML = `
      <h3>${task.crop}</h3>
      <p><strong>Location:</strong> ${task.location}</p>
      <p><strong>${task.clearBed ? 'Clear Bed' : 'Quantity'}:</strong> ${task.clearBed ? 'YES — harvest all' : task.quantity + ' ' + task.units}</p>
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
      <button type="submit">Completed</button>
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
      loadTasks();  // Refresh the list
    })
    .catch(err => alert("Error submitting: " + err));
}

loadTasks();
