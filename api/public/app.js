const API_URL = '/api/albergues';
let map;
let markers = {};
let alberguesData = [];
let baseLayer;

// ── Page-wide language toggle ─────────────────────────────────────
const STATUS_TEXT_BY_LANG = {
    KO: { green: '여유', red: '만실', gray: '미확인' },
    EN: { green: 'Available', red: 'Full', gray: 'Unknown' }
};

const PAGE_STRINGS = {
    KO: {
        listHeaderLabel: '숙소 목록',
        searchPlaceholder: '도시명 검색 (예: Burgos)...',
        refreshTitle: '새로고침',
        locateTitle: '현재 위치 찾기',
        communityTitle: '커뮤니티 게시판',
        shareTitle: '앱 공유하기',
        contactTitle: '개발자에게 문의',
        infoTitle: 'MuniBed 소개',
        loadingText: '데이터를 불러오는 중입니다...',
        loadErrorText: '데이터를 불러오지 못했습니다. 서버 연결을 확인해주세요.',
        noResultsText: '검색 결과가 없습니다.',
        checkingLocation: '📍 위치 확인 중...',
        tooFarLocked: radius => `🔒 현재 위치에서 ${radius}km 이상 떨어짐 — 수정 불가`,
        dailyLimitLocked: (used, total) => `📵 오늘 수정 한도 초과 (${used}/${total})`,
        geoNotSupported: '지오로케이션(Geolocation)을 지원하지 않는 브라우저입니다.',
        geoDenied: '위치 정보 공유가 거부되었습니다. 설정에서 권한을 허용해주세요.',
        geoUnable: '위치 정보를 가져올 수 없습니다.',
        locationRequired: '현재 위치를 확인할 수 없습니다. 위치 서비스를 켜주고 다시 시도해주세요.',
        locationRestricted: radius => `이 알베르게는 현재 위치에서 ${radius}km 이상 떨어져 있어 상태를 변경할 수 없습니다.`,
        dailyLimitReached: (limit) => `오늘 변경 가능한 알베르게 수(${limit}개)를 초과했습니다. 내일 다시 시도해주세요.`,
        updateFailed: '상태 업데이트에 실패했습니다.',
    },
    EN: {
        listHeaderLabel: 'Albergues',
        searchPlaceholder: 'Search by city (e.g. Burgos)...',
        refreshTitle: 'Refresh',
        locateTitle: 'Find My Location',
        communityTitle: 'Community Board',
        shareTitle: 'Share App',
        contactTitle: 'Contact Developer',
        infoTitle: 'About MuniBed',
        loadingText: 'Loading data...',
        loadErrorText: 'Could not load data. Please check your connection.',
        noResultsText: 'No results found.',
        checkingLocation: '📍 Checking location...',
        tooFarLocked: radius => `🔒 More than ${radius}km from your current location — cannot update`,
        dailyLimitLocked: (used, total) => `📵 Daily limit reached (${used}/${total})`,
        geoNotSupported: 'Geolocation is not supported by this browser.',
        geoDenied: 'Location access was denied. Please allow it in your settings.',
        geoUnable: 'Unable to retrieve your location.',
        locationRequired: 'Could not determine your location. Please enable location services and try again.',
        locationRestricted: radius => `Cannot update albergues more than ${radius}km from your current location.`,
        dailyLimitReached: (limit) => `Daily update limit reached (${limit}). Please try again tomorrow.`,
        updateFailed: 'Failed to update status.',
    }
};

let pageLang = localStorage.getItem('munibed_page_lang') === 'EN' ? 'EN' : 'KO';

function switchModalLang(modalId, lang) {
    const contentPrefix = modalId === 'infoModal' ? 'content' : 'contactContent';
    const container = document.querySelector(`#${modalId} .modal-actions`);
    if (!container) return;
    container.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-lang') === lang));
    document.querySelectorAll(`#${modalId} .lang-content`).forEach(c => c.classList.remove('active'));
    const target = document.getElementById(`${contentPrefix}${lang}`);
    if (target) target.classList.add('active');
}

