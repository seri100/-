// 간단한 Task API 클라이언트 데모 스크립트
const API_BASE = '/api/tasks'

const taskListEl = document.getElementById('task-list')
const titleInputEl = document.getElementById('task-title-input')
const addBtnEl = document.getElementById('add-task-btn')

function renderTask(task) {
  const li = document.createElement('li')
  li.className = 'py-3 flex items-center justify-between'
  li.dataset.id = task.id

  const left = document.createElement('div')
  left.className = 'flex items-center gap-3'

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = !!task.completed
  checkbox.className = 'w-4 h-4'
  checkbox.addEventListener('change', () => toggleCompleted(task.id, checkbox.checked))

  const span = document.createElement('span')
  span.textContent = task.title
  span.className = task.completed ? 'line-through text-gray-400' : 'text-gray-800'

  left.appendChild(checkbox)
  left.appendChild(span)

  const delBtn = document.createElement('button')
  delBtn.innerHTML = '<i class="fas fa-trash"></i>'
  delBtn.className = 'text-red-500 hover:text-red-700 px-2'
  delBtn.addEventListener('click', () => deleteTask(task.id))

  li.appendChild(left)
  li.appendChild(delBtn)
  return li
}

async function loadTasks() {
  const res = await axios.get(API_BASE)
  taskListEl.innerHTML = ''
  res.data.data.forEach((task) => {
    taskListEl.appendChild(renderTask(task))
  })
}

async function addTask() {
  const title = titleInputEl.value.trim()
  if (!title) return
  await axios.post(API_BASE, { title })
  titleInputEl.value = ''
  await loadTasks()
}

async function toggleCompleted(id, completed) {
  await axios.put(`${API_BASE}/${id}`, { completed })
  await loadTasks()
}

async function deleteTask(id) {
  await axios.delete(`${API_BASE}/${id}`)
  await loadTasks()
}

addBtnEl?.addEventListener('click', addTask)
titleInputEl?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addTask()
})

// 초기 로드
loadTasks().catch((err) => console.error('Failed to load tasks:', err))
