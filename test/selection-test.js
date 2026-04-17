// 选择持久化测试脚本
// 在浏览器控制台中运行此代码来测试选择持久化功能

function testSelectionPersistence() {
  console.log('Testing selection persistence...');

  // 测试保存功能
  const testGroup = { id: 1, name: 'Test Group', full_path: 'test-group' };
  const testProject = { id: 1, name: 'Test Project', path_with_namespace: 'test-group/test-project' };
  const testMR = { id: 1, iid: 1, title: 'Test MR', source_branch: 'feature', target_branch: 'main' };

  // 模拟保存
  localStorage.setItem('selected-group', JSON.stringify(testGroup));
  localStorage.setItem('selected-project', JSON.stringify(testProject));
  localStorage.setItem('selected-mr', JSON.stringify(testMR));

  console.log('✅ Test data saved to localStorage');

  // 测试加载功能
  const loadedGroup = localStorage.getItem('selected-group');
  const loadedProject = localStorage.getItem('selected-project');
  const loadedMR = localStorage.getItem('selected-mr');

  if (loadedGroup && loadedProject && loadedMR) {
    console.log('✅ Data loaded successfully from localStorage');
    console.log('Group:', JSON.parse(loadedGroup));
    console.log('Project:', JSON.parse(loadedProject));
    console.log('MR:', JSON.parse(loadedMR));
  } else {
    console.log('❌ Failed to load data from localStorage');
  }

  // 测试清除功能
  localStorage.removeItem('selected-group');
  localStorage.removeItem('selected-project');
  localStorage.removeItem('selected-mr');

  console.log('✅ Test data cleared from localStorage');
}

// 运行测试
testSelectionPersistence();