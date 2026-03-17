const API_URL = '/api/albergues';
let map;
let markers = {};
let alberguesData = [];
let baseLayer;

// Initialize Map
function initMap() {
    map = L.map('map').setView([42.5987, -5.5671], 8);
    baseLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
}

// Fetch Albergues Data
async function fetchAlbergues() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        alberguesData = data;
        
        document.getElementById('count').textContent = data.length;
        renderMapMarkers();
        renderList();
        renderSideIndex();
    } catch (error) {
        console.error('API 로드 실패:', error);
        document.getElementById('albergueList').innerHTML = 
            '<div class="loading" style="color:var(--red)">데이터를 불러오지 못했습니다. 서버 연결을 확인해주세요.</div>';
    }
}

// Render Map Markers
function renderMapMarkers() {
    // Clear existing markers
    Object.values(markers).forEach(marker => map.removeLayer(marker));
    markers = {};

    const statusColors = {
        'green': '#10b981',
        'red': '#ef4444',
        'gray': '#94a3b8'
    };

    const bounds = [];

    alberguesData.forEach(item => {
        if (!item.lat || !item.lng) return;

        const color = statusColors[item.status] || statusColors['gray'];
        
        // Create custom div icon
        const markerIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="width: 16px; height: 16px; border-radius: 50%; background-color: ${color};"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        const marker = L.marker([item.lat, item.lng], { icon: markerIcon }).addTo(map);
        
        // Popup
        marker.bindPopup(`
            <div style="font-family: Pretendard, sans-serif;">
                <h3 style="margin: 0 0 5px 0; font-size: 14px;">${item.name}</h3>
                <p style="margin: 0; color: #666; font-size: 12px;">상태: ${getStatusText(item.status)}</p>
                <p style="margin: 5px 0 0 0; color: #999; font-size: 11px;">업데이트: ${item.lastUpdated}</p>
            </div>
        `);

        markers[item.id] = marker;
        bounds.push([item.lat, item.lng]);
    });

    // Fit map to bounds if we have points
    if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

// Render List
function renderList(dataToRender = alberguesData) {
    const listContainer = document.getElementById('albergueList');
    listContainer.innerHTML = '';

    if (dataToRender.length === 0) {
        listContainer.innerHTML = '<div class="loading">검색 결과가 없습니다.</div>';
        return;
    }

    let currentGroup = '';

    dataToRender.forEach(item => {
        // Grouping logic
        const cityMatch = item.name.match(/\(([^()]*?)\)/);
        const cityName = cityMatch ? cityMatch[1].trim() : "Other";
        const firstLetter = cityName.charAt(0).toUpperCase();

        if (firstLetter !== currentGroup) {
            currentGroup = firstLetter;
            const groupHeader = document.createElement('div');
            groupHeader.className = 'group-header';
            groupHeader.id = `group-${currentGroup}`;
            groupHeader.textContent = currentGroup;
            groupHeader.style.cssText = 'padding: 1rem 1.5rem; background: var(--bg-alt); font-weight: 800; border-bottom: 1px solid var(--border); color: var(--primary);';
            listContainer.appendChild(groupHeader);
        }

        const card = document.createElement('div');
        card.className = 'card';
        card.style.margin = '1rem';
        card.onclick = () => focusMapMarker(item.id, item.lat, item.lng);

        const badgeClass = `bg-${item.status}`;
        const statusText = getStatusText(item.status);

        card.innerHTML = `
            <div class="card-header">
                <div class="card-title">${item.name}</div>
                <span class="badge ${badgeClass}">${statusText}</span>
            </div>
            <div class="card-meta">
                <span>⏱️ ${item.lastUpdated}</span>
            </div>
            <div class="card-actions" onclick="event.stopPropagation()">
                <button class="status-btn btn-green ${item.status === 'green' ? 'active' : ''}" onclick="updateStatus(${item.id}, 'green')">여유<br>(Available)</button>
                <button class="status-btn btn-red ${item.status === 'red' ? 'active' : ''}" onclick="updateStatus(${item.id}, 'red')">만실<br>(Full)</button>
                <button class="status-btn btn-gray ${item.status === 'gray' ? 'active' : ''}" onclick="updateStatus(${item.id}, 'gray')">미확인<br>(Unknown)</button>
            </div>
            <div class="card-footer" style="padding: 10px 15px; border-top: 1px solid var(--border); background: var(--bg-alt); text-align: center;" onclick="event.stopPropagation()">
                <button class="comment-btn" style="background: transparent; color: var(--primary); border: 1.5px solid var(--primary); padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 600; width: 100%;" onclick="openCommentsModal(${item.id}, '${item.name.replace(/'/g, "\\'")}')">💬 순례자 코멘트 (Review)</button>
            </div>
        `;
        listContainer.appendChild(card);
    });
}

// Update Status API
async function updateStatus(id, newStatus) {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: newStatus,
                lastUpdated: formattedDate
            })
        });

        if (response.ok) {
            // Optimistic UI update
            const albergueIndex = alberguesData.findIndex(a => a.id === id);
            if (albergueIndex !== -1) {
                alberguesData[albergueIndex].status = newStatus;
                alberguesData[albergueIndex].lastUpdated = formattedDate;
                renderMapMarkers();
                renderList();
            }
        } else {
            alert('상태 업데이트에 실패했습니다.');
        }
    } catch (error) {
        console.error('업데이트 에러:', error);
        alert('서버 연결 오류로 업데이트에 실패했습니다.');
    }
}

