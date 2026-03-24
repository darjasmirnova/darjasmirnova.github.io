const loadBtn = document.getElementById('loadBtn');
const catsContainer = document.getElementById('catsContainer');
const loading = document.getElementById('loading');
const error = document.getElementById('error');

const USER_HOVER_IMAGES = [
    '/img/Group%204.svg',
    '/img/Group%205.svg',
    '/img/Group%206.svg',
    '/img/Group%207.svg',
    '/img/Group%208.svg'
];

loadBtn.addEventListener('click', fetchCats);

async function fetchCats() {
    try {
        // Show loading, hide error and clear results
        loading.style.display = 'block';
        error.style.display = 'none';
        catsContainer.innerHTML = '';
        loadBtn.disabled = true;

        const response = await fetch('/api/cats');
        
        if (!response.ok) {
            throw new Error('Failed to fetch cats');
        }

        const cats = await response.json();
        loading.style.display = 'none';
        displayCats(cats);

    } catch (err) {
        loading.style.display = 'none';
        error.style.display = 'block';
        error.textContent = '❌ Error loading cats: ' + err.message;
        console.error('Error:', err);
    } finally {
        loadBtn.disabled = false;
    }
}

function displayCats(cats) {
    if (cats.length === 0) {
        catsContainer.innerHTML = '<p style="color: white; text-align: center; grid-column: 1/-1;">No cats found</p>';
        return;
    }

    cats.forEach((cat, index) => {
        const catCard = createCatCard(cat, index);
        catsContainer.appendChild(catCard);
    });
}

function createCatCard(cat, index) {
    const card = document.createElement('div');
    card.className = 'cat-card';

    const hoverImage = USER_HOVER_IMAGES[index % USER_HOVER_IMAGES.length];

    card.innerHTML = `
        <img src="${cat.url}" alt="${cat.breed}" class="cat-image" onerror="this.src='https://via.placeholder.com/300?text=Image+Not+Available'">
        <div class="cat-info">
            <div class="cat-breed">${escapeHtml(cat.breed)}</div>
            <div class="cat-description">${escapeHtml(cat.description)}</div>
        </div>
    `;

    const image = card.querySelector('.cat-image');
    image.dataset.originalSrc = cat.url;
    image.dataset.hoverSrc = hoverImage;

    image.addEventListener('mouseenter', () => {
        image.src = image.dataset.hoverSrc;
    });

    image.addEventListener('mouseleave', () => {
        image.src = image.dataset.originalSrc;
    });

    return card;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Load cats on page load
window.addEventListener('load', () => {
    fetchCats();
});
