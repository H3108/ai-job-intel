with open('backend/src/crawler.js', 'r') as f:
    content = f.read()

# Add harvest entry log
content = content.replace(
    'async function harvestCDP(cdp, keyword = \'\', navUrl = \'\', searchRoleName = selectedRole.name, searchCityName = selectedCity.name) {\n  const st = await cdp.evaluate(`(() => ({ url: location.href }))`())',
    'async function harvestCDP(cdp, keyword = \'\', navUrl = \'\', searchRoleName = selectedRole.name, searchCityName = selectedCity.name) {\n  console.log(\'[crawler][harvest] 入口：\' + (keyword || \'(no keyword)\'))\n  const st = await cdp.evaluate(`(() => ({ url: location.href }))`())'
)

content = content.replace(
    '  if (/_security_check|zhipin\\.com\\/web\\/geek\\/login/.test(st.url)) {\n    console.warn(\'[crawler] 当前页是登录墙/安全校验，跳过。\')\n    return\n  }',
    '  if (/_security_check|zhipin\\.com\\/web\\/geek\\/login/.test(st.url)) {\n    console.warn(\'[crawler] 当前页是登录墙/安全校验，跳过。\')\n    console.log(\'[crawler][harvest] 出口：登录墙\')\n    return\n  }'
)

# Add 0 cards exit log
content = content.replace(
    "  if (res.count === 0) {\n    const snippet = await cdp.evaluate(`(() => document.body ? document.body.innerHTML.slice(0, 1500) : '')()`)\n    console.warn('[crawler] 0 卡片，页面片段（用于校准选择器）：\\n' + snippet)\n    return\n  }",
    "  if (res.count === 0) {\n    const snippet = await cdp.evaluate(`(() => document.body ? document.body.innerHTML.slice(0, 1500) : '')()`)\n    console.warn('[crawler] 0 卡片，页面片段（用于校准选择器）：\\n' + snippet)\n    console.log('[crawler][harvest] 出口：0 卡片')\n    return\n  }"
)

with open('backend/src/crawler.js', 'w') as f:
    f.write(content)
print('patched')