function renderSideIndex() {
    const sideIndexEl = document.getElementById('side-index');
    if (!sideIndexEl) return;
    sideIndexEl.innerHTML = '';

    const letters = new Set();
    alberguesData.forEach(item => {
        let cityName = item.name.match(/\(([^()]*?)\)/)?.[1] || "";
        if (cityName) {
            const firstChar = cityName.trim().charAt(0).toUpperCase();
            if (/[A-Z]/.test(firstChar)) {
                letters.add(firstChar);
            }
        }
    });

    const sortedLetters = Array.from(letters).sort();
    sortedLetters.forEach(l => {
        const span = document.createElement('span');
        span.textContent = l;
        span.onclick = () => scrollToLetter(l);
        sideIndexEl.appendChild(span);
    });
}

function scrollToLetter(letter) {
    const target = document.getElementById(`group-${letter}`);
    if (target) {
        const container = document.getElementById('albergueList');
        const offset = target.offsetTop - container.offsetTop;
        container.scrollTo({ top: offset, behavior: 'smooth' });
    }
}

// Helper: Get readable text for status
function getStatusText(status) {
    const statusMap = {
        'green': '여유 (Available)',
        'red': '만실 (Full)',
        'gray': '미확인 (Unknown)'
    };
    return statusMap[status] || '미확인';
}

// Map Focus Helper
function focusMapMarker(id, lat, lng) {
    if (lat && lng) {
        map.setView([lat, lng], 15, {
            animate: true,
            duration: 1
        });
        
        if (markers[id]) {
            markers[id].openPopup();
        }
    }
}

// Event Listeners
document.getElementById('refreshBtn').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    fetchAlbergues();
});

const shareBtn = document.getElementById('shareBtn');
if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
        const shareData = {
            title: 'MuniBed - Camino Albergue Tracker',
            text: '산티아고 순례길 알베르게 실시간 현황을 확인해보세요! Check real-time Albergue status on Camino!',
            url: window.location.href
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(window.location.href);
                alert('주소가 복사되었습니다! Link copied to clipboard.');
            }
        } catch (err) {
            console.error('Share failed:', err);
        }
    });
}

// Mobile Sidebar Logic
const mobileFab = document.getElementById('mobileFab');
const mobileOverlay = document.getElementById('mobileOverlay');
const listSection = document.getElementById('listSection');

