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
        // Sort alphabetically by city name (the part in parentheses)
        alberguesData.sort((a, b) => {
            const cityA = a.name.match(/\(([^()]*?)\)/)?.[1]?.trim() || "Z";
            const cityB = b.name.match(/\(([^()]*?)\)/)?.[1]?.trim() || "Z";
            return cityA.localeCompare(cityB);
        });

        document.getElementById('count').textContent = data.length;
        renderMapMarkers();
        renderList();
        initAlphabetIndex();
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

function scrollToLetter(letter) {
    const container = document.getElementById('albergueList');
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

// Mobile Interaction Logic
function handleMobileView(item) {
    if (window.innerWidth <= 900) {
        // Scroll to map top when clicking list item
        document.querySelector('.map-section').scrollIntoView({ behavior: 'smooth' });
    }
}

// Ensure clicking a hostel in the list scrolls to map on mobile
const originalFocusMapMarker = focusMapMarker;
focusMapMarker = function(id, lat, lng) {
    originalFocusMapMarker(id, lat, lng);
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
    fetchAlbergues().then(() => {
        setupSearch();
        initAlphabetIndex();
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
        
        // Remove active state from alphabet buttons
        document.querySelectorAll('.alpha-btn').forEach(btn => btn.classList.remove('active'));

        // Clear autocomplete
        autocompleteList.innerHTML = '';
        
        if (!query || query === 'all') {
            document.querySelectorAll('.alpha-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelector('.alpha-btn').classList.add('active'); // Set 'All' to active
            autocompleteList.classList.remove('active');
            renderList(alberguesData);
            return;
        }

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
