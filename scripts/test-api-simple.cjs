const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:9222/json', (res) => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const tabs = JSON.parse(Buffer.concat(chunks).toString());
    const page = tabs.find(t => t.type === 'page' && t.url && t.url.includes('zhipin.com/web/geek/jobs'));
    if (!page) { console.log('No page'); return; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.on('open', () => {
      ws.send(JSON.stringify({id:1, method:'Runtime.enable'}));
      setTimeout(() => {
        const script = `
          (() => {
            const cookies = document.cookie.split(';').reduce((a, b) => {
              const [k, v] = b.trim().split('='); a[k] = v; return a;
            }, {});
            const token = cookies['wt2'] || cookies['zp_at'] || '';
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/wapi/zpgeek/search/joblist.json', false);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.setRequestHeader('Referer', location.href);
            xhr.setRequestHeader('Origin', 'https://www.zhipin.com');
            xhr.setRequestHeader('zp_token', token);
            xhr.setRequestHeader('token', token);
            xhr.send('page=1&pageSize=15&city=101280600&query=%E5%89%8D%E7%AB%AF&scene=1');
            const d = JSON.parse(xhr.responseText);
            const job = (d.zpData && d.zpData.jobList && d.zpData.jobList[0]) || {};
            return { code: d.code, resCount: d.zpData ? d.zpData.resCount : 0, jobKeys: Object.keys(job), sample: job };
          })()
        `;
        ws.send(JSON.stringify({id:2, method:'Runtime.evaluate', params:{expression: script, returnByValue: true}}));
      }, 500);
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === 2) {
        console.log('Job structure:', JSON.stringify(msg.result && msg.result.result ? msg.result.result.value : msg.result, null, 2));
        ws.close();
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(0), 3000);
  });
});
