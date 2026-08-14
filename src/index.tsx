import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { renderer } from './renderer'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// API 전용 CORS 허용 (프론트-백엔드 분리 아키텍처를 가정)
app.use('/api/*', cors())

// ------------------------------------------------------------------
// REST API: Task 관리 (Cloudflare D1 사용)
// ------------------------------------------------------------------

// [GET] /api/tasks - 전체 목록 조회 (completed 쿼리 파라미터로 필터 가능)
app.get('/api/tasks', async (c) => {
  const { env } = c
  const completed = c.req.query('completed') // 'true' | 'false' | undefined

  let query = 'SELECT * FROM tasks'
  const params: any[] = []

  if (completed === 'true' || completed === 'false') {
    query += ' WHERE completed = ?'
    params.push(completed === 'true' ? 1 : 0)
  }
  query += ' ORDER BY created_at DESC'

  const { results } = await env.DB.prepare(query).bind(...params).all()

  return c.json({
    success: true,
    data: results,
    count: results.length
  })
})

// [GET] /api/tasks/:id - 단일 조회
app.get('/api/tasks/:id', async (c) => {
  const { env } = c
  const id = c.req.param('id')

  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?')
    .bind(id)
    .first()

  if (!task) {
    return c.json({ success: false, error: 'Task not found' }, 404)
  }

  return c.json({ success: true, data: task })
})

// [POST] /api/tasks - 생성
app.post('/api/tasks', async (c) => {
  const { env } = c
  const body = await c.req.json().catch(() => null)

  if (!body || typeof body.title !== 'string' || body.title.trim() === '') {
    return c.json({ success: false, error: 'title is required' }, 400)
  }

  const { title, description = null } = body

  const result = await env.DB.prepare(
    'INSERT INTO tasks (title, description) VALUES (?, ?)'
  ).bind(title, description).run()

  const created = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first()

  return c.json({ success: true, data: created }, 201)
})

// [PUT] /api/tasks/:id - 수정 (title, description, completed)
app.put('/api/tasks/:id', async (c) => {
  const { env } = c
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)

  const existing = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?')
    .bind(id)
    .first()

  if (!existing) {
    return c.json({ success: false, error: 'Task not found' }, 404)
  }

  const title = body?.title ?? existing.title
  const description = body?.description ?? existing.description
  const completed = body?.completed !== undefined
    ? (body.completed ? 1 : 0)
    : existing.completed

  await env.DB.prepare(
    `UPDATE tasks SET title = ?, description = ?, completed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(title, description, completed, id).run()

  const updated = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?')
    .bind(id)
    .first()

  return c.json({ success: true, data: updated })
})

// [DELETE] /api/tasks/:id - 삭제
app.delete('/api/tasks/:id', async (c) => {
  const { env } = c
  const id = c.req.param('id')

  const existing = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?')
    .bind(id)
    .first()

  if (!existing) {
    return c.json({ success: false, error: 'Task not found' }, 404)
  }

  await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run()

  return c.json({ success: true, message: `Task ${id} deleted` })
})

// ------------------------------------------------------------------
// 문서/데모 페이지 (프론트엔드)
// ------------------------------------------------------------------
app.use(renderer)

app.get('/', (c) => {
  return c.render(
    <div id="api-doc-app" class="max-w-4xl mx-auto py-10 px-4">
      <header class="mb-8">
        <h1 class="text-3xl font-bold text-gray-800">
          <i class="fas fa-server mr-2 text-blue-600"></i>
          Task API 서버 예시
        </h1>
        <p class="text-gray-500 mt-2">Hono + Cloudflare D1로 만든 REST API 데모입니다.</p>
      </header>

      <section class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-xl font-semibold mb-4">📋 엔드포인트 목록</h2>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left border-b">
              <th class="py-2 pr-4">Method</th>
              <th class="py-2 pr-4">Path</th>
              <th class="py-2">설명</th>
            </tr>
          </thead>
          <tbody id="endpoint-table-body" class="divide-y">
            <tr><td class="py-2 pr-4"><span class="px-2 py-1 bg-green-100 text-green-700 rounded font-mono text-xs">GET</span></td><td class="py-2 pr-4 font-mono">/api/tasks</td><td class="py-2">전체 목록 조회 (?completed=true/false)</td></tr>
            <tr><td class="py-2 pr-4"><span class="px-2 py-1 bg-green-100 text-green-700 rounded font-mono text-xs">GET</span></td><td class="py-2 pr-4 font-mono">/api/tasks/:id</td><td class="py-2">단일 항목 조회</td></tr>
            <tr><td class="py-2 pr-4"><span class="px-2 py-1 bg-blue-100 text-blue-700 rounded font-mono text-xs">POST</span></td><td class="py-2 pr-4 font-mono">/api/tasks</td><td class="py-2">신규 생성 { "{ title, description }" }</td></tr>
            <tr><td class="py-2 pr-4"><span class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded font-mono text-xs">PUT</span></td><td class="py-2 pr-4 font-mono">/api/tasks/:id</td><td class="py-2">수정 { "{ title, description, completed }" }</td></tr>
            <tr><td class="py-2 pr-4"><span class="px-2 py-1 bg-red-100 text-red-700 rounded font-mono text-xs">DELETE</span></td><td class="py-2 pr-4 font-mono">/api/tasks/:id</td><td class="py-2">삭제</td></tr>
          </tbody>
        </table>
      </section>

      <section class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-xl font-semibold mb-4">🧪 라이브 테스트</h2>
        <div class="flex gap-2 mb-4">
          <input id="task-title-input" type="text" placeholder="할 일 제목 입력..." class="flex-1 border rounded px-3 py-2" />
          <button id="add-task-btn" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            <i class="fas fa-plus mr-1"></i>추가
          </button>
        </div>
        <ul id="task-list" class="divide-y"></ul>
      </section>

      <section class="bg-gray-900 text-green-400 rounded-lg shadow p-6 font-mono text-sm overflow-x-auto">
        <h2 class="text-white text-lg font-semibold mb-3 font-sans">💻 curl 예시</h2>
        <pre># 목록 조회
curl {'{'}BASE_URL{'}'}/api/tasks

# 생성
curl -X POST {'{'}BASE_URL{'}'}/api/tasks \
  -H "Content-Type: application/json" \
  -d '{'{'}"title":"장보기","description":"우유, 계란"{'}'}'

# 수정 (완료 처리)
curl -X PUT {'{'}BASE_URL{'}'}/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{'{'}"completed":true{'}'}'

# 삭제
curl -X DELETE {'{'}BASE_URL{'}'}/api/tasks/1</pre>
      </section>
    </div>
  )
})

export default app
