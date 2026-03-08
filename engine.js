/**
 * AntiGravity Engine Base (Minimalist implementation)
 */

class InputHandler {
    constructor() {
        this.keys = {};
        this.justPressed = {};
        this.justReleased = {};
        
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (!this.keys[key]) {
                this.justPressed[key] = true;
            }
            this.keys[key] = true;
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = false;
            this.justReleased[key] = true;
        });
    }

    isDown(key) {
        return !!this.keys[key.toLowerCase()];
    }

    isJustPressed(key) {
        return !!this.justPressed[key.toLowerCase()];
    }

    isJustReleased(key) {
        return !!this.justReleased[key.toLowerCase()];
    }

    update() {
        // Limpar os estados de "just" no final de cada frame
        this.justPressed = {};
        this.justReleased = {};
    }
}

class GameEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.input = new InputHandler();
        
        this.entities = [];
        this.lastTime = 0;
        this.isRunning = false;
        this.isPaused = false;
        
        // Efeitos globais
        this.screenShakeTime = 0;
        this.screenShakeIntensity = 0;
    }

    addEntity(entity) {
        this.entities.push(entity);
        entity.engine = this;
    }

    clearEntities() {
        this.entities = [];
    }

    shake(intensity = 5, duration = 0.2) {
        this.screenShakeIntensity = intensity;
        this.screenShakeTime = duration;
    }

    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            requestAnimationFrame((timestamp) => this.loop(timestamp));
        }
    }

    togglePause() {
        this.isPaused = !this.isPaused;
    }

    stop() {
        this.isRunning = false;
    }

    loop(timestamp) {
        if (!this.isRunning) return;

        // Calcular Delta Time (dt) em segundos
        let dt = (timestamp - this.lastTime) / 1000;
        if (dt > 0.1) dt = 0.1; // Limite para evitar bugs grandes se a aba ficar inativa
        this.lastTime = timestamp;

        if (this.input.isJustPressed('escape')) {
            this.togglePause();
        }

        if (!this.isPaused) {
            this.update(dt);
        }
        
        this.draw();

        this.input.update(); // Limpa justPressed/Released
        
        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        // Atualizar screenshake
        if (this.screenShakeTime > 0) {
            this.screenShakeTime -= dt;
        }

        // Atualizar todas as entidades
        for (const entity of this.entities) {
            if (entity.update) {
                entity.update(dt);
            }
        }
    }

    draw() {
        this.ctx.save();

        if (this.screenShakeTime > 0) {
            const dx = (Math.random() - 0.5) * this.screenShakeIntensity * 2;
            const dy = (Math.random() - 0.5) * this.screenShakeIntensity * 2;
            this.ctx.translate(dx, dy);
        }

        // Fundo (pode ser sobrescrito pelo game.js)
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Desenhar entidades (ordenadas pelo 'zIndex' simulado ou pela ordem de array)
        // Primeiro fundo/mortos, depois personagens
        for (const entity of this.entities) {
            if (entity.draw) {
                entity.draw(this.ctx);
            }
        }

        this.ctx.restore();
    }
}

// Utilitários Matemáticos
const MathUtils = {
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },
    // Colisão AABB (Axis-Aligned Bounding Box)
    checkCollision(rect1, rect2) {
        return (
            rect1.x < rect2.x + rect2.width &&
            rect1.x + rect1.width > rect2.x &&
            rect1.y < rect2.y + rect2.height &&
            rect1.height + rect1.y > rect2.y
        );
    }
};