function toggleMobileSidebar(active) {
    if (active) {
        listSection.classList.add('active');
        mobileOverlay.classList.add('active');
    } else {
        listSection.classList.remove('active');
        mobileOverlay.classList.remove('active');
    }
}

if (mobileFab) {
    mobileFab.addEventListener('click', () => toggleMobileSidebar(true));
}

if (mobileOverlay) {
    mobileOverlay.addEventListener('click', () => toggleMobileSidebar(false));
}

// Ensure clicking a hostel in the list closes the sidebar on mobile
const originalFocusMapMarker = focusMapMarker;
focusMapMarker = function(id, lat, lng) {
    originalFocusMapMarker(id, lat, lng);
    if (window.innerWidth <= 900) {
        toggleMobileSidebar(false);
    }
};

// Modal Logic
const infoModal = document.getElementById('infoModal');
const infoBtn = document.getElementById('infoBtn');
const closeModalBtn = document.getElementById('closeModalBtn');


if (infoBtn) {
    infoBtn.addEventListener('click', () => {
        infoModal.classList.add('active');
    });
}
if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        infoModal.classList.remove('active');
    });
}
if (infoModal) {
    infoModal.addEventListener('click', (e) => {
        if (e.target === infoModal) {
            infoModal.classList.remove('active');
        }
    });
}

// Contact Modal Logic
const contactModal = document.getElementById('contactModal');
const contactBtn = document.getElementById('contactBtn');
const closeContactBtn = document.getElementById('closeContactBtn');

if (contactBtn) {
    contactBtn.addEventListener('click', () => {
        contactModal.classList.add('active');
    });
}
if (closeContactBtn) {
    closeContactBtn.addEventListener('click', () => {
        contactModal.classList.remove('active');
    });
}
if (contactModal) {
    contactModal.addEventListener('click', (e) => {
        if (e.target === contactModal) {
            contactModal.classList.remove('active');
        }
    });
}

// Language Toggle Logic
const langToggleContainer = document.querySelectorAll('.modal-actions');

langToggleContainer.forEach(container => {
    const btns = container.querySelectorAll('.lang-btn');
    const modalId = container.closest('.modal-overlay').id; // 'infoModal' or 'contactModal'
    const contentPrefix = modalId === 'infoModal' ? 'content' : 'contactContent';

    btns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active class from buttons in THIS container
            btns.forEach(b => b.classList.remove('active'));
            
            // Add active class to clicked button
            const clickedBtn = e.target;
            clickedBtn.classList.add('active');

            // Hide all contents for this modal
            const allContents = document.querySelectorAll(`#${modalId} .lang-content`);
            allContents.forEach(c => c.classList.remove('active'));

            // Show corresponding content based on data-lang attribute
            const targetLang = clickedBtn.getAttribute('data-lang');
            document.getElementById(`${contentPrefix}${targetLang}`).classList.add('active');
        });
    });
});

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
    initMap();
    fetchAlbergues().then(() => {
        setupSearch();
        initAlphabetIndex();
    });
});