function setPageLang(lang) {
    pageLang = lang;
    localStorage.setItem('munibed_page_lang', lang);
    document.documentElement.lang = lang.toLowerCase();

    const t = PAGE_STRINGS[lang];
    document.getElementById('listHeaderLabel').textContent = t.listHeaderLabel;
    document.getElementById('searchInput').placeholder = t.searchPlaceholder;
    document.getElementById('refreshBtn').title = t.refreshTitle;
    document.getElementById('locateBtn').title = t.locateTitle;
    document.getElementById('communityBtn').title = t.communityTitle;
    document.getElementById('shareBtn').title = t.shareTitle;
    document.getElementById('contactBtn').title = t.contactTitle;
    document.getElementById('infoBtn').title = t.infoTitle;
    document.getElementById('legendGreen').textContent = STATUS_TEXT_BY_LANG[lang].green;
    document.getElementById('legendRed').textContent = STATUS_TEXT_BY_LANG[lang].red;
    document.getElementById('legendGray').textContent = STATUS_TEXT_BY_LANG[lang].gray;
    document.getElementById('pageLangKo').classList.toggle('active', lang === 'KO');
    document.getElementById('pageLangEn').classList.toggle('active', lang === 'EN');
    const initialLoadingEl = document.getElementById('initialLoading');
    if (initialLoadingEl) initialLoadingEl.textContent = t.loadingText;

    // Keep the info/contact modals in sync with the same language
    switchModalLang('infoModal', lang);
    switchModalLang('contactModal', lang);

    if (alberguesData.length > 0) {
        renderMapMarkers();
        renderList();
    }
}

// ── Daily Update Limit ──────────────────────────────────────────
const DAILY_LIMIT = 4;

function getMadridDateClient() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }); // YYYY-MM-DD
}

function getTodayUpdatedAlbergues() {
    const today = getMadridDateClient();
    if (localStorage.getItem('munibed_daily_date') !== today) {
        localStorage.setItem('munibed_daily_date', today);
        localStorage.setItem('munibed_daily_albergues', '[]');
        return new Set();
    }
    try {
        return new Set(JSON.parse(localStorage.getItem('munibed_daily_albergues') || '[]'));
    } catch {
        return new Set();
    }
}

function markAlbergueUpdatedToday(albergueId) {
    const set = getTodayUpdatedAlbergues(); // handles new-day reset before we write
    set.add(albergueId);
    localStorage.setItem('munibed_daily_albergues', JSON.stringify([...set]));
}

function updateDailyCounter() {
    const el = document.getElementById('dailyCounter');
    if (!el) return;
    const used = getTodayUpdatedAlbergues().size;
    const remaining = DAILY_LIMIT - used;
    if (used === 0) {
        el.textContent = '';
        el.className = 'daily-counter';
    } else if (remaining > 0) {
        el.textContent = `오늘 ${used}/${DAILY_LIMIT}`;
        el.className = 'daily-counter';
    } else {
        el.textContent = `오늘 한도 초과 (${DAILY_LIMIT}/${DAILY_LIMIT})`;
        el.className = 'daily-counter daily-counter--full';
    }
}

// ── Device Identity (for daily update limit) ─────────────────────
let deviceId;

function getOrCreateDeviceId() {
    let id = localStorage.getItem('munibed_device_id');
    if (!id) {
        id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        localStorage.setItem('munibed_device_id', id);
    }
    return id;
}

// ── Live Location: only albergues within EDIT_RADIUS_KM are editable ──
// No separate consent step — this is just the browser's normal geolocation
// prompt, requested silently on load. Position is never persisted; a
// pilgrim's location changes daily, so each visit re-checks the real spot.
const EDIT_RADIUS_KM = 5;
let currentPos = null; // { lat, lng }

function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Editing requires knowing where the user currently is, within range.
// Without a fix there is nothing to check against, so we must lock, not allow.
function isLocationLocked(albergue) {
    if (!currentPos) return true;
    return haversineKm(currentPos.lat, currentPos.lng, albergue.lat, albergue.lng) > EDIT_RADIUS_KM;
}

