// 兜底下载：当页面内 fetch 被 CORS / 403 拦截时，改由浏览器下载器直接取
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'dy-emoji-download') return;

  chrome.downloads
    .download({
      url: msg.url,
      filename: msg.filename || 'douyin-emoji/' + Date.now(),
      conflictAction: 'uniquify',
      saveAs: false,
    })
    .then((id) => sendResponse({ ok: true, id }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));

  return true; // 异步响应
});