// ======== Comments Modal Logic ============
let currentAlbergueId = null;

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadAlbergueComments(albergueId) {
    const list = document.getElementById('modalCommentsList');
    list.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">댓글을 불러오는 중...</div>';
    try {
        const res = await fetch(`/api/albergues/${albergueId}/comments`);
        if (!res.ok) throw new Error('Failed to load comments');
        const comments = await res.json();
        
        if (comments.length === 0) {
            list.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">아직 등록된 의견이 없습니다. 첫 번째 순례자가 되어주세요!</div>';
            return;
        }

        list.innerHTML = '';
        comments.forEach(c => {
            const myNick = localStorage.getItem('munibed_nickname') || '';
            const isMine = c.nickname === myNick;
            const item = document.createElement('div');
            item.style.padding = '12px';
            item.style.background = isMine ? 'rgba(2,132,199,0.04)' : 'var(--bg-alt)';
            item.style.border = isMine ? '1px solid rgba(2,132,199,0.3)' : '1px solid var(--border)';
            item.style.borderRadius = '8px';
            
            const meta = document.createElement('div');
            meta.style.display = 'flex';
            meta.style.justifyContent = 'space-between';
            meta.style.marginBottom = '6px';
            meta.style.fontSize = '0.8rem';
            meta.innerHTML = `<span style="font-weight:bold;">${escapeHtml(c.nickname)} ${isMine ? '(나)' : ''}</span><span style="color:var(--text-muted);">${c.createdAt}</span>`;
            
            const body = document.createElement('div');
            body.style.fontSize = '0.9rem';
            body.style.lineHeight = '1.4';
            body.innerHTML = escapeHtml(c.content).replace(/\n/g, '<br>');
            
            item.appendChild(meta);
            item.appendChild(body);
            list.appendChild(item);
        });
    } catch (e) {
        list.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--red);">댓글을 불러오는 데 실패했습니다.</div>';
    }
}

function openCommentsModal(id, title) {
    currentAlbergueId = id;
    const modal = document.getElementById('commentsModal');
    document.getElementById('commentsModalTitle').innerText = title;
    document.getElementById('modalCommentInput').value = '';
    modal.classList.add('active');
    loadAlbergueComments(id);
}

document.getElementById('closeCommentsBtn').addEventListener('click', () => {
    document.getElementById('commentsModal').classList.remove('active');
    currentAlbergueId = null;
});

document.addEventListener('click', (e) => {
    const modal = document.getElementById('commentsModal');
    if (e.target === modal) {
        modal.classList.remove('active');
        currentAlbergueId = null;
    }
});

function getMyNicknameForComments() {
    let nick = localStorage.getItem('munibed_nickname');
    if (!nick) {
        const ADJECTIVES = ['용감한','든든한','따뜻한','신비로운','씩씩한','느긋한','명랑한','차분한','참신한','지혜로운'];
        const NOUNS = ['순례자','까미노러','알베르게인','배낭여행자','Pilgrim','Wanderer','Walker'];
        const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
        const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
        const num = Math.floor(Math.random() * 900) + 100;
        nick = `${adj} ${noun} ${num}`;
        localStorage.setItem('munibed_nickname', nick);
    }
    return nick;
}

