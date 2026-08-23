import { jsxRenderer } from 'hono/jsx-renderer'

export const renderer = jsxRenderer(({ children }, c) => {
  const path = c.req.path
  const isGcal = path === '/gcal'

  const title = isGcal ? '구글 캘린더 입찰 대시보드' : '입찰 관리 대시보드'

  const scriptSrc = isGcal ? '/static/gcal-app.js' : '/static/bid-app.js'

  return (
    <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>

        {/* 파비콘 (PC 브라우저 탭) */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/static/icons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/static/icons/favicon-16x16.png" />

        {/* 모바일 홈화면 아이콘 (iOS/Android) */}
        <link rel="apple-touch-icon" sizes="180x180" href="/static/icons/apple-touch-icon.png" />
        <link rel="manifest" href="/static/manifest.json" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="입찰대시보드" />

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