function refreshCurrentPosition() {
    return new Promise(resolve => {
        if (!navigator.geolocation) { resolve(null); return; }
        navigator.geolocation.getCurrentPosition(
            pos => {
                currentPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                resolve(currentPos);
            },
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
    });
}

// Initialize Map
function initMap() {
    map = L.map('map').setView([42.9, -4.9], 7);
    baseLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
    
    // Ensure map layout is correct
    setTimeout(() => {
        map.invalidateSize();
    }, 500);
}

// Fetch Albergues Data
async function fetchAlbergues() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        alberguesData = data;
        // Sort alphabetically by city name (the part in parentheses)
        alberguesData.sort((a, b) => {
            const cityA = a.name.match(/\(([^()]*?)\)/)?.[1]?.trim() || "Z";
            const cityB = b.name.match(/\(([^()]*?)\)/)?.[1]?.trim() || "Z";
            return cityA.localeCompare(cityB);
        });

        document.getElementById('count').textContent = data.length;
        renderMapMarkers();
        renderList();
    } catch (error) {
        console.error('API 로드 실패:', error);
        document.getElementById('albergueList').innerHTML =
            `<div class="loading" style="color:var(--red)">${PAGE_STRINGS[pageLang].loadErrorText}</div>`;
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
        // Use a small timeout to ensure map container size is correct on mobile
        setTimeout(() => {
            map.invalidateSize();
            map.fitBounds(bounds, { padding: [50, 50] });
        }, 100);
    }
}

// Render List
function renderList(dataToRender = alberguesData) {
    const listContainer = document.getElementById('albergueList');
    listContainer.innerHTML = '';

    if (dataToRender.length === 0) {
        listContainer.innerHTML = `<div class="loading">${PAGE_STRINGS[pageLang].noResultsText}</div>`;
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
        const noFix = !currentPos;
        const locationLocked = isLocationLocked(item);
        const todaySet = getTodayUpdatedAlbergues();
        const dailyLimitLocked = !todaySet.has(item.id) && todaySet.size >= DAILY_LIMIT;

        const actionButtons = `
            <button class="status-btn btn-green ${item.status === 'green' ? 'active' : ''}" onclick="updateStatus(${item.id}, 'green')">${STATUS_TEXT_BY_LANG[pageLang].green}</button>
            <button class="status-btn btn-red ${item.status === 'red' ? 'active' : ''}" onclick="updateStatus(${item.id}, 'red')">${STATUS_TEXT_BY_LANG[pageLang].red}</button>
            <button class="status-btn btn-gray ${item.status === 'gray' ? 'active' : ''}" onclick="updateStatus(${item.id}, 'gray')">${STATUS_TEXT_BY_LANG[pageLang].gray}</button>`;

        card.innerHTML = `
            <div class="card-header">
                <div class="card-title">${item.name}</div>
                <span class="badge ${badgeClass}">${statusText}</span>
            </div>
            <div class="card-meta">
                <span>⏱️ ${item.lastUpdated}</span>
            </div>
            <div class="card-actions" onclick="event.stopPropagation()">
                ${locationLocked
                    ? noFix
                        ? `<div class="lock-notice">${PAGE_STRINGS[pageLang].checkingLocation}</div>`
                        : `<div class="lock-notice">${PAGE_STRINGS[pageLang].tooFarLocked(EDIT_RADIUS_KM)}</div>`
                    : dailyLimitLocked
                        ? `<div class="lock-notice">${PAGE_STRINGS[pageLang].dailyLimitLocked(DAILY_LIMIT, DAILY_LIMIT)}</div>`
                        : actionButtons
                }
            </div>
        `;
        listContainer.appendChild(card);
    });
}

