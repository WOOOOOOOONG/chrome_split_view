// 규칙 활성화
chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: ['remove_headers']
  });
});

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getTabs') {
    chrome.tabs.query({}, (tabs) => {
      const tabsInfo = tabs.map(tab => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl
      }));
      sendResponse(tabsInfo);
    });
    return true;
  }

  // 북마크 요청 처리
  if (message.action === 'getBookmarks') {
    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
      const bookmarks = extractBookmarks(bookmarkTreeNodes);
      sendResponse({ bookmarks });
    });
    return true; // 비동기 응답을 위해 true 반환
  }
  
  if (message.action === 'syncCookies') {
    syncCookiesForDomain(message.domain, message.targetUrl)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({success: false, error: error.message}));
    return true;
  }
  
  if (message.action === 'advancedSessionSync') {
    advancedSessionSync(message.domain, message.targetUrl, message.sessionCookies, message.allCookies)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({success: false, error: error.message}));
    return true;
  }
  
  if (message.action === 'getDomainCookies') {
    getDomainCookies(message.domain)
      .then(cookies => sendResponse(cookies))
      .catch(error => sendResponse([]));
    return true;
  }
});

// 북마크 트리에서 URL이 있는 북마크만 추출하는 함수
function extractBookmarks(bookmarkNodes, parentTitle = '') {
  let bookmarks = [];
  
  for (const node of bookmarkNodes) {
    if (node.url) {
      bookmarks.push({
        id: node.id,
        title: node.title || extractDomain(node.url),
        url: node.url,
        dateAdded: node.dateAdded,
        parentTitle: parentTitle
      });
    }
    
    if (node.children) {
      // 이 노드가 폴더인 경우, 자식들의 parentTitle로 이 폴더 이름 전달
      const newParentTitle = node.title || parentTitle;
      bookmarks = bookmarks.concat(extractBookmarks(node.children, newParentTitle));
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

// 기본 쿠키 동기화 (기존)
async function syncCookiesForDomain(domain, targetUrl) {
  try {
    // 현재 탭에서 해당 도메인의 모든 쿠키 가져오기
    const cookies = await chrome.cookies.getAll({domain: domain});
    const subdomainCookies = await chrome.cookies.getAll({domain: `.${domain}`});
    
    // 서브도메인 쿠키들도 포함
    const allCookies = [...cookies, ...subdomainCookies];
    
    console.log(`Found ${allCookies.length} cookies for ${domain}`);
    
    // Gmail과 Claude 등을 위한 특별 처리
    const specialDomains = {
      'gmail.com': ['accounts.google.com', 'google.com'],
      'claude.ai': ['anthropic.com'],
      'calendar.google.com': ['accounts.google.com', 'google.com'],
      'drive.google.com': ['accounts.google.com', 'google.com'],
      'notion.so': ['notion.com']
    };
    
    // 관련 도메인의 쿠키도 가져오기
    if (specialDomains[domain]) {
      for (const relatedDomain of specialDomains[domain]) {
        const relatedCookies = await chrome.cookies.getAll({domain: relatedDomain});
        const relatedSubCookies = await chrome.cookies.getAll({domain: `.${relatedDomain}`});
        allCookies.push(...relatedCookies, ...relatedSubCookies);
      }
    }
    
    // 쿠키 복제 시도
    let successCount = 0;
    const targetDomain = new URL(targetUrl).hostname;
    
    for (const cookie of allCookies) {
      try {
        // SameSite 설정 조정
        const cookieData = {
          url: targetUrl,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain.startsWith('.') ? cookie.domain : `.${targetDomain}`,
          path: cookie.path || '/',
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: 'no_restriction', // 가장 관대한 설정
        };
        
        if (cookie.expirationDate) {
          cookieData.expirationDate = cookie.expirationDate;
        }
        
        await chrome.cookies.set(cookieData);
        successCount++;
      } catch (e) {
        console.log(`Failed to set cookie ${cookie.name}:`, e);
      }
    }
    
    console.log(`Successfully synced ${successCount}/${allCookies.length} cookies`);
    return {success: true, syncedCount: successCount, totalCount: allCookies.length};
    
  } catch (error) {
    console.error('Cookie sync error:', error);
    return {success: false, error: error.message};
  }
}

// 고급 세션 동기화 (새로운 강화 버전)
async function advancedSessionSync(domain, targetUrl, sessionCookies, allCookies) {
  try {
    console.log(`Advanced session sync for ${domain}`);
    
    const targetDomain = new URL(targetUrl).hostname;
    let successCount = 0;
    
    // 1. 세션 쿠키 우선 동기화 (가장 중요한 인증 쿠키들)
    for (const cookie of sessionCookies) {
      try {
        const cookieData = {
          url: targetUrl,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain.startsWith('.') ? cookie.domain : `.${targetDomain}`,
          path: cookie.path || '/',
          secure: true, // 세션 쿠키는 강제로 secure 설정
          httpOnly: cookie.httpOnly,
          sameSite: 'none', // iframe에서 동작하도록 가장 관대한 설정
        };
        
        if (cookie.expirationDate) {
          cookieData.expirationDate = cookie.expirationDate;
        }
        
        await chrome.cookies.set(cookieData);
        successCount++;
        console.log(`Set session cookie: ${cookie.name}`);
        
      } catch (e) {
        console.log(`Failed to set session cookie ${cookie.name}:`, e);
        
        // 실패 시 더 관대한 설정으로 재시도
        try {
          const fallbackData = {
            url: targetUrl,
            name: cookie.name,
            value: cookie.value,
            domain: `.${targetDomain}`,
            path: '/',
            secure: false,
            httpOnly: false,
            sameSite: 'lax',
          };
          
          await chrome.cookies.set(fallbackData);
          successCount++;
          console.log(`Set session cookie (fallback): ${cookie.name}`);
        } catch (e2) {
          console.log(`Failed to set session cookie (fallback) ${cookie.name}:`, e2);
        }
      }
    }
    
    // 2. 일반 쿠키 동기화
    for (const cookie of allCookies) {
      // 세션 쿠키는 이미 처리했으므로 스킵
      if (sessionCookies.find(sc => sc.name === cookie.name && sc.domain === cookie.domain)) {
        continue;
      }
      
      try {
        const cookieData = {
          url: targetUrl,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain.startsWith('.') ? cookie.domain : `.${targetDomain}`,
          path: cookie.path || '/',
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: 'lax', // 일반 쿠키는 lax로 설정
        };
        
        if (cookie.expirationDate) {
          cookieData.expirationDate = cookie.expirationDate;
        }
        
        await chrome.cookies.set(cookieData);
        successCount++;
        
      } catch (e) {
        console.log(`Failed to set cookie ${cookie.name}:`, e);
      }
    }
    
    // 3. 특별한 도메인들을 위한 추가 처리
    await handleSpecialDomains(domain, targetUrl, targetDomain);
    
    console.log(`Advanced sync completed: ${successCount}/${allCookies.length} cookies`);
    return {success: true, syncedCount: successCount, totalCount: allCookies.length};
    
  } catch (error) {
    console.error('Advanced session sync error:', error);
    return {success: false, error: error.message};
  }
}

// 특별한 도메인들을 위한 추가 처리
async function handleSpecialDomains(domain, targetUrl, targetDomain) {
  try {
    // Notion 특별 처리
    if (domain.includes('notion')) {
      const notionCookies = await chrome.cookies.getAll({domain: 'notion.so'});
      const notionComCookies = await chrome.cookies.getAll({domain: 'notion.com'});
      
      for (const cookie of [...notionCookies, ...notionComCookies]) {
        if (cookie.name.includes('token') || cookie.name.includes('session') || cookie.name.includes('auth')) {
          try {
            await chrome.cookies.set({
              url: targetUrl,
              name: cookie.name,
              value: cookie.value,
              domain: `.${targetDomain}`,
              path: '/',
              secure: true,
              sameSite: 'none'
            });
          } catch (e) {
            console.log(`Failed to set special Notion cookie ${cookie.name}:`, e);
          }
        }
      }
    }
    
    // Flex 특별 처리
    if (domain.includes('flex.team')) {
      const flexCookies = await chrome.cookies.getAll({domain: 'flex.team'});
      
      for (const cookie of flexCookies) {
        if (cookie.name.includes('session') || cookie.name.includes('auth') || cookie.name.includes('user')) {
          try {
            await chrome.cookies.set({
              url: targetUrl,
              name: cookie.name,
              value: cookie.value,
              domain: `.${targetDomain}`,
              path: '/',
              secure: true,
              sameSite: 'none'
            });
          } catch (e) {
            console.log(`Failed to set special Flex cookie ${cookie.name}:`, e);
          }
        }
      }
    }
    
  } catch (error) {
    console.log('Special domain handling error:', error);
  }
}

// 도메인의 모든 쿠키 가져오기
async function getDomainCookies(domain) {
  try {
    const cookies = await chrome.cookies.getAll({domain: domain});
    console.log(`Retrieved ${cookies.length} cookies for domain: ${domain}`);
    return cookies;
  } catch (e) {
    console.log(`Failed to get cookies for ${domain}:`, e);
    return [];
  }
}

// 쿠키 정리 (선택적으로 사용)
async function cleanupExpiredCookies() {
  try {
    const allCookies = await chrome.cookies.getAll({});
    const now = Date.now() / 1000;
    
    for (const cookie of allCookies) {
      if (cookie.expirationDate && cookie.expirationDate < now) {
        try {
          await chrome.cookies.remove({
            url: `https://${cookie.domain}${cookie.path}`,
            name: cookie.name
          });
        } catch (e) {
          // 무시
        }
      }
    }
  } catch (error) {
    console.log('Cookie cleanup error:', error);
  }
}

// 주기적으로 만료된 쿠키 정리 (1시간마다)
setInterval(cleanupExpiredCookies, 60 * 60 * 1000);