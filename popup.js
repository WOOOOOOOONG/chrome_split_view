document.addEventListener('DOMContentLoaded', () => {
  async function executeAction(action) {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      
      // 제한된 페이지 체크
      if (tab.url.startsWith('chrome://') || 
          tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('edge://') ||
          tab.url.startsWith('about:')) {
        alert('이 페이지에서는 분할 화면을 사용할 수 없습니다.');
        return;
      }
      
      // 메시지 전송 시도
      try {
        await chrome.tabs.sendMessage(tab.id, {action: action});
      } catch (error) {
        // content script 재주입
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content.css']
        });
        
        // 잠시 후 재시도
        setTimeout(async () => {
          await chrome.tabs.sendMessage(tab.id, {action: action});
        }, 200);
      }
      
      window.close();
    } catch (error) {
      console.error('Action failed:', error);
      alert('실행 중 오류가 발생했습니다.');
    }
  }
  
  document.getElementById('splitVertical').addEventListener('click', () => {
    executeAction('splitVertical');
  });
  
  document.getElementById('splitHorizontal').addEventListener('click', () => {
    executeAction('splitHorizontal');
  });
  
  document.getElementById('closeSplit').addEventListener('click', () => {
    executeAction('closeSplit');
  });
});