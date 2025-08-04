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

    // 전체 컨테이너 생성
    this.splitContainer = document.createElement('div');
    this.splitContainer.id = 'split-screen-container';
    this.splitContainer.className = `split-${direction}`;

    // 왼쪽 패널 (현재 페이지)
    this.leftPanel = document.createElement('div');
    this.leftPanel.className = 'split-panel left-panel';
    this.leftPanel.style.flex = '1';

    const leftContent = document.createElement('div');
    leftContent.className = 'left-content';
    leftContent.style.cssText = `
      width: 100%;
      height: 100%;
      overflow: auto;
      background: white;
      position: relative;
    `;
    
    const pagePreview = document.createElement('iframe');
    pagePreview.src = window.location.href;
    pagePreview.className = 'left-preview';
    pagePreview.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      pointer-events: none;
      background: white;
    `;
    
    leftContent.appendChild(pagePreview);
    this.leftPanel.appendChild(leftContent);

    // 리사이저
    this.resizer = document.createElement('div');
    this.resizer.className = `resizer resizer-${direction}`;
    this.setupResizer();

    // 오른쪽 패널
    this.rightPanel = document.createElement('div');
    this.rightPanel.className = 'split-panel right-panel';
    this.rightPanel.style.flex = '1';
    
    // 초기 UI 생성
    this.createInitialUI();

    // 레이아웃 구성
    this.splitContainer.appendChild(this.leftPanel);
    this.splitContainer.appendChild(this.resizer);
    this.splitContainer.appendChild(this.rightPanel);

    // body에 추가하되 기존 내용은 숨기기
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    
    const originalElements = Array.from(document.body.children);
    originalElements.forEach(el => {
      if (el.id !== 'split-screen-container') {
        el.style.display = 'none';
      }
    });
    
    document.body.appendChild(this.splitContainer);

    // ESC 키로 종료
    document.addEventListener('keydown', this.handleKeydown.bind(this));
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
        
        <div class="history-section" style="display: ${this.history.length > 0 ? 'block' : 'none'}">
          <h3>최근 방문</h3>
          <div class="history-list" id="historyList"></div>
        </div>
        
        <div class="quick-links">
          <h3>빠른 링크</h3>
          <div class="links-grid">
            <button class="quick-link" data-url="https://www.google.com">Google</button>
            <button class="quick-link" data-url="https://www.naver.com">Naver</button>
            <button class="quick-link" data-url="https://www.youtube.com">YouTube</button>
            <button class="quick-link" data-url="https://github.com">GitHub</button>
          </div>
        </div>
      </div>
    `;

    this.rightPanel.appendChild(initialUI);
    
    requestAnimationFrame(() => {
      this.setupInitialUIEvents();
      this.populateTabsList();
      this.populateHistory();
    });
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
    // URL 정규화
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.') && !url.includes(' ')) {
        url = 'https://' + url;
      } else {
        url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
      }
    }

    this.addToHistory(url);
    this.showLoading();

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

  createAndLoadIframe(url) {
    const container = document.getElementById('iframeContainer');
    if (!container) return;

    const existingFrame = document.getElementById('splitFrame');
    if (existingFrame) {
      existingFrame.remove();
    }

    // Gmail 특별 처리
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
    
    // 여러 Gmail 접근 방법 시도
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
    
    // 각 옵션 버튼 이벤트
    document.querySelectorAll('.gmail-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const optionUrl = btn.dataset.url;
        const index = parseInt(btn.dataset.index);
        
        // 로딩 표시
        gmailAlt.innerHTML = `
          <div class="alternative-content">
            <div class="spinner large"></div>
            <div class="loading-text">${gmailOptions[index].name} 로딩 중...</div>
          </div>
        `;
        
        // 특별한 방법으로 iframe 시도
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

    // Gmail 전용 속성들
    this.rightFrame.referrerPolicy = 'strict-origin-when-cross-origin';
    this.rightFrame.loading = 'lazy';
    
    let loadSuccess = false;
    let loadTimeout;

    this.rightFrame.addEventListener('load', () => {
      loadSuccess = true;
      if (loadTimeout) clearTimeout(loadTimeout);
      
      // 성공적으로 로드되면 표시
      setTimeout(() => {
        try {
          // iframe 내용 접근 시도로 차단 여부 확인
          const doc = this.rightFrame.contentDocument;
          if (doc && doc.body && doc.body.innerHTML.length > 100) {
            this.rightFrame.style.opacity = '1';
            const existing = container.querySelector('.gmail-alternative');
            if (existing) existing.remove();
          } else {
            throw new Error('Empty or blocked content');
          }
        } catch (e) {
          // 여전히 차단되면 대안 표시
          this.showGmailFallback(url, container, optionName);
        }
      }, 1000);
    });

    // 타임아웃 설정
    loadTimeout = setTimeout(() => {
      if (!loadSuccess) {
        this.showGmailFallback(url, container, optionName);
      }
    }, 5000);

    container.appendChild(this.rightFrame);
    
    // User-Agent를 변경해서 모바일처럼 보이게 (일부 사이트에서 효과적)
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

    const targetDomain = new URL(url).hostname;
    const needsCookieSync = ['claude.ai', 'calendar.google.com', 'drive.google.com', 'accounts.google.com', 'notion.so'].some(domain => 
      targetDomain.includes(domain)
    );

    let loadTimeout;
    let hasLoaded = false;

    this.rightFrame.addEventListener('load', async () => {
      hasLoaded = true;
      if (loadTimeout) clearTimeout(loadTimeout);
      
      if (needsCookieSync) {
        console.log(`Syncing cookies for ${targetDomain}`);
        try {
          const result = await chrome.runtime.sendMessage({
            action: 'syncCookies',
            domain: targetDomain.replace('www.', ''),
            targetUrl: url
          });
          console.log('Cookie sync result:', result);
          
          if (result.success && result.syncedCount > 0 && !this.rightFrame.dataset.synced) {
            this.rightFrame.dataset.synced = 'true';
            setTimeout(() => {
              this.rightFrame.src = url;
            }, 500);
            return;
          }
        } catch (e) {
          console.log('Cookie sync failed:', e);
        }
      }
      
      this.hideLoadingIndicator();
    });

    loadTimeout = setTimeout(() => {
      if (!hasLoaded) {
        console.log('iframe load timeout for:', url);
        this.handleIframeLoadError(url);
      }
    }, 10000);

    container.appendChild(this.rightFrame);
    
    requestAnimationFrame(() => {
      this.rightFrame.src = url;
    });
  }

  hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
      loadingIndicator.style.opacity = '0';
      setTimeout(() => {
        if (loadingIndicator.parentNode) {
          loadingIndicator.remove();
        }
        this.rightFrame.style.opacity = '1';
      }, 200);
    } else {
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
    
    this.rightPanel.appendChild(errorMessage);
    
    document.getElementById('openNewTab').addEventListener('click', () => {
      window.open(url, '_blank');
    });
    
    document.getElementById('retry').addEventListener('click', () => {
      errorMessage.remove();
      if (this.rightFrame) {
        this.rightFrame.style.display = 'block';
        this.rightFrame.src = url;
      }
    });
  }

  showGmailAlternative(url) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
    
    this.handleGmailSpecial(url, this.rightPanel.querySelector('.iframe-container') || this.rightPanel);
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
      
      goBtn2.addEventListener('click', navigate);
      addressInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') navigate();
      });
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
      // 기본 클릭
      icon.addEventListener('click', () => {
        const url = icon.dataset.url;
        if (url && addressInput) {
          addressInput.value = url;
          if (this.rightFrame) {
            this.rightFrame.src = url;
          }
        }
      });
      
      // 우클릭으로 세션 복제
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

    // 리사이징 완전히 중단하는 함수
    const stopResizing = () => {
      if (!isResizing) return;
      
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      // 모든 이벤트 리스너 제거
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
      document.removeEventListener('mouseleave', handleMouseLeave, true);
      window.removeEventListener('blur', stopResizing, true);
    };

    const handleMouseMove = (e) => {
      if (!isResizing) return;
      
      // 마우스 버튼이 눌려있지 않으면 중단
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
      // 창에서 마우스가 벗어나면 리사이징 중단
      if (isResizing && (e.clientX < 0 || e.clientY < 0 || 
          e.clientX > window.innerWidth || e.clientY > window.innerHeight)) {
        stopResizing();
      }
    };

    // 마우스다운 이벤트
    this.resizer.addEventListener('mousedown', (e) => {
      // 왼쪽 마우스 버튼만 허용
      if (e.button !== 0) return;
      
      // 이미 리사이징 중이면 무시
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
      
      // 이벤트 리스너 등록
      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('mouseup', handleMouseUp, true);
      document.addEventListener('mouseleave', handleMouseLeave, true);
      window.addEventListener('blur', stopResizing, true); // 창이 포커스를 잃으면 중단
      
      // 스타일 설정
      document.body.style.cursor = this.direction === 'vertical' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      
      e.preventDefault();
      e.stopPropagation();
    });

    // 우클릭이나 다른 버튼 클릭 시 리사이징 중단
    this.resizer.addEventListener('contextmenu', (e) => {
      if (isResizing) {
        stopResizing();
        e.preventDefault();
      }
    });

    // 키보드 ESC로 리사이징 중단
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isResizing) {
        stopResizing();
      }
    });
  }

  handleKeydown(e) {
    if (e.key === 'Escape') {
      this.closeSplitScreen();
    }
  }

  closeSplitScreen() {
    if (!this.isActive) return;

    if (this.splitContainer) {
      this.splitContainer.remove();
    }

    const hiddenElements = Array.from(document.body.children).filter(el => 
      el.style.display === 'none' && el.id !== 'split-screen-container'
    );
    
    hiddenElements.forEach(el => {
      el.style.display = '';
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

// 전역 인스턴스
const splitScreenManager = new SplitScreenManager();

// 메시지 리스너
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