document.getElementById('modalSendCommentBtn').addEventListener('click', async () => {
    if (!currentAlbergueId) return;
    const input = document.getElementById('modalCommentInput');
    const content = input.value.trim();
    if (!content) return;

    const nickname = getMyNicknameForComments();
    const btn = document.getElementById('modalSendCommentBtn');
    btn.disabled = true;
    btn.textContent = '전송 중...';

    try {
        const res = await fetch(`/api/albergues/${currentAlbergueId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname, content })
        });
        if (!res.ok) throw new Error('Failed');
        input.value = '';
        await loadAlbergueComments(currentAlbergueId);
    } catch (e) {
        alert('댓글 작성에 실패했습니다.');
    } finally {
        btn.disabled = false;
        btn.textContent = '댓글 남기기';
    }
});

// ======== New Features: Search & Index ============

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const autocompleteList = document.getElementById('autocompleteList');
    
    // Extract unique full city names for the dropdown
    const uniqueCities = new Set();
    alberguesData.forEach(item => {
        const match = item.name.match(/\(([^)]+)\)/);
        if (match && match[1]) {
            uniqueCities.add(match[1].trim());
        }
    });
    const cityList = Array.from(uniqueCities).sort();

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        
        // Remove active state from alphabet buttons
        document.querySelectorAll('.alpha-btn').forEach(btn => btn.classList.remove('active'));

        // Clear autocomplete
        autocompleteList.innerHTML = '';
        
        if (!query) {
            autocompleteList.classList.remove('active');
            renderList(alberguesData);
            return;
        }

        // 1. Populate Autocomplete Dropdown with matching Cities that START with the query
        const matchingCities = cityList.filter(city => city.toLowerCase().startsWith(query));
        
        if (matchingCities.length > 0) {
            autocompleteList.classList.add('active');
            matchingCities.forEach(city => {
                const itemDiv = document.createElement('div');
                // Highlight matching part (always at the beginning now)
                const matchStr = city.substring(0, query.length);
                const after = city.substring(query.length);
                
                itemDiv.innerHTML = `<b>${matchStr}</b>${after}`;
                
                itemDiv.addEventListener('click', () => {
                    // When clicked, fill input, hide dropdown, and render list
                    searchInput.value = city;
                    autocompleteList.classList.remove('active');
                    
                    const filtered = alberguesData.filter(item => {
                         const m = item.name.match(/\(([^)]+)\)/);
                         return m && m[1].trim() === city;
                    });
                    renderList(filtered);
                });
                autocompleteList.appendChild(itemDiv);
            });
        } else {
            autocompleteList.classList.remove('active');
        }

        // 2. Render the actual list below (live searching)
        const filtered = alberguesData.filter(item => {
            const match = item.name.match(/\(([^)]+)\)/);
            // Match city name starting with query
            if (match && match[1] && match[1].trim().toLowerCase().startsWith(query)) {
                return true;
            }
            // Fallback: match albergue name starting with query
            return item.name.toLowerCase().startsWith(query);
        });
        renderList(filtered);
    });

    // Hide autocomplete when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target !== searchInput && e.target !== autocompleteList) {
            autocompleteList.classList.remove('active');
        }
    });
}

function initAlphabetIndex() {
    const indexContainer = document.getElementById('alphabetIndex');
    indexContainer.innerHTML = '';
    
    // Extract unique first letters based on CITY name (inside parentheses)
    const letters = new Set();
    alberguesData.forEach(item => {
        const letter = getCityFirstLetter(item.name);
        if (/[A-Z]/.test(letter)) {
            letters.add(letter);
        }
    });

    const sortedLetters = Array.from(letters).sort();

    // "All" button
    const allBtn = document.createElement('button');
    allBtn.className = 'alpha-btn active';
    allBtn.textContent = 'All';
    allBtn.onclick = () => filterByLetter('All', allBtn);
    indexContainer.appendChild(allBtn);

    sortedLetters.forEach(letter => {
        const btn = document.createElement('button');
        btn.className = 'alpha-btn';
        btn.textContent = letter;
        btn.onclick = () => filterByLetter(letter, btn);
        indexContainer.appendChild(btn);
    });
}

function filterByLetter(letter, clickedBtn) {
    // UI Update
    document.querySelectorAll('.alpha-btn').forEach(btn => btn.classList.remove('active'));
    clickedBtn.classList.add('active');
    
    // Clear search input
    document.getElementById('searchInput').value = '';

    if (letter === 'All') {
        renderList(alberguesData);
        return;
    }

    const filtered = alberguesData.filter(item => getCityFirstLetter(item.name) === letter);
    renderList(filtered);
}

function getCityFirstLetter(fullName) {
    // 1. "Ref. municipal (Saint-Jean)" -> extract "Saint-Jean"
    const match = fullName.match(/\(([^)]+)\)/);
    
    if (match && match[1]) {
        // 2. Get the first alphabetical character of the city
        const cityFirstCharMatch = match[1].match(/[a-zA-Z]/);
        return cityFirstCharMatch ? cityFirstCharMatch[0].toUpperCase() : '#';
    }
    
    // Fallback if no parentheses are found: just text the first letter of the name
    const fallbackMatch = fullName.match(/[a-zA-Z]/);
    return fallbackMatch ? fallbackMatch[0].toUpperCase() : '#';
}