// Update Status API
async function updateStatus(id, newStatus) {
    const albergue = alberguesData.find(a => a.id === id);

    if (!currentPos) await refreshCurrentPosition(); // one more live attempt, e.g. after a slow first fix

    if (!currentPos) {
        alert(PAGE_STRINGS[pageLang].locationRequired);
        renderList();
        return;
    }
    if (albergue && isLocationLocked(albergue)) {
        alert(PAGE_STRINGS[pageLang].locationRestricted(EDIT_RADIUS_KM));
        return;
    }

    // Daily limit check (client-side fast path)
    const todaySet = getTodayUpdatedAlbergues();
    if (!todaySet.has(id) && todaySet.size >= DAILY_LIMIT) {
        alert(PAGE_STRINGS[pageLang].dailyLimitReached(DAILY_LIMIT));
        return;
    }

    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    try {
        const body = { status: newStatus, lastUpdated: formattedDate, lat: currentPos.lat, lng: currentPos.lng };
        if (deviceId) body.device_id = deviceId;

        const response = await fetch(`${API_URL}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            markAlbergueUpdatedToday(id);
            updateDailyCounter();
            // Optimistic UI update
            const albergueIndex = alberguesData.findIndex(a => a.id === id);
            if (albergueIndex !== -1) {
                alberguesData[albergueIndex].status = newStatus;
                alberguesData[albergueIndex].lastUpdated = formattedDate;
                renderMapMarkers();
                renderList();
            }
        } else {
            const errData = await response.json().catch(() => ({}));
            if (errData.code === 'LOCATION_REQUIRED') {
                alert(PAGE_STRINGS[pageLang].locationRequired);
            } else if (errData.code === 'LOCATION_RESTRICTED') {
                alert(PAGE_STRINGS[pageLang].locationRestricted(EDIT_RADIUS_KM));
            } else if (errData.code === 'DAILY_LIMIT_REACHED') {
                alert(PAGE_STRINGS[pageLang].dailyLimitReached(DAILY_LIMIT));
            } else {
                alert(PAGE_STRINGS[pageLang].updateFailed);
            }
        }
    } catch (error) {
        console.error('업데이트 에러:', error);
        alert('서버 연결 오류로 업데이트에 실패했습니다.');
    }
}

function scrollToLetter(letter) {
    // If list is filtered or searched, clear search to ensure all groups are present
    const searchInput = document.getElementById('searchInput');
    if (searchInput.value !== '') {
        searchInput.value = '';
        renderList(alberguesData);
    }
    
    const target = document.getElementById(`group-${letter}`);
    if (target) {
        // On mobile, we need to account for sticky headers
        const headerOffset = window.innerWidth <= 900 ? 550 : 150; 
        const elementPosition = target.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
            top: offsetPosition,
            behavior: "smooth"
        });
        
        // Highlight the group header briefly
        target.style.color = 'var(--red)';
        setTimeout(() => { target.style.color = 'var(--primary)'; }, 2000);
    }
}

// Helper: Get readable text for status
function getStatusText(status) {
    const statusMap = STATUS_TEXT_BY_LANG[pageLang];
    return statusMap[status] || statusMap.gray;
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

// Mobile Interaction Logic
function handleMobileView() {
    if (window.innerWidth <= 900) {
        document.querySelector('.map-section').scrollIntoView({ behavior: 'smooth' });
    }
}

// Ensure clicking a hostel in the list scrolls to map on mobile
const originalFocusMapMarker_fn = focusMapMarker;
window.focusMapMarker = function(id, lat, lng) {
    originalFocusMapMarker_fn(id, lat, lng);
    handleMobileView();
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
    setPageLang(pageLang); // apply saved/default language to static UI text
    deviceId = getOrCreateDeviceId();
    refreshCurrentPosition().then(() => renderList()); // silent — just the browser's native prompt
    updateDailyCounter();
    fetchAlbergues().then(() => {
        setupSearch();
        initAlphabetIndex();
        setupGeolocation();
    });
});


// ======== New Features: Search & Index ============

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const autocompleteList = document.getElementById('autocompleteList');
    let currentFocus = -1;
    
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
        currentFocus = -1;

        // Clear autocomplete
        autocompleteList.innerHTML = '';

        if (!query || query === 'all') {
            document.querySelectorAll('.alpha-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelector('.alpha-btn').classList.add('active'); // Set 'All' to active
            autocompleteList.classList.remove('active');
            renderList(alberguesData);
            return;
        }

        // Remove active state from alphabet buttons (non-empty query)
        document.querySelectorAll('.alpha-btn').forEach(btn => btn.classList.remove('active'));

        // 1. Populate Autocomplete Dropdown with matching Cities that START with or CONTAIN the query
        const matchingCities = cityList.filter(city => city.toLowerCase().includes(query));
        
        if (matchingCities.length > 0) {
            autocompleteList.classList.add('active');
            matchingCities.forEach((city, index) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'autocomplete-item';
                
                // Highlight matching part
                const matchIndex = city.toLowerCase().indexOf(query);
                const before = city.substring(0, matchIndex);
                const middle = city.substring(matchIndex, matchIndex + query.length);
                const after = city.substring(matchIndex + query.length);
                
                itemDiv.innerHTML = `${before}<b>${middle}</b>${after}`;
                
                itemDiv.addEventListener('click', () => {
                    selectCity(city);
                });
                autocompleteList.appendChild(itemDiv);
            });
        } else {
            autocompleteList.classList.remove('active');
        }

        // 2. Render the actual list below (live searching)
        const filtered = alberguesData.filter(item => {
            const match = item.name.match(/\(([^)]+)\)/);
            return (match && match[1] && match[1].toLowerCase().includes(query)) || 
                   item.name.toLowerCase().includes(query);
        });
        renderList(filtered);
    });

    // Keyboard navigation
    searchInput.addEventListener('keydown', function(e) {
        const items = autocompleteList.getElementsByTagName('div');
        if (e.key === 'ArrowDown') {
            currentFocus++;
            addActive(items);
        } else if (e.key === 'ArrowUp') {
            currentFocus--;
            addActive(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentFocus > -1) {
                if (items[currentFocus]) items[currentFocus].click();
            }
        }
    });

    function addActive(items) {
        if (!items) return false;
        removeActive(items);
        if (currentFocus >= items.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (items.length - 1);
        items[currentFocus].classList.add('active');
        items[currentFocus].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function removeActive(items) {
        for (let i = 0; i < items.length; i++) {
            items[i].classList.remove('active');
        }
    }

    function selectCity(city) {
        searchInput.value = city;
        autocompleteList.classList.remove('active');
        
        // Render full list and scroll to the city
        renderList(alberguesData);
        
        // Find the first albergue of this city
        const cityIndexChar = city.charAt(0).toUpperCase();
        const cityPattern = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\(${cityPattern}\\)`, 'i');
        
        const firstAlbergue = alberguesData.find(item => regex.test(item.name));
        
        if (firstAlbergue) {
            // Give the browser a moment to render the list
            setTimeout(() => {
                const groupHeader = document.getElementById(`group-${cityIndexChar}`);
                if (groupHeader) groupHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
                
                // Find all cards for this city and highlight them
                const cards = document.querySelectorAll('.card');
                cards.forEach(card => {
                    if (card.innerText.includes(`(${city})`)) {
                        card.classList.add('card-highlight');
                        setTimeout(() => card.classList.remove('card-highlight'), 3000);
                    }
                });
            }, 100);
        }
    }

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
        const listContainer = document.getElementById('albergueList');
        listContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    scrollToLetter(letter);
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

// Current Location Logic
function setupGeolocation() {
    const locateBtn = document.getElementById('locateBtn');
    if (!locateBtn) return;

    locateBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert(PAGE_STRINGS[pageLang].geoNotSupported);
            return;
        }

        const originalText = locateBtn.innerHTML;
        locateBtn.innerHTML = '⌛'; // Show loading
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;

                currentPos = { lat: latitude, lng: longitude };
                renderList();

                // Add or move a specific marker for current location
                if (window.myLocationMarker) {
                    window.myLocationMarker.setLatLng([latitude, longitude]);
                } else {
                    const myIcon = L.divIcon({
                        className: 'my-location-marker',
                        html: '<div class="pulse"></div>',
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    });
                    window.myLocationMarker = L.marker([latitude, longitude], { icon: myIcon }).addTo(map);
                }

                map.setView([latitude, longitude], 15);
                locateBtn.innerHTML = originalText;
            },
            (error) => {
                console.error('Geolocation error:', error);
                const msg = error.code === 1 ? PAGE_STRINGS[pageLang].geoDenied : PAGE_STRINGS[pageLang].geoUnable;
                alert(msg);
                locateBtn.innerHTML = originalText;
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}
