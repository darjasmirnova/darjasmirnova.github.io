class PacmanGame {
    constructor() {
        this.setupDOM();
        this.initMaze();
        this.resetGameState();
        this.setupEventListeners();
        this.renderMaze();
    }

    setupDOM() {
        this.gameBoard = document.getElementById('gameBoard');
        this.scoreDisplay = document.getElementById('score');
        this.levelDisplay = document.getElementById('level');
        this.livesDisplay = document.getElementById('lives');
        this.messageDisplay = document.getElementById('message');
        this.startBtn = document.getElementById('startBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.resetBtn = document.getElementById('resetBtn');

        this.startBtn.addEventListener('click', () => this.startGame());
        this.pauseBtn.addEventListener('click', () => this.togglePause());
        this.resetBtn.addEventListener('click', () => this.resetGame());
    }

    initMaze() {
        this.maze = [
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,0,0,0,0,0,0,0,0,0,0,0,0,1],
            [1,0,1,1,0,1,1,1,1,0,1,1,0,1],
            [1,0,1,1,0,1,1,1,1,0,1,1,0,1],
            [1,0,0,0,0,0,0,0,0,0,0,0,0,1],
            [1,0,1,1,0,1,0,1,1,0,1,1,0,1],
            [1,0,0,0,0,1,0,0,0,0,0,0,0,1],
            [1,0,1,1,1,1,1,1,1,1,1,1,0,1],
            [1,0,0,0,0,0,0,0,0,0,0,0,0,1],
            [1,0,1,1,0,1,1,1,1,0,1,1,0,1],
            [1,0,0,0,0,0,0,0,0,0,0,0,0,1],
            [1,0,1,1,0,1,1,1,1,0,1,1,0,1],
            [1,0,1,1,0,1,1,1,1,0,1,1,0,1],
            [1,0,0,0,0,0,0,0,0,0,0,0,0,1],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1]
        ];

        this.rows = this.maze.length;
        this.cols = this.maze[0].length;

        // Initialize tiles
        this.tiles = Array(this.rows).fill(null).map(() => Array(this.cols).fill(null));
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                this.tiles[y][x] = {
                    isWall: this.maze[y][x] === 1,
                    hasPellet: this.maze[y][x] === 0,
                    hasPowerPellet: false
                };
            }
        }

        // Add power pellets in corners
        this.tiles[1][1].hasPellet = false;
        this.tiles[1][1].hasPowerPellet = true;
        this.tiles[1][this.cols - 2].hasPellet = false;
        this.tiles[1][this.cols - 2].hasPowerPellet = true;
        this.tiles[this.rows - 2][1].hasPellet = false;
        this.tiles[this.rows - 2][1].hasPowerPellet = true;
        this.tiles[this.rows - 2][this.cols - 2].hasPellet = false;
        this.tiles[this.rows - 2][this.cols - 2].hasPowerPellet = true;
    }

    resetGameState() {
        this.score = 0;
        this.level = 1;
        this.lives = 3;
        this.gameActive = false;
        this.gamePaused = false;
        this.speed = 180;
        this.speedIncreaseTimer = 0;
        this.speedIncreaseInterval = 10000; // Each 10 seconds

        this.pacman = {
            x: 1,
            y: 1,
            direction: 'right',
            nextDirection: 'right'
        };

        this.ghosts = [
            { x: 6, y: 6, color: 'red', startX: 6, startY: 6, image: 'pacman2.svg' },
            { x: 6, y: 7, color: 'pink', startX: 6, startY: 7, image: 'pacman3.svg' },
            { x: 7, y: 6, color: 'cyan', startX: 7, startY: 6, image: 'pacman4.svg' },
            { x: 7, y: 7, color: 'orange', startX: 7, startY: 7, image: 'pacman5.svg' }
        ];

        this.pelletsEaten = 0;
        this.totalPellets = this.countPellets();
        this.gameLoops = [];
        this.animationFrameId = null;
        this.lastRenderTime = null;
        this.pacmanMoveTimer = 0;
        this.ghostMoveTimer = 0;
        
        // Character elements for smooth movement
        this.pacmanElement = null;
        this.ghostElements = [];
    }

    countPellets() {
        let count = 0;
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.tiles[y][x].hasPellet || this.tiles[y][x].hasPowerPellet) {
                    count++;
                }
            }
        }
        return count;
    }

    setupEventListeners() {
        this.keys = {};
        document.addEventListener('keydown', (e) => {
            this.handleKeyDown(e);
        });
        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    handleKeyDown(e) {
        if (!this.gameActive) return;

        const key = e.key.toLowerCase();
        switch(key) {
            case 'arrowup':
            case 'w':
                e.preventDefault();
                this.pacman.nextDirection = 'up';
                break;
            case 'arrowdown':
            case 's':
                e.preventDefault();
                this.pacman.nextDirection = 'down';
                break;
            case 'arrowleft':
            case 'a':
                e.preventDefault();
                this.pacman.nextDirection = 'left';
                break;
            case 'arrowright':
            case 'd':
                e.preventDefault();
                this.pacman.nextDirection = 'right';
                break;
        }
    }

    isWalkable(x, y) {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return false;
        return !this.tiles[y][x].isWall;
    }

    getNextPosition(x, y, direction) {
        const deltas = {
            up: { dx: 0, dy: -1 },
            down: { dx: 0, dy: 1 },
            left: { dx: -1, dy: 0 },
            right: { dx: 1, dy: 0 }
        };
        const delta = deltas[direction];
        return { x: x + delta.dx, y: y + delta.dy };
    }

    movePacman() {
        // Try to move in preferred direction
        let newPos = this.getNextPosition(this.pacman.x, this.pacman.y, this.pacman.nextDirection);

        if (this.isWalkable(newPos.x, newPos.y)) {
            this.pacman.direction = this.pacman.nextDirection;
            this.pacman.x = newPos.x;
            this.pacman.y = newPos.y;
        } else {
            // Try to continue in current direction
            newPos = this.getNextPosition(this.pacman.x, this.pacman.y, this.pacman.direction);
            if (this.isWalkable(newPos.x, newPos.y)) {
                this.pacman.x = newPos.x;
                this.pacman.y = newPos.y;
            }
        }

        this.eatPellet();
    }

    eatPellet() {
        const tile = this.tiles[this.pacman.y][this.pacman.x];
        const pelletEl = this.gameBoard.querySelector(`[data-x="${this.pacman.x}"][data-y="${this.pacman.y}"] .pellet`);
        const powerPelletEl = this.gameBoard.querySelector(`[data-x="${this.pacman.x}"][data-y="${this.pacman.y}"] .power-pellet`);

        if (tile.hasPellet && pelletEl) {
            tile.hasPellet = false;
            pelletEl.classList.add('eaten');
            setTimeout(() => pelletEl.remove(), 300);
            this.score += 10;
            this.pelletsEaten++;
            this.updateDisplay();
        }
        if (tile.hasPowerPellet && powerPelletEl) {
            tile.hasPowerPellet = false;
            powerPelletEl.classList.add('eaten');
            setTimeout(() => powerPelletEl.remove(), 300);
            this.score += 50;
            this.pelletsEaten++;
            this.updateDisplay();
        }
    }

    moveGhosts() {
        this.ghosts.forEach(ghost => {
            const newPos = this.findBestMove(ghost);
            ghost.x = newPos.x;
            ghost.y = newPos.y;
        });
    }

    findBestMove(ghost) {
        const directions = ['up', 'down', 'left', 'right'];
        let bestMove = null;
        let bestDistance = Infinity;

        directions.forEach(dir => {
            const newPos = this.getNextPosition(ghost.x, ghost.y, dir);
            if (this.isWalkable(newPos.x, newPos.y)) {
                const distance = Math.hypot(newPos.x - this.pacman.x, newPos.y - this.pacman.y);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMove = newPos;
                }
            }
        });

        return bestMove || { x: ghost.x, y: ghost.y };
    }

    checkCollisions() {
        for (let ghost of this.ghosts) {
            if (ghost.x === this.pacman.x && ghost.y === this.pacman.y) {
                this.loseLife();
                return;
            }
        }
    }

    loseLife() {
        this.lives--;
        this.updateDisplay();

        if (this.lives <= 0) {
            this.gameOver();
        } else {
            this.resetPositions();
        }
    }

    resetPositions() {
        this.pacman.x = 1;
        this.pacman.y = 1;
        this.pacman.direction = 'right';
        this.pacman.nextDirection = 'right';

        this.ghosts.forEach(ghost => {
            ghost.x = ghost.startX;
            ghost.y = ghost.startY;
        });
        
        this.updateCharacterPositions();
    }

    checkWinCondition() {
        if (this.pelletsEaten >= this.totalPellets) {
            this.levelUp();
        }
    }

    levelUp() {
        this.level++;
        this.speed = Math.max(60, this.speed - 20);
        this.messageDisplay.textContent = `🎉 УРОВЕНЬ ${this.level}!`;

        this.stopGameLoop();

        setTimeout(() => {
            if (this.gameActive) {
                this.resetPositions();
                this.initMaze();
                this.pelletsEaten = 0;
                this.totalPellets = this.countPellets();
                this.messageDisplay.textContent = '';
                this.renderMaze();
                this.pacmanMoveTimer = 0;
                this.ghostMoveTimer = 0;
                this.speedIncreaseTimer = 0;
                this.startGameLoop();
            }
        }, 2000);
    }

    gameOver() {
        this.gameActive = false;
        this.messageDisplay.textContent = `💀 GAME OVER!\nОчки: ${this.score}`;
        this.stopGameLoop();
        this.updateButtons();
    }

    startGame() {
        if (this.gameActive) return;

        this.resetGameState();
        this.gameActive = true;
        this.gamePaused = false;
        this.messageDisplay.textContent = '';
        this.updateDisplay();
        this.updateButtons();
        this.renderMaze();
        this.startGameLoop();
    }

    togglePause() {
        if (!this.gameActive) return;

        this.gamePaused = !this.gamePaused;
        this.messageDisplay.textContent = this.gamePaused ? '⏸️ ПАУЗА' : '';
        this.updateButtons();
    }

    resetGame() {
        this.stopGameLoop();
        this.resetGameState();
        this.initMaze();
        this.messageDisplay.textContent = '';
        this.updateDisplay();
        this.updateButtons();
        this.renderMaze();
    }

    startGameLoop() {
        this.stopGameLoop();

        this.pacmanMoveTimer = 0;
        this.ghostMoveTimer = 0;
        this.speedIncreaseTimer = 0;
        this.lastRenderTime = Date.now();

        const gameLoop = () => {
            if (!this.gameActive) {
                this.animationFrameId = null;
                return;
            }

            const currentTime = Date.now();
            const deltaTime = currentTime - (this.lastRenderTime || currentTime);
            this.lastRenderTime = currentTime;

            if (!this.gamePaused) {
                // Gradually increase speed over time
                this.speedIncreaseTimer += deltaTime;
                if (this.speedIncreaseTimer >= this.speedIncreaseInterval) {
                    this.speed = Math.max(70, this.speed - 8);
                    this.speedIncreaseTimer = 0;
                }

                // Update Pacman
                this.pacmanMoveTimer += deltaTime;
                if (this.pacmanMoveTimer >= this.speed) {
                    this.movePacman();
                    this.checkCollisions();
                    this.checkWinCondition();
                    this.pacmanMoveTimer = 0;
                }

                // Update Ghosts
                this.ghostMoveTimer += deltaTime;
                if (this.ghostMoveTimer >= this.speed * 1.4) {
                    this.moveGhosts();
                    this.checkCollisions();
                    this.ghostMoveTimer = 0;
                }
            }

            // Always render to keep animations smooth
            this.render();
            this.animationFrameId = requestAnimationFrame(gameLoop);
        };

        this.animationFrameId = requestAnimationFrame(gameLoop);
    }

    stopGameLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.gameLoops.forEach(loop => clearInterval(loop));
        this.gameLoops = [];
    }

    updateDisplay() {
        this.scoreDisplay.textContent = this.score;
        this.levelDisplay.textContent = this.level;
        this.livesDisplay.textContent = '❤️'.repeat(Math.max(0, this.lives));
    }

    updateButtons() {
        this.startBtn.disabled = this.gameActive;
        this.pauseBtn.disabled = !this.gameActive;
        this.pauseBtn.textContent = this.gamePaused ? '▶️ ПРОДОЛЖИТЬ' : '⏸️ ПАУЗА';
    }

    renderMaze() {
        this.gameBoard.innerHTML = '';

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const tile = document.createElement('div');
                tile.className = 'tile';
                tile.setAttribute('data-x', x);
                tile.setAttribute('data-y', y);

                if (this.tiles[y][x].isWall) {
                    tile.classList.add('wall');
                } else {
                    if (this.tiles[y][x].hasPellet) {
                        const pellet = document.createElement('div');
                        pellet.className = 'pellet';
                        tile.appendChild(pellet);
                    }
                    if (this.tiles[y][x].hasPowerPellet) {
                        const powerPellet = document.createElement('div');
                        powerPellet.className = 'power-pellet';
                        tile.appendChild(powerPellet);
                    }
                }

                this.gameBoard.appendChild(tile);
            }
        }
        
        // Create character elements
        this.createCharacterElements();
    }

    render() {
        // Update positions smoothly using transform
        this.updateCharacterPositions();
    }

    createCharacterElements() {
        // Remove old elements if they exist
        if (this.pacmanElement) this.pacmanElement.remove();
        this.ghostElements.forEach(el => el.remove());
        this.ghostElements = [];
        
        // Create Pacman element
        this.pacmanElement = document.createElement('div');
        this.pacmanElement.className = 'pacman';
        this.pacmanElement.style.backgroundImage = 'url(pacman.svg)';
        this.pacmanElement.style.left = '0';
        this.pacmanElement.style.top = '0';
        this.gameBoard.appendChild(this.pacmanElement);
        
        // Create Ghost elements
        this.ghosts.forEach((ghost, index) => {
            const ghostEl = document.createElement('div');
            ghostEl.className = `ghost ${ghost.color}`;
            ghostEl.style.backgroundImage = `url(${ghost.image})`;
            ghostEl.style.left = '0';
            ghostEl.style.top = '0';
            this.gameBoard.appendChild(ghostEl);
            this.ghostElements.push(ghostEl);
        });
        
        // Initial position update
        this.updateCharacterPositions();
    }
    
    updateCharacterPositions() {
        if (!this.pacmanElement) return;
        
        const cellWidth = 100 / this.cols;
        const cellHeight = 100 / this.rows;
        
        // Update Pacman position
        const pacmanX = this.pacman.x * cellWidth;
        const pacmanY = this.pacman.y * cellHeight;
        const rotation = this.getRotation(this.pacman.direction);
        this.pacmanElement.style.transform = `translate(${pacmanX}%, ${pacmanY}%) ${rotation}`;
        
        // Update Ghost positions
        this.ghosts.forEach((ghost, index) => {
            if (this.ghostElements[index]) {
                const ghostX = ghost.x * cellWidth;
                const ghostY = ghost.y * cellHeight;
                this.ghostElements[index].style.transform = `translate(${ghostX}%, ${ghostY}%)`;
            }
        });
    }

    getRotation(direction) {
        const rotations = {
            right: 'rotate(0deg)',
            down: 'rotate(90deg)',
            left: 'rotate(180deg)',
            up: 'rotate(270deg)'
        };
        return rotations[direction];
    }
}

// Start game when page loads
window.addEventListener('load', () => {
    new PacmanGame();
});
