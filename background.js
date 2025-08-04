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
  
  if (message.action === 'syncCookies') {
    syncCookiesForDomain(message.domain, message.targetUrl)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({success: false, error: error.message}));
    return true;
  }
});

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