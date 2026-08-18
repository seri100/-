import { jsxRenderer } from 'hono/jsx-renderer'

export const renderer = jsxRenderer(({ children }, c) => {
  const path = c.req.path
  const isApiDocs = path === '/api-docs'
  const isGcal = path === '/gcal'

  const title = isApiDocs
    ? 'Task API 서버 예시'
    : isGcal
      ? '구글 캘린더 입찰 대시보드'
      : '입찰 관리 대시보드'

  const scriptSrc = isApiDocs
    ? '/static/app.js'
    : isGcal
      ? '/static/gcal-app.js'
      : '/static/bid-app.js'

  return (
    <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" />
        <link href="/static/style.css" rel="stylesheet" />
      </head>
      <body class="bg-gray-100">
        {children}
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src={scriptSrc}></script>
      </body>
    </html>
  )
})
