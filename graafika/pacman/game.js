class PacmanGame {
    constructor() {
        this.setupDOM();
        this.initGame();
        this.setupEventListeners();
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
    }

    initGame() {
        // Maze layout (1 = wall, 0 = path)
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
        this.cellSize = 100 / this.cols; // percentage

        this.resetGame();
    }

    resetGame() {
        this.score = 0;
        this.level = 1;
        this.lives = 3;
        this.gameActive = false;
        this.gamePaused = false;
        this.baseSpeed = 5.0; // cells per second (increased)
        this.currentSpeed = this.baseSpeed;
        this.gameTime = 0; // Track total game time for speed increase

        // Pacman with real coordinates
        this.pacman = {
            gridX: 1,
            gridY: 1,
            x: 1,
            y: 1,
            direction: { x: 1, y: 0 },
            nextDirection: { x: 1, y: 0 }
        };

        // Ghosts positioned in open areas around center
        this.ghosts = [
            { gridX: 5, gridY: 8, x: 5, y: 8, direction: { x: -1, y: 0 }, color: 'red', image: 'pacman2.svg' },
            { gridX: 9, gridY: 8, x: 9, y: 8, direction: { x: 1, y: 0 }, color: 'pink', image: 'pacman3.svg' },
            { gridX: 7, gridY: 6, x: 7, y: 6, direction: { x: 0, y: -1 }, color: 'cyan', image: 'pacman4.svg' },
            { gridX: 7, gridY: 10, x: 7, y: 10, direction: { x: 0, y: 1 }, color: 'orange', image: 'pacman5.svg' }
        ];

        this.initPellets();
        this.updateDisplay();
        this.renderMaze();
    }

    initPellets() {
        this.pellets = [];
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.maze[y][x] === 0) {
                    // Power pellets in corners
                    if ((x === 1 && y === 1) || (x === this.cols - 2 && y === 1) ||
                        (x === 1 && y === this.rows - 2) || (x === this.cols - 2 && y === this.rows - 2)) {
                        this.pellets.push({ x, y, power: true, eaten: false });
                    } else {
                        this.pellets.push({ x, y, power: false, eaten: false });
                    }
                }
            }
        }
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.startBtn.addEventListener('click', () => this.startGame());
        this.pauseBtn.addEventListener('click', () => this.togglePause());
        this.resetBtn.addEventListener('click', () => {
            this.stopGame();
            this.resetGame();
        });
    }

    handleKeyDown(e) {
        if (!this.gameActive || this.gamePaused) return;

        const key = e.key.toLowerCase();
        let newDirection = null;

        switch(key) {
            case 'arrowup':
            case 'w':
                e.preventDefault();
                newDirection = { x: 0, y: -1 };
                break;
            case 'arrowdown':
            case 's':
                e.preventDefault();
                newDirection = { x: 0, y: 1 };
                break;
            case 'arrowleft':
            case 'a':
                e.preventDefault();
                newDirection = { x: -1, y: 0 };
                break;
            case 'arrowright':
            case 'd':
                e.preventDefault();
                newDirection = { x: 1, y: 0 };
                break;
        }

        if (newDirection) {
            this.pacman.nextDirection = newDirection;
        }
    }

    startGame() {
        if (this.gameActive) return;

        this.gameActive = true;
        this.gamePaused = false;
        this.messageDisplay.textContent = '';
        this.updateButtons();
        this.createCharacters();
        this.lastTime = performance.now();
        this.gameLoop();
    }

    stopGame() {
        this.gameActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    togglePause() {
        if (!this.gameActive) return;
        this.gamePaused = !this.gamePaused;
        this.messageDisplay.textContent = this.gamePaused ? '⏸️ PAUSED' : '';
        this.updateButtons();
        if (!this.gamePaused) {
            this.lastTime = performance.now();
            this.gameLoop();
        }
    }

    gameLoop() {
        if (!this.gameActive) return;
        if (this.gamePaused) return;

        const currentTime = performance.now();
        const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1); // Cap deltaTime to prevent issues
        this.lastTime = currentTime;

        // Track game time and gradually increase speed
        this.gameTime += deltaTime;
        const speedIncrease = Math.floor(this.gameTime / 10) * 0.5; // +0.5 cells/sec every 10 seconds
        this.currentSpeed = this.baseSpeed + speedIncrease + (this.level - 1) * 1.0;

        this.updatePacman(deltaTime);
        this.updateGhosts(deltaTime);
        this.checkCollisions();
        this.checkPellets();
        this.render();

        this.animationId = requestAnimationFrame(() => this.gameLoop());
    }

    updatePacman(deltaTime) {
        const speed = this.currentSpeed * deltaTime;

        // Try to turn
        const nextGridX = Math.round(this.pacman.x + this.pacman.nextDirection.x * 0.5);
        const nextGridY = Math.round(this.pacman.y + this.pacman.nextDirection.y * 0.5);

        // If close to grid center and can turn
        const distToGridX = Math.abs(this.pacman.x - Math.round(this.pacman.x));
        const distToGridY = Math.abs(this.pacman.y - Math.round(this.pacman.y));

        if (distToGridX < 0.1 && distToGridY < 0.1) {
            if (this.canMove(nextGridX, nextGridY)) {
                this.pacman.direction = { ...this.pacman.nextDirection };
            }
        }

        // Move in current direction
        const newX = this.pacman.x + this.pacman.direction.x * speed;
        const newY = this.pacman.y + this.pacman.direction.y * speed;

        // Check if can move
        const targetGridX = Math.round(newX);
        const targetGridY = Math.round(newY);

        if (this.canMove(targetGridX, targetGridY)) {
            this.pacman.x = newX;
            this.pacman.y = newY;
            this.pacman.gridX = Math.round(this.pacman.x);
            this.pacman.gridY = Math.round(this.pacman.y);
        } else {
            // Snap to grid
            this.pacman.x = Math.round(this.pacman.x);
            this.pacman.y = Math.round(this.pacman.y);
        }
    }

    updateGhosts(deltaTime) {
        const speed = this.currentSpeed * deltaTime * 0.8; // Ghosts slightly slower

        this.ghosts.forEach(ghost => {
            // Simple AI: move toward pacman when at grid intersection
            const distToGridX = Math.abs(ghost.x - Math.round(ghost.x));
            const distToGridY = Math.abs(ghost.y - Math.round(ghost.y));

            if (distToGridX < 0.15 && distToGridY < 0.15) {
                const gridX = Math.round(ghost.x);
                const gridY = Math.round(ghost.y);

                // Find best direction toward pacman
                const directions = [
                    { x: 0, y: -1 },
                    { x: 0, y: 1 },
                    { x: -1, y: 0 },
                    { x: 1, y: 0 }
                ];

                let bestDir = null;
                let bestDist = Infinity;
                const possibleDirs = [];

                directions.forEach(dir => {
                    const newGridX = gridX + dir.x;
                    const newGridY = gridY + dir.y;

                    // Don't go backward unless stuck
                    const isBackward = dir.x === -ghost.direction.x && dir.y === -ghost.direction.y;

                    if (this.canMove(newGridX, newGridY)) {
                        possibleDirs.push(dir);
                        if (!isBackward || possibleDirs.length === 1) {
                            const dist = Math.hypot(
                                newGridX - this.pacman.gridX,
                                newGridY - this.pacman.gridY
                            );
                            if (dist < bestDist) {
                                bestDist = dist;
                                bestDir = dir;
                            }
                        }
                    }
                });

                // If we found a valid direction, use it
                if (bestDir) {
                    ghost.direction = bestDir;
                } else if (possibleDirs.length > 0) {
                    // If stuck, take any available direction
                    ghost.direction = possibleDirs[0];
                }
            }

            // Move in current direction
            const newX = ghost.x + ghost.direction.x * speed;
            const newY = ghost.y + ghost.direction.y * speed;

            const targetGridX = Math.round(newX);
            const targetGridY = Math.round(newY);

            if (this.canMove(targetGridX, targetGridY)) {
                ghost.x = newX;
                ghost.y = newY;
                ghost.gridX = Math.round(ghost.x);
                ghost.gridY = Math.round(ghost.y);
            } else {
                // Snap to grid if hitting wall
                ghost.x = Math.round(ghost.x);
                ghost.y = Math.round(ghost.y);
            }
        });
    }

    canMove(x, y) {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return false;
        return this.maze[y][x] === 0;
    }

    checkCollisions() {
        this.ghosts.forEach(ghost => {
            const dist = Math.hypot(ghost.x - this.pacman.x, ghost.y - this.pacman.y);
            if (dist < 0.5) {
                this.loseLife();
            }
        });
    }

    checkPellets() {
        this.pellets.forEach(pellet => {
            if (!pellet.eaten) {
                const dist = Math.hypot(pellet.x - this.pacman.x, pellet.y - this.pacman.y);
                if (dist < 0.4) {
                    pellet.eaten = true;
                    this.score += pellet.power ? 50 : 10;
                    this.updateDisplay();

                    // Remove pellet from DOM
                    const pelletEl = document.querySelector(`[data-pellet-x="${pellet.x}"][data-pellet-y="${pellet.y}"]`);
                    if (pelletEl) {
                        pelletEl.style.animation = 'pellet-disappear 0.3s ease-out forwards';
                        setTimeout(() => pelletEl.remove(), 300);
                    }

                    // Check win
                    if (this.pellets.every(p => p.eaten)) {
                        this.levelUp();
                    }
                }
            }
        });
    }

    loseLife() {
        this.lives--;
        this.updateDisplay();

        if (this.lives <= 0) {
            this.gameOver();
        } else {
            // Reset positions
            this.pacman.x = 1;
            this.pacman.y = 1;
            this.pacman.gridX = 1;
            this.pacman.gridY = 1;
            this.pacman.direction = { x: 1, y: 0 };
            this.pacman.nextDirection = { x: 1, y: 0 };

            // Reset ghosts to open positions around center
            this.ghosts[0].x = this.ghosts[0].gridX = 5;
            this.ghosts[0].y = this.ghosts[0].gridY = 8;
            this.ghosts[0].direction = { x: -1, y: 0 };
            
            this.ghosts[1].x = this.ghosts[1].gridX = 9;
            this.ghosts[1].y = this.ghosts[1].gridY = 8;
            this.ghosts[1].direction = { x: 1, y: 0 };
            
            this.ghosts[2].x = this.ghosts[2].gridX = 7;
            this.ghosts[2].y = this.ghosts[2].gridY = 6;
            this.ghosts[2].direction = { x: 0, y: -1 };
            
            this.ghosts[3].x = this.ghosts[3].gridX = 7;
            this.ghosts[3].y = this.ghosts[3].gridY = 10;
            this.ghosts[3].direction = { x: 0, y: 1 };
        }
    }

    levelUp() {
        this.level++;
        this.messageDisplay.textContent = `🎉 LEVEL ${this.level}!`;
        this.stopGame();

        setTimeout(() => {
            this.initPellets();
            this.messageDisplay.textContent = '';
            this.gameTime = 0; // Reset game time for speed increase
            this.renderMaze();
            this.startGame();
        }, 2000);
    }

    gameOver() {
        this.stopGame();
        this.messageDisplay.textContent = `💀 GAME OVER!\nScore: ${this.score}`;
        this.updateButtons();
    }

    renderMaze() {
        this.gameBoard.innerHTML = '';
        const tileMap = Array.from({ length: this.rows }, () => Array(this.cols));

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const tile = document.createElement('div');
                tile.className = 'tile';

                if (this.maze[y][x] === 1) {
                    tile.classList.add('wall');
                }

                tileMap[y][x] = tile;
                this.gameBoard.appendChild(tile);
            }
        }

        // Add pellets
        this.pellets.forEach(pellet => {
            if (!pellet.eaten) {
                const pelletEl = document.createElement('div');
                pelletEl.className = pellet.power ? 'power-pellet' : 'pellet';
                pelletEl.setAttribute('data-pellet-x', pellet.x);
                pelletEl.setAttribute('data-pellet-y', pellet.y);
                pelletEl.style.position = 'absolute';
                pelletEl.style.left = '50%';
                pelletEl.style.top = '50%';

                // Place pellets only inside walkable (white) cells.
                if (this.maze[pellet.y][pellet.x] === 0) {
                    tileMap[pellet.y][pellet.x].appendChild(pelletEl);
                }
            }
        });
    }

    createCharacters() {
        // Remove old characters
        const oldChars = this.gameBoard.querySelectorAll('.pacman, .ghost');
        oldChars.forEach(el => el.remove());

        // Create Pacman
        this.pacmanEl = document.createElement('div');
        this.pacmanEl.className = 'pacman';
        this.pacmanEl.style.backgroundImage = 'url(pacman.svg)';
        this.gameBoard.appendChild(this.pacmanEl);

        // Create Ghosts
        this.ghostEls = [];
        this.ghosts.forEach(ghost => {
            const ghostEl = document.createElement('div');
            ghostEl.className = `ghost ${ghost.color}`;
            ghostEl.style.backgroundImage = `url(${ghost.image})`;
            this.gameBoard.appendChild(ghostEl);
            this.ghostEls.push(ghostEl);
        });
    }

    render() {
        if (!this.pacmanEl) return;

        // Keep Pacman centered inside walkable cells so it stays on white paths visually.
        const pacmanLeft = (this.pacman.x + 0.5) * this.cellSize;
        const pacmanTop = (this.pacman.y + 0.5) * this.cellSize;
        const pacmanSize = this.cellSize * 0.78;
        this.pacmanEl.style.left = pacmanLeft + '%';
        this.pacmanEl.style.top = pacmanTop + '%';
        this.pacmanEl.style.width = pacmanSize + '%';
        this.pacmanEl.style.height = pacmanSize + '%';

        // Rotate based on direction
        let rotation = 0;
        if (this.pacman.direction.x === 1) rotation = 0;
        else if (this.pacman.direction.x === -1) rotation = 180;
        else if (this.pacman.direction.y === 1) rotation = 90;
        else if (this.pacman.direction.y === -1) rotation = 270;
        this.pacmanEl.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;

        // Update Ghosts
        this.ghosts.forEach((ghost, i) => {
            if (this.ghostEls[i]) {
                const ghostLeft = ghost.x * this.cellSize;
                const ghostTop = ghost.y * this.cellSize;
                this.ghostEls[i].style.left = ghostLeft + '%';
                this.ghostEls[i].style.top = ghostTop + '%';
                this.ghostEls[i].style.width = this.cellSize + '%';
                this.ghostEls[i].style.height = this.cellSize + '%';
            }
        });
    }

    updateDisplay() {
        this.scoreDisplay.textContent = this.score;
        this.levelDisplay.textContent = this.level;
        this.livesDisplay.textContent = '❤️'.repeat(Math.max(0, this.lives));
    }

    updateButtons() {
        this.startBtn.disabled = this.gameActive;
        this.pauseBtn.disabled = !this.gameActive;
        this.pauseBtn.textContent = this.gamePaused ? '▶️ RESUME' : '⏸️ PAUSE';
    }
}

window.addEventListener('load', () => {
    new PacmanGame();
});
