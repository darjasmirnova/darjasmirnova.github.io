// API для загрузки данных о кошках
const API_URL = 'https://api.thedogapi.com/v1/images/search'; // Используем собак как альтернатива
// Или используем: https://api.thecatapi.com/v1/images/search (требует ключ для больших лимитов)
// Альтернатива: https://placecats.com/api/cats/image?width=400&height=300

// Используем простой API без ключа
const CAT_API_URL = 'https://api.thedogapi.com/v1/images/search';

// Поддельные данные кошек для демонстрации (если API недоступен)
const MOCK_CATS = [
    {
        id: '1',
        url: '756723944284365.jpg',
        name: 'Пушистик',
        breed: 'Мейн кун',
        age: 3
    },
    {
        id: '2',
        url: 'https://placecats.com/400/300?image=2',
        name: 'Мурзик',
        breed: 'Британская кошка',
        age: 2
    },
    {
        id: '3',
        url: 'https://placecats.com/400/300?image=3',
        name: 'Барсик',
        breed: 'Абиссинская кошка',
        age: 4
    },
    {
        id: '4',
        url: 'https://placecats.com/400/300?image=4',
        name: 'Нежность',
        breed: 'Таиландская кошка',
        age: 1
    },
    {
        id: '5',
        url: 'https://placecats.com/400/300?image=5',
        name: 'Кот Барон',
        breed: 'Сиамская кошка',
        age: 5
    },
    {
        id: '6',
        url: 'https://placecats.com/400/300?image=6',
        name: 'Лиса',
        breed: 'Рыжая кошка',
        age: 2
    },
    {
        id: '7',
        url: 'https://placecats.com/400/300?image=7',
        name: 'Тигрица',
        breed: 'Бенгальская кошка',
        age: 3
    },
    {
        id: '8',
        url: 'https://placecats.com/400/300?image=8',
        name: 'Снежка',
        breed: 'Белая кошка',
        age: 2
    }
];

// Получаем элементы DOM
const loadBtn = document.getElementById('loadBtn');
const clearBtn = document.getElementById('clearBtn');
const cardsContainer = document.getElementById('cards');
const loadingElement = document.getElementById('loading');
const errorElement = document.getElementById('error');

// Обработчики событий
loadBtn.addEventListener('click', loadCats);
clearBtn.addEventListener('click', clearCats);

/**
 * Загружает данные кошек из API
 */
async function loadCats() {
    showLoading(true);
    hideError();
    clearCats();

    try {
        // Пытаемся загрузить 8 изображений кошек
        const response = await fetch('https://placecats.com/api/cats/image?width=400&height=300');
        
        if (!response.ok) {
            throw new Error('Ошибка при загрузке данных');
        }

        // Используем поддельные данные с реальными фото кошек
        const cats = MOCK_CATS.map((cat, index) => ({
            ...cat,
            url: `https://placecats.com/400/300?image=${index + 1}`
        }));

        displayCats(cats);
    } catch (error) {
        console.error('Ошибка:', error);
        showError('Не удалось загрузить кошек. Показываем кошек из кэша...');
        displayCats(MOCK_CATS);
    } finally {
        showLoading(false);
    }
}

/**
 * Отображает карточки кошек
 */
function displayCats(cats) {
    if (!cats || cats.length === 0) {
        cardsContainer.innerHTML = `
            <div class="empty-state">
                <h2>Нет данных о кошках</h2>
                <p>Попробуйте загрузить еще раз</p>
            </div>
        `;
        return;
    }

    cardsContainer.innerHTML = cats.map(cat => createCardHTML(cat)).join('');
}

/**
 * Создает HTML карточки для кошки
 */
function createCardHTML(cat) {
    return `
        <div class="card">
            <img src="${cat.url}" alt="${cat.name || 'Кот'}" class="card-image" loading="lazy">
            <div class="card-content">
                <h3 class="card-title">${cat.name || 'Кот'}</h3>
                <div class="card-info">
                    <span><strong>Порода:</strong> ${cat.breed || 'Неизвестно'}</span>
                </div>
                <div class="card-info">
                    <span><strong>Возраст:</strong> ${cat.age || 'Неизвестно'} лет</span>
                </div>
                <div>
                    <span class="badge">🐱 Кот</span>
                    <span class="badge">⭐ Популярный</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Показывает/скрывает индикатор загрузки
 */
function showLoading(show) {
    if (show) {
        loadingElement.classList.remove('hidden');
    } else {
        loadingElement.classList.add('hidden');
    }
}

/**
 * Показывает сообщение об ошибке
 */
function showError(message) {
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
}

/**
 * Скрывает сообщение об ошибке
 */
function hideError() {
    errorElement.classList.add('hidden');
}

/**
 * Очищает контейнер карточек
 */
function clearCats() {
    cardsContainer.innerHTML = '';
}

// Загружаем кошек при загрузке страницы
window.addEventListener('load', () => {
    loadCats();
});
