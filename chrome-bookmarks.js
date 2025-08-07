// 크롬 즐겨찾기를 사용하는 모듈

// 크롬 즐겨찾기 가져오기
async function getChromeFavorites() {
  return new Promise((resolve) => {
    if (!chrome.bookmarks) {
      console.error('Chrome bookmarks API is not available');
      resolve([]);
      return;
    }
    
    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
      const bookmarks = extractBookmarks(bookmarkTreeNodes);
      resolve(bookmarks);
    });
  });
}

// 북마크 트리에서 URL이 있는 북마크만 추출
function extractBookmarks(bookmarkNodes) {
  let bookmarks = [];
  
  for (const node of bookmarkNodes) {
    if (node.url) {
      bookmarks.push({
        id: node.id,
        title: node.title || extractDomain(node.url),
        url: node.url,
        dateAdded: node.dateAdded
      });
    }
    
    if (node.children) {
      bookmarks = bookmarks.concat(extractBookmarks(node.children));
    }
  }
  
  return bookmarks;
}

// URL에서 도메인 추출 (제목이 없는 경우)
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

// 메시지 핸들러에서 북마크 요청을 처리하는 함수
function setupBookmarkMessageHandler() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getBookmarks') {
      chrome.bookmarks.getTree((bookmarkTreeNodes) => {
        const bookmarks = extractBookmarks(bookmarkTreeNodes);
        sendResponse({ bookmarks });
      });
      return true; // 비동기 응답을 위해 true 반환
    }
  });
}

// content.js에서 북마크 요청
async function requestBookmarks() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getBookmarks' }, (response) => {
      if (response && response.bookmarks) {
        resolve(response.bookmarks);
      } else {
        resolve([]);
      }
    });
  });
}

// URL의 파비콘 가져오기
function getFavicon(url) {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23666"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/></svg>';
  }
}