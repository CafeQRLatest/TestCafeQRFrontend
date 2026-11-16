import Document, { Html, Head, Main, NextScript } from 'next/document';
import { ServerStyleSheet } from 'styled-components';

export default class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const sheet = new ServerStyleSheet();
    const originalRenderPage = ctx.renderPage;

    try {
      ctx.renderPage = () =>
        originalRenderPage({
          enhanceApp: (App) => (props) =>
            sheet.collectStyles(<App {...props} />),
        });

      const initialProps = await Document.getInitialProps(ctx);
      return {
        ...initialProps,
        styles: [
          initialProps.styles,
          sheet.getStyleElement(),
        ],
      };
    } finally {
      sheet.seal();
    }
  }

  render() {
    return (
      <Html lang="en">
        <Head>
          <meta name="application-name" content="CafeQR" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-title" content="CafeQR" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="theme-color" content="#f97316" />
          <link rel="icon" type="image/png" href="/icons/icon-192.png" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="apple-touch-icon" href="/icons/icon-192.png" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet" />
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  window.__CAFEQR_MOUNTED = false;
                  window.__CAFEQR_BOOT_ERROR = null;

                  window.onerror = function(msg, url, line, col, err) {
                    window.__CAFEQR_BOOT_ERROR = { msg: msg, url: url, line: line, col: col, error: err };
                    console.error("[CafeQR Boot Guard] Caught error:", msg, "at", url, line + ":" + col);
                    if (!window.__CAFEQR_MOUNTED) {
                      triggerDiagnosticUI();
                    }
                  };

                  if (window.addEventListener) {
                    window.addEventListener('unhandledrejection', function(e) {
                      var reason = e && (e.reason || e.message) ? (e.reason || e.message) : 'Unknown Promise Rejection';
                      console.warn("[CafeQR Boot Guard] Unhandled rejection:", reason);
                    });
                  }

                  function getChromeVersion() {
                    var ua = navigator.userAgent || '';
                    var match = ua.match(/Chrome\\/(\\d+)/);
                    return match ? parseInt(match[1], 10) : 0;
                  }

                  function triggerDiagnosticUI() {
                    if (window.__CAFEQR_MOUNTED) return;
                    var chromeVer = getChromeVersion();
                    var appContainer = document.getElementById('__next');
                    if (!appContainer) return;

                    var errorDetails = window.__CAFEQR_BOOT_ERROR 
                      ? (window.__CAFEQR_BOOT_ERROR.msg || 'Script evaluation error') + ' (' + (window.__CAFEQR_BOOT_ERROR.url || '').split('/').pop() + ':' + window.__CAFEQR_BOOT_ERROR.line + ')'
                      : (chromeVer && chromeVer < 65 ? 'Your device is running an older Android System WebView (Chrome ' + chromeVer + '). Updating improves speed and reliability.' : 'Application took longer than expected to initialize.');

                    appContainer.innerHTML = 
                      '<div style="min-height:100vh;height:100%;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#ffffff;font-family:sans-serif;padding:24px;box-sizing:border-box;">' +
                        '<div style="background:#1e293b;border:1px solid #334155;border-radius:16px;padding:28px 24px;max-width:440px;width:100%;text-align:center;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);">' +
                          '<div style="width:48px;height:48px;background:#f97316;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px auto;font-weight:900;font-size:22px;color:#fff;">!</div>' +
                          '<h2 style="margin:0 0 8px 0;font-size:18px;font-weight:700;color:#f8fafc;">Compatibility Notice</h2>' +
                          '<p style="margin:0 0 18px 0;font-size:13px;color:#94a3b8;line-height:1.5;">' + errorDetails + '</p>' +
                          '<div style="display:flex;flex-direction:column;gap:10px;">' +
                            '<a href="market://details?id=com.google.android.webview" style="display:block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px;border-radius:8px;">Update Android System WebView</a>' +
                            '<button onclick="location.reload()" style="background:#334155;color:#f8fafc;border:none;font-weight:600;font-size:14px;padding:12px;border-radius:8px;cursor:pointer;">Retry Loading</button>' +
                          '</div>' +
                        '</div>' +
                      '</div>';
                  }

                  setTimeout(function() {
                    if (!window.__CAFEQR_MOUNTED) {
                      triggerDiagnosticUI();
                    }
                  }, 8000);
                })();
              `,
            }}
          />
        </Head>
        <body className="antialiased">
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
