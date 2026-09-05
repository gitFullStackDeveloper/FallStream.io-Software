// The entire offline page HTML, right inside the Service Worker
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>You're Offline | FallStream.io</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Plus Jakarta Sans', 'Outfit', sans-serif;
            background: #f1f5f9;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 2rem;
        }
        .error-card {
            background: #fff;
            border-radius: 24px;
            padding: 3rem 2.5rem;
            max-width: 480px;
            width: 100%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04);
            border: 1px solid #e5e7eb;
        }
        .error-icon {
            width: 80px; height: 80px; border-radius: 20px;
            background: #fef2f2; color: #ef4444;
            display: flex; align-items: center; justify-content: center;
            font-size: 2.2rem; margin: 0 auto 1.5rem;
        }
        .error-card h1 {
            font-family: 'Outfit', sans-serif;
            font-size: 1.6rem; font-weight: 700; color: #1e293b; margin-bottom: 0.5rem;
        }
        .error-card p {
            color: #64748b; font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem;
        }
        .btn {
            display: inline-flex; align-items: center; gap: 8px;
            padding: 12px 28px; background: #3b82f6; color: #fff;
            border: none; border-radius: 12px; font-family: inherit;
            font-size: 0.95rem; font-weight: 600; cursor: pointer;
            text-decoration: none; transition: background 0.2s, transform 0.1s;
        }
        .btn:hover { background: #2563eb; transform: translateY(-1px); }
        .btn:disabled { opacity: 0.7; cursor: not-allowed; transform: none; }
        .btn .btn-text { display: inline-flex; align-items: center; gap: 8px; }
        .btn .btn-spinner { display: none; }
        .btn.loading .btn-text { display: none; }
        .btn.loading .btn-spinner { display: inline-flex; align-items: center; gap: 8px; }
        .status-dot {
            display: inline-block; width: 10px; height: 10px;
            border-radius: 50%; background: #ef4444; margin-right: 8px;
            animation: pulse 1.5s infinite;
        }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .auto-reconnect {
            margin-top: 1.5rem; font-size: 0.8rem; color: #94a3b8;
        }
        .error-toast {
            position: fixed; bottom: -100px; left: 50%; transform: translateX(-50%);
            background: #fef2f2; color: #991b1b; padding: 12px 24px; border-radius: 12px;
            font-size: 0.9rem; font-weight: 600; display: flex; align-items: center; gap: 10px;
            box-shadow: 0 6px 20px rgba(239,68,68,0.2); z-index: 9999;
            transition: bottom 0.4s cubic-bezier(0.2, 0.9, 0.4, 1.1);
            border: 1px solid #fecaca;
        }
        .error-toast.show { bottom: 30px; }
        .error-toast i { color: #ef4444; }
    </style>
</head>
<body>
    <div class="error-card">
        <div class="error-icon"><i class="fas fa-circle-exclamation"></i></div>
        <h1>No Internet Connection</h1>
        <p>It looks like you’ve lost your connection. Please check your network and try again.</p>
        <button class="btn" id="retryBtn" onclick="retryConnection()">
            <span class="btn-text"><i class="fas fa-redo-alt"></i> Try Again</span>
            <span class="btn-spinner"><i class="fas fa-spinner fa-spin"></i> Checking...</span>
        </button>
        <div class="auto-reconnect">
            <span class="status-dot"></span> Waiting for connection...
        </div>
    </div>
    <div class="error-toast" id="errorToast">
        <i class="fas fa-circle-exclamation"></i>
        <span>Still no connection. Please check your network.</span>
    </div>
    <script>
        window.addEventListener('online', () => location.reload());
        async function retryConnection() {
            const btn = document.getElementById('retryBtn');
            const toast = document.getElementById('errorToast');
            btn.classList.add('loading');
            btn.disabled = true;
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 3000);
                await fetch('/favicon.ico', { method: 'HEAD', cache: 'no-store', signal: controller.signal });
                clearTimeout(timeout);
                location.reload();
            } catch (err) {
                clearTimeout(timeout);
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 3000);
            } finally {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        }
    <\/script>
</body>
</html>`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(OFFLINE_HTML, {
          headers: { "Content-Type": "text/html" },
        });
      }),
    );
  }
});
