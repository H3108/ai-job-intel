// 检查 Boss API 返回的 job 字段结构
const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:9222/json', (res) => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const tabs = JSON.parse(Buffer.concat(chunks).toString());
    const page = tabs.find(t => t.type === 'page' && t.url && t.url.includes('zhipin.com/web/geek/jobs'));
    if (!page) return console.log('No page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.on('open', () => {
      ws.send(JSON.stringify({id:1, method:'Runtime.enable'}));
      setTimeout(() => {
        const expr = `(() => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/wapi/zpgeek/search/joblist.json', false);
          xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
          xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
          xhr.setRequestHeader('Referer', location.href);
          xhr.setRequestHeader('Origin', 'https://www.zhipin.com');
          const c = document.cookie.split(';').reduce((a, b) => { const [k, v] = b.trim().split('='); a[k] = v; return a; }, {});
          const token = c['bst'] || c['__zp_stoken__'] || '';
          xhr.setRequestHeader('zp_token', token);
          xhr.setRequestHeader('token', token);
          xhr.send('page=1&pageSize=1&city=101280600&query=%E5%89%8D%E7%AB%AF&scene=1');
          try {
            const d = JSON.parse(xhr.responseText);
            const job = (d.zpData.jobList || [])[0];
            return { ok: d.code === 0, jobKeys: job ? Object.keys(job) : [], sample: job };
          } catch(e) { return { ok: false, error: e.message }; }
        })()`;
        ws.send(JSON.stringify({id:2, method:'Runtime.evaluate', params:{expression:expr, returnByValue:true}}));
      }, 500);
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === 2) {
        const result = msg.result?.result?.value;
        console.log(JSON.stringify(result, null, 2));
        ws.close();
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(0), 5000);
  });
});
