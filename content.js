class SplitScreenManager {
  constructor() {
    this.isActive = false;
    this.splitContainer = null;
    this.resizer = null;
    this.leftPanel = null;
    this.rightPanel = null;
    this.rightFrame = null;
    this.history = this.loadHistory();
    this.currentTabs = [];
    this.sessionSyncInProgress = false;
  }

  async init() {
    if (this.isActive) return;
    
    try {
      this.currentTabs = await this.getCurrentTabs();
    } catch (error) {
      this.currentTabs = [];
    }
  }

  async getCurrentTabs() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({action: 'getTabs'}, (response) => {
          resolve(response || []);
        });
      } else {
        resolve([]);
      }
    });
  }

  createSplitScreen(direction) {
    if (this.isActive) {
      this.closeSplitScreen();
      return;
    }

    this.isActive = true;
    this.direction = direction;

    this.updateTabIcon(true);

    this.splitContainer = document.createElement('div');
    this.splitContainer.id = 'split-screen-container';
    this.splitContainer.className = `split-${direction}`;

    this.leftPanel = document.createElement('div');
    this.leftPanel.className = 'split-panel left-panel';
    this.leftPanel.style.flex = '1';

    const leftContent = document.createElement('div');
    leftContent.className = 'left-content';
    leftContent.style.cssText = `
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: white;
      position: relative;
    `;
    
    const leftControls = document.createElement('div');
    leftControls.className = 'left-panel-controls';
    leftControls.innerHTML = `
      <div class="panel-control-bar">
        <button id="refreshLeft" class="panel-control-btn" title="새로고침">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
          </svg>
        </button>
        <span class="panel-label">현재 페이지</span>
      </div>
    `;
    
    const pagePreview = document.createElement('iframe');
    pagePreview.src = window.location.href;
    pagePreview.className = 'left-preview';
    pagePreview.id = 'leftPreviewFrame';
    pagePreview.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      pointer-events: auto;
      background: white;
      transition: opacity 0.2s ease;
    `;
    
    pagePreview.loading = 'lazy';
    pagePreview.referrerPolicy = 'same-origin';
    
    leftContent.appendChild(pagePreview);
    leftContent.appendChild(leftControls);
    this.leftPanel.appendChild(leftContent);

    this.setupLeftPanelControls();

    this.resizer = document.createElement('div');
    this.resizer.className = `resizer resizer-${direction}`;
    this.setupResizer();

    this.rightPanel = document.createElement('div');
    this.rightPanel.className = 'split-panel right-panel';
    this.rightPanel.style.flex = '1';
    
    this.createInitialUI();

    this.splitContainer.appendChild(this.leftPanel);
    this.splitContainer.appendChild(this.resizer);
    this.splitContainer.appendChild(this.rightPanel);

    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    
    const originalElements = Array.from(document.body.children);
    originalElements.forEach(el => {
      if (el.id !== 'split-screen-container') {
        el.style.visibility = 'hidden';
        el.style.position = 'absolute';
      }
    });
    
    document.body.appendChild(this.splitContainer);

    document.addEventListener('keydown', this.handleKeydown.bind(this));
  }

  setupLeftPanelControls() {
    const refreshBtn = document.getElementById('refreshLeft');
    const leftFrame = document.getElementById('leftPreviewFrame');
    
    if (refreshBtn && leftFrame) {
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        leftFrame.src = leftFrame.src;
      });
    }
  }

  createInitialUI() {
    const initialUI = document.createElement('div');
    initialUI.className = 'split-initial-ui';
    initialUI.innerHTML = `
      <div class="split-title">Split View</div>
      <div class="initial-content">
        <div class="url-input-section">
          <div class="input-wrapper">
            <input type="text" id="urlInput" placeholder="웹 주소를 입력하거나 검색하세요" />
            <button id="goBtn">이동</button>
          </div>
        </div>
        
        <div class="tabs-section" style="display: ${this.currentTabs.length > 0 ? 'block' : 'none'}">
          <h3>현재 열린 탭에서 선택</h3>
          <div class="tabs-list" id="tabsList"></div>
        </div>
        
        <div class="bookmarks-section">
          <h3>즐겨찾기에서 선택</h3>
          <div class="bookmarks-list" id="bookmarksList">
            <div class="loading-bookmarks">
              <div class="spinner small"></div>
              <span>즐겨찾기 불러오는 중...</span>
            </div>
          </div>
        </div>
        
        <div class="history-section" style="display: ${this.history.length > 0 ? 'block' : 'none'}">
          <h3>최근 방문</h3>
          <div class="history-list" id="historyList"></div>
        </div>
      </div>
    `;

    this.rightPanel.appendChild(initialUI);
    
    requestAnimationFrame(() => {
      this.setupInitialUIEvents();
      this.populateTabsList();
      this.loadChromeBookmarks(); // 크롬 즐겨찾기 로드
      this.populateHistory();
    });
  }

  // 크롬 즐겨찾기 로드 및 표시 메서드 추가
  async loadChromeBookmarks() {
    const bookmarksList = document.getElementById('bookmarksList');
    if (!bookmarksList) return;
    
    try {
      // 백그라운드 스크립트에 북마크 요청
      let bookmarks = [];
      
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        try {
          bookmarks = await new Promise((resolve) => {
            chrome.runtime.sendMessage({action: 'getBookmarks'}, (response) => {
              if (response && response.bookmarks) {
                resolve(response.bookmarks);
              } else {
                resolve([]);
              }
            });
          });
        } catch (e) {
          console.error('Failed to get bookmarks:', e);
          // 접근 권한이 없는 경우 대체 메시지 표시
          bookmarksList.innerHTML = `
            <div class="bookmarks-error">
              <p>즐겨찾기를 불러올 수 없습니다. 확장 프로그램의 북마크 접근 권한을 확인해주세요.</p>
            </div>
          `;
          return;
        }
      }
      
      // 북마크가 없는 경우
      if (!bookmarks || bookmarks.length === 0) {
        bookmarksList.innerHTML = `
          <div class="empty-bookmarks">
            <p>즐겨찾기가 없습니다. 크롬 즐겨찾기에 사이트를 추가해보세요.</p>
          </div>
        `;
        return;
      }
      
      // 북마크 표시 (최대 10개)
      bookmarksList.innerHTML = '';
      const limitedBookmarks = bookmarks.slice(0, 10);
      
      limitedBookmarks.forEach(bookmark => {
        const bookmarkItem = document.createElement('div');
        bookmarkItem.className = 'bookmark-item';
        
        const favicon = this.getDefaultIcon(bookmark.url);
        
        bookmarkItem.innerHTML = `
          <img src="${favicon}" width="16" height="16" onerror="this.style.display='none'">
          <div class="bookmark-item-content">
            <span class="bookmark-title">${bookmark.title || this.getDomainFromUrl(bookmark.url)}</span>
            <span class="bookmark-url">${bookmark.url}</span>
          </div>
        `;
        
        bookmarkItem.addEventListener('click', () => {
          this.loadUrl(bookmark.url);
        });
        
        bookmarksList.appendChild(bookmarkItem);
      });
      
      // 더 많은 북마크가 있는 경우 "더 보기" 버튼 추가
      if (bookmarks.length > 10) {
        const moreBtn = document.createElement('button');
        moreBtn.className = 'more-bookmarks-btn';
        moreBtn.textContent = `더 보기 (${bookmarks.length - 10}개 더)`;
        moreBtn.addEventListener('click', () => {
          this.showAllBookmarks(bookmarks);
        });
        bookmarksList.appendChild(moreBtn);
      }
      
    } catch (error) {
      console.error('Error loading bookmarks:', error);
      bookmarksList.innerHTML = `
        <div class="bookmarks-error">
          <p>즐겨찾기를 불러오는 중 오류가 발생했습니다.</p>
        </div>
      `;
    }
  }

  // 모든 북마크를 보여주는 모달 창
showAllBookmarks(bookmarks) {
    const modal = document.createElement('div');
    modal.className = 'bookmarks-modal';
    
    // 북마크를 폴더별로 그룹화
    const bookmarksByFolder = {};
    bookmarks.forEach(bookmark => {
      const folder = bookmark.parentTitle || 'Other';
      if (!bookmarksByFolder[folder]) {
        bookmarksByFolder[folder] = [];
      }
      bookmarksByFolder[folder].push(bookmark);
    });
    
    let modalContent = `
      <div class="bookmarks-modal-content">
        <div class="bookmarks-modal-header">
          <h3>모든 즐겨찾기</h3>
          <button class="close-modal-btn">&times;</button>
        </div>
        <div class="bookmarks-modal-body">
          <input type="text" class="bookmark-search" placeholder="즐겨찾기 검색..." />
          <div class="all-bookmarks-list">
    `;
    
    Object.keys(bookmarksByFolder).sort().forEach(folder => {
      const folderBookmarks = bookmarksByFolder[folder];
      
      modalContent += `
        <div class="bookmark-folder">
          <div class="folder-header">${folder} (${folderBookmarks.length})</div>
          <div class="folder-items">
      `;
      
      folderBookmarks.forEach(bookmark => {
        const favicon = this.getDefaultIcon(bookmark.url);
        
        modalContent += `
          <div class="bookmark-item" data-url="${bookmark.url}">
            <img src="${favicon}" width="16" height="16" onerror="this.style.display='none'">
            <div class="bookmark-item-content">
              <span class="bookmark-title">${bookmark.title || this.getDomainFromUrl(bookmark.url)}</span>
              <span class="bookmark-url">${bookmark.url}</span>
            </div>
          </div>
        `;
      });
      
      modalContent += `
          </div>
        </div>
      `;
    });
    
    modalContent += `
          </div>
        </div>
      </div>
    `;
    
    modal.innerHTML = modalContent;
    document.body.appendChild(modal);
    
    // 이벤트 설정
    modal.querySelector('.close-modal-btn').addEventListener('click', () => {
      modal.remove();
    });
    
    // 모달 외부 클릭 시 닫기
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
    // 검색 기능
    const searchInput = modal.querySelector('.bookmark-search');
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      
      modal.querySelectorAll('.bookmark-item').forEach(item => {
        const title = item.querySelector('.bookmark-title').textContent.toLowerCase();
        const url = item.querySelector('.bookmark-url').textContent.toLowerCase();
        
        if (title.includes(searchTerm) || url.includes(searchTerm)) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
      
      // 폴더 헤더 표시/숨김 처리
      modal.querySelectorAll('.bookmark-folder').forEach(folder => {
        const visibleItems = folder.querySelectorAll('.bookmark-item[style=""]').length;
        const folderHeader = folder.querySelector('.folder-header');
        
        if (visibleItems === 0) {
          folder.style.display = 'none';
        } else {
          folder.style.display = '';
          // 표시되는 항목 수 업데이트
          const folderName = folderHeader.textContent.split('(')[0].trim();
          folderHeader.textContent = `${folderName} (${visibleItems})`;
        }
      });
    });
    
    // 북마크 클릭 이벤트
    modal.querySelectorAll('.bookmark-item[data-url]').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        this.loadUrl(url);
        modal.remove();
      });
    });
    
    // 포커스 설정
    setTimeout(() => {
      searchInput.focus();
    }, 100);
  }

  populateTabsList() {
    const tabsList = document.getElementById('tabsList');
    if (!tabsList || this.currentTabs.length === 0) return;

    this.currentTabs.forEach(tab => {
      if (tab.url === window.location.href) return;

      const tabItem = document.createElement('div');
      tabItem.className = 'tab-item';
      tabItem.innerHTML = `
        <img src="${tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23f0f0f0"/></svg>'}" 
             width="16" height="16" onerror="this.style.display='none'">
        <span class="tab-title">${tab.title}</span>
        <span class="tab-url">${tab.url}</span>
      `;
      tabItem.addEventListener('click', () => this.loadUrl(tab.url));
      tabsList.appendChild(tabItem);
    });
  }

  populateHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList || this.history.length === 0) return;

    this.history.slice(0, 5).forEach(item => {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      
      const favicon = this.getDefaultIcon(item.url);
      
      historyItem.innerHTML = `
        <img src="${favicon}" width="16" height="16" onerror="this.style.display='none'">
        <div class="history-item-content">
          <span class="history-title">${item.title || this.getDomainFromUrl(item.url)}</span>
          <span class="history-url">${item.url}</span>
        </div>
      `;
      historyItem.addEventListener('click', () => this.loadUrl(item.url));
      historyList.appendChild(historyItem);
    });
  }

  getDomainFromUrl(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  setupInitialUIEvents() {
    setTimeout(() => {
      const urlInput = document.getElementById('urlInput');
      const goBtn = document.getElementById('goBtn');
      
      if (!urlInput || !goBtn) {
        console.error('UI elements not found');
        return;
      }
      
      const handleGo = () => {
        const url = urlInput.value.trim();
        if (url) {
          this.loadUrl(url);
        }
      };

      goBtn.addEventListener('click', handleGo);
      urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          handleGo();
        }
      });

      document.querySelectorAll('.quick-link').forEach(link => {
        link.addEventListener('click', () => {
          this.loadUrl(link.dataset.url);
        });
      });

      urlInput.focus();
    }, 50);
  }

  async loadUrl(url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.') && !url.includes(' ')) {
        url = 'https://' + url;
      } else {
        url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
      }
    }

    this.addToHistory(url);
    this.showLoading();

    const targetDomain = new URL(url).hostname;
    const needsSessionSync = this.checkIfNeedsSessionSync(targetDomain);

    if (needsSessionSync) {
      console.log(`Pre-syncing session for ${targetDomain}`);
      await this.preSessionSync(targetDomain, url);
    }

    const relevantTabs = this.currentTabs.filter(tab => {
      try {
        const tabUrl = new URL(tab.url);
        return tabUrl.protocol === 'https:' || tabUrl.protocol === 'http:';
      } catch {
        return false;
      }
    }).slice(0, 8);

    await new Promise(resolve => {
      requestAnimationFrame(() => {
        this.rightPanel.innerHTML = `
          <div class="address-bar">
            <div class="nav-section">
              <button class="nav-btn" id="backBtn" title="뒤로" disabled>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                </svg>
              </button>
              <button class="nav-btn" id="forwardBtn" title="앞으로" disabled>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                </svg>
              </button>
              <button class="nav-btn" id="refreshBtn" title="새로고침">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
              </button>
            </div>
            
            <div class="address-input-section">
              <input type="text" id="addressInput" value="${url}" placeholder="주소를 입력하거나 검색..." />
              <button class="go-btn" id="goBtn2">GO</button>
            </div>
            
            ${relevantTabs.length > 0 ? `
              <div class="tabs-section" id="tabsSection">
                ${relevantTabs.map(tab => `
                  <div class="tab-icon" data-url="${tab.url}" title="${tab.title}">
                    <img src="${tab.favIconUrl || this.getDefaultIcon(tab.url)}" 
                        onerror="this.src='${this.getDefaultIcon(tab.url)}'" />
                    <div class="tab-tooltip">${this.truncateTitle(tab.title)}</div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
            
            <div class="action-section">
              <button class="action-btn" id="newTabBtn" title="새 탭에서 열기">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="iframe-container" id="iframeContainer">
            <div class="loading-indicator" id="loadingIndicator">
              <div class="spinner"></div>
              <div class="loading-text">페이지를 불러오는 중...</div>
            </div>
          </div>
        `;
        resolve();
      });
    });

    setTimeout(() => {
      this.createAndLoadIframe(url);
      this.setupEnhancedEvents();
    }, 100);
  }

  checkIfNeedsSessionSync(domain) {
    // 대부분의 웹사이트는 세션 동기화가 필요함
    // 단순한 정적 사이트나 검색 엔진만 제외
    const staticSites = [
      'google.com', 'bing.com', 'duckduckgo.com',
      'wikipedia.org', 'github.io', 'blogspot.com',
      'wordpress.com', 'medium.com'
    ];
    
    // 로그인이 필요 없는 사이트가 아니라면 대부분 세션 동기화 필요
    const isStaticSite = staticSites.some(site => domain.includes(site));
    return !isStaticSite;
  }

  async preSessionSync(domain, targetUrl) {
    if (this.sessionSyncInProgress) return;
    
    this.sessionSyncInProgress = true;
    
    try {
      console.log(`Universal session sync for ${domain}`);
      
      // 1. 현재 페이지와 관련된 모든 도메인의 쿠키 수집
      const allDomains = this.getRelatedDomains(domain);
      const allCookies = [];
      
      for (const d of allDomains) {
        try {
          const cookies = await chrome.runtime.sendMessage({
            action: 'getDomainCookies',
            domain: d
          });
          if (cookies && cookies.length > 0) {
            allCookies.push(...cookies);
          }
        } catch (e) {
          console.log(`Failed to get cookies for ${d}:`, e);
        }
      }
      
      // 2. 중요한 쿠키들 필터링 (더 포괄적으로)
      const importantCookies = allCookies.filter(cookie => {
        const name = cookie.name.toLowerCase();
        const value = cookie.value.toLowerCase();
        
        // 세션/인증 관련 쿠키 패턴들
        const sessionPatterns = [
          'session', 'auth', 'token', 'login', 'user', 'sid', 'sso',
          'csrf', 'xsrf', 'jwt', 'bearer', 'oauth', 'identity',
          'remember', 'persistent', 'connect', 'secure', 'refresh',
          '_ga', '_gid', '_gat', // Google Analytics
          'PHPSESSID', 'JSESSIONID', 'ASP.NET_SessionId', // 서버 세션
          '__cf_bm', '__cflb', // Cloudflare
          '_fbp', '_fbc', // Facebook
          'AWSALB', 'AWSALBCORS' // AWS Load Balancer
        ];
        
        // 쿠키 이름이나 값에 세션 관련 패턴이 있는지 확인
        const hasSessionPattern = sessionPatterns.some(pattern => 
          name.includes(pattern) || value.includes(pattern)
        );
        
        // httpOnly나 secure 플래그가 있는 쿠키들도 중요
        const isSecureCookie = cookie.httpOnly || cookie.secure;
        
        // 만료 시간이 없거나 가까운 쿠키들 (세션 쿠키)
        const isSessionCookie = !cookie.expirationDate || 
          (cookie.expirationDate && (cookie.expirationDate * 1000 - Date.now()) < 86400000); // 24시간 이내
        
        return hasSessionPattern || isSecureCookie || isSessionCookie;
      });
      
      console.log(`Found ${importantCookies.length} important cookies out of ${allCookies.length} total`);
      
      // 3. 범용 세션 동기화 실행
      const result = await chrome.runtime.sendMessage({
        action: 'advancedSessionSync',
        domain: domain.replace('www.', ''),
        targetUrl: targetUrl,
        sessionCookies: importantCookies,
        allCookies: allCookies
      });
      
      console.log('Universal session sync result:', result);
      
      // 4. 쿠키 전파를 위한 대기 시간
      await new Promise(resolve => setTimeout(resolve, 800));
      
    } catch (e) {
      console.error('Universal session sync failed:', e);
    } finally {
      this.sessionSyncInProgress = false;
    }
  }

  // 관련 도메인들을 찾는 함수
  getRelatedDomains(domain) {
    const domains = new Set();
    
    // 기본 도메인 변형들
    domains.add(domain);
    domains.add(`.${domain}`);
    domains.add(domain.replace('www.', ''));
    domains.add(`.${domain.replace('www.', '')}`);
    
    // 현재 페이지의 도메인도 포함
    const currentDomain = window.location.hostname;
    domains.add(currentDomain);
    domains.add(`.${currentDomain}`);
    domains.add(currentDomain.replace('www.', ''));
    domains.add(`.${currentDomain.replace('www.', '')}`);
    
    // 서브도메인 패턴 추가
    const domainParts = domain.split('.');
    if (domainParts.length >= 2) {
      const rootDomain = domainParts.slice(-2).join('.');
      domains.add(rootDomain);
      domains.add(`.${rootDomain}`);
      
      // 일반적인 서브도메인들
      const commonSubdomains = ['www', 'api', 'auth', 'login', 'accounts', 'sso', 'id'];
      commonSubdomains.forEach(sub => {
        domains.add(`${sub}.${rootDomain}`);
        domains.add(`.${sub}.${rootDomain}`);
      });
    }
    
    return Array.from(domains);
  }

  createAndLoadIframe(url) {
    const container = document.getElementById('iframeContainer');
    if (!container) return;

    const existingFrame = document.getElementById('splitFrame');
    if (existingFrame) {
      existingFrame.remove();
    }

    if (url.includes('gmail.com') || url.includes('mail.google.com')) {
      this.handleGmailSpecial(url, container);
      return;
    }

    this.createNormalIframe(url, container);
  }

  handleGmailSpecial(url, container) {
    console.log('Gmail special handling');
    
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
    
    const gmailOptions = [
      {
        name: '기본 Gmail',
        url: url,
        description: '표준 Gmail 인터페이스'
      },
      {
        name: 'Gmail 기본 HTML',
        url: 'https://mail.google.com/mail/u/0/h/',
        description: '가벼운 HTML 버전'
      },
      {
        name: 'Gmail 모바일',
        url: 'https://mail.google.com/mail/mu/',
        description: '모바일 최적화 버전'
      },
      {
        name: 'Google 계정 우회',
        url: 'https://accounts.google.com/AccountChooser?continue=https://mail.google.com/mail/',
        description: '계정 선택 후 Gmail 접속'
      }
    ];
    
    const gmailAlt = document.createElement('div');
    gmailAlt.className = 'gmail-alternative';
    gmailAlt.innerHTML = `
      <div class="alternative-content">
        <div class="gmail-icon">📧</div>
        <h3>Gmail 접속 옵션</h3>
        <p>Gmail은 보안 정책으로 인해 일반적인 방법으로는 로드되지 않습니다.<br>
        아래 옵션들을 시도해보세요:</p>
        
        <div class="gmail-options">
          ${gmailOptions.map((option, index) => `
            <button class="gmail-option-btn" data-url="${option.url}" data-index="${index}">
              <div class="option-name">${option.name}</div>
              <div class="option-desc">${option.description}</div>
            </button>
          `).join('')}
        </div>
        
        <div class="alternative-actions">
          <button id="openGmailNewTab" class="primary-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            새 탭에서 Gmail 열기
          </button>
        </div>
        
        <div class="tip">
          💡 팁: Gmail 탭이 이미 열려 있다면 상단의 탭 아이콘을 클릭해보세요.
        </div>
      </div>
    `;
    
    container.appendChild(gmailAlt);
    
    document.querySelectorAll('.gmail-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const optionUrl = btn.dataset.url;
        const index = parseInt(btn.dataset.index);
        
        gmailAlt.innerHTML = `
          <div class="alternative-content">
            <div class="spinner large"></div>
            <div class="loading-text">${gmailOptions[index].name} 로딩 중...</div>
          </div>
        `;
        
        this.tryGmailIframe(optionUrl, container, gmailOptions[index].name);
      });
    });
    
    document.getElementById('openGmailNewTab').addEventListener('click', () => {
      window.open(url, '_blank');
    });
  }

  tryGmailIframe(url, container, optionName) {
    this.rightFrame = document.createElement('iframe');
    this.rightFrame.id = 'splitFrame';
    this.rightFrame.className = 'split-frame';
    this.rightFrame.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: white;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    this.rightFrame.referrerPolicy = 'strict-origin-when-cross-origin';
    this.rightFrame.loading = 'lazy';
    
    let loadSuccess = false;
    let loadTimeout;

    this.rightFrame.addEventListener('load', () => {
      loadSuccess = true;
      if (loadTimeout) clearTimeout(loadTimeout);
      
      setTimeout(() => {
        try {
          const doc = this.rightFrame.contentDocument;
          if (doc && doc.body && doc.body.innerHTML.length > 100) {
            this.rightFrame.style.opacity = '1';
            const existing = container.querySelector('.gmail-alternative');
            if (existing) existing.remove();
          } else {
            throw new Error('Empty or blocked content');
          }
        } catch (e) {
          this.showGmailFallback(url, container, optionName);
        }
      }, 1000);
    });

    loadTimeout = setTimeout(() => {
      if (!loadSuccess) {
        this.showGmailFallback(url, container, optionName);
      }
    }, 5000);

    container.appendChild(this.rightFrame);
    
    requestAnimationFrame(() => {
      this.rightFrame.src = url;
    });
  }

  showGmailFallback(originalUrl, container, attemptedMethod) {
    if (this.rightFrame) {
      this.rightFrame.remove();
    }
    
    const fallback = document.createElement('div');
    fallback.className = 'gmail-fallback';
    fallback.innerHTML = `
      <div class="fallback-content">
        <div class="fallback-icon">🔒</div>
        <h3>${attemptedMethod} 접속 실패</h3>
        <p>Gmail의 보안 정책으로 인해 분할 화면에서 로드할 수 없습니다.</p>
        
        <div class="fallback-suggestions">
          <div class="suggestion">
            <strong>권장 방법:</strong>
            <ol>
              <li>새 탭에서 Gmail을 먼저 열고 로그인</li>
              <li>상단 탭 아이콘에서 Gmail 탭 클릭</li>
              <li>또는 Chrome의 "멀티 로그인" 기능 사용</li>
            </ol>
          </div>
        </div>
        
        <div class="fallback-actions">
          <button id="openGmailNewTab2" class="primary-btn">새 탭에서 Gmail 열기</button>
          <button id="tryAnother" class="secondary-btn">다른 방법 시도</button>
        </div>
      </div>
    `;
    
    container.appendChild(fallback);
    
    document.getElementById('openGmailNewTab2').addEventListener('click', () => {
      window.open(originalUrl, '_blank');
    });
    
    document.getElementById('tryAnother').addEventListener('click', () => {
      fallback.remove();
      this.handleGmailSpecial(originalUrl, container);
    });
  }

  createNormalIframe(url, container) {
    this.rightFrame = document.createElement('iframe');
    this.rightFrame.id = 'splitFrame';
    this.rightFrame.className = 'split-frame';
    this.rightFrame.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: white;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    // 범용적인 iframe 설정
    this.rightFrame.loading = 'eager';
    this.rightFrame.referrerPolicy = 'same-origin'; // 더 안전한 설정
    
    const targetDomain = new URL(url).hostname;
    const needsSessionSync = this.checkIfNeedsSessionSync(targetDomain);
    
    // sandbox 설정은 최소한으로 (호환성 향상)
    if (needsSessionSync) {
      console.log(`Setting up universal session sync for ${targetDomain}`);
      
      // 현재 도메인과 같은 경우에만 sandbox 제한
      const currentDomain = window.location.hostname;
      const isSameDomain = targetDomain === currentDomain || 
                          targetDomain.endsWith(`.${currentDomain}`) ||
                          currentDomain.endsWith(`.${targetDomain}`);
      
      if (isSameDomain) {
        this.rightFrame.sandbox = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-same-origin';
      }
    }

    let loadTimeout;
    let hasLoaded = false;
    let retryCount = 0;
    const maxRetries = 1; // 재시도 1회로 제한

    const handleLoad = async () => {
      hasLoaded = true;
      if (loadTimeout) clearTimeout(loadTimeout);
      
      // 세션 검증을 더 관대하게
      if (needsSessionSync && retryCount === 0) {
        console.log(`Checking session for ${targetDomain}`);
        
        try {
          // 간단한 세션 검증만 수행
          const sessionValid = await this.quickSessionCheck(this.rightFrame, url);
          
          if (!sessionValid && retryCount < maxRetries) {
            console.log('Session might be invalid, trying to refresh cookies...');
            retryCount++;
            
            // 추가 쿠키 동기화 후 재시도
            setTimeout(async () => {
              await this.forceSessionSync(targetDomain, url);
              this.rightFrame.src = url + (url.includes('?') ? '&' : '?') + `t=${Date.now()}`;
            }, 1000);
            return;
          }
        } catch (e) {
          console.log('Session check failed, proceeding anyway:', e);
        }
      }
      
      this.hideLoadingIndicator();
    };

    this.rightFrame.addEventListener('load', handleLoad);

    this.rightFrame.addEventListener('error', () => {
      console.log('iframe error for:', url);
      if (!hasLoaded) {
        this.handleIframeLoadError(url);
      }
    });

    // 더 관대한 타임아웃
    const timeoutDuration = 12000; // 12초로 통일
    loadTimeout = setTimeout(() => {
      if (!hasLoaded) {
        console.log('iframe load timeout for:', url);
        this.handleIframeLoadError(url);
      }
    }, timeoutDuration);

    container.appendChild(this.rightFrame);
    
    // 즉시 로드 (지연 최소화)
    setTimeout(() => {
      this.rightFrame.src = url;
    }, 100);
  }

  // 빠른 세션 체크 (더 관대함)
  async quickSessionCheck(iframe, originalUrl) {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1초만 대기
      
      const currentSrc = iframe.src || '';
      
      // 명확한 로그인 페이지 패턴만 체크
      const loginIndicators = [
        '/login',
        '/signin',
        '/authenticate',
        'login.',
        'auth.',
        'accounts.',
        '/oauth/authorize',
        '/sso/'
      ];
      
      const hasLoginIndicator = loginIndicators.some(indicator => 
        currentSrc.toLowerCase().includes(indicator)
      );
      
      if (hasLoginIndicator) {
        console.log('Detected login page');
        return false;
      }
      
      return true; // 기본적으로 통과
      
    } catch (e) {
      console.log('Quick session check error:', e);
      return true; // 에러 시 통과
    }
  }

  // 강제 세션 동기화
  async forceSessionSync(domain, targetUrl) {
    try {
      console.log(`Force syncing session for ${domain}`);
      
      // 모든 관련 도메인의 쿠키를 가져와서 동기화
      const allDomains = this.getRelatedDomains(domain);
      const allCookies = [];
      
      for (const d of allDomains) {
        try {
          const cookies = await chrome.runtime.sendMessage({
            action: 'getDomainCookies',
            domain: d
          });
          if (cookies && cookies.length > 0) {
            allCookies.push(...cookies);
          }
        } catch (e) {
          // 무시
        }
      }
      
      // 모든 쿠키를 세션 쿠키로 취급하여 동기화
      const result = await chrome.runtime.sendMessage({
        action: 'advancedSessionSync',
        domain: domain.replace('www.', ''),
        targetUrl: targetUrl,
        sessionCookies: allCookies, // 모든 쿠키를 세션 쿠키로
        allCookies: allCookies
      });
      
      console.log('Force session sync result:', result);
      return result;
      
    } catch (e) {
      console.log('Force session sync failed:', e);
      return { success: false };
    }
  }

  async advancedSessionSync(domain, targetUrl) {
    try {
      // 범용적인 쿠키 수집
      const allDomains = this.getRelatedDomains(domain);
      const allCookies = [];
      
      for (const d of allDomains) {
        try {
          const cookies = await chrome.runtime.sendMessage({
            action: 'getDomainCookies',
            domain: d
          });
          if (cookies && cookies.length > 0) {
            allCookies.push(...cookies);
          }
        } catch (e) {
          console.log(`Failed to get cookies for ${d}:`, e);
        }
      }
      
      // 중복 제거
      const uniqueCookies = allCookies.filter((cookie, index, self) =>
        index === self.findIndex(c => c.name === cookie.name && c.domain === cookie.domain)
      );
      
      // 모든 쿠키를 중요하게 취급 (범용성을 위해)
      const sessionCookies = uniqueCookies.filter(cookie => {
        const name = cookie.name.toLowerCase();
        
        // 더 포괄적인 세션 쿠키 패턴
        const sessionPatterns = [
          'session', 'auth', 'token', 'login', 'user', 'sid', 'sso',
          'csrf', 'xsrf', 'jwt', 'bearer', 'oauth', 'identity',
          'remember', 'persistent', 'connect', 'secure', 'refresh',
          '_ga', '_gid', '_gat', '_fbp', '_fbc',
          'PHPSESSID', 'JSESSIONID', 'ASP.NET_SessionId',
          '__cf_bm', '__cflb', 'AWSALB', 'AWSALBCORS'
        ];
        
        return sessionPatterns.some(pattern => name.includes(pattern)) ||
               cookie.httpOnly || 
               cookie.secure ||
               !cookie.expirationDate; // 세션 쿠키
      });
      
      console.log(`Syncing ${sessionCookies.length} session cookies out of ${uniqueCookies.length} total`);
      
      const result = await chrome.runtime.sendMessage({
        action: 'advancedSessionSync',
        domain: domain.replace('www.', ''),
        targetUrl: targetUrl,
        sessionCookies: sessionCookies,
        allCookies: uniqueCookies
      });
      
      console.log('Advanced session sync result:', result);
      return result;
      
    } catch (e) {
      console.log('Advanced session sync failed:', e);
      return { success: false };
    }
  }

  async getAllDomainCookies(domain) {
    // 이 함수는 이제 getRelatedDomains를 사용하도록 간소화
    return this.getRelatedDomains(domain);
  }

  async validateSession(iframe, originalUrl) {
    // 이 함수는 더 이상 사용하지 않고 quickSessionCheck로 대체
    return this.quickSessionCheck(iframe, originalUrl);
  }

  hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
      loadingIndicator.style.opacity = '0';
      setTimeout(() => {
        if (loadingIndicator.parentNode) {
          loadingIndicator.remove();
        }
        if (this.rightFrame) {
          this.rightFrame.style.opacity = '1';
        }
      }, 200);
    } else if (this.rightFrame) {
      this.rightFrame.style.opacity = '1';
    }
  }

  handleIframeLoadError(url) {
    console.log('Handling iframe load error for:', url);
    
    if (url.includes('gmail.com') || url.includes('mail.google.com')) {
      this.showGmailAlternative(url);
      return;
    }
    
    this.showIframeError(url);
  }

  showIframeError(url) {
    if (this.rightFrame) {
      this.rightFrame.style.display = 'none';
    }
    
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
    
    const errorMessage = document.createElement('div');
    errorMessage.className = 'iframe-error';
    errorMessage.innerHTML = `
      <div class="error-content">
        <div class="error-icon">⚠️</div>
        <h3>페이지를 로드할 수 없습니다</h3>
        <p>이 사이트는 보안 정책으로 인해 분할 화면에서 로드될 수 없습니다.</p>
        <div class="error-actions">
          <button id="openNewTab" class="primary-btn">새 탭에서 열기</button>
          <button id="retry" class="secondary-btn">다시 시도</button>
        </div>
        <div class="error-url">${url}</div>
      </div>
    `;
    
    const container = document.getElementById('iframeContainer');
    if (container) {
      container.appendChild(errorMessage);
    } else {
      this.rightPanel.appendChild(errorMessage);
    }
    
    document.getElementById('openNewTab').addEventListener('click', () => {
      window.open(url, '_blank');
    });
    
    document.getElementById('retry').addEventListener('click', () => {
      errorMessage.remove();
      if (this.rightFrame) {
        this.rightFrame.style.display = 'block';
        this.rightFrame.src = url;
      } else {
        this.loadUrl(url);
      }
    });
  }

  showGmailAlternative(url) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
    
    const container = document.getElementById('iframeContainer') || this.rightPanel;
    this.handleGmailSpecial(url, container);
  }

  showLoading() {
    if (this.rightPanel) {
      this.rightPanel.innerHTML = `
        <div class="loading-container">
          <div class="loading-content">
            <div class="spinner large"></div>
            <div class="loading-text">준비 중...</div>
          </div>
        </div>
      `;
    }
  }

  getDefaultIcon(url) {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23666"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
    }
  }

  truncateTitle(title) {
    return title.length > 25 ? title.substring(0, 25) + '...' : title;
  }

  setupEnhancedEvents() {
    const addressInput = document.getElementById('addressInput');
    const goBtn2 = document.getElementById('goBtn2');
    const newTabBtn = document.getElementById('newTabBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const tabIcons = document.querySelectorAll('.tab-icon');
    
    if (addressInput && goBtn2) {
      const navigate = () => {
        const url = addressInput.value.trim();
        if (url) {
          this.loadUrl(url);
        }
      };
      
      addressInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        if (e.key === 'Enter') {
          e.preventDefault();
          navigate();
        }
      });
      
      addressInput.addEventListener('keyup', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      });
      
      addressInput.addEventListener('keypress', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        if (e.key === 'Enter') {
          e.preventDefault();
          navigate();
        }
      });
      
      addressInput.addEventListener('copy', (e) => {
        e.stopPropagation();
      });
      
      addressInput.addEventListener('paste', (e) => {
        e.stopPropagation();
      });
      
      addressInput.addEventListener('cut', (e) => {
        e.stopPropagation();
      });
      
      addressInput.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
      
      addressInput.addEventListener('mouseup', (e) => {
        e.stopPropagation();
      });
      
      addressInput.addEventListener('focus', (e) => {
        e.stopPropagation();
      });
      
      goBtn2.addEventListener('click', navigate);
    }
    
    if (newTabBtn) {
      newTabBtn.addEventListener('click', () => {
        window.open(addressInput.value || (this.rightFrame ? this.rightFrame.src : ''), '_blank');
      });
    }
    
    if (refreshBtn && this.rightFrame) {
      refreshBtn.addEventListener('click', () => {
        this.rightFrame.src = this.rightFrame.src;
      });
    }

    tabIcons.forEach(icon => {
      icon.addEventListener('click', async () => {
        const url = icon.dataset.url;
        if (url && addressInput) {
          const domain = new URL(url).hostname;
          
          if (this.checkIfNeedsSessionSync(domain)) {
            console.log(`Tab click: pre-syncing for ${domain}`);
            await this.preSessionSync(domain, url);
          }
          
          addressInput.value = url;
          if (this.rightFrame) {
            this.rightFrame.src = url;
          }
        }
      });
      
      icon.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        const url = icon.dataset.url;
        if (url) {
          const domain = new URL(url).hostname;
          
          try {
            const result = await chrome.runtime.sendMessage({
              action: 'syncCookies',
              domain: domain.replace('www.', ''),
              targetUrl: url
            });
            
            if (result.success && addressInput) {
              addressInput.value = url;
              if (this.rightFrame) {
                this.rightFrame.src = url;
              }
              
              icon.style.borderColor = '#28a745';
              setTimeout(() => {
                icon.style.borderColor = '#007acc';
              }, 1000);
            }
          } catch (e) {
            console.log('Session clone failed:', e);
          }
        }
      });
    });
  }

  setupResizer() {
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startLeftWidth = 0;
    let startTopHeight = 0;

    const stopResizing = () => {
      if (!isResizing) return;
      
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
      document.removeEventListener('mouseleave', handleMouseLeave, true);
      window.removeEventListener('blur', stopResizing, true);
    };

    const handleMouseMove = (e) => {
      if (!isResizing) return;
      
      if (e.buttons !== 1) {
        stopResizing();
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      
      if (this.direction === 'vertical') {
        const deltaX = e.clientX - startX;
        const newLeftWidth = startLeftWidth + deltaX;
        const containerWidth = this.splitContainer.offsetWidth;
        
        const minWidth = containerWidth * 0.2;
        const maxWidth = containerWidth * 0.8;

        if (newLeftWidth >= minWidth && newLeftWidth <= maxWidth) {
          const leftFlex = newLeftWidth / containerWidth;
          const rightFlex = 1 - leftFlex;
          
          this.leftPanel.style.flex = leftFlex;
          this.rightPanel.style.flex = rightFlex;
        }
      } else {
        const deltaY = e.clientY - startY;
        const newTopHeight = startTopHeight + deltaY;
        const containerHeight = this.splitContainer.offsetHeight;
        
        const minHeight = containerHeight * 0.2;
        const maxHeight = containerHeight * 0.8;

        if (newTopHeight >= minHeight && newTopHeight <= maxHeight) {
          const topFlex = newTopHeight / containerHeight;
          const bottomFlex = 1 - topFlex;
          
          this.leftPanel.style.flex = topFlex;
          this.rightPanel.style.flex = bottomFlex;
        }
      }
    };

    const handleMouseUp = (e) => {
      stopResizing();
    };

    const handleMouseLeave = (e) => {
      if (isResizing && (e.clientX < 0 || e.clientY < 0 || 
          e.clientX > window.innerWidth || e.clientY > window.innerHeight)) {
        stopResizing();
      }
    };

    this.resizer.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      
      if (isResizing) {
        stopResizing();
        return;
      }
      
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      
      if (this.direction === 'vertical') {
        startLeftWidth = this.leftPanel.offsetWidth;
      } else {
        startTopHeight = this.leftPanel.offsetHeight;
      }
      
      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('mouseup', handleMouseUp, true);
      document.addEventListener('mouseleave', handleMouseLeave, true);
      window.addEventListener('blur', stopResizing, true);
      
      document.body.style.cursor = this.direction === 'vertical' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      
      e.preventDefault();
      e.stopPropagation();
    });

    this.resizer.addEventListener('contextmenu', (e) => {
      if (isResizing) {
        stopResizing();
        e.preventDefault();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isResizing) {
        stopResizing();
      }
    });
  }

  handleKeydown(e) {
    const activeElement = document.activeElement;
    if (activeElement && activeElement.id === 'addressInput') {
      if (e.key === 'Escape') {
        activeElement.blur();
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    
    if (e.key === 'Escape') {
      this.closeSplitScreen();
      e.preventDefault();
      e.stopPropagation();
    }
  }

  closeSplitScreen() {
    if (!this.isActive) return;

    this.updateTabIcon(false);

    if (this.splitContainer) {
      this.splitContainer.remove();
    }

    const hiddenElements = Array.from(document.body.children).filter(el => 
      el.style.visibility === 'hidden' && el.id !== 'split-screen-container'
    );
    
    hiddenElements.forEach(el => {
      el.style.visibility = '';
      el.style.position = '';
    });

    document.body.style.margin = '';
    document.body.style.padding = '';
    document.body.style.overflow = '';
    
    document.removeEventListener('keydown', this.handleKeydown);
    
    this.isActive = false;
    this.splitContainer = null;
    this.leftPanel = null;
    this.rightPanel = null;
    this.rightFrame = null;
    this.sessionSyncInProgress = false;

    if (window.gc) {
      setTimeout(() => window.gc(), 100);
    }
  }

  updateTabIcon(isSplitActive) {
    try {
      if (isSplitActive) {
        this.originalFavicon = this.getCurrentFavicon();
        this.setTemporaryFavicon();
        
        this.originalTitle = document.title;
        document.title = `[Split View] ${this.originalTitle}`;
      } else {
        this.restoreOriginalFavicon();
        
        if (this.originalTitle) {
          document.title = this.originalTitle;
        }
      }
      
    } catch (e) {
      console.log('Failed to update tab icon:', e);
    }
  }

  getCurrentFavicon() {
    const existingLinks = document.querySelectorAll('link[rel*="icon"]');
    const faviconInfo = [];
    
    existingLinks.forEach(link => {
      if (link.href && !link.href.startsWith('data:')) {
        faviconInfo.push({
          rel: link.rel,
          type: link.type,
          href: link.href,
          sizes: link.sizes ? link.sizes.toString() : null
        });
      }
    });
    
    if (faviconInfo.length === 0) {
      faviconInfo.push({
        rel: 'shortcut icon',
        type: 'image/x-icon',
        href: `${window.location.origin}/favicon.ico`,
        sizes: null
      });
    }
    
    return faviconInfo;
  }

  setTemporaryFavicon() {
    const existingLinks = document.querySelectorAll('link[rel*="icon"]');
    existingLinks.forEach(link => {
      link.style.display = 'none';
      link.dataset.originalDisplay = 'block';
    });
    
    this.tempFaviconLink = document.createElement('link');
    this.tempFaviconLink.rel = 'shortcut icon';
    this.tempFaviconLink.type = 'image/x-icon';
    this.tempFaviconLink.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="4" width="8" height="16" rx="1" fill="%23007acc"/><rect x="14" y="4" width="8" height="16" rx="1" fill="%2300a2ff"/><rect x="10" y="10" width="4" height="4" rx="1" fill="%23007acc"/></svg>';
    this.tempFaviconLink.dataset.splitViewIcon = 'true';
    
    document.head.appendChild(this.tempFaviconLink);
  }

  restoreOriginalFavicon() {
    if (this.tempFaviconLink) {
      this.tempFaviconLink.remove();
      this.tempFaviconLink = null;
    }
    
    const splitIcons = document.querySelectorAll('link[data-split-view-icon="true"]');
    splitIcons.forEach(icon => icon.remove());
    
    const hiddenLinks = document.querySelectorAll('link[rel*="icon"][style*="display: none"]');
    hiddenLinks.forEach(link => {
      link.style.display = link.dataset.originalDisplay || '';
      delete link.dataset.originalDisplay;
    });
    
    if (this.originalFavicon && this.originalFavicon.length > 0) {
      if (hiddenLinks.length === 0) {
        this.originalFavicon.forEach(info => {
          const link = document.createElement('link');
          link.rel = info.rel;
          link.type = info.type;
          link.href = info.href;
          if (info.sizes) {
            link.sizes = info.sizes;
          }
          document.head.appendChild(link);
        });
      }
    }
  }

  addToHistory(url) {
    const item = {
      url: url,
      title: url,
      timestamp: Date.now()
    };

    this.history = this.history.filter(h => h.url !== url);
    this.history.unshift(item);
    
    if (this.history.length > 20) {
      this.history = this.history.slice(0, 20);
    }

    this.saveHistory();
  }

  loadHistory() {
    try {
      const saved = localStorage.getItem('split-screen-history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  saveHistory() {
    try {
      localStorage.setItem('split-screen-history', JSON.stringify(this.history));
    } catch {}
  }
}

const splitScreenManager = new SplitScreenManager();

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  await splitScreenManager.init();
  
  switch (message.action) {
    case 'splitVertical':
      splitScreenManager.createSplitScreen('vertical');
      break;
    case 'splitHorizontal':
      splitScreenManager.createSplitScreen('horizontal');
      break;
    case 'closeSplit':
      splitScreenManager.closeSplitScreen();
      break;
  }
  
  sendResponse({success: true});
});