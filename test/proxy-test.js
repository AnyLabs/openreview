// 代理测试脚本
// 在浏览器控制台中运行此代码来测试代理配置

async function testProxy() {
  console.log('Testing proxy configuration...');

  try {
    // 测试代理路径
    const response = await fetch('/api/opencode/zen/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key'
      },
      body: JSON.stringify({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      })
    });

    console.log('Proxy response status:', response.status);
    console.log('Proxy response headers:', Object.fromEntries(response.headers.entries()));

    if (response.status === 401 || response.status === 403) {
      console.log('✅ Proxy is working! Received authentication error (expected)');
    } else if (response.status >= 400) {
      const errorText = await response.text();
      console.log('Proxy error response:', errorText);
    } else {
      console.log('✅ Proxy is working! Unexpected success response');
    }
  } catch (error) {
    console.error('❌ Proxy test failed:', error);
  }
}

// 运行测试
testProxy